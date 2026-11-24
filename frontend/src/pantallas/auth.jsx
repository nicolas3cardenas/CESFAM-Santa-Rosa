// Pantallas 01 (inicio de sesión), 02 (olvidé mi contraseña), 03 (cambiar contraseña, con sesión o con enlace) y 17 (acceso denegado).
import { useEffect, useState } from 'react';
import { api, fijarToken } from '../api.js';
import { Link, navegar } from '../router.jsx';
import { useSesion, inicioDe } from '../sesion.jsx';
import { Acceso } from '../layout.jsx';
import { AvisoDe, Boton, Campo, CampoClave, manejarError, propsCampo, useEnfocarError, useEnvio, useTitulo } from '../ui.jsx';
import { EN_DESARROLLO, V } from '../util.js';

/* ---------- 01 Inicio de sesión ---------- */
export function Login() {
  useTitulo('Inicio de sesión');
  const { iniciarSesion, avisoLogin } = useSesion();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(avisoLogin ? { tipo: 'alerta', texto: avisoLogin } : null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);

  function enviar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      if (!V.correo(correo)) { e.correo = 'Ingrese un correo válido'; }
      if (!V.clave(clave)) { e.clave = 'La contraseña debe tener entre 8 y 64 caracteres'; }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }
      try {
        const r = await iniciarSesion(correo, clave);
        navegar(inicioDe(r.permisos), { reemplazar: true });
      } catch (err) {
        // Siempre se muestra el mensaje que entrega la API: es el mismo para correo inexistente, clave mala o cuenta bloqueada
        manejarError(err, setErrores, setAviso);
      }
    });
  }

  return (
    <Acceso>
      <h1>Ingreso al sistema</h1>
      <p className="texto-2">Sistema de gestión de indicadores y metas sanitarias</p>
      <AvisoDe aviso={aviso} />
      <form onSubmit={enviar} noValidate>
        <Campo id="correo" etiqueta="Correo" error={errores.correo}>
          <input {...propsCampo('correo', errores.correo)} type="text" inputMode="email" autoComplete="username"
            placeholder="nombre@institucion.cl" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </Campo>
        <Campo id="clave" etiqueta="Contraseña" error={errores.clave}>
          <CampoClave id="clave" valor={clave} alCambiar={(e) => setClave(e.target.value)} error={errores.clave} autoComplete="current-password" />
        </Campo>
        <Boton ocupado={ocupado} textoOcupado="Ingresando…" className="btn btn-primario btn-ancho">Ingresar</Boton>
      </form>
      <div className="enlaces">
        <Link a="/olvide">Olvidé mi contraseña</Link>
      </div>
    </Acceso>
  );
}

/* ---------- 02 Olvidé mi contraseña ---------- */
export function Olvide() {
  useTitulo('Olvidé mi contraseña');
  const [correo, setCorreo] = useState('');
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);

  function enviar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      if (!V.correo(correo)) { setErrores({ correo: 'Ingrese un correo válido' }); return; }
      setErrores({});
      try {
        // El mensaje es el mismo si el correo está registrado o no: así no se revela qué correos existen
        const r = await api.post('/auth/olvide', { correo }, { sinSesion: true });
        setAviso({ tipo: 'exito', texto: r.mensaje });
      } catch (err) { manejarError(err, setErrores, setAviso); }
    });
  }

  return (
    <Acceso>
      <h1>Olvidé mi contraseña</h1>
      <p className="texto-2">Escriba el correo de su cuenta y le enviaremos un enlace para crear una contraseña nueva. El enlace sirve una sola vez y vence en 30 minutos.</p>
      <AvisoDe aviso={aviso} />
      <form onSubmit={enviar} noValidate>
        <Campo id="correo" etiqueta="Correo" error={errores.correo}>
          <input {...propsCampo('correo', errores.correo)} type="text" inputMode="email" autoComplete="username"
            placeholder="nombre@institucion.cl" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </Campo>
        <Boton ocupado={ocupado} textoOcupado="Enviando…" className="btn btn-primario btn-ancho">Enviar enlace</Boton>
      </form>
      {EN_DESARROLLO && (
        <details className="demo">
          <summary>Solo en desarrollo</summary>
          <p>El correo todavía no se envía de verdad: el enlace aparece en la consola del servidor (<code>MODO_CORREO=consola</code>).</p>
        </details>
      )}
      <div className="enlaces">
        <Link a="/login">Volver al inicio de sesión</Link>
      </div>
    </Acceso>
  );
}

/* ---------- 03 Crear contraseña nueva con el enlace del correo ---------- */
export function Restablecer({ params }) {
  useTitulo('Cambiar contraseña');
  const [estado, setEstado] = useState('revisando'); // revisando | valido | invalido | listo
  const [clave, setClave] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);

  useEffect(() => {
    let vigente = true;
    api.get(`/auth/restablecer/${encodeURIComponent(params.token)}`, undefined, { sinSesion: true })
      .then(() => { if (vigente) { setEstado('valido'); } })
      .catch((err) => {
        if (!vigente) { return; }
        setEstado('invalido');
        setAviso({ tipo: 'error', texto: err.status === 400 ? 'Enlace no válido. Solicite uno nuevo.' : err.mensaje });
      });
    return () => { vigente = false; };
  }, [params.token]);

  function enviar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      if (!V.clave(clave)) { e.clave = 'La contraseña nueva debe tener entre 8 y 64 caracteres'; }
      if (confirmacion !== clave) { e.confirmacion = 'Las contraseñas no coinciden'; }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }
      try {
        const r = await api.post(`/auth/restablecer/${encodeURIComponent(params.token)}`, { clave, confirmacion }, { sinSesion: true });
        setAviso({ tipo: 'exito', texto: r.mensaje });
        setEstado('listo');
        setClave(''); setConfirmacion('');
      } catch (err) {
        if (err.status === 400 && !err.campos) { setEstado('invalido'); }
        manejarError(err, setErrores, setAviso);
      }
    });
  }

  return (
    <Acceso>
      <h1>Cambiar contraseña</h1>
      <p className="texto-2">Elija una contraseña nueva de 8 a 64 caracteres.</p>
      <AvisoDe aviso={aviso} />
      {estado === 'valido' && (
        <form onSubmit={enviar} noValidate>
          <Campo id="clave" etiqueta="Contraseña nueva" ayuda="De 8 a 64 caracteres." error={errores.clave}>
            <CampoClave id="clave" valor={clave} alCambiar={(e) => setClave(e.target.value)} error={errores.clave} autoComplete="new-password" />
          </Campo>
          <Campo id="confirmacion" etiqueta="Confirmar contraseña" error={errores.confirmacion}>
            <input {...propsCampo('confirmacion', errores.confirmacion)} type="password" autoComplete="new-password"
              value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
          </Campo>
          <Boton ocupado={ocupado} textoOcupado="Guardando…" className="btn btn-primario btn-ancho">Guardar</Boton>
        </form>
      )}
      <div className="enlaces">
        <Link a="/login">Ir al inicio de sesión</Link>
        {estado === 'invalido' && <Link a="/olvide">Solicitar un enlace nuevo</Link>}
      </div>
    </Acceso>
  );
}

/* ---------- 03 Cambiar contraseña (con sesión iniciada) ---------- */
export function CambiarClave() {
  useTitulo('Cambiar contraseña');
  const { permisos } = useSesion();
  const [v, setV] = useState({ claveActual: '', claveNueva: '', confirmacion: '' });
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);
  const cambiar = (campo) => (e) => setV({ ...v, [campo]: e.target.value });

  function enviar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      if (v.claveActual === '') { e.claveActual = 'Ingrese su contraseña actual'; }
      if (!V.clave(v.claveNueva)) { e.claveNueva = 'La contraseña nueva debe tener entre 8 y 64 caracteres'; }
      else if (v.claveNueva === v.claveActual) { e.claveNueva = 'La contraseña nueva debe ser distinta de la actual'; }
      if (v.confirmacion !== v.claveNueva) { e.confirmacion = 'Las contraseñas no coinciden'; }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }
      try {
        const r = await api.post('/auth/cambiar-clave', v);
        fijarToken(r.token); // el token anterior queda sin validez: se guarda el nuevo
        setAviso({ tipo: 'exito', texto: `${r.mensaje}. La sesión anterior se cerró y el cambio quedó en la auditoría.` });
        setV({ claveActual: '', claveNueva: '', confirmacion: '' });
      } catch (err) { manejarError(err, setErrores, setAviso); }
    });
  }

  return (
    <>
      <h1>Cambiar contraseña</h1>
      <p className="texto-2">Elija una contraseña nueva de 8 a 64 caracteres, distinta de la actual.</p>
      <AvisoDe aviso={aviso} />
      <form className="formulario" onSubmit={enviar} noValidate>
        <Campo id="claveActual" etiqueta="Contraseña actual" error={errores.claveActual}>
          <input {...propsCampo('claveActual', errores.claveActual)} type="password" autoComplete="current-password" value={v.claveActual} onChange={cambiar('claveActual')} />
        </Campo>
        <Campo id="claveNueva" etiqueta="Contraseña nueva" ayuda="De 8 a 64 caracteres." error={errores.claveNueva}>
          <input {...propsCampo('claveNueva', errores.claveNueva)} type="password" autoComplete="new-password" value={v.claveNueva} onChange={cambiar('claveNueva')} />
        </Campo>
        <Campo id="confirmacion" etiqueta="Confirmar contraseña" error={errores.confirmacion}>
          <input {...propsCampo('confirmacion', errores.confirmacion)} type="password" autoComplete="new-password" value={v.confirmacion} onChange={cambiar('confirmacion')} />
        </Campo>
        <div className="acciones">
          <Boton ocupado={ocupado} textoOcupado="Guardando…">Guardar</Boton>
          <Link a={inicioDe(permisos)} className="btn btn-secundario">Cancelar</Link>
        </div>
      </form>
    </>
  );
}

/* ---------- 17 Acceso denegado ---------- */
export function AccesoDenegado() {
  useTitulo('Acceso denegado');
  const { permisos } = useSesion();
  return (
    <div className="centrado">
      <svg className="icono-grande" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /><path d="M12 15v2" />
      </svg>
      <h1>Acceso denegado</h1>
      <p>No tiene permiso para ver esta pantalla.</p>
      <p className="texto-2 pequeno">Su rol no incluye esta función. El servidor no entrega ningún dato de la pantalla bloqueada.</p>
      <div className="acciones" style={{ justifyContent: 'center' }}>
        <Link a={inicioDe(permisos)} className="btn btn-primario" id="volver">Volver al inicio</Link>
      </div>
    </div>
  );
}

export function NoEncontrada() {
  useTitulo('Pantalla no encontrada');
  const { permisos } = useSesion();
  return (
    <div className="centrado">
      <h1>Pantalla no encontrada</h1>
      <p>La dirección que abrió no existe.</p>
      <div className="acciones" style={{ justifyContent: 'center' }}>
        <Link a={inicioDe(permisos)} className="btn btn-primario">Volver al inicio</Link>
      </div>
    </div>
  );
}
