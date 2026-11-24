'use strict';
// Autenticación (¿quién es?) y autorización (¿puede hacer esto?) en CADA solicitud.
const config = require('../config');
const { E, asincrono } = require('./errores');
const claves = require('../lib/claves');
const permisos = require('../lib/permisos');
const usuarios = require('../servicios/usuarios');

const MSG_SESION = 'La sesión venció o no es válida. Inicie sesión nuevamente.';

const autenticar = asincrono(async (req, res, next) => {
  const cabecera = req.headers.authorization || '';
  const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/.exec(cabecera);
  if (!m) { throw E.noAutenticado('Debe iniciar sesión'); }

  let carga;
  try { carga = claves.verificarSesion(m[1]); } catch (err) { throw E.noAutenticado(MSG_SESION); }

  const id = Number(carga.sub);
  if (!Number.isSafeInteger(id) || id <= 0) { throw E.noAutenticado(MSG_SESION); }
  // El usuario se vuelve a leer de la base: si lo desactivaron o le cambiaron el rol, rige lo de la base, no lo del token
  const u = await usuarios.cargarParaSesion(id);
  if (!u || !u.activo) { throw E.noAutenticado(MSG_SESION); }
  // Si cambió su contraseña, los tokens anteriores dejan de servir
  if (carga.ph !== claves.huellaClave(u.password_hash)) { throw E.noAutenticado(MSG_SESION); }
  // Duración máxima de la sesión aunque haya actividad
  const ahora = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(carga.ini) || ahora - carga.ini > config.sesionMaxHoras * 3600) { throw E.noAutenticado(MSG_SESION); }

  req.usuario = { id: u.id, nombre: u.nombre, correo: u.email, rolId: u.rol_id, rol: u.rol, programaId: u.programa_id, programa: u.programa };

  // Cierre por inactividad: el token dura 30 minutos y se renueva mientras la persona sigue usando el sistema.
  // El token nuevo viaja en la cabecera X-Token-Renovado; el frontend debe reemplazar el que tenía.
  if (ahora - carga.iat > config.renovarTrasSegundos) {
    res.setHeader('X-Token-Renovado', claves.firmarSesion(u, carga.ini));
  }
  next();
});

// Exige que el rol del usuario tenga permiso para la acción (si no: 403 y el frontend muestra la pantalla 17)
function exigir(accion) {
  return (req, res, next) => {
    if (!req.usuario || !permisos.puede(req.usuario.rol, accion)) { return next(E.prohibido()); }
    return next();
  };
}

module.exports = { autenticar, exigir };
