'use strict';
const express = require('express');
const { asincrono } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const v = require('../lib/validaciones');
const catalogos = require('../servicios/catalogos');
const indicadores = require('../servicios/indicadores');
const comentarios = require('../servicios/comentarios');
const { exigirValido, param, vacio, idDeRuta, cuerpo } = require('./ayudas');

const r = express.Router();

// Valida el cuerpo de un indicador (pantalla 13). Devuelve los valores listos para guardar.
function validarIndicador(b) {
  const origen = v.opcion(b.origenDenominador, catalogos.ORIGENES, 'Elija el origen del denominador');
  const pares = {
    nombre: v.texto(b.nombre, 1, 200, 'El nombre'),
    programaId: v.id(b.programaId, 'Elija un programa de la lista'),
    remCodigo: v.texto(b.remCodigo, 1, 20, 'El código REM'),
    seccion: v.textoOpcional(b.seccion, 50, 'La sección'),
    celdaNumerador: v.celdaExcel(b.celdaNumerador, 'La celda del numerador'),
    origenDenominador: origen,
    codigoPrestacion: v.textoOpcional(b.codigoPrestacion, 50, 'El código de prestación'),
    metaNacional: v.decimal(b.metaNacional, 0, 99999.99, 2, 'La meta debe ser un número mayor o igual a 0, con hasta 2 decimales'),
    pesoRelativo: v.decimal(b.pesoRelativo, 0, 100, 2, 'El peso debe ser un número entre 0 y 100, con hasta 2 decimales'),
    referenteResponsable: v.textoOpcional(b.referenteResponsable, 100, 'El referente'),
    activo: b.activo === undefined ? { valor: true } : v.booleano(b.activo, 'Indique si el indicador está activo')
  };
  // Combinación origen/celda: con REM la celda del denominador es obligatoria; con Población debe quedar vacía
  if (origen.valor === 'REM') {
    pares.celdaDenominador = v.celdaExcel(b.celdaDenominador, 'La celda del denominador');
  } else if (origen.valor === 'POBLACION') {
    pares.celdaDenominador = vacio(b.celdaDenominador)
      ? { valor: null }
      : { error: 'Con denominador "Población" la celda del denominador debe quedar vacía' };
  }
  return exigirValido(v.reunir(pares));
}

// GET /api/indicadores?q=&programaId=   (pantalla 12)
r.get('/', exigir('parametrizarIndicadores'), asincrono(async (req, res) => {
  const qCrudo = param(req, 'q');
  const q = vacio(qCrudo) ? { valor: null } : v.texto(qCrudo, 0, 100, 'La búsqueda');
  exigirValido(v.reunir({ q }));
  // El programa pedido debe existir (P12-2): uno inexistente o con formato raro responde 400
  const programaId = await catalogos.resolverPrograma(req.usuario, param(req, 'programaId'));
  res.json({ indicadores: await indicadores.listar({ q: q.valor, programaId }) });
}));

// POST /api/indicadores
r.post('/', exigir('parametrizarIndicadores'), asincrono(async (req, res) => {
  const datos = validarIndicador(cuerpo(req));
  res.status(201).json(await indicadores.crear(datos, req.usuario));
}));

// GET /api/indicadores/:id/detalle?periodo=AAAA-MM   (pantalla 7; el Jefe solo ve los de su programa)
r.get('/:id/detalle', exigir('detalleIndicador'), asincrono(async (req, res) => {
  const id = idDeRuta(req, 'id', 'Indicador no encontrado');
  const crudo = param(req, 'periodo');
  const periodo = vacio(crudo) ? null : exigirValido(v.reunir({ periodo: v.periodo(crudo) })).periodo;
  const base = await indicadores.obtener(id);
  indicadores.verificarAlcance(req.usuario, base);
  res.json(await indicadores.detalle(id, periodo));
}));

// GET /api/indicadores/:id/comentarios?periodo=
r.get('/:id/comentarios', exigir('verComentarios'), asincrono(async (req, res) => {
  const id = idDeRuta(req, 'id', 'Indicador no encontrado');
  const crudo = param(req, 'periodo');
  const periodo = vacio(crudo) ? null : exigirValido(v.reunir({ periodo: v.periodo(crudo) })).periodo;
  indicadores.verificarAlcance(req.usuario, await indicadores.obtener(id));
  res.json({ comentarios: await comentarios.listar(id, periodo) });
}));

// POST /api/indicadores/:id/comentarios  { periodo, texto }   (solo el Jefe de Programa, en indicadores de su programa)
r.post('/:id/comentarios', exigir('comentar'), asincrono(async (req, res) => {
  const id = idDeRuta(req, 'id', 'Indicador no encontrado');
  const b = cuerpo(req);
  const datos = exigirValido(v.reunir({ periodo: v.periodo(b.periodo), texto: v.texto(b.texto, 1, 500, 'El comentario') }));
  indicadores.verificarAlcance(req.usuario, await indicadores.obtener(id));
  res.status(201).json(await comentarios.crear(req.usuario, id, datos.periodo, datos.texto));
}));

// GET /api/indicadores/:id   (formulario de edición)
r.get('/:id', exigir('parametrizarIndicadores'), asincrono(async (req, res) => {
  res.json(await indicadores.obtener(idDeRuta(req, 'id', 'Indicador no encontrado')));
}));

// PUT /api/indicadores/:id
r.put('/:id', exigir('parametrizarIndicadores'), asincrono(async (req, res) => {
  const id = idDeRuta(req, 'id', 'Indicador no encontrado');
  const datos = validarIndicador(cuerpo(req));
  res.json(await indicadores.actualizar(id, datos, req.usuario));
}));

module.exports = r;
module.exports.validarIndicador = validarIndicador;
