'use strict';
// Validaciones del servidor. Son las MISMAS reglas del plan de pruebas (informe, sección 7.3)
// y del prototipo, pero se repiten aquí porque el navegador no es de fiar: quien modifique
// la solicitud se salta el formulario, y el servidor es la última barrera.
//
// Cada función devuelve { valor } si el dato es válido o { error } con el mensaje para la persona.

const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RE_PERIODO = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const RE_FECHA = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const RE_CELDA = /^[A-Za-z]{1,3}[1-9][0-9]{0,6}$/;
const RE_ENTERO = /^[0-9]+$/;
const RE_ID = /^[1-9][0-9]{0,8}$/;

// PostgreSQL no acepta el carácter NUL (\u0000) dentro de un texto: lo rechazamos antes.
function tieneNulo(s) { return s.indexOf('\u0000') >= 0; }
// Largo en caracteres (no en unidades UTF-16): así un emoji cuenta 1, igual que en varchar(n).
function largo(s) { return Array.from(s).length; }

function correo(v) {
  const MSG = 'Ingrese un correo válido';
  if (typeof v !== 'string' || v.length === 0 || largo(v) > 100 || tieneNulo(v) || !RE_CORREO.test(v)) { return { error: MSG }; }
  return { valor: v.toLowerCase() };
}

// Contraseña de 8 a 64 caracteres (informe 6.1). bcrypt solo considera los primeros 72 bytes,
// por eso también se rechaza un texto que, siendo de 64 caracteres, pase de 72 bytes.
function clave(v) {
  const MSG = 'La contraseña debe tener entre 8 y 64 caracteres';
  if (typeof v !== 'string' || tieneNulo(v)) { return { error: MSG }; }
  const n = largo(v);
  if (n < 8 || n > 64 || Buffer.byteLength(v, 'utf8') > 72) { return { error: MSG }; }
  return { valor: v };
}

function periodo(v) {
  if (typeof v !== 'string' || !RE_PERIODO.test(v)) { return { error: 'Ingrese un período válido (AAAA-MM)' }; }
  return { valor: v };
}

function anio(v) {
  if (typeof v !== 'string' || !/^[0-9]{4}$/.test(v)) { return { error: 'Ingrese un año válido (AAAA)' }; }
  return { valor: v };
}

// Fecha AAAA-MM-DD que exista de verdad (el 31-02 no existe). Devuelve el mismo texto.
function fecha(v) {
  const MSG = 'Ingrese una fecha que exista (AAAA-MM-DD)';
  if (typeof v !== 'string') { return { error: MSG }; }
  const m = RE_FECHA.exec(v);
  if (!m) { return { error: MSG }; }
  const a = Number(m[1]); const mes = Number(m[2]); const d = Number(m[3]);
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (a < 1900 || f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) { return { error: MSG }; }
  return { valor: v };
}

// Rango de fechas: ambas o ninguna; Hasta no puede ser anterior a Desde.
function rangoFechas(desde, hasta) {
  const vacio = (x) => x === undefined || x === null || x === '';
  if (vacio(desde) && vacio(hasta)) { return { valor: null }; }
  const campos = {};
  const d = fecha(desde); const h = fecha(hasta);
  if (d.error) { campos.desde = d.error; }
  if (h.error) { campos.hasta = h.error; }
  if (!d.error && !h.error && h.valor < d.valor) { campos.hasta = 'La fecha Hasta no puede ser anterior a Desde'; }
  if (Object.keys(campos).length > 0) { return { error: 'Revise las fechas', campos }; }
  return { valor: { desde: d.valor, hasta: h.valor } };
}

// Entero escrito solo con dígitos (rechaza letras, punto, coma, signo y 1e3). Acepta número o texto.
function entero(v, min, max, mensaje) {
  const MSG = mensaje || `Ingrese un entero entre ${min} y ${max}`;
  let n;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) { return { error: MSG }; }
    n = v;
  } else if (typeof v === 'string' && RE_ENTERO.test(v) && v.length <= 15) {
    n = Number(v);
  } else {
    return { error: MSG };
  }
  if (n < min || n > max) { return { error: MSG }; }
  return { valor: n };
}

// Número con hasta 'decimales' decimales, sin signo ni notación científica. Acepta número o texto (coma o punto).
function decimal(v, min, max, decimales, mensaje) {
  const MSG = mensaje || `Ingrese un número entre ${min} y ${max} con hasta ${decimales} decimales`;
  let texto;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) { return { error: MSG }; }
    texto = String(v);
    if (/e/i.test(texto)) { return { error: MSG }; }
  } else if (typeof v === 'string') {
    texto = v.replace(',', '.');
  } else {
    return { error: MSG };
  }
  const re = new RegExp('^[0-9]+(\\.[0-9]{1,' + decimales + '})?$');
  if (!re.test(texto)) { return { error: MSG }; }
  const n = Number(texto);
  if (n < min || n > max) { return { error: MSG }; }
  return { valor: n };
}

// Texto con al menos 'min' caracteres que no sean espacios y no más de 'max'. Se guarda sin espacios en los bordes.
function texto(v, min, max, nombre) {
  const etiqueta = nombre || 'El texto';
  const MSG = min === 0
    ? `${etiqueta} no puede tener más de ${max} caracteres`
    : `${etiqueta} debe tener entre ${min} y ${max} caracteres`;
  if (typeof v !== 'string' || tieneNulo(v)) { return { error: MSG }; }
  const limpio = v.trim();
  if (largo(limpio) < min || largo(v) > max) { return { error: MSG }; }
  return { valor: limpio };
}

// Texto opcional: vacío o ausente es válido y queda como null.
function textoOpcional(v, max, nombre) {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) { return { valor: null }; }
  return texto(v, 1, max, nombre);
}

// Referencia de celda de Excel: B12 sí; 12B y B-12 no. Se guarda en mayúsculas.
function celdaExcel(v, nombre) {
  const MSG = `${nombre || 'La celda'}: use el formato de Excel, por ejemplo B12`;
  if (typeof v !== 'string' || v.length > 50 || !RE_CELDA.test(v)) { return { error: MSG }; }
  return { valor: v.toUpperCase() };
}

// Identificador numérico de la base (entero positivo, sin ceros a la izquierda).
function id(v, mensaje) {
  const MSG = mensaje || 'Identificador no válido';
  if (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 999999999) { return { valor: v }; }
  if (typeof v === 'string' && RE_ID.test(v)) { return { valor: Number(v) }; }
  return { error: MSG };
}

// El valor debe ser uno de la lista (comparación exacta).
function opcion(v, lista, mensaje) {
  if (typeof v !== 'string' || lista.indexOf(v) < 0) { return { error: mensaje || 'Valor no permitido' }; }
  return { valor: v };
}

function booleano(v, mensaje) {
  if (typeof v !== 'boolean') { return { error: mensaje || 'Debe ser verdadero o falso' }; }
  return { valor: v };
}

// Junta los resultados de varias validaciones: { valores, campos } (campos vacío = todo bien).
function reunir(pares) {
  const valores = {}; const campos = {};
  Object.keys(pares).forEach((k) => {
    const r = pares[k];
    if (r.error) { campos[k] = r.error; } else { valores[k] = r.valor; }
  });
  return { valores, campos, ok: Object.keys(campos).length === 0 };
}

module.exports = {
  RE_CORREO, RE_PERIODO, largo,
  correo, clave, periodo, anio, fecha, rangoFechas, entero, decimal, texto, textoOpcional,
  celdaExcel, id, opcion, booleano, reunir
};
