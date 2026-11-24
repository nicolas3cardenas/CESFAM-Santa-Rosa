'use strict';
// Comentarios breves del Jefe de Programa sobre un indicador (pantalla 7).
// El texto se guarda TAL CUAL lo escribió la persona y se entrega como texto: el navegador nunca lo
// interpreta como HTML, así que un <script> se ve como letras y no se ejecuta (T-2, P7-2).
const db = require('../db');
const auditoria = require('./auditoria');

function aApi(f) {
  return { id: f.id, indicadorId: f.indicador_id, autor: f.autor, periodo: f.periodo, texto: f.texto, fecha: f.fecha };
}

async function listar(indicadorId, periodo) {
  const r = await db.consultar(
    `SELECT c.id, c.indicador_id, u.nombre AS autor, c.periodo, c.texto, c.fecha
       FROM comentario_indicador c JOIN usuario u ON u.id = c.usuario_id
      WHERE c.indicador_id = $1 AND ($2::text IS NULL OR c.periodo = $2)
      ORDER BY c.fecha DESC, c.id DESC`, [indicadorId, periodo]);
  return r.rows.map(aApi);
}

async function crear(usuario, indicadorId, periodo, texto) {
  return db.transaccion(async (cl) => {
    const r = await cl.query(
      `INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto)
       VALUES ($1, $2, $3, $4) RETURNING id, indicador_id, periodo, texto, fecha`, [indicadorId, usuario.id, periodo, texto]);
    await auditoria.registrar(cl, {
      usuarioId: usuario.id, accion: 'COMENTAR_INDICADOR', entidad: 'comentario_indicador', entidadId: r.rows[0].id,
      detalle: { antes: null, despues: { indicador_id: indicadorId, periodo } }   // el texto no se copia a la auditoría
    });
    return aApi({ ...r.rows[0], autor: usuario.nombre });
  });
}

module.exports = { listar, crear };
