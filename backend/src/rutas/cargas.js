'use strict';
const express = require('express');
const { asincrono, E } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const { recibirArchivo, nombreOriginal } = require('../middleware/subida');
const v = require('../lib/validaciones');
const cargas = require('../servicios/cargas');
const { exigirValido, idDeRuta, paginacion } = require('./ayudas');

const r = express.Router();

// POST /api/cargas   (multipart/form-data: campo "archivo" + campo "periodo" AAAA-MM)
// Devuelve 201 con el detalle de la carga: estado "Validada" o "Con errores" (en ese caso no se crean resultados).
// Un archivo que no sirve en absoluto (extensión, tamaño, no es Excel) se rechaza con 400/413 y no deja carga.
r.post('/', exigir('cargarRem'), recibirArchivo, asincrono(async (req, res) => {
  const body = req.body || {};
  const datos = exigirValido(v.reunir({ periodo: v.periodo(body.periodo) }));
  if (!req.file) { throw E.solicitudInvalida('Debe adjuntar un archivo', { archivo: 'Seleccione el archivo del REM' }); }
  const carga = await cargas.procesar(req.usuario, datos.periodo, { nombre: nombreOriginal(req.file), buffer: req.file.buffer });
  res.status(201).json(carga);
}));

// GET /api/cargas?pagina=&tamano=
r.get('/', exigir('cargarRem'), asincrono(async (req, res) => {
  const p = paginacion(req, 20);
  res.json(await cargas.listar(p.pagina, p.tamano));
}));

// GET /api/cargas/:id   (pantalla 10: resumen de validación)
r.get('/:id', exigir('cargarRem'), asincrono(async (req, res) => {
  res.json(await cargas.obtener(idDeRuta(req, 'id', 'Carga no encontrada')));
}));

module.exports = r;
