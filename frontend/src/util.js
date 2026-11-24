// Utilidades compartidas: validaciones (las mismas reglas del plan de pruebas), formatos de cifras y fechas.

export const NOMBRE_SISTEMA = 'CESFAM Santa Rosa';
export const NOMBRE_SUB = 'Metas sanitarias';
export const EN_DESARROLLO = Boolean(import.meta.env && import.meta.env.DEV);

/* ---------- Validaciones (reglas de la sección 7.3 del plan de pruebas) ---------- */
export const V = {
  // Correo de hasta 100 caracteres, sin espacios, con @ y dominio
  correo: (t) => t.length > 0 && t.length <= 100 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t),
  // Contraseña de 8 a 64 caracteres
  clave: (t) => t.length >= 8 && t.length <= 64,
  // Entero positivo escrito solo con dígitos: rechaza letras, puntos, comas, signos y 1e3
  entero: (t, min, max) => {
    if (!/^[0-9]+$/.test(t)) { return false; }
    const n = Number(t);
    return n >= min && n <= max;
  },
  // Decimal con coma o punto y hasta 2 decimales, sin signo
  decimal: (t, min, max) => {
    if (!/^[0-9]+([.,][0-9]{1,2})?$/.test(t)) { return false; }
    const n = Number(t.replace(',', '.'));
    return n >= min && n <= max;
  },
  periodo: (t) => /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(t), // AAAA-MM
  // Fecha DD-MM-AAAA que exista de verdad (31-02 no existe). Devuelve un Date o null.
  fecha: (t) => {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
    if (!m) { return null; }
    const d = Number(m[1]); const mes = Number(m[2]); const a = Number(m[3]);
    const f = new Date(a, mes - 1, d);
    return (f.getFullYear() === a && f.getMonth() === mes - 1 && f.getDate() === d) ? f : null;
  },
  celdaExcel: (t) => t.length <= 50 && /^[A-Za-z]{1,3}[1-9][0-9]{0,6}$/.test(t), // B12 sí; 12B y B-12 no
  // Al menos 'min' caracteres que no sean espacios y no más de 'max'
  largo: (t, min, max) => t.trim().length >= min && t.length <= max
};

// 'DD-MM-AAAA' -> 'AAAA-MM-DD' (el formato que pide la API)
export function fechaIso(texto) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(texto);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/* ---------- Formatos ---------- */
// 1500 -> "1.500"; 76.25 -> "76,25"
export function numero(n) {
  if (n === null || n === undefined || n === '') { return '—'; }
  const partes = String(n).split('.');
  const entera = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return partes[1] ? `${entera},${partes[1]}` : entera;
}
export function porcentaje(n) {
  return n === null || n === undefined ? '—' : `${numero(n)} %`;
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
// Fecha ISO (UTC) -> "12-06-2026 10:20" en hora de Chile
export function fechaHora(iso) {
  if (!iso) { return '—'; }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) { return String(iso); }
  const p = {};
  FORMATO_FECHA.formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function nombrePeriodo(p) { // '2026-06' -> 'junio 2026'
  const m = /^(\d{4})-(\d{2})$/.exec(p || '');
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : (p || '');
}
export function periodoActual() { // 'AAAA-MM' del mes en curso (hora local)
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

export const TEXTO_ESTADO = {
  cumple: 'Cumple', riesgo: 'En riesgo', nocumple: 'No cumple', sin_poblacion: 'Sin población', sin_datos: 'Sin datos'
};

// Ancho de una barra: entre 0 y 100
export function ancho(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 0;
}

// Textos de la auditoría (acciones y entidades que entrega la API)
export const ACCIONES = {
  LOGIN_FALLIDO: 'Inicio de sesión fallido', CUENTA_BLOQUEADA: 'Cuenta bloqueada', CAMBIO_CLAVE: 'Cambio de contraseña',
  RESTABLECER_CLAVE: 'Restablecimiento de contraseña', SOLICITUD_RECUPERACION: 'Solicitud de recuperación', LOGOUT: 'Cierre de sesión',
  CARGA_REM: 'Carga de REM', INGRESO_POBLACION: 'Ingreso de población', CREAR_INDICADOR: 'Creación de indicador',
  ACTUALIZAR_INDICADOR: 'Actualización de indicador', CREAR_USUARIO: 'Creación de usuario', ACTUALIZAR_USUARIO: 'Actualización de usuario',
  ACTIVAR_USUARIO: 'Activación de usuario', DESACTIVAR_USUARIO: 'Desactivación de usuario', COMENTAR_INDICADOR: 'Comentario en indicador'
};
export const ENTIDADES = {
  usuario: 'Usuario', indicador: 'Indicador', carga_rem: 'Carga de REM', poblacion_denominador: 'Población (denominador)',
  comentario_indicador: 'Comentario de indicador'
};
