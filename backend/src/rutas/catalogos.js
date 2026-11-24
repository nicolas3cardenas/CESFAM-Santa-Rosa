'use strict';
const express = require('express');
const { asincrono } = require('../middleware/errores');
const catalogos = require('../servicios/catalogos');

const r = express.Router();

// GET /api/catalogos -> listas para filtros y formularios (el Jefe de Programa recibe solo su programa)
r.get('/', asincrono(async (req, res) => {
  res.json(await catalogos.obtenerTodo(req.usuario));
}));

module.exports = r;
