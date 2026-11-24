'use strict';
// Todas las rutas bajo /api. Lo que no sea /api/salud ni /api/auth/(login|olvide|restablecer)
// exige sesión: sin token válido responde 401 (T-3).
const express = require('express');
const { autenticar } = require('../middleware/auth');
const { crearLimitador } = require('../middleware/limites');
const { crearRutas: rutasAuth } = require('./auth');

function crearRutas(opciones) {
  const r = express.Router();

  r.get('/salud', (req, res) => res.json({ ok: true }));
  r.use('/auth', rutasAuth(crearLimitador(opciones && opciones.limiteAutenticacion)));

  r.use(autenticar);
  r.use('/catalogos', require('./catalogos'));
  r.use('/dashboard', require('./dashboard'));
  r.use('/reportes', require('./reportes'));
  r.use('/comparativo', require('./comparativo'));
  r.use('/indicadores', require('./indicadores'));
  r.use('/exportar', require('./exportar'));
  r.use('/cargas', require('./cargas'));
  r.use('/poblacion', require('./poblacion'));
  r.use('/usuarios', require('./usuarios'));
  r.use('/auditoria', require('./auditoria'));
  return r;
}

module.exports = { crearRutas };
