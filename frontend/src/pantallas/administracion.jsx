// Pantallas 12 y 13 (indicadores), 14 y 15 (usuarios) y 16 (auditoría).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link, navegar } from '../router.jsx';
import { useSesion } from '../sesion.jsx';
import {
  AvisoDe, Aviso, Boton, Campo, CampoClave, Cargando, ChipActivo, Confirmar, DetalleCambio, manejarError, Paginacion, propsCampo,
  useDatos, useEnfocarError, useEnvio, useTitulo
} from '../ui.jsx';
import { ACCIONES, ENTIDADES, V, fechaHora, fechaIso, numero, porcentaje } from '../util.js';

/* ---------- 12 Lista de indicadores ---------- */
export function ListaIndicadores() {
  useTitulo('Indicadores');
  const { catalogos, tomarFlash } = useSesion();
  const [flash] = useState(() => tomarFlash());
  const [campos, setCampos] = useState({ q: '', programaId: '' });
  const [filtro, setFiltro] = useState({ q: '', programaId: '' });
  const [errores, setErrores] = useState({});
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);
  const lista = useDatos(() => api.get('/indicadores', filtro), [filtro.q, filtro.programaId]);

  function buscar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      if (campos.q.length > 100) { setErrores({ q: 'Escriba como máximo 100 caracteres' }); return; }
      setErrores({});
      setFiltro({ q: campos.q.trim(), programaId: campos.programaId });
    });
  }

  const inds = lista.datos ? lista.datos.indicadores : [];
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Indicadores</h1>
          <p className="texto-2" style={{ margin: 0 }}>Indicadores sanitarios y su configuración.</p>
        </div>
        <Link a="/indicadores/nuevo" className="btn btn-primario">Nuevo indicador</Link>
      </div>

      <form className="tarjeta" onSubmit={buscar} noValidate>
        <div className="filtros">
          <Campo id="buscar" etiqueta="Buscar" error={errores.q}>
            <input {...propsCampo('buscar', errores.q)} type="text" placeholder="Nombre o código" autoComplete="off" value={campos.q} onChange={(e) => setCampos({ ...campos, q: e.target.value })} />
          </Campo>
          <Campo id="programa" etiqueta="Programa">
            <select id="programa" value={campos.programaId} onChange={(e) => setCampos({ ...campos, programaId: e.target.value })}>
              <option value="">Todos</option>
              {catalogos && catalogos.programas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          <div className="campo"><Boton ocupado={ocupado} textoOcupado="Buscando…">Buscar</Boton></div>
        </div>
      </form>

      <AvisoDe aviso={flash} />
      {lista.error && <Aviso tipo="error">{lista.error}</Aviso>}
      {lista.cargando && !lista.datos && <Cargando />}
      {lista.datos && (
        <>
          <p className="texto-2 pequeno" aria-live="polite">{inds.length} {inds.length === 1 ? 'indicador' : 'indicadores'}</p>
          <div className="tabla-contenedor">
            {inds.length === 0
              ? <p className="sin-resultados">No hay indicadores que coincidan con la búsqueda.</p>
              : (
                <table>
                  <thead>
                    <tr><th>Código</th><th>Indicador</th><th>Programa</th><th className="num">Meta</th><th className="num">Peso</th><th>Denominador</th><th>Estado</th><th>Acción</th></tr>
                  </thead>
                  <tbody>
                    {inds.map((i) => (
                      <tr key={i.id}>
                        <td className="nw">{i.remCodigo}</td><td>{i.nombre}</td><td>{i.programa}</td>
                        <td className="num">{porcentaje(i.metaNacional)}</td><td className="num">{numero(i.pesoRelativo)}</td>
                        <td>{i.origenDenominador === 'REM' ? `REM (celda ${i.celdaDenominador})` : 'Población ingresada'}</td>
                        <td><ChipActivo activo={i.activo} /></td>
                        <td className="nw"><Link a={`/indicadores/${i.id}/editar`} className="btn btn-secundario btn-pequeno">Editar</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}
    </>
  );
}

/* ---------- 13 Formulario de indicador (nuevo y editar) ---------- */
const VACIO_IND = {
  nombre: '', programaId: '', remCodigo: '', celdaNumerador: '', origenDenominador: '', celdaDenominador: '',
  metaNacional: '', pesoRelativo: '', seccion: '', codigoPrestacion: '', referenteResponsable: '', activo: true
};

export function FormularioIndicador({ params }) {
  const edicion = params.id !== undefined;
  useTitulo(edicion ? 'Editar indicador' : 'Nuevo indicador');
  const { catalogos, ponerFlash } = useSesion();
  const [v, setV] = useState(VACIO_IND);
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);
  const carga = useDatos(() => api.get(`/indicadores/${encodeURIComponent(params.id)}`), [params.id], edicion);

  useEffect(() => {
    const i = carga.datos;
    if (!i) { return; }
    const texto = (x) => (x === null || x === undefined ? '' : String(x));
    setV({
      nombre: texto(i.nombre), programaId: texto(i.programaId), remCodigo: texto(i.remCodigo), celdaNumerador: texto(i.celdaNumerador),
      origenDenominador: texto(i.origenDenominador), celdaDenominador: texto(i.celdaDenominador),
      metaNacional: texto(i.metaNacional).replace('.', ','), pesoRelativo: texto(i.pesoRelativo).replace('.', ','),
      seccion: texto(i.seccion), codigoPrestacion: texto(i.codigoPrestacion), referenteResponsable: texto(i.referenteResponsable), activo: i.activo !== false
    });
  }, [carga.datos]);

  const cambiar = (campo) => (e) => setV({ ...v, [campo]: e.target.value });
  const porPoblacion = v.origenDenominador === 'POBLACION';

  function guardar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      if (!V.largo(v.nombre, 1, 200)) { e.nombre = 'Escriba un nombre de 1 a 200 caracteres'; }
      if (v.programaId === '') { e.programaId = 'Seleccione un programa'; }
      if (!V.largo(v.remCodigo, 1, 20)) { e.remCodigo = 'Escriba un código REM de 1 a 20 caracteres'; }
      if (!V.celdaExcel(v.celdaNumerador)) { e.celdaNumerador = 'Escriba una celda de Excel válida, por ejemplo B12 (no 12B ni B-12)'; }
      if (v.origenDenominador === '') { e.origenDenominador = 'Seleccione el origen del denominador'; }
      if (v.origenDenominador === 'REM' && !V.celdaExcel(v.celdaDenominador)) { e.celdaDenominador = 'Con origen REM, escriba la celda del denominador, por ejemplo C12'; }
      if (!V.decimal(v.metaNacional, 0, 99999.99)) { e.metaNacional = 'Ingrese un número desde 0, con hasta 2 decimales'; }
      if (!V.decimal(v.pesoRelativo, 0, 100)) { e.pesoRelativo = 'Ingrese un número de 0 a 100, con hasta 2 decimales'; }
      if (v.seccion.length > 50) { e.seccion = 'Escriba como máximo 50 caracteres'; }
      if (v.codigoPrestacion.length > 50) { e.codigoPrestacion = 'Escriba como máximo 50 caracteres'; }
      if (v.referenteResponsable.length > 100) { e.referenteResponsable = 'Escriba como máximo 100 caracteres'; }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }

      const cuerpo = {
        nombre: v.nombre.trim(), programaId: Number(v.programaId), remCodigo: v.remCodigo.trim(), celdaNumerador: v.celdaNumerador,
        origenDenominador: v.origenDenominador, metaNacional: v.metaNacional, pesoRelativo: v.pesoRelativo, activo: v.activo
      };
      if (v.origenDenominador === 'REM') { cuerpo.celdaDenominador = v.celdaDenominador; }
      ['seccion', 'codigoPrestacion', 'referenteResponsable'].forEach((k) => { if (v[k].trim() !== '') { cuerpo[k] = v[k].trim(); } });
      try {
        if (edicion) {
          await api.put(`/indicadores/${encodeURIComponent(params.id)}`, cuerpo);
          setAviso({ tipo: 'exito', texto: 'Indicador guardado. En la auditoría quedan el valor anterior y el nuevo.' });
        } else {
          const r = await api.post('/indicadores', cuerpo);
          ponerFlash({ tipo: 'exito', texto: `Indicador creado: ${r.remCodigo || cuerpo.remCodigo}. En la auditoría queda el registro.` });
          navegar('/indicadores');
        }
      } catch (err) { manejarError(err, setErrores, setAviso); }
    });
  }

  if (edicion && carga.cargando && !carga.datos) { return <Cargando />; }
  return (
    <>
      <p className="migas"><Link a="/indicadores">Indicadores</Link> › {edicion ? (v.remCodigo || 'Editar') : 'Nuevo indicador'}</p>
      <h1>{edicion ? 'Editar indicador' : 'Nuevo indicador'}</h1>
      <p className="texto-2">Los campos con asterisco (*) son obligatorios.</p>
      <AvisoDe aviso={aviso} />
      {edicion && !carga.datos && <Aviso tipo="error">{carga.status === 404 ? 'Indicador no encontrado' : (carga.error || 'No se pudo cargar el indicador')}</Aviso>}

      {(!edicion || carga.datos) && (
        <form className="tarjeta formulario" onSubmit={guardar} noValidate>
          <Campo id="nombre" etiqueta="Nombre *" ayuda="De 1 a 200 caracteres." error={errores.nombre}>
            <input {...propsCampo('nombre', errores.nombre)} type="text" autoComplete="off" value={v.nombre} onChange={cambiar('nombre')} />
          </Campo>
          <div className="fila">
            <Campo id="programaId" etiqueta="Programa *" error={errores.programaId}>
              <select {...propsCampo('programaId', errores.programaId)} value={v.programaId} onChange={cambiar('programaId')}>
                <option value="">Seleccione un programa</option>
                {catalogos && catalogos.programas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Campo>
            <Campo id="remCodigo" etiqueta="Código REM *" ayuda="Hasta 20 caracteres. Por ejemplo: IND-01." error={errores.remCodigo}>
              <input {...propsCampo('remCodigo', errores.remCodigo)} type="text" autoComplete="off" value={v.remCodigo} onChange={cambiar('remCodigo')} />
            </Campo>
          </div>
          <div className="fila">
            <Campo id="celdaNumerador" etiqueta="Celda del numerador *" ayuda="Referencia de celda de Excel: letras y número, por ejemplo B12." error={errores.celdaNumerador}>
              <input {...propsCampo('celdaNumerador', errores.celdaNumerador)} type="text" autoComplete="off" placeholder="B12" value={v.celdaNumerador} onChange={cambiar('celdaNumerador')} />
            </Campo>
            <Campo id="origenDenominador" etiqueta="Origen del denominador *" error={errores.origenDenominador}>
              <select {...propsCampo('origenDenominador', errores.origenDenominador)} value={v.origenDenominador}
                onChange={(e) => setV({ ...v, origenDenominador: e.target.value, celdaDenominador: e.target.value === 'POBLACION' ? '' : v.celdaDenominador })}>
                <option value="">Seleccione el origen</option>
                <option value="REM">REM (celda de la planilla)</option>
                <option value="POBLACION">Población (se ingresa a mano)</option>
              </select>
            </Campo>
          </div>
          <Campo id="celdaDenominador" etiqueta="Celda del denominador" estilo={{ maxWidth: 360 }} error={errores.celdaDenominador}
            ayuda={porPoblacion ? 'No se usa: la población se ingresa a mano en la pantalla de ingreso de población.' : 'Obligatoria cuando el origen es REM.'}>
            <input {...propsCampo('celdaDenominador', errores.celdaDenominador)} type="text" autoComplete="off" placeholder="C12"
              disabled={porPoblacion} value={v.celdaDenominador} onChange={cambiar('celdaDenominador')} />
          </Campo>
          <div className="fila">
            <Campo id="metaNacional" etiqueta="Meta nacional (%) *" ayuda="Número desde 0, con hasta 2 decimales." error={errores.metaNacional}>
              <input {...propsCampo('metaNacional', errores.metaNacional)} type="text" inputMode="decimal" autoComplete="off" placeholder="80" value={v.metaNacional} onChange={cambiar('metaNacional')} />
            </Campo>
            <Campo id="pesoRelativo" etiqueta="Peso relativo *" ayuda="Número de 0 a 100, con hasta 2 decimales." error={errores.pesoRelativo}>
              <input {...propsCampo('pesoRelativo', errores.pesoRelativo)} type="text" inputMode="decimal" autoComplete="off" placeholder="10" value={v.pesoRelativo} onChange={cambiar('pesoRelativo')} />
            </Campo>
          </div>

          <h2 style={{ marginTop: 8 }}>Datos opcionales</h2>
          <div className="fila">
            <Campo id="seccion" etiqueta="Sección" ayuda="Hasta 50 caracteres." error={errores.seccion}>
              <input {...propsCampo('seccion', errores.seccion)} type="text" autoComplete="off" value={v.seccion} onChange={cambiar('seccion')} />
            </Campo>
            <Campo id="codigoPrestacion" etiqueta="Código de prestación" ayuda="Hasta 50 caracteres." error={errores.codigoPrestacion}>
              <input {...propsCampo('codigoPrestacion', errores.codigoPrestacion)} type="text" autoComplete="off" value={v.codigoPrestacion} onChange={cambiar('codigoPrestacion')} />
            </Campo>
          </div>
          <Campo id="referenteResponsable" etiqueta="Referente responsable" ayuda="Hasta 100 caracteres." error={errores.referenteResponsable}>
            <input {...propsCampo('referenteResponsable', errores.referenteResponsable)} type="text" autoComplete="off" value={v.referenteResponsable} onChange={cambiar('referenteResponsable')} />
          </Campo>
          <div className="campo campo-casilla">
            <label><input type="checkbox" id="activo" checked={v.activo} onChange={(e) => setV({ ...v, activo: e.target.checked })} /> Indicador activo</label>
          </div>

          <div className="acciones">
            <Boton ocupado={ocupado} textoOcupado="Guardando…">Guardar</Boton>
            <Link a="/indicadores" className="btn btn-secundario">Cancelar</Link>
          </div>
        </form>
      )}
    </>
  );
}

/* ---------- 14 Lista de usuarios ---------- */
export function ListaUsuarios() {
  useTitulo('Usuarios');
  const { catalogos, tomarFlash } = useSesion();
  const [aviso, setAviso] = useState(() => tomarFlash());
  const [campos, setCampos] = useState({ q: '', rolId: '' });
  const [filtro, setFiltro] = useState({ q: '', rolId: '' });
  const [errores, setErrores] = useState({});
  const [ocupado, ejecutar] = useEnvio();
  const [confirmacion, setConfirmacion] = useState(null); // { usuario }
  const [cambiando, setCambiando] = useState(false);
  useEnfocarError(errores);
  const lista = useDatos(() => api.get('/usuarios', filtro), [filtro.q, filtro.rolId]);

  function buscar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      if (campos.q.length > 100) { setErrores({ q: 'Escriba como máximo 100 caracteres' }); return; }
      setErrores({});
      setFiltro({ q: campos.q.trim(), rolId: campos.rolId });
    });
  }

  async function cambiarEstado() {
    if (cambiando || !confirmacion) { return; }
    const u = confirmacion.usuario;
    const nuevo = !u.activo;
    setCambiando(true);
    try {
      await api.patch(`/usuarios/${u.id}/estado`, { activo: nuevo });
      setAviso({ tipo: 'exito', texto: `Usuario ${nuevo ? 'activado' : 'desactivado'}: ${u.nombre}. Queda en la auditoría.` });
      lista.recargar();
    } catch (err) { manejarError(err, undefined, setAviso); } finally { setCambiando(false); setConfirmacion(null); }
  }

  const usuarios = lista.datos ? lista.datos.usuarios : [];
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Usuarios</h1>
          <p className="texto-2" style={{ margin: 0 }}>Personas con acceso al sistema y su rol.</p>
        </div>
        <Link a="/usuarios/nuevo" className="btn btn-primario">Nuevo usuario</Link>
      </div>

      <form className="tarjeta" onSubmit={buscar} noValidate>
        <div className="filtros">
          <Campo id="buscar" etiqueta="Buscar" error={errores.q}>
            <input {...propsCampo('buscar', errores.q)} type="text" placeholder="Nombre o correo" autoComplete="off" value={campos.q} onChange={(e) => setCampos({ ...campos, q: e.target.value })} />
          </Campo>
          <Campo id="rol" etiqueta="Rol">
            <select id="rol" value={campos.rolId} onChange={(e) => setCampos({ ...campos, rolId: e.target.value })}>
              <option value="">Todos</option>
              {catalogos && catalogos.roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </Campo>
          <div className="campo"><Boton ocupado={ocupado} textoOcupado="Buscando…">Buscar</Boton></div>
        </div>
      </form>

      <AvisoDe aviso={aviso} />
      {lista.error && <Aviso tipo="error">{lista.error}</Aviso>}
      {lista.cargando && !lista.datos && <Cargando />}
      {lista.datos && (
        <>
          <p className="texto-2 pequeno" aria-live="polite">{usuarios.length} {usuarios.length === 1 ? 'usuario' : 'usuarios'}</p>
          <div className="tabla-contenedor">
            {usuarios.length === 0
              ? <p className="sin-resultados">No hay usuarios que coincidan con la búsqueda.</p>
              : (
                <table>
                  <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Programa</th><th>Estado</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id}>
                        <td>{u.nombre}</td><td>{u.correo}</td><td>{u.rol}</td><td>{u.programa || '—'}</td>
                        <td><ChipActivo activo={u.activo} /></td>
                        <td className="nw">
                          <Link a={`/usuarios/${u.id}/editar`} className="btn btn-secundario btn-pequeno">Editar</Link>
                          <button type="button" className={`btn btn-pequeno ${u.activo ? 'btn-secundario' : 'btn-primario'}`} onClick={() => setConfirmacion({ usuario: u })}>
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}
      {confirmacion && (
        <Confirmar
          titulo={confirmacion.usuario.activo ? `¿Desactivar a ${confirmacion.usuario.nombre}?` : `¿Activar a ${confirmacion.usuario.nombre}?`}
          texto={confirmacion.usuario.activo ? 'La persona ya no podrá iniciar sesión. Sus datos y su historial se conservan.' : 'La persona podrá volver a iniciar sesión.'}
          textoBoton={confirmacion.usuario.activo ? 'Desactivar' : 'Activar'}
          ocupado={cambiando} alConfirmar={cambiarEstado} alCancelar={() => setConfirmacion(null)} />
      )}
    </>
  );
}

/* ---------- 15 Formulario de usuario (nuevo y editar) ---------- */
export function FormularioUsuario({ params }) {
  const edicion = params.id !== undefined;
  useTitulo(edicion ? 'Editar usuario' : 'Nuevo usuario');
  const { catalogos, ponerFlash } = useSesion();
  const [v, setV] = useState({ nombre: '', correo: '', rolId: '', programaId: '', clave: '' });
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);
  const carga = useDatos(() => api.get(`/usuarios/${encodeURIComponent(params.id)}`), [params.id], edicion);

  useEffect(() => {
    const u = carga.datos;
    if (!u) { return; }
    setV({ nombre: u.nombre || '', correo: u.correo || '', rolId: String(u.rolId), programaId: u.programaId ? String(u.programaId) : '', clave: '' });
  }, [carga.datos]);

  const rol = catalogos ? catalogos.roles.find((r) => String(r.id) === String(v.rolId)) : null;
  const conPrograma = Boolean(rol && rol.requierePrograma);
  const cambiar = (campo) => (e) => setV({ ...v, [campo]: e.target.value });

  function guardar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      if (!V.largo(v.nombre, 1, 100)) { e.nombre = 'Escriba un nombre de 1 a 100 caracteres'; }
      if (!V.correo(v.correo)) { e.correo = 'Escriba un correo válido, sin espacios y de hasta 100 caracteres (por ejemplo nombre@dominio.cl)'; }
      if (v.rolId === '') { e.rolId = 'Seleccione un rol'; }
      if (conPrograma && v.programaId === '') { e.programaId = 'Seleccione el programa del Jefe de Programa'; }
      if (!edicion && !V.clave(v.clave)) { e.clave = 'La contraseña debe tener entre 8 y 64 caracteres'; }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }

      const cuerpo = { nombre: v.nombre.trim(), correo: v.correo.trim(), rolId: Number(v.rolId) };
      if (conPrograma) { cuerpo.programaId = Number(v.programaId); }
      if (!edicion) { cuerpo.clave = v.clave; }
      try {
        if (edicion) {
          await api.put(`/usuarios/${encodeURIComponent(params.id)}`, cuerpo);
          setAviso({ tipo: 'exito', texto: 'Usuario actualizado. Queda en la auditoría.' });
        } else {
          await api.post('/usuarios', cuerpo);
          ponerFlash({ tipo: 'exito', texto: `Usuario creado: ${cuerpo.nombre}. Queda en la auditoría; solo se guarda la huella de la contraseña, nunca la contraseña.` });
          navegar('/usuarios');
        }
      } catch (err) { manejarError(err, setErrores, setAviso); }
    });
  }

  if (edicion && carga.cargando && !carga.datos) { return <Cargando />; }
  return (
    <>
      <p className="migas"><Link a="/usuarios">Usuarios</Link> › {edicion ? (v.nombre || 'Editar') : 'Nuevo usuario'}</p>
      <h1>{edicion ? 'Editar usuario' : 'Nuevo usuario'}</h1>
      <p className="texto-2">Los campos con asterisco (*) son obligatorios.</p>
      <AvisoDe aviso={aviso} />
      {edicion && !carga.datos && <Aviso tipo="error">{carga.status === 404 ? 'Usuario no encontrado' : (carga.error || 'No se pudo cargar el usuario')}</Aviso>}

      {(!edicion || carga.datos) && (
        <form className="tarjeta formulario" onSubmit={guardar} noValidate>
          <Campo id="nombre" etiqueta="Nombre *" ayuda="De 1 a 100 caracteres." error={errores.nombre}>
            <input {...propsCampo('nombre', errores.nombre)} type="text" autoComplete="off" value={v.nombre} onChange={cambiar('nombre')} />
          </Campo>
          <Campo id="correo" etiqueta="Correo *" ayuda="Hasta 100 caracteres. Cada persona usa un correo distinto." error={errores.correo}>
            <input {...propsCampo('correo', errores.correo)} type="text" inputMode="email" autoComplete="off" value={v.correo} onChange={cambiar('correo')} />
          </Campo>
          <div className="fila">
            <Campo id="rolId" etiqueta="Rol *" error={errores.rolId}>
              <select {...propsCampo('rolId', errores.rolId)} value={v.rolId} onChange={(e) => setV({ ...v, rolId: e.target.value, programaId: '' })}>
                <option value="">Seleccione un rol</option>
                {catalogos && catalogos.roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </Campo>
            <Campo id="programaId" etiqueta="Programa" ayuda="Obligatorio solo para el rol Jefe de Programa." error={errores.programaId}>
              <select {...propsCampo('programaId', errores.programaId)} value={conPrograma ? v.programaId : ''} onChange={cambiar('programaId')} disabled={!conPrograma}>
                <option value="">Seleccione un programa</option>
                {catalogos && catalogos.programas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Campo>
          </div>
          {!edicion && (
            <Campo id="clave" etiqueta="Contraseña inicial *" ayuda="De 8 a 64 caracteres. La persona podrá cambiarla al ingresar." error={errores.clave} estilo={{ maxWidth: 420 }}>
              <CampoClave id="clave" valor={v.clave} alCambiar={cambiar('clave')} error={errores.clave} autoComplete="new-password" />
            </Campo>
          )}
          {edicion && <p className="texto-2 pequeno">La contraseña no se cambia desde esta pantalla: la persona la cambia al ingresar o usa «Olvidé mi contraseña».</p>}

          <div className="acciones">
            <Boton ocupado={ocupado} textoOcupado="Guardando…">Guardar</Boton>
            <Link a="/usuarios" className="btn btn-secundario">Cancelar</Link>
          </div>
        </form>
      )}
    </>
  );
}

/* ---------- 16 Auditoría de cambios (solo lectura) ---------- */
export function Auditoria() {
  useTitulo('Auditoría de cambios');
  const [campos, setCampos] = useState({ desde: '', hasta: '', usuarioId: '', entidad: '' });
  const [filtro, setFiltro] = useState({});
  const [pagina, setPagina] = useState(1);
  const [errores, setErrores] = useState({});
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);
  const usuarios = useDatos(() => api.get('/usuarios'), []);
  const lista = useDatos(() => api.get('/auditoria', { ...filtro, pagina, tamano: 20 }), [JSON.stringify(filtro), pagina]);

  function consultar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      const e = {};
      const conFechas = campos.desde !== '' || campos.hasta !== '';
      if (conFechas) {
        const fd = V.fecha(campos.desde); const fh = V.fecha(campos.hasta);
        if (!fd) { e.desde = 'Ingrese una fecha que exista (DD-MM-AAAA)'; }
        if (!fh) { e.hasta = 'Ingrese una fecha que exista (DD-MM-AAAA)'; }
        if (fd && fh && fh < fd) { e.hasta = 'La fecha Hasta no puede ser anterior a Desde'; }
      }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }
      const f = {};
      if (conFechas) { f.desde = fechaIso(campos.desde); f.hasta = fechaIso(campos.hasta); }
      if (campos.usuarioId) { f.usuarioId = campos.usuarioId; }
      if (campos.entidad) { f.entidad = campos.entidad; }
      setPagina(1);
      setFiltro(f);
    });
  }

  const d = lista.datos;
  return (
    <>
      <h1>Auditoría de cambios</h1>
      <p className="texto-2">Registro de quién cambió qué y cuándo. Solo se puede leer: no se puede editar ni borrar.</p>

      <form className="tarjeta" onSubmit={consultar} noValidate>
        <div className="filtros">
          <Campo id="desde" etiqueta="Desde" error={errores.desde}>
            <input {...propsCampo('desde', errores.desde)} type="text" inputMode="numeric" placeholder="DD-MM-AAAA" autoComplete="off" value={campos.desde} onChange={(e) => setCampos({ ...campos, desde: e.target.value })} />
          </Campo>
          <Campo id="hasta" etiqueta="Hasta" error={errores.hasta}>
            <input {...propsCampo('hasta', errores.hasta)} type="text" inputMode="numeric" placeholder="DD-MM-AAAA" autoComplete="off" value={campos.hasta} onChange={(e) => setCampos({ ...campos, hasta: e.target.value })} />
          </Campo>
          <Campo id="usuario" etiqueta="Usuario">
            <select id="usuario" value={campos.usuarioId} onChange={(e) => setCampos({ ...campos, usuarioId: e.target.value })}>
              <option value="">Todos</option>
              {usuarios.datos && usuarios.datos.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="entidad" etiqueta="Entidad">
            <select id="entidad" value={campos.entidad} onChange={(e) => setCampos({ ...campos, entidad: e.target.value })}>
              <option value="">Todas</option>
              {Object.keys(ENTIDADES).map((k) => <option key={k} value={k}>{ENTIDADES[k]}</option>)}
            </select>
          </Campo>
          <div className="campo"><Boton ocupado={ocupado} textoOcupado="Consultando…">Consultar</Boton></div>
        </div>
        <p className="texto-2 pequeno" style={{ margin: 0 }}>Las fechas son opcionales. Sin filtros se muestran todos los registros.</p>
      </form>

      {lista.error && <Aviso tipo="error">{lista.error}</Aviso>}
      {lista.cargando && !d && <Cargando />}
      {d && (
        <>
          <p className="texto-2 pequeno" aria-live="polite">{d.total} {d.total === 1 ? 'registro' : 'registros'}</p>
          <div className="tabla-contenedor">
            {d.registros.length === 0
              ? <p className="sin-resultados">No hay registros para los filtros elegidos.</p>
              : (
                <table>
                  <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Registro afectado</th><th>Detalle del cambio</th></tr></thead>
                  <tbody>
                    {d.registros.map((a) => (
                      <tr key={a.id}>
                        <td className="nw">{fechaHora(a.fecha)}</td>
                        <td>{a.usuario ? a.usuario.nombre : '(sin usuario)'}</td>
                        <td>{ACCIONES[a.accion] || a.accion}</td>
                        <td>{(ENTIDADES[a.entidad] || a.entidad) + (a.entidadId ? ` n.º ${a.entidadId}` : '')}</td>
                        <td><DetalleCambio detalle={a.detalle} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
          {d.total > d.tamano && <Paginacion pagina={d.pagina} total={d.total} tamano={d.tamano} alCambiar={setPagina} />}
        </>
      )}
    </>
  );
}
