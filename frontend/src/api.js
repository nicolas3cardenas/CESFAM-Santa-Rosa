// Cliente de la API. Reglas (docs/API.md y frontend/README.md):
//  - el token vive solo en memoria (esta variable), nunca en localStorage;
//  - si una respuesta trae X-Token-Renovado, se reemplaza el token guardado;
//  - 401 fuera del inicio de sesión: se descarta la sesión y se vuelve al inicio de sesión;
//  - 403: se muestra la pantalla "Acceso denegado".

const BASE = (import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:3001/api';

let token = null;
let manejadores = { alVencer: () => {}, alDenegar: () => {} };

export function configurar(m) { manejadores = { ...manejadores, ...m }; }
export function fijarToken(t) { token = t || null; }
export function haySesion() { return token !== null; }

export class ErrorApi extends Error {
  constructor(status, mensaje, campos) {
    super(mensaje);
    this.status = status;
    this.mensaje = mensaje;
    this.campos = campos || null;
    this.manejado = false; // true si ya se actuó (volver al inicio de sesión o mostrar "Acceso denegado")
  }
}

function armarUrl(ruta, params) {
  const q = new URLSearchParams();
  Object.keys(params || {}).forEach((k) => {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') { q.set(k, String(v)); }
  });
  const texto = q.toString();
  return BASE + ruta + (texto ? `?${texto}` : '');
}

function nombreDeArchivo(cabecera) {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cabecera || '');
  return m ? decodeURIComponent(m[1]) : null;
}

async function pedir(ruta, { metodo = 'GET', cuerpo, formData, params, blob = false, sinSesion = false } = {}) {
  const cabeceras = {};
  if (token) { cabeceras.Authorization = `Bearer ${token}`; }
  let body;
  if (formData) {
    body = formData; // el navegador arma el Content-Type (multipart) con su separador
  } else if (cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
    body = JSON.stringify(cuerpo);
  }

  let res;
  try {
    res = await fetch(armarUrl(ruta, params), { method: metodo, headers: cabeceras, body });
  } catch (e) {
    throw new ErrorApi(0, 'No se pudo conectar con el servidor. Revise que esté encendido e intente de nuevo.');
  }

  const renovado = res.headers.get('X-Token-Renovado');
  if (renovado && token) { token = renovado; }

  if (res.status === 204) { return null; }
  if (res.ok) {
    if (blob) { return { blob: await res.blob(), nombre: nombreDeArchivo(res.headers.get('Content-Disposition')) }; }
    return res.json();
  }

  let datos = null;
  try { datos = await res.json(); } catch (e) { /* respuesta sin cuerpo JSON */ }
  const err = new ErrorApi(res.status, (datos && datos.error) || 'Ocurrió un error inesperado. Intente nuevamente más tarde.', datos && datos.campos);
  if (res.status === 401 && !sinSesion && token) {
    token = null;
    err.manejado = true;
    manejadores.alVencer(err.mensaje);
  } else if (res.status === 403) {
    err.manejado = true;
    manejadores.alDenegar();
  }
  throw err;
}

export const api = {
  get: (ruta, params, opciones) => pedir(ruta, { params, ...opciones }),
  post: (ruta, cuerpo, opciones) => pedir(ruta, { metodo: 'POST', cuerpo, ...opciones }),
  put: (ruta, cuerpo) => pedir(ruta, { metodo: 'PUT', cuerpo }),
  patch: (ruta, cuerpo) => pedir(ruta, { metodo: 'PATCH', cuerpo }),
  subir: (ruta, formData) => pedir(ruta, { metodo: 'POST', formData }),
  descargar: (ruta, params) => pedir(ruta, { params, blob: true })
};
