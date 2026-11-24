'use strict';
// Inicio de sesión, bloqueo de cuenta, recuperación y cambio de contraseña (informe, sección 6.1).
const db = require('../db');
const config = require('../config');
const { E } = require('../middleware/errores');
const claves = require('../lib/claves');
const v = require('../lib/validaciones');
const { permisosDe } = require('../lib/permisos');
const auditoria = require('./auditoria');
const usuarios = require('./usuarios');
const correo = require('./correo');

// El MISMO mensaje para correo inexistente, contraseña incorrecta, cuenta bloqueada o desactivada:
// quien ataca no puede saber cuál fue el caso (T-8).
const MSG_LOGIN = 'Correo o contraseña incorrectos';
const MSG_RECUPERACION = 'Si el correo está registrado, recibirá un enlace';
const MSG_ENLACE = 'Enlace no válido';

function datosSesion(u) {
  return {
    id: u.id, nombre: u.nombre, correo: u.email, rolId: u.rol_id, rol: u.rol,
    programaId: u.programa_id, programa: u.programa
  };
}

function respuestaSesion(u) {
  return {
    token: claves.firmarSesion(u),
    expiraEnMinutos: config.sesionMinutos,
    usuario: datosSesion(u),
    permisos: permisosDe(u.rol)
  };
}

async function iniciarSesion(correoEntrada, claveEntrada) {
  const falla = () => E.noAutenticado(MSG_LOGIN);
  const u = await usuarios.buscarPorCorreo(correoEntrada);

  if (!u) {
    await claves.compararFalso(claveEntrada);
    await auditoria.registrar(null, { accion: 'LOGIN_FALLIDO', entidad: 'usuario', detalle: { correo_intentado: correoEntrada.slice(0, 100), motivo: 'Correo no registrado' } });
    throw falla();
  }
  if (!u.activo || u.bloqueado) {
    await claves.compararFalso(claveEntrada);
    await auditoria.registrar(null, {
      usuarioId: u.id, accion: 'LOGIN_FALLIDO', entidad: 'usuario', entidadId: u.id,
      detalle: { correo_intentado: correoEntrada.slice(0, 100), motivo: !u.activo ? 'Cuenta desactivada' : 'Cuenta bloqueada' }
    });
    throw falla();
  }

  const correcta = await claves.compararClave(claveEntrada, u.password_hash);
  if (!correcta) {
    // Contador atómico en una sola instrucción. Al llegar al máximo se bloquea y el contador vuelve a 0.
    // Si otra solicitud ya bloqueó la cuenta, la condición del WHERE no la modifica de nuevo.
    const r = await db.consultar(
      `UPDATE usuario
          SET intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
              bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueado_hasta END
        WHERE id = $1 AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= now())
        RETURNING (intentos_fallidos = 0) AS bloqueada`,
      [u.id, config.maxIntentosFallidos, config.bloqueoMinutos]);
    const bloqueada = r.rowCount > 0 && r.rows[0].bloqueada;
    await auditoria.registrar(null, {
      usuarioId: u.id, accion: 'LOGIN_FALLIDO', entidad: 'usuario', entidadId: u.id,
      detalle: { correo_intentado: correoEntrada.slice(0, 100), motivo: 'Contraseña incorrecta' }
    });
    if (bloqueada) {
      await auditoria.registrar(null, {
        usuarioId: u.id, accion: 'CUENTA_BLOQUEADA', entidad: 'usuario', entidadId: u.id,
        detalle: { minutos: config.bloqueoMinutos, motivo: `${config.maxIntentosFallidos} intentos fallidos seguidos` }
      });
    }
    throw falla();
  }

  await db.consultar('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [u.id]);
  return respuestaSesion(u);
}

// --- Recuperación de contraseña ---

async function solicitarRecuperacion(correoEntrada) {
  const u = await usuarios.buscarPorCorreo(correoEntrada);
  if (u && u.activo) {
    const token = claves.generarToken();
    await db.transaccion(async (cl) => {
      // un solo enlace vigente por persona: los anteriores sin usar quedan anulados
      await cl.query('UPDATE token_recuperacion SET usado_en = now() WHERE usuario_id = $1 AND usado_en IS NULL', [u.id]);
      await cl.query(
        `INSERT INTO token_recuperacion (usuario_id, token_hash, expira_en)
         VALUES ($1, $2, now() + make_interval(mins => $3))`,
        [u.id, claves.hashToken(token), config.enlaceRecuperacionMinutos]);
      await auditoria.registrar(cl, { usuarioId: u.id, accion: 'SOLICITUD_RECUPERACION', entidad: 'usuario', entidadId: u.id, detalle: {} });
    });
    await correo.enviarEnlaceRecuperacion(u.email, `${config.frontendUrl}/restablecer/${token}`);
  } else {
    await claves.compararFalso('relleno');   // tiempo parecido al caso con correo registrado
  }
  return { mensaje: MSG_RECUPERACION };   // la misma respuesta exista o no el correo (P2-2)
}

async function tokenVigente(token, ejecutor) {
  if (!claves.tokenConFormato(token)) { return null; }
  const r = await (ejecutor || db.pool).query(
    `SELECT t.id, t.usuario_id
       FROM token_recuperacion t JOIN usuario u ON u.id = t.usuario_id
      WHERE t.token_hash = $1 AND t.usado_en IS NULL AND t.expira_en > now() AND u.activo`,
    [claves.hashToken(token)]);
  return r.rows[0] || null;
}

async function validarEnlace(token) {
  const t = await tokenVigente(token);
  if (!t) { throw E.solicitudInvalida(MSG_ENLACE); }
  return { valido: true };
}

async function restablecer(token, claveNueva, confirmacion) {
  if (!(await tokenVigente(token))) { throw E.solicitudInvalida(MSG_ENLACE); }
  const campos = {};
  const c = v.clave(claveNueva);
  if (c.error) { campos.clave = c.error; }
  else if (claveNueva !== confirmacion) { campos.confirmacion = 'Las contraseñas no coinciden'; }
  if (Object.keys(campos).length > 0) { throw E.solicitudInvalida('Revise los datos ingresados', campos); }

  const hash = await claves.hashClave(claveNueva);
  await db.transaccion(async (cl) => {
    // "Usar" el enlace y cambiar la clave van juntos; si dos solicitudes llegan a la vez, solo una gana
    const uso = await cl.query(
      `UPDATE token_recuperacion SET usado_en = now()
        WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > now()
        RETURNING usuario_id`, [claves.hashToken(token)]);
    if (uso.rowCount === 0) { throw E.solicitudInvalida(MSG_ENLACE); }
    const uid = uso.rows[0].usuario_id;
    await cl.query('UPDATE usuario SET password_hash = $2, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1 AND activo', [uid, hash]);
    await auditoria.registrar(cl, { usuarioId: uid, accion: 'RESTABLECER_CLAVE', entidad: 'usuario', entidadId: uid, detalle: {} });
  });
  return { mensaje: 'Contraseña actualizada. Ya puede iniciar sesión.' };
}

// --- Cambio de contraseña con la sesión iniciada ---

async function cambiarClave(usuario, datos) {
  const campos = {};
  if (typeof datos.claveActual !== 'string' || datos.claveActual === '') { campos.claveActual = 'Ingrese su contraseña actual'; }
  const nueva = v.clave(datos.claveNueva);
  if (nueva.error) { campos.claveNueva = nueva.error; }
  else if (datos.claveNueva === datos.claveActual) { campos.claveNueva = 'La contraseña nueva debe ser distinta de la actual'; }
  else if (datos.claveNueva !== datos.confirmacion) { campos.confirmacion = 'Las contraseñas no coinciden'; }
  if (Object.keys(campos).length > 0) { throw E.solicitudInvalida('Revise los datos ingresados', campos); }

  const actual = await usuarios.cargarParaSesion(usuario.id);
  if (!(await claves.compararClave(datos.claveActual, actual.password_hash))) {
    throw E.solicitudInvalida('La contraseña actual no es correcta', { claveActual: 'La contraseña actual no es correcta' });
  }
  const hash = await claves.hashClave(datos.claveNueva);
  await db.transaccion(async (cl) => {
    await cl.query('UPDATE usuario SET password_hash = $2 WHERE id = $1', [usuario.id, hash]);
    await auditoria.registrar(cl, { usuarioId: usuario.id, accion: 'CAMBIO_CLAVE', entidad: 'usuario', entidadId: usuario.id, detalle: {} });
  });
  // Al cambiar la contraseña los tokens anteriores dejan de servir: se entrega uno nuevo
  const nuevo = await usuarios.cargarParaSesion(usuario.id);
  return { mensaje: 'Contraseña actualizada', token: claves.firmarSesion(nuevo) };
}

module.exports = { MSG_LOGIN, MSG_RECUPERACION, MSG_ENLACE, datosSesion, respuestaSesion, iniciarSesion, solicitarRecuperacion, validarEnlace, restablecer, cambiarClave };
