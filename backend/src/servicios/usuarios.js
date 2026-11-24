'use strict';
// Gestión de usuarios (pantallas 14 y 15, solo Gestor de Información) y datos de sesión.
const db = require('../db');
const { E } = require('../middleware/errores');
const claves = require('../lib/claves');
const auditoria = require('./auditoria');

const COLUMNAS = `u.id, u.nombre, u.email, u.activo, u.rol_id, r.nombre AS rol, u.programa_id, p.nombre AS programa, u.creado_en`;
const DESDE = `FROM usuario u JOIN rol r ON r.id = u.rol_id LEFT JOIN programa p ON p.id = u.programa_id`;

// Lo que el frontend recibe (nunca incluye password_hash ni contadores de bloqueo)
function aApi(f) {
  return {
    id: f.id, nombre: f.nombre, correo: f.email, activo: f.activo,
    rolId: f.rol_id, rol: f.rol, programaId: f.programa_id, programa: f.programa, creadoEn: f.creado_en
  };
}

// Escapa los comodines de LIKE (% _ \) para que una búsqueda se trate como texto literal
function patronLike(texto) { return '%' + texto.replace(/[\\%_]/g, (c) => '\\' + c) + '%'; }

// Usuario para validar una sesión: se vuelve a leer de la base en CADA solicitud
// (así un usuario desactivado o con otro rol pierde el acceso de inmediato).
async function cargarParaSesion(id) {
  const r = await db.consultar(`SELECT ${COLUMNAS}, u.password_hash ${DESDE} WHERE u.id = $1`, [id]);
  return r.rows[0] || null;
}

async function buscarPorCorreo(correo) {
  const r = await db.consultar(
    `SELECT ${COLUMNAS}, u.password_hash, (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now()) AS bloqueado
       ${DESDE} WHERE u.email = $1`, [correo]);
  return r.rows[0] || null;
}

async function listar(filtros) {
  const q = filtros.q ? patronLike(filtros.q) : null;
  const r = await db.consultar(
    `SELECT ${COLUMNAS} ${DESDE}
      WHERE ($1::text IS NULL OR u.nombre ILIKE $1 ESCAPE '\\' OR u.email ILIKE $1 ESCAPE '\\')
        AND ($2::int IS NULL OR u.rol_id = $2)
      ORDER BY u.nombre, u.id`, [q, filtros.rolId]);
  return r.rows.map(aApi);
}

async function obtener(id) {
  const r = await db.consultar(`SELECT ${COLUMNAS} ${DESDE} WHERE u.id = $1`, [id]);
  if (r.rowCount === 0) { throw E.noEncontrado('Usuario no encontrado'); }
  return aApi(r.rows[0]);
}

// Revisa la regla "solo el Jefe de Programa tiene programa" y que rol y programa existan.
// Devuelve nombres para dejar en la auditoría.
async function revisarRolYPrograma(ejecutor, rolId, programaId) {
  const rol = await ejecutor.query('SELECT id, nombre, requiere_programa FROM rol WHERE id = $1', [rolId]);
  if (rol.rowCount === 0) { throw E.solicitudInvalida('Rol no válido', { rolId: 'Elija un rol de la lista' }); }
  let programa = null;
  if (programaId !== null) {
    const p = await ejecutor.query('SELECT id, nombre FROM programa WHERE id = $1', [programaId]);
    if (p.rowCount === 0) { throw E.solicitudInvalida('Programa no válido', { programaId: 'Elija un programa de la lista' }); }
    programa = p.rows[0];
  }
  if (rol.rows[0].requiere_programa && programaId === null) {
    throw E.solicitudInvalida('Debe asignar un programa', { programaId: 'El Jefe de Programa debe tener un programa asignado' });
  }
  if (!rol.rows[0].requiere_programa && programaId !== null) {
    throw E.solicitudInvalida('Programa no permitido', { programaId: 'Solo el Jefe de Programa puede tener un programa asignado' });
  }
  return { rol: rol.rows[0].nombre, programa: programa ? programa.nombre : null };
}

async function crear(datos, actor) {
  const hash = await claves.hashClave(datos.clave);
  return db.transaccion(async (cl) => {
    const nombres = await revisarRolYPrograma(cl, datos.rolId, datos.programaId);
    const ins = await cl.query(
      `INSERT INTO usuario (nombre, email, password_hash, rol_id, programa_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`, [datos.nombre, datos.correo, hash, datos.rolId, datos.programaId]);
    if (ins.rowCount === 0) { throw E.conflicto('El correo ya está registrado', { correo: 'El correo ya está registrado' }); }
    const id = ins.rows[0].id;
    await auditoria.registrar(cl, {
      usuarioId: actor.id, accion: 'CREAR_USUARIO', entidad: 'usuario', entidadId: id,
      detalle: { antes: null, despues: { nombre: datos.nombre, correo: datos.correo, rol: nombres.rol, programa: nombres.programa } }
    });
    return id;
  }).then(obtener);
}

async function actualizar(id, datos, actor) {
  return db.transaccion(async (cl) => {
    const act = await cl.query(`SELECT ${COLUMNAS} ${DESDE} WHERE u.id = $1 FOR UPDATE OF u`, [id]);
    if (act.rowCount === 0) { throw E.noEncontrado('Usuario no encontrado'); }
    const antes = act.rows[0];
    if (actor.id === id && datos.rolId !== antes.rol_id) {
      throw E.solicitudInvalida('No puede cambiar su propio rol', { rolId: 'No puede cambiar su propio rol' });
    }
    const nombres = await revisarRolYPrograma(cl, datos.rolId, datos.programaId);
    try {
      await cl.query(
        'UPDATE usuario SET nombre = $2, email = $3, rol_id = $4, programa_id = $5 WHERE id = $1',
        [id, datos.nombre, datos.correo, datos.rolId, datos.programaId]);
    } catch (err) {
      if (err.code === '23505') { throw E.conflicto('El correo ya está registrado', { correo: 'El correo ya está registrado' }); }
      throw err;
    }
    // Auditoría: solo los campos que cambiaron
    const a = {}; const d = {};
    if (antes.nombre !== datos.nombre) { a.nombre = antes.nombre; d.nombre = datos.nombre; }
    if (antes.email !== datos.correo) { a.correo = antes.email; d.correo = datos.correo; }
    if (antes.rol_id !== datos.rolId) { a.rol = antes.rol; d.rol = nombres.rol; }
    if ((antes.programa_id || null) !== datos.programaId) { a.programa = antes.programa; d.programa = nombres.programa; }
    if (Object.keys(d).length > 0) {
      await auditoria.registrar(cl, { usuarioId: actor.id, accion: 'ACTUALIZAR_USUARIO', entidad: 'usuario', entidadId: id, detalle: { antes: a, despues: d } });
    }
  }).then(() => obtener(id));
}

// Activar / desactivar. Repetir la misma orden (doble clic) no hace nada y no deja una segunda auditoría.
async function cambiarEstado(id, activo, actor) {
  if (actor.id === id && activo === false) {
    throw E.solicitudInvalida('No puede desactivar su propia cuenta');
  }
  const cambiado = await db.transaccion(async (cl) => {
    const act = await cl.query('SELECT activo FROM usuario WHERE id = $1 FOR UPDATE', [id]);
    if (act.rowCount === 0) { throw E.noEncontrado('Usuario no encontrado'); }
    if (act.rows[0].activo === activo) { return false; }
    await cl.query('UPDATE usuario SET activo = $2 WHERE id = $1', [id, activo]);
    await auditoria.registrar(cl, {
      usuarioId: actor.id, accion: activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO', entidad: 'usuario', entidadId: id,
      detalle: { antes: { activo: !activo }, despues: { activo } }
    });
    return true;
  });
  return { usuario: await obtener(id), cambiado };
}

module.exports = { aApi, patronLike, cargarParaSesion, buscarPorCorreo, listar, obtener, crear, actualizar, cambiarEstado };
