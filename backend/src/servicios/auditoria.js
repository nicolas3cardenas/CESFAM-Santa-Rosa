'use strict';
// Registro de auditoría: quién hizo qué y cuándo, con el valor anterior y el nuevo (informe 6.5).
// Es de solo lectura para la aplicación: el usuario de base de datos no tiene permiso de UPDATE ni DELETE.
// NUNCA se guardan contraseñas, hashes ni tokens en el detalle.
const db = require('../db');
const config = require('../config');

// 'ejecutor' es el pool o el cliente de una transacción: así la auditoría se guarda en la MISMA
// transacción que el cambio y, si el cambio se revierte, no queda registro de algo que no pasó.
async function registrar(ejecutor, evento) {
  const e = evento || {};
  await (ejecutor || db.pool).query(
    'INSERT INTO log_auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES ($1, $2, $3, $4, $5::jsonb)',
    [e.usuarioId === undefined ? null : e.usuarioId, e.accion, e.entidad, e.entidadId === undefined ? null : e.entidadId, JSON.stringify(e.detalle || {})]
  );
}

// Entidades que registra el sistema (sirve de lista para el filtro de la pantalla 16)
const ENTIDADES = ['usuario', 'indicador', 'carga_rem', 'poblacion_denominador', 'comentario_indicador'];

async function listar(filtros) {
  const tamano = filtros.tamano;
  const desplazamiento = (filtros.pagina - 1) * tamano;
  const params = [filtros.usuarioId, filtros.entidad, filtros.desde, filtros.hasta, config.zonaHoraria];
  const donde = `
    WHERE ($1::int  IS NULL OR a.usuario_id = $1)
      AND ($2::text IS NULL OR a.entidad = $2)
      AND ($3::date IS NULL OR a.fecha_hora >= ($3::date)::timestamp AT TIME ZONE $5::text)
      AND ($4::date IS NULL OR a.fecha_hora <  (($4::date + 1))::timestamp AT TIME ZONE $5::text)`;
  const total = await db.consultar(`SELECT count(*) AS n FROM log_auditoria a ${donde}`, params);
  const filas = await db.consultar(
    `SELECT a.id, a.fecha_hora, a.accion, a.entidad, a.entidad_id, a.detalle, a.usuario_id, u.nombre AS usuario_nombre
       FROM log_auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id
       ${donde}
      ORDER BY a.fecha_hora DESC, a.id DESC
      LIMIT $6 OFFSET $7`,
    params.concat([tamano, desplazamiento])
  );
  return {
    total: total.rows[0].n,
    pagina: filtros.pagina,
    tamano,
    registros: filas.rows.map((r) => ({
      id: r.id,
      fecha: r.fecha_hora,
      usuario: r.usuario_id === null ? null : { id: r.usuario_id, nombre: r.usuario_nombre },
      accion: r.accion,
      entidad: r.entidad,
      entidadId: r.entidad_id,
      detalle: r.detalle
    }))
  };
}

module.exports = { registrar, listar, ENTIDADES };
