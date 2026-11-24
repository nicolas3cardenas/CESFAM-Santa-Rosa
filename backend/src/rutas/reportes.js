'use strict';
const express = require('express');
const { asincrono, E } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const v = require('../lib/validaciones');
const { periodosEnRango } = require('../lib/fechas');
const catalogos = require('../servicios/catalogos');
const resultados = require('../servicios/resultados');
const { exigirValido, param, vacio } = require('./ayudas');

const r = express.Router();

// GET /api/reportes?mes=AAAA-MM            un mes
// GET /api/reportes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD   un rango (si se envía, se usa en lugar del mes)
// Filtros opcionales: corte (etiqueta, por ahora no filtra) y programaId
r.get('/', exigir('reportes'), asincrono(async (req, res) => {
  const periodos = await catalogos.periodosConDatos();
  const rango = v.rangoFechas(param(req, 'desde'), param(req, 'hasta'));
  if (rango.error) { throw E.solicitudInvalida(rango.error, rango.campos); }

  const corteCrudo = param(req, 'corte');
  const corte = vacio(corteCrudo) ? { valor: catalogos.CORTES[0] } : v.opcion(corteCrudo, catalogos.CORTES, 'Corte no válido');
  const programaId = await catalogos.resolverPrograma(req.usuario, param(req, 'programaId'));

  let elegidos; let titulo; let modo;
  if (rango.valor) {
    modo = 'rango';
    exigirValido(v.reunir({ corte }));
    elegidos = periodosEnRango(periodos, rango.valor.desde, rango.valor.hasta);
    titulo = `Del ${rango.valor.desde} al ${rango.valor.hasta}`;
  } else {
    modo = 'mes';
    const mesCrudo = param(req, 'mes');
    const mes = vacio(mesCrudo) ? { valor: periodos[0] } : v.opcion(mesCrudo, periodos, 'Elija un mes de la lista');
    exigirValido(v.reunir({ mes, corte }));
    elegidos = mes.valor ? [mes.valor] : [];
    titulo = mes.valor || '';
  }

  if (elegidos.length === 0) {
    return res.json({ modo, titulo, periodos: [], corte: corte.valor, programaId, sinDatos: true, mensaje: 'Sin datos para el rango elegido', filas: [] });
  }

  const items = await resultados.porPeriodos(elegidos, { programaId });
  const filas = [];
  const porIndicador = new Map();
  items.forEach((it) => {
    if (!porIndicador.has(it.indicadorId)) {
      const fila = { indicadorId: it.indicadorId, codigo: it.codigo, nombre: it.nombre, programaId: it.programaId, programa: it.programa, meta: it.meta, valores: [] };
      porIndicador.set(it.indicadorId, fila);
      filas.push(fila);
    }
    porIndicador.get(it.indicadorId).valores.push({ periodo: it.periodo, numerador: it.numerador, denominador: it.denominador, resultado: it.resultado, estado: it.estado });
  });
  filas.forEach((f) => { f.valores.sort((a, b) => (a.periodo < b.periodo ? -1 : 1)); });
  return res.json({ modo, titulo, periodos: elegidos.slice().sort(), corte: corte.valor, programaId, sinDatos: false, filas });
}));

module.exports = r;
