// Estructura de las pantallas: con menú lateral y barra superior (Shell) o con panel de marca y formulario, sin menú (Acceso).
import { useEffect, useRef, useState } from 'react';
import { Icono } from './iconos.jsx';
import { Link, useRuta } from './router.jsx';
import { useSesion, inicioDe } from './sesion.jsx';
import { Logo, Aviso } from './ui.jsx';
import { NOMBRE_SISTEMA } from './util.js';

// [ruta, permiso que la habilita, texto, ícono, grupo del menú]
const MENU = [
  ['/dashboard', 'dashboard', 'Dashboard', 'dashboard', 'Consulta'],
  ['/reportes', 'reportes', 'Reportes', 'reportes', 'Consulta'],
  ['/comparativo', 'comparativo', 'Comparativo anual', 'comparativo', 'Consulta'],
  ['/exportar', 'exportar', 'Exportar datos', 'exportar', 'Consulta'],
  ['/cargas', 'cargarRem', 'Carga de REM', 'carga', 'Datos'],
  ['/poblacion', 'ingresarPoblacion', 'Ingreso de población', 'poblacion', 'Datos'],
  ['/indicadores', 'parametrizarIndicadores', 'Indicadores', 'indicadores', 'Datos'],
  ['/usuarios', 'gestionarUsuarios', 'Usuarios', 'usuarios', 'Administración'],
  ['/auditoria', 'verAuditoria', 'Auditoría de cambios', 'auditoria', 'Administración']
];

// Iniciales para el círculo del usuario: "María Pérez Soto" → "MP"
function iniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) { return '?'; }
  return (partes[0][0] + (partes.length > 1 ? partes[1][0] : '')).toUpperCase();
}

export function Shell({ children }) {
  const { usuario, permisos, cerrarSesion, errorCatalogos, cargarCatalogos } = useSesion();
  const { ruta } = useRuta();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [usuarioAbierto, setUsuarioAbierto] = useState(false);
  const caja = useRef(null);

  // Al cambiar de pantalla se cierra el menú del teléfono
  useEffect(() => { setMenuAbierto(false); setUsuarioAbierto(false); }, [ruta]);
  useEffect(() => {
    function fuera(ev) { if (caja.current && !caja.current.contains(ev.target)) { setUsuarioAbierto(false); } }
    function tecla(ev) { if (ev.key === 'Escape') { setMenuAbierto(false); setUsuarioAbierto(false); } }
    document.addEventListener('click', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('click', fuera); document.removeEventListener('keydown', tecla); };
  }, []);

  // "Detalle del indicador" cuelga de Reportes en el menú
  const rutaMenu = ruta.startsWith('/detalle/') ? '/reportes' : ruta;
  const activo = (r) => rutaMenu === r || rutaMenu.startsWith(`${r}/`);
  const inicio = inicioDe(permisos);

  // Las opciones que la persona puede usar, agrupadas. Si solo hay un grupo no se escribe su título.
  const visibles = MENU.filter((m) => permisos[m[1]]);
  const grupos = [];
  visibles.forEach((m) => {
    let g = grupos.find((x) => x.titulo === m[4]);
    if (!g) { g = { titulo: m[4], items: [] }; grupos.push(g); }
    g.items.push(m);
  });

  return (
    <div className={`shell${menuAbierto ? ' menu-abierto' : ''}`}>
      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} />}
      <aside className="sidebar" id="menu-lateral" aria-label="Menú principal">
        <div className="sidebar-logo">
          <Link a={inicio} className="sidebar-marca" aria-label={`${NOMBRE_SISTEMA}, ir al inicio`}><Logo claro /></Link>
        </div>
        <nav>
          {grupos.map((g, n) => (
            <div className="menu-grupo" key={g.titulo}>
              {grupos.length > 1 && <p className="menu-grupo-titulo" id={`grupo-${n}`}>{g.titulo}</p>}
              <ul aria-labelledby={grupos.length > 1 ? `grupo-${n}` : undefined}>
                {g.items.map((m) => (
                  <li key={m[0]}>
                    <Link a={m[0]} className={activo(m[0]) ? 'activo' : undefined} aria-current={activo(m[0]) ? 'page' : undefined}>
                      <Icono nombre={m[3]} /><span>{m[2]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="principal">
        <header className="topbar">
          <button type="button" className="btn-menu" aria-label="Abrir o cerrar el menú" aria-controls="menu-lateral"
            aria-expanded={menuAbierto ? 'true' : 'false'} onClick={() => setMenuAbierto(!menuAbierto)}>
            <Icono nombre="menu" />
          </button>
          <span className="topbar-rol">
            <span className="rol-pastilla"><Icono nombre="escudo" />{usuario.rol}</span>
            {usuario.programa && <span className="rol-programa">Programa {usuario.programa}</span>}
          </span>
          <div className="usuario" ref={caja}>
            <button type="button" className="btn-usuario" aria-haspopup="true" aria-expanded={usuarioAbierto ? 'true' : 'false'}
              onClick={() => setUsuarioAbierto(!usuarioAbierto)}>
              <span className="avatar" aria-hidden="true">{iniciales(usuario.nombre)}</span>
              <span className="nombre">{usuario.nombre}</span>
              <span className="flecha" aria-hidden="true"><Icono nombre="flecha" /></span>
            </button>
            {usuarioAbierto && (
              <div className="usuario-menu">
                <Link a="/cambiar-clave"><Icono nombre="llave" />Cambiar contraseña</Link>
                <button type="button" id="cerrar-sesion" onClick={cerrarSesion}><Icono nombre="salir" />Cerrar sesión</button>
              </div>
            )}
          </div>
        </header>
        <main id="contenido">
          {errorCatalogos && (
            <Aviso tipo="error">
              {errorCatalogos}{' '}
              <button type="button" className="btn-enlace" onClick={() => cargarCatalogos().catch(() => {})}>Reintentar</button>
            </Aviso>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

// Pantallas de acceso: a la izquierda el panel de marca (qué hace el sistema) y a la derecha el formulario. Sin menú.
export function Acceso({ children }) {
  useEffect(() => {
    document.body.classList.add('acceso');
    return () => document.body.classList.remove('acceso');
  }, []);
  return (
    <div className="acceso-pagina">
      <aside className="acceso-marca">
        <svg className="acceso-cruz" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
          <path d="M17 2h6v13h13v6H23v13h-6V21H4v-6h13z" fill="currentColor" />
        </svg>
        <Logo claro grande />
        <div className="acceso-texto">
          <p className="acceso-lema">Metas sanitarias e indicadores IAAPS</p>
          <p className="acceso-bajada">Cargue el REM, calcule el cumplimiento de cada indicador y haga seguimiento por programa.</p>
          <ul className="acceso-puntos">
            <li><Icono nombre="formula" /><span>Cada resultado muestra su fórmula: numerador ÷ denominador × 100.</span></li>
            <li><Icono nombre="planilla" /><span>La planilla REM se valida antes de calcular.</span></li>
            <li><Icono nombre="escudo" /><span>Cada cambio queda en el registro de auditoría.</span></li>
          </ul>
        </div>
        <p className="acceso-pie">Proyecto Integrado · INACAP</p>
      </aside>
      <main id="contenido">
        <div className="acceso-formulario">
          {children}
        </div>
      </main>
    </div>
  );
}
