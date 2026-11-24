'use strict';
// Consultas de resultados para dashboard, reportes, comparativo, detalle y exportación.
//
// "Carga vigente" de un período = la carga MÁS RECIENTE de ese período que sí generó resultados.
// Así, si se sube de nuevo el REM de un mes (por ejemplo corregido), la nueva carga reemplaza a la
// anterior en los reportes sin borrar nada: las cargas anteriores quedan como historial.
const db = require('../db');
const { armarItem } = require('../lib/calculo');

const CTE_VIGENTE = `vigente AS (
  SELECT DISTINCT ON (c.periodo) c.id, c.periodo
    FROM carga_rem c
   WHERE EXISTS (SELECT 1 FROM resultado_indicador r WHERE r.carga_rem_id = c.id)
   ORDER BY c.periodo, c.id DESC
)`;

// Un objeto por (indicador activo, período). Si el indicador no tiene fila de resultado en la carga
// vigente del período, 'tiene_resultado' es falso (el frontend lo muestra como "sin datos").
async function porPeriodos(periodos, filtros) {
  const f = filtros || {};
  const r = await db.consultar(
    `WITH ${CTE_VIGENTE}
     SELECT i.id AS indicador_id, i.rem_codigo AS codigo, i.nombre, i.programa_id, p.nombre AS programa,
            i.origen_denominador, i.meta_nacional AS meta, i.peso_relativo, v.periodo,
            r.valor_numerador AS numerador, r.valor_denominador AS denominador, r.valor_resultado AS resultado,
            (r.id IS NOT NULL) AS tiene_resultado
       FROM vigente v
       CROSS JOIN indicador i
       JOIN programa p ON p.id = i.programa_id
       LEFT JOIN resultado_indicador r ON r.carga_rem_id = v.id AND r.indicador_id = i.id
      WHERE v.periodo = ANY($1::text[])
        AND i.activo
        AND ($2::int IS NULL OR i.programa_id = $2)
        AND ($3::int IS NULL OR i.id = $3)
      ORDER BY p.nombre, i.rem_codigo, v.periodo DESC`,
    [periodos, f.programaId === undefined ? null : f.programaId, f.indicadorId === undefined ? null : f.indicadorId]);
  return r.rows.map(armarItem);
}

// Promedio de los resultados mensuales de cada indicador en un año (ignora meses sin resultado).
// Regla de la demostración; la forma exacta de acumular el año (promedio, último corte, suma
// de numeradores y denominadores) queda por confirmar con el cliente.
async function anual(anio, filtros) {
  const f = filtros || {};
  const r = await db.consultar(
    `WITH ${CTE_VIGENTE}
     SELECT i.id AS indicador_id, i.rem_codigo AS codigo, i.nombre, i.programa_id, p.nombre AS programa,
            i.meta_nacional AS meta, round(avg(r.valor_resultado), 2) AS resultado, count(r.valor_resultado) AS meses
       FROM indicador i
       JOIN programa p ON p.id = i.programa_id
       LEFT JOIN vigente v ON left(v.periodo::text, 4) = $1
       LEFT JOIN resultado_indicador r ON r.carga_rem_id = v.id AND r.indicador_id = i.id
      WHERE i.activo AND ($2::int IS NULL OR i.programa_id = $2)
      GROUP BY i.id, i.rem_codigo, i.nombre, i.programa_id, p.nombre, i.meta_nacional
      ORDER BY p.nombre, i.rem_codigo`,
    [anio, f.programaId === undefined ? null : f.programaId]);
  return r.rows;
}

module.exports = { CTE_VIGENTE, porPeriodos, anual };
