'use strict';
// Reglas de cálculo de los indicadores (sin base de datos: así se prueban fácilmente).

// Redondeo a 2 decimales, hacia arriba en el medio (82,005 -> 82,01).
function redondear2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }

// Resultado = numerador / denominador * 100. Con denominador cero no hay resultado (null).
function calcularResultado(numerador, denominador) {
  if (!(denominador > 0)) { return null; }
  return redondear2((numerador * 100) / denominador);
}

// Regla de la demostración: cumple (desde la meta), en riesgo (desde el 90 % de la meta) o no cumple.
// Se compara en centésimas enteras para evitar errores de coma flotante (0,9 * 80 no es exacto).
function estadoSegunMeta(resultado, meta) {
  if (resultado === null || resultado === undefined) { return null; }
  const r = Math.round(resultado * 100);
  const m = Math.round(meta * 100);
  if (r >= m) { return 'cumple'; }
  if (r * 10 >= m * 9) { return 'riesgo'; }
  return 'nocumple';
}

// Estado que ve el frontend, incluyendo los casos sin resultado.
//   sin_datos: el período no tiene resultado para ese indicador
//   sin_poblacion: falta ingresar la población (denominador a mano)
//   sin_denominador: el denominador que vino del REM es cero
function estadoDeFila(fila) {
  if (!fila.tiene_resultado) { return 'sin_datos'; }
  if (fila.resultado === null || fila.resultado === undefined) {
    return fila.origen_denominador === 'POBLACION' ? 'sin_poblacion' : 'sin_denominador';
  }
  return estadoSegunMeta(fila.resultado, fila.meta);
}

// Fila de la consulta SQL -> objeto del contrato de la API
function armarItem(fila) {
  return {
    indicadorId: fila.indicador_id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    programaId: fila.programa_id,
    programa: fila.programa,
    origenDenominador: fila.origen_denominador,
    meta: fila.meta,
    pesoRelativo: fila.peso_relativo,
    periodo: fila.periodo,
    numerador: fila.tiene_resultado ? fila.numerador : null,
    denominador: fila.tiene_resultado ? fila.denominador : null,
    resultado: fila.tiene_resultado ? fila.resultado : null,
    estado: estadoDeFila(fila)
  };
}

const TEXTO_ESTADO = {
  cumple: 'Cumple', riesgo: 'En riesgo', nocumple: 'No cumple',
  sin_poblacion: 'Sin población', sin_denominador: 'Sin denominador', sin_datos: 'Sin datos'
};

function contarEstados(items) {
  const c = { cumple: 0, riesgo: 0, nocumple: 0, sinPoblacion: 0, sinDatos: 0 };
  items.forEach((it) => {
    if (it.estado === 'cumple') { c.cumple++; }
    else if (it.estado === 'riesgo') { c.riesgo++; }
    else if (it.estado === 'nocumple') { c.nocumple++; }
    else if (it.estado === 'sin_poblacion') { c.sinPoblacion++; }
    else { c.sinDatos++; }
  });
  return c;
}

// Promedio de los valores que no son null (null si no hay ninguno)
function promedio(valores) {
  const v = valores.filter((x) => x !== null && x !== undefined);
  if (v.length === 0) { return null; }
  return redondear2(v.reduce((a, b) => a + b, 0) / v.length);
}

module.exports = { TEXTO_ESTADO, redondear2, calcularResultado, estadoSegunMeta, estadoDeFila, armarItem, contarEstados, promedio };
