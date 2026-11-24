'use strict';
// Parametrización de indicadores (pantallas 12 y 13) y detalle de un indicador (pantalla 7).
const db = require('../db');
const { E } = require('../middleware/errores');
const auditoria = require('./auditoria');
const usuarios = require('./usuarios');
const resultados = require('./resultados');
const { ROL } = require('../lib/permisos');

const COLUMNAS = `i.id, i.nombre, i.programa_id, p.nombre AS programa, i.rem_codigo, i.seccion, i.celda_numerador,
  i.origen_denominador, i.celda_denominador, i.codigo_prestacion, i.meta_nacional, i.peso_relativo,
  i.referente_responsable, i.activo`;
const DESDE = 'FROM indicador i JOIN programa p ON p.id = i.programa_id';

function aApi(f) {
  return {
    id: f.id, nombre: f.nombre, programaId: f.programa_id, programa: f.programa, remCodigo: f.rem_codigo,
    seccion: f.seccion, celdaNumerador: f.celda_numerador, origenDenominador: f.origen_denominador,
    celdaDenominador: f.celda_denominador, codigoPrestacion: f.codigo_prestacion, metaNacional: f.meta_nacional,
    pesoRelativo: f.peso_relativo, referenteResponsable: f.referente_responsable, activo: f.activo
  };
}

async function listar(filtros) {
  const q = filtros.q ? usuarios.patronLike(filtros.q) : null;
  const r = await db.consultar(
    `SELECT ${COLUMNAS} ${DESDE}
      WHERE ($1::text IS NULL OR i.nombre ILIKE $1 ESCAPE '\\' OR i.rem_codigo ILIKE $1 ESCAPE '\\')
        AND ($2::int IS NULL OR i.programa_id = $2)
      ORDER BY p.nombre, i.rem_codigo, i.id`, [q, filtros.programaId]);
  return r.rows.map(aApi);
}

async function obtener(id, ejecutor) {
  const r = await (ejecutor || db.pool).query(`SELECT ${COLUMNAS} ${DESDE} WHERE i.id = $1`, [id]);
  if (r.rowCount === 0) { throw E.noEncontrado('Indicador no encontrado'); }
  return aApi(r.rows[0]);
}

async function revisarPrograma(ejecutor, programaId) {
  const p = await ejecutor.query('SELECT id FROM programa WHERE id = $1', [programaId]);
  if (p.rowCount === 0) { throw E.solicitudInvalida('Programa no válido', { programaId: 'Elija un programa de la lista' }); }
}

// Los datos ya vienen validados por la ruta (largos, formato de celdas, combinación origen/celda)
async function crear(d, actor) {
  const id = await db.transaccion(async (cl) => {
    await revisarPrograma(cl, d.programaId);
    const r = await cl.query(
      `INSERT INTO indicador (nombre, programa_id, rem_codigo, seccion, celda_numerador, origen_denominador, celda_denominador,
                              codigo_prestacion, meta_nacional, peso_relativo, referente_responsable, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [d.nombre, d.programaId, d.remCodigo, d.seccion, d.celdaNumerador, d.origenDenominador, d.celdaDenominador,
        d.codigoPrestacion, d.metaNacional, d.pesoRelativo, d.referenteResponsable, d.activo]);
    await auditoria.registrar(cl, {
      usuarioId: actor.id, accion: 'CREAR_INDICADOR', entidad: 'indicador', entidadId: r.rows[0].id,
      detalle: { antes: null, despues: { codigo: d.remCodigo, nombre: d.nombre, meta_nacional: d.metaNacional } }
    });
    return r.rows[0].id;
  });
  return obtener(id);
}

const CAMPOS_AUDITADOS = [
  ['nombre', 'nombre'], ['programaId', 'programa_id'], ['remCodigo', 'rem_codigo'], ['seccion', 'seccion'],
  ['celdaNumerador', 'celda_numerador'], ['origenDenominador', 'origen_denominador'], ['celdaDenominador', 'celda_denominador'],
  ['codigoPrestacion', 'codigo_prestacion'], ['metaNacional', 'meta_nacional'], ['pesoRelativo', 'peso_relativo'],
  ['referenteResponsable', 'referente_responsable'], ['activo', 'activo']
];

async function actualizar(id, d, actor) {
  await db.transaccion(async (cl) => {
    const act = await cl.query('SELECT * FROM indicador WHERE id = $1 FOR UPDATE', [id]);
    if (act.rowCount === 0) { throw E.noEncontrado('Indicador no encontrado'); }
    await revisarPrograma(cl, d.programaId);
    const antes = act.rows[0];
    await cl.query(
      `UPDATE indicador SET nombre = $2, programa_id = $3, rem_codigo = $4, seccion = $5, celda_numerador = $6,
              origen_denominador = $7, celda_denominador = $8, codigo_prestacion = $9, meta_nacional = $10,
              peso_relativo = $11, referente_responsable = $12, activo = $13
        WHERE id = $1`,
      [id, d.nombre, d.programaId, d.remCodigo, d.seccion, d.celdaNumerador, d.origenDenominador, d.celdaDenominador,
        d.codigoPrestacion, d.metaNacional, d.pesoRelativo, d.referenteResponsable, d.activo]);
    // Auditoría: solo lo que cambió, con el valor anterior y el nuevo
    const a = {}; const n = {};
    CAMPOS_AUDITADOS.forEach(([campoApi, columna]) => {
      const viejo = antes[columna] === undefined ? null : antes[columna];
      const nuevo = d[campoApi] === undefined ? null : d[campoApi];
      // numeric llega como número (parser de db.js) pero 'antes' viene de SELECT *: ya es número
      if (viejo !== nuevo) { a[columna] = viejo; n[columna] = nuevo; }
    });
    if (Object.keys(n).length > 0) {
      await auditoria.registrar(cl, { usuarioId: actor.id, accion: 'ACTUALIZAR_INDICADOR', entidad: 'indicador', entidadId: id, detalle: { antes: a, despues: n } });
    }
  });
  return obtener(id);
}

// Pantalla 7: indicador + resultado del período + evolución mensual
async function detalle(id, periodo) {
  const indicador = await obtener(id);
  const todos = await resultados.porPeriodos(await periodosDelIndicador(), { indicadorId: id });
  const historial = todos
    .map((x) => ({ periodo: x.periodo, numerador: x.numerador, denominador: x.denominador, resultado: x.resultado, estado: x.estado }))
    .sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
  const delPeriodo = periodo ? (todos.find((x) => x.periodo === periodo) || null) : null;
  return { indicador, periodo: periodo || null, resultado: delPeriodo, historial };
}

async function periodosDelIndicador() {
  const r = await db.consultar(
    `SELECT DISTINCT c.periodo FROM carga_rem c
      WHERE EXISTS (SELECT 1 FROM resultado_indicador r WHERE r.carga_rem_id = c.id) ORDER BY c.periodo`);
  return r.rows.map((x) => x.periodo);
}

// El Jefe de Programa solo accede a indicadores de su programa (T-6)
function verificarAlcance(usuario, indicador) {
  if (usuario.rol === ROL.JEFE && indicador.programaId !== usuario.programaId) {
    throw E.prohibido('No tiene permiso para ver ese indicador');
  }
}

module.exports = { aApi, listar, obtener, crear, actualizar, detalle, verificarAlcance };
