// Piezas de pantalla que se repiten: aviso, campo con su error, etiqueta de estado, barra, ventana de confirmación...
import { useCallback, useEffect, useRef, useState } from 'react';
import { NOMBRE_SISTEMA, NOMBRE_SUB, TEXTO_ESTADO, ancho } from './util.js';

export function useTitulo(texto) {
  useEffect(() => { document.title = `${texto} · ${NOMBRE_SISTEMA}`; }, [texto]);
}

// claro = para fondos oscuros (menú lateral y pantalla de acceso): círculo blanco y cruz azul
export function Logo({ grande = false, claro = false }) {
  return (
    <div className={`logo${grande ? ' logo-grande' : ''}${claro ? ' logo-claro' : ''}`}>
      <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
        <circle cx="20" cy="20" r="20" fill={claro ? '#FFFFFF' : '#0B5C8E'} />
        <path d="M17 9h6v8h8v6h-8v8h-6v-8H9v-6h8z" fill={claro ? '#0B5C8E' : '#FFFFFF'} />
      </svg>
      <span className="logo-texto">
        <span className="logo-nombre">{NOMBRE_SISTEMA}</span>
        <span className="logo-sub">{NOMBRE_SUB}</span>
      </span>
    </div>
  );
}

/* ---------- Mensajes ---------- */
export function Aviso({ tipo = 'info', children }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.scrollIntoView) { ref.current.scrollIntoView({ block: 'nearest' }); } }, []);
  return (
    <div ref={ref} className={`aviso ${tipo}`} role="status" aria-live="polite">
      <span className="aviso-texto">{children}</span>
    </div>
  );
}
// Aviso a partir de un estado { tipo, texto } (null = no se muestra)
export function AvisoDe({ aviso }) {
  return aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null;
}
export function Cargando({ texto = 'Cargando…' }) {
  return <p className="cargando" role="status">{texto}</p>;
}

// Muestra el error de una llamada a la API. Los de sesión (401) y permisos (403) ya los atendió la aplicación.
export function manejarError(err, setErrores, setAviso) {
  if (err && err.manejado) { return; }
  const mensaje = (err && err.mensaje) || 'Ocurrió un error inesperado. Intente nuevamente más tarde.';
  if (err && err.campos && setErrores) { setErrores(err.campos); }
  if (setAviso) { setAviso({ tipo: 'error', texto: mensaje }); }
}

// Lleva el foco al primer campo con error (accesibilidad)
export function useEnfocarError(errores) {
  useEffect(() => {
    if (!errores || Object.keys(errores).length === 0) { return; }
    const el = document.querySelector('form .invalido');
    if (el && el.focus) { el.focus(); }
  }, [errores]);
}

/* ---------- Campos ---------- */
// Propiedades que lleva todo campo con posible error (id, aria y borde rojo)
export function propsCampo(id, error, extra) {
  return {
    id,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    className: error ? 'invalido' : undefined,
    ...extra
  };
}
export function Campo({ id, etiqueta, ayuda, error, children, estilo, casilla = false }) {
  return (
    <div className={`campo${casilla ? ' campo-casilla' : ''}`} style={estilo}>
      {etiqueta && <label htmlFor={id}>{etiqueta}</label>}
      {children}
      {ayuda && <span className="ayuda">{ayuda}</span>}
      <p id={`${id}-error`} className={`campo-error${error ? ' visible' : ''}`} role="alert">{error || ''}</p>
    </div>
  );
}
// Contraseña con botón Mostrar / Ocultar
export function CampoClave({ id, valor, alCambiar, error, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="con-ojo">
      <input {...propsCampo(id, error)} type={visible ? 'text' : 'password'} value={valor} onChange={alCambiar} autoComplete={autoComplete} />
      <button type="button" className="btn-ojo" aria-pressed={visible ? 'true' : 'false'} onClick={() => setVisible(!visible)}>
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}

/* ---------- Envío con un solo clic ---------- */
// ejecutar(fn): si ya hay un envío en curso no hace nada. Así un doble clic (o Enter dos veces) guarda una sola vez.
export function useEnvio() {
  const [ocupado, setOcupado] = useState(false);
  const enCurso = useRef(false);
  const ejecutar = useCallback(async (fn) => {
    if (enCurso.current) { return undefined; }
    enCurso.current = true;
    setOcupado(true);
    try { return await fn(); } finally { enCurso.current = false; setOcupado(false); }
  }, []);
  return [ocupado, ejecutar];
}
export function Boton({ ocupado, textoOcupado = 'Procesando…', children, className = 'btn btn-primario', type = 'submit', ...resto }) {
  return <button type={type} className={className} disabled={ocupado || resto.disabled} {...resto}>{ocupado ? textoOcupado : children}</button>;
}

/* ---------- Datos que se piden a la API al abrir la pantalla ---------- */
export function useDatos(pedir, deps, activo = true) {
  const [estado, setEstado] = useState({ datos: null, error: '', status: 0, cargando: activo });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!activo) { return undefined; }
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: '' }));
    pedir()
      .then((d) => { if (vigente) { setEstado({ datos: d, error: '', status: 200, cargando: false }); } })
      .catch((e) => { if (vigente) { setEstado({ datos: null, error: e && !e.manejado ? e.mensaje : '', status: e ? e.status : 0, cargando: false }); } });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, activo, version]);
  return { ...estado, recargar: () => setVersion((v) => v + 1) };
}

/* ---------- Estados y barras ---------- */
const SIMBOLO = { cumple: '✔', riesgo: '!', nocumple: '✖' };
export function Chip({ estado }) {
  const clase = SIMBOLO[estado] ? estado : 'neutro';
  return (
    <span className={`chip ${clase}`}>
      {SIMBOLO[estado] && <span aria-hidden="true">{SIMBOLO[estado]}</span>}
      {TEXTO_ESTADO[estado] || estado || 'Sin datos'}
    </span>
  );
}
export function ChipActivo({ activo }) {
  return activo
    ? <span className="chip cumple"><span aria-hidden="true">✔</span>Activo</span>
    : <span className="chip neutro"><span aria-hidden="true">–</span>Inactivo</span>;
}

export function BarraFila({ nombre, valor, estado, meta, texto }) {
  return (
    <div className="barra-fila">
      <span className="barra-nombre">{nombre}</span>
      <div className="barra-pista">
        <div className={`barra-relleno ${SIMBOLO[estado] ? estado : 'neutro'}`} style={{ width: `${ancho(valor)}%` }} />
        {meta !== undefined && meta !== null && <div className="barra-meta" style={{ left: `${ancho(meta)}%` }} title={`Meta ${meta} %`} />}
      </div>
      <span className="barra-valor">{texto}</span>
    </div>
  );
}

/* ---------- Páginas de una lista ---------- */
export function Paginacion({ pagina, total, tamano, alCambiar }) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  return (
    <div className="paginacion">
      <button type="button" className="btn btn-secundario btn-pequeno" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>Anterior</button>
      <span className="texto-2 pequeno">Página {pagina} de {paginas}</span>
      <button type="button" className="btn btn-secundario btn-pequeno" disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>Siguiente</button>
    </div>
  );
}

/* ---------- Ventana de confirmación ---------- */
export function Confirmar({ titulo, texto, textoBoton = 'Confirmar', ocupado = false, alConfirmar, alCancelar }) {
  const cancelar = useRef(null);
  const anterior = useRef(document.activeElement);
  useEffect(() => {
    if (cancelar.current) { cancelar.current.focus(); }
    const previo = anterior.current;
    return () => { if (previo && previo.focus) { previo.focus(); } };
  }, []);
  return (
    <div className="modal-fondo" role="dialog" aria-modal="true" aria-labelledby="modal-titulo"
      onKeyDown={(ev) => { if (ev.key === 'Escape' && !ocupado) { alCancelar(); } }}>
      <div className="modal">
        <h2 id="modal-titulo">{titulo}</h2>
        <p>{texto}</p>
        <div className="acciones">
          <button type="button" ref={cancelar} className="btn btn-secundario" disabled={ocupado} onClick={alCancelar}>Cancelar</button>
          <button type="button" className="btn btn-primario" disabled={ocupado} onClick={alConfirmar}>{textoBoton}</button>
        </div>
      </div>
    </div>
  );
}

// Detalle de un cambio de la auditoría: valor anterior y nuevo, o el objeto completo. Siempre como texto.
export function DetalleCambio({ detalle }) {
  const d = detalle || {};
  if (d.antes !== undefined || d.despues !== undefined) {
    return (
      <details className="ver">
        <summary>Ver detalle</summary>
        <div className="cambio">
          <div><h4>Valor anterior</h4><pre className="json">{d.antes === null || d.antes === undefined ? '(no existía)' : JSON.stringify(d.antes, null, 2)}</pre></div>
          <div><h4>Valor nuevo</h4><pre className="json">{d.despues === null || d.despues === undefined ? '(sin valor)' : JSON.stringify(d.despues, null, 2)}</pre></div>
        </div>
      </details>
    );
  }
  return (
    <details className="ver">
      <summary>Ver detalle</summary>
      <pre className="json">{JSON.stringify(d, null, 2)}</pre>
    </details>
  );
}
