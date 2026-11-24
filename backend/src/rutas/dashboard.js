'use strict';
const express = require('express');
const { asincrono } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const v = require('../lib/validaciones');
const { contarEstados } = require('../lib/calculo');
const catalogos = require('../servicios/catalogos');
const resultados = require('../servicios/resultados');
const { exigirValido, param, vacio } = require('./ayudas');

const r = express.Router();

// GET /api/dashboard?periodo=AAAA-MM&programaId=
//  - sin periodo: el más reciente con datos
//  - período con formato válido pero sin datos: 200 con sinDatos = true ("Sin datos para el período")
r.get('/', exigir('dashboard'), asincrono(async (req, res) => {
  const periodos = await catalogos.periodosConDatos();
  const crudo = param(req, 'periodo');
  const periodo = vacio(crudo)
    ? (periodos[0] || null)
    : exigirValido(v.reunir({ periodo: v.periodo(crudo) })).periodo;
  const programaId = await catalogos.resolverPrograma(req.usuario, param(req, 'programaId'));

  if (periodo === null || periodos.indexOf(periodo) < 0) {
    return res.json({ periodo, programaId, sinDatos: true, mensaje: 'Sin datos para el período', resumen: contarEstados([]), faltaPoblacion: 0, indicadores: [] });
  }
  const items = await resultados.porPeriodos([periodo], { programaId });
  const resumen = contarEstados(items);
  return res.json({ periodo, programaId, sinDatos: false, resumen, faltaPoblacion: resumen.sinPoblacion, indicadores: items });
}));

module.exports = r;
