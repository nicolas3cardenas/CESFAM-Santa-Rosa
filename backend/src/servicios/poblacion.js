'use strict';
// Ingreso de la población (denominador a mano) de los indicadores con origen "Población" (pantalla 11).
const db = require('../db');
const { E } = require('../middleware/errores');
const auditoria = require('./auditoria');

async function listar(periodo) {
  const r = await db.consultar(
    `SELECT i.id AS indicador_id, i.rem_codigo AS codigo, i.nombre, p.nombre AS programa, pd.valor, pd.fecha_ingreso
       FROM indicador i
       JOIN programa p ON p.id = i.programa_id
       LEFT JOIN poblacion_denominador pd ON pd.indicador_id = i.id AND pd.periodo = $1
      WHERE i.activo AND i.origen_denominador = 'POBLACION'
      ORDER BY p.nombre, i.rem_codigo`, [periodo]);
  return r.rows.map((f) => ({
    indicadorId: f.indicador_id, codigo: f.codigo, nombre: f.nombre, programa: f.programa,
    valor: f.valor, fechaIngreso: f.fecha_ingreso, pendiente: f.valor === null
  }));
}

// Guarda la población de un indicador y período. Un valor ya ingresado NO se sobrescribe (P11-2).
// Si el REM de ese mes ya estaba cargado y el resultado quedó sin calcular por falta de población,
// se calcula ahora con el valor recién ingresado.
async function ingresar(usuario, indicadorId, periodo, valor) {
  return db.transaccion(async (cl) => {
    await cl.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['periodo:' + periodo]);

    const ind = await cl.query('SELECT id, rem_codigo, activo, origen_denominador FROM indicador WHERE id = $1', [indicadorId]);
    if (ind.rowCount === 0 || !ind.rows[0].activo || ind.rows[0].origen_denominador !== 'POBLACION') {
      throw E.solicitudInvalida('Indicador no válido', { indicadorId: 'Elija un indicador activo cuyo denominador sea la población' });
    }

    // Si ya existe, no se inserta nada y no se escribe auditoría: el doble clic o un segundo intento no dejan rastro doble
    const ins = await cl.query(
      `INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (indicador_id, periodo) DO NOTHING
       RETURNING id`, [indicadorId, periodo, valor, usuario.id]);
    if (ins.rowCount === 0) {
      throw E.conflicto('Ya existe población para ese período', { periodo: 'Ya existe población para ese período' });
    }
    const id = ins.rows[0].id;

    const act = await cl.query(
      `UPDATE resultado_indicador r
          SET valor_denominador = $3::numeric,
              valor_resultado   = round(r.valor_numerador * 100.0 / $3::numeric, 2)
         FROM (SELECT c.id FROM carga_rem c
                WHERE c.periodo = $2
                  AND EXISTS (SELECT 1 FROM resultado_indicador x WHERE x.carga_rem_id = c.id)
                ORDER BY c.id DESC LIMIT 1) v
        WHERE r.carga_rem_id = v.id AND r.indicador_id = $1 AND r.valor_denominador = 0
        RETURNING r.id`, [indicadorId, periodo, valor]);

    await auditoria.registrar(cl, {
      usuarioId: usuario.id, accion: 'INGRESO_POBLACION', entidad: 'poblacion_denominador', entidadId: id,
      detalle: { antes: null, despues: { indicador: ind.rows[0].rem_codigo, periodo, valor } }
    });
    return { id, indicadorId, periodo, valor, resultadosActualizados: act.rowCount };
  });
}

module.exports = { listar, ingresar };
