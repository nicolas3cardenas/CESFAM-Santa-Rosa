'use strict';
const express = require('express');
const { asincrono } = require('../middleware/errores');
const { autenticar } = require('../middleware/auth');
const v = require('../lib/validaciones');
const { permisosDe } = require('../lib/permisos');
const auth = require('../servicios/auth');
const auditoria = require('../servicios/auditoria');
const { exigirValido, cuerpo } = require('./ayudas');

function crearRutas(limitador) {
  const r = express.Router();

  // POST /api/auth/login  { correo, clave }
  r.post('/login', limitador, asincrono(async (req, res) => {
    const b = cuerpo(req);
    const val = v.reunir({ correo: v.correo(b.correo), clave: v.clave(b.clave) });
    // Un correo o clave con formato inválido se informa por campo; las credenciales mal puestas, con el mensaje único
    const datos = exigirValido(val);
    res.json(await auth.iniciarSesion(datos.correo, datos.clave));
  }));

  // POST /api/auth/olvide  { correo }
  r.post('/olvide', limitador, asincrono(async (req, res) => {
    const b = cuerpo(req);
    const datos = exigirValido(v.reunir({ correo: v.correo(b.correo) }));
    res.json(await auth.solicitarRecuperacion(datos.correo));
  }));

  // GET /api/auth/restablecer/:token  -> { valido: true } o 400 "Enlace no válido"
  r.get('/restablecer/:token', limitador, asincrono(async (req, res) => {
    res.json(await auth.validarEnlace(req.params.token));
  }));

  // POST /api/auth/restablecer/:token  { clave, confirmacion }
  r.post('/restablecer/:token', limitador, asincrono(async (req, res) => {
    const b = cuerpo(req);
    res.json(await auth.restablecer(req.params.token, b.clave, b.confirmacion));
  }));

  // POST /api/auth/cambiar-clave  { claveActual, claveNueva, confirmacion }   (con sesión)
  r.post('/cambiar-clave', autenticar, limitador, asincrono(async (req, res) => {
    const b = cuerpo(req);
    res.json(await auth.cambiarClave(req.usuario, b));
  }));

  // GET /api/auth/yo  -> datos de la sesión y permisos (con ellos el frontend arma el menú)
  r.get('/yo', autenticar, (req, res) => {
    res.json({ usuario: req.usuario, permisos: permisosDe(req.usuario.rol) });
  });

  // POST /api/auth/salir  -> el frontend descarta el token; aquí queda el registro
  r.post('/salir', autenticar, asincrono(async (req, res) => {
    await auditoria.registrar(null, { usuarioId: req.usuario.id, accion: 'LOGOUT', entidad: 'usuario', entidadId: req.usuario.id, detalle: {} });
    res.status(204).end();
  }));

  return r;
}

module.exports = { crearRutas };
