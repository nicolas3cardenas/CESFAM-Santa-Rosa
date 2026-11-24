'use strict';
const express = require('express');
const { asincrono } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const v = require('../lib/validaciones');
const catalogos = require('../servicios/catalogos');
const exportar = require('../servicios/exportar');
const { exigirValido, param } = require('./ayudas');

const r = express.Router();

// GET /api/exportar?formato=CSV|XLSX&periodo=AAAA-MM&programaId=
// El Jefe de Programa recibe solo datos de su programa.
r.get('/', exigir('exportar'), asincrono(async (req, res) => {
  const periodos = await catalogos.periodosConDatos();
  const datos = exigirValido(v.reunir({
    formato: v.opcion(param(req, 'formato'), catalogos.FORMATOS, 'Elija CSV o XLSX'),
    periodo: v.opcion(param(req, 'periodo'), periodos, 'Elija un período de la lista')
  }));
  const programaId = await catalogos.resolverPrograma(req.usuario, param(req, 'programaId'));
  const filas = await exportar.datos(datos.periodo, programaId);
  const nombre = `metas_${datos.periodo}`;   // el período ya está validado: no hay texto de la persona en el nombre del archivo

  if (datos.formato === 'CSV') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${nombre}.csv"`);
    return res.send(exportar.generarCsv(filas));
  }
  const xlsx = await exportar.generarXlsx(filas, datos.periodo);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${nombre}.xlsx"`);
  return res.send(xlsx);
}));

module.exports = r;
