'use strict';
const express = require('express');
const { asincrono } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const v = require('../lib/validaciones');
const poblacion = require('../servicios/poblacion');
const { exigirValido, param, cuerpo } = require('./ayudas');

const r = express.Router();

// GET /api/poblacion?periodo=AAAA-MM -> indicadores con origen Población y su valor (o pendiente) en ese período
r.get('/', exigir('ingresarPoblacion'), asincrono(async (req, res) => {
  const datos = exigirValido(v.reunir({ periodo: v.periodo(param(req, 'periodo')) }));
  res.json({ periodo: datos.periodo, indicadores: await poblacion.listar(datos.periodo) });
}));

// POST /api/poblacion  { indicadorId, periodo, valor }
r.post('/', exigir('ingresarPoblacion'), asincrono(async (req, res) => {
  const b = cuerpo(req);
  const datos = exigirValido(v.reunir({
    indicadorId: v.id(b.indicadorId, 'Elija un indicador de la lista'),
    periodo: v.periodo(b.periodo),
    valor: v.entero(b.valor, 1, 1000000, 'Ingrese un entero entre 1 y 1.000.000')
  }));
  res.status(201).json(await poblacion.ingresar(req.usuario, datos.indicadorId, datos.periodo, datos.valor));
}));

module.exports = r;
