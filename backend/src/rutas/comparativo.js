'use strict';
const express = require('express');
const { asincrono, E } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const v = require('../lib/validaciones');
const { estadoSegunMeta } = require('../lib/calculo');
const catalogos = require('../servicios/catalogos');
const resultados = require('../servicios/resultados');
const { exigirValido, param, vacio } = require('./ayudas');

const r = express.Router();

// GET /api/comparativo?anioActual=AAAA&anioComparar=AAAA&programaId=
// Cada año se resume como el promedio de sus resultados mensuales por indicador.
r.get('/', exigir('comparativo'), asincrono(async (req, res) => {
  const anios = catalogos.aniosDe(await catalogos.periodosConDatos());
  const programaId = await catalogos.resolverPrograma(req.usuario, param(req, 'programaId'));

  const actual = v.opcion(param(req, 'anioActual'), anios, 'Elija un año de la lista');
  const comparar = v.opcion(param(req, 'anioComparar'), anios, 'Elija un año con datos');
  const { valores } = (() => {
    const reunido = v.reunir({ anioActual: actual, anioComparar: comparar });
    return { valores: exigirValido(reunido) };
  })();
  if (valores.anioActual === valores.anioComparar) {
    throw E.solicitudInvalida('Elija un año distinto al actual', { anioComparar: 'Elija un año distinto al actual' });
  }

  const a = await resultados.anual(valores.anioActual, { programaId });
  const b = await resultados.anual(valores.anioComparar, { programaId });
  const mapaB = new Map(b.map((x) => [x.indicador_id, x]));
  const indicadores = a.map((x) => {
    const y = mapaB.get(x.indicador_id);
    const resA = x.meses > 0 ? x.resultado : null;
    const resB = y && y.meses > 0 ? y.resultado : null;
    return {
      indicadorId: x.indicador_id, codigo: x.codigo, nombre: x.nombre, programaId: x.programa_id, programa: x.programa, meta: x.meta,
      actual: { resultado: resA, meses: x.meses, estado: estadoSegunMeta(resA, x.meta) },
      comparado: { resultado: resB, meses: y ? y.meses : 0, estado: estadoSegunMeta(resB, x.meta) },
      diferencia: resA !== null && resB !== null ? Math.round((resA - resB) * 100) / 100 : null
    };
  });
  res.json({ anioActual: valores.anioActual, anioComparar: valores.anioComparar, programaId, indicadores });
}));

module.exports = r;
