// Estructura de las pantallas: con menú lateral y barra superior (Shell) o centrada, sin menú (Acceso).
import { useEffect, useRef, useState } from 'react';
import { Link, useRuta } from './router.jsx';
import { useSesion, inicioDe } from './sesion.jsx';
import { Logo, Aviso } from './ui.jsx';
import { NOMBRE_SISTEMA } from './util.js';

const ICONOS = {
  dashboard: <path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" />,
  reportes: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  comparativo: <path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4" />,
  exportar: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  carga: <path d="M12 21V9M7 14l5-5 5 5M4 3h16" />,
  poblacion: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3 3 0 010 6M22 20c0-2.5-1.5-4.5-4-5.3" /></>,
  indicadores: <path d="M4 6h16M4 12h16M4 18h10" />,
  usuarios: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></>,
  auditoria: <path d="M12 8v5l3 2M21 12a9 9 0 11-3-6.7M21 4v5h-5" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />
};
function Icono({ nombre }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre]}
    </svg>
  );
}

// [ruta, permiso que la habilita, texto, ícono]
const MENU = [
  ['/dashboard', 'dashboard', 'Dashboard', 'dashboard'],
  ['/reportes', 'reportes', 'Reportes', 'reportes'],
  ['/comparativo', 'comparativo', 'Comparativo anual', 'comparativo'],
  ['/exportar', 'exportar', 'Exportar datos', 'exportar'],
  ['/cargas', 'cargarRem', 'Carga de REM', 'carga'],
  ['/poblacion', 'ingresarPoblacion', 'Ingreso de población', 'poblacion'],
  ['/indicadores', 'parametrizarIndicadores', 'Indicadores', 'indicadores'],
  ['/usuarios', 'gestionarUsuarios', 'Usuarios', 'usuarios'],
  ['/auditoria', 'verAuditoria', 'Auditoría de cambios', 'auditoria']
];

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

  return (
    <div className={`shell${menuAbierto ? ' menu-abierto' : ''}`}>
      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} />}
      <aside className="sidebar" id="menu-lateral" aria-label="Menú principal">
        <div className="sidebar-logo">
          <Link a={inicio} className="logo" aria-label={`${NOMBRE_SISTEMA}, ir al inicio`}><Logo /></Link>
        </div>
        <nav>
          <ul>
            {MENU.filter((m) => permisos[m[1]]).map((m) => (
              <li key={m[0]}>
                <Link a={m[0]} className={activo(m[0]) ? 'activo' : undefined} aria-current={activo(m[0]) ? 'page' : undefined}>
                  <Icono nombre={m[3]} /><span>{m[2]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="principal">
        <header className="topbar">
          <button type="button" className="btn-menu" aria-label="Abrir o cerrar el menú" aria-controls="menu-lateral"
            aria-expanded={menuAbierto ? 'true' : 'false'} onClick={() => setMenuAbierto(!menuAbierto)}>
            <Icono nombre="menu" />
          </button>
          <span className="topbar-rol">{usuario.rol}{usuario.programa ? ` · ${usuario.programa}` : ''}</span>
          <div className="usuario" ref={caja}>
            <button type="button" className="btn-usuario" aria-haspopup="true" aria-expanded={usuarioAbierto ? 'true' : 'false'}
              onClick={() => setUsuarioAbierto(!usuarioAbierto)}>
              <span className="nombre">{usuario.nombre}</span><span aria-hidden="true">▾</span>
            </button>
            {usuarioAbierto && (
              <div className="usuario-menu">
                <Link a="/cambiar-clave">Cambiar contraseña</Link>
                <button type="button" id="cerrar-sesion" onClick={cerrarSesion}>Cerrar sesión</button>
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

// Pantallas de acceso: una tarjeta centrada con el logo y sin menú
export function Acceso({ children }) {
  useEffect(() => {
    document.body.classList.add('acceso');
    return () => document.body.classList.remove('acceso');
  }, []);
  return (
    <main id="contenido">
      <div className="centrado"><Logo grande /></div>
      {children}
    </main>
  );
}
