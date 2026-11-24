'use strict';
const express = require('express');
const { asincrono } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const v = require('../lib/validaciones');
const usuarios = require('../servicios/usuarios');
const catalogos = require('../servicios/catalogos');
const { exigirValido, param, vacio, idDeRuta, cuerpo } = require('./ayudas');

const r = express.Router();
r.use(exigir('gestionarUsuarios'));

function programaOpcional(x) { return vacio(x) ? { valor: null } : v.id(x, 'Elija un programa de la lista'); }

// GET /api/usuarios?q=&rolId=   (pantalla 14)
r.get('/', asincrono(async (req, res) => {
  const qCrudo = param(req, 'q');
  const rolCrudo = param(req, 'rolId');
  const f = exigirValido(v.reunir({
    q: vacio(qCrudo) ? { valor: null } : v.texto(qCrudo, 0, 100, 'La búsqueda'),
    rolId: vacio(rolCrudo) ? { valor: null } : v.id(rolCrudo, 'Rol no válido')
  }));
  if (f.rolId !== null) {
    const roles = await catalogos.roles();
    if (!roles.some((x) => x.id === f.rolId)) { exigirValido({ ok: false, campos: { rolId: 'Rol no válido' } }); }
  }
  res.json({ usuarios: await usuarios.listar({ q: f.q, rolId: f.rolId }) });
}));

// POST /api/usuarios  { nombre, correo, rolId, programaId?, clave }   (pantalla 15)
r.post('/', asincrono(async (req, res) => {
  const b = cuerpo(req);
  const d = exigirValido(v.reunir({
    nombre: v.texto(b.nombre, 1, 100, 'El nombre'),
    correo: v.correo(b.correo),
    rolId: v.id(b.rolId, 'Elija un rol de la lista'),
    programaId: programaOpcional(b.programaId),
    clave: v.clave(b.clave)
  }));
  res.status(201).json(await usuarios.crear(d, req.usuario));
}));

// GET /api/usuarios/:id
r.get('/:id', asincrono(async (req, res) => {
  res.json(await usuarios.obtener(idDeRuta(req, 'id', 'Usuario no encontrado')));
}));

// PUT /api/usuarios/:id  { nombre, correo, rolId, programaId? }   (la contraseña no se cambia aquí)
r.put('/:id', asincrono(async (req, res) => {
  const id = idDeRuta(req, 'id', 'Usuario no encontrado');
  const b = cuerpo(req);
  const d = exigirValido(v.reunir({
    nombre: v.texto(b.nombre, 1, 100, 'El nombre'),
    correo: v.correo(b.correo),
    rolId: v.id(b.rolId, 'Elija un rol de la lista'),
    programaId: programaOpcional(b.programaId)
  }));
  res.json(await usuarios.actualizar(id, d, req.usuario));
}));

// PATCH /api/usuarios/:id/estado  { activo: true | false }
r.patch('/:id/estado', asincrono(async (req, res) => {
  const id = idDeRuta(req, 'id', 'Usuario no encontrado');
  const d = exigirValido(v.reunir({ activo: v.booleano(cuerpo(req).activo, 'Indique si la cuenta queda activa') }));
  res.json(await usuarios.cambiarEstado(id, d.activo, req.usuario));
}));

module.exports = r;
