'use strict';
// Utilidades de períodos (AAAA-MM) y fechas.

// '2026-03-15' -> '2026-03'
function periodoDeFecha(iso) { return iso.slice(0, 7); }

// Períodos de la lista que quedan entre dos fechas (inclusive por mes)
function periodosEnRango(periodos, desdeISO, hastaISO) {
  const a = periodoDeFecha(desdeISO); const b = periodoDeFecha(hastaISO);
  return periodos.filter((p) => p >= a && p <= b);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function nombrePeriodo(p) {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? MESES[Number(m[2]) - 1] + ' ' + m[1] : p;
}

module.exports = { periodoDeFecha, periodosEnRango, nombrePeriodo };
