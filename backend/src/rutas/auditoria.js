'use strict';
const express = require('express');
const { asincrono, E } = require('../middleware/errores');
const { exigir } = require('../middleware/auth');
const v = require('../lib/validaciones');
const auditoria = require('../servicios/auditoria');
const db = require('../db');
const { exigirValido, param, vacio, paginacion } = require('./ayudas');

const r = express.Router();
r.use(exigir('verAuditoria'));

// GET /api/auditoria?desde=&hasta=&usuarioId=&entidad=&pagina=&tamano=   (pantalla 16)
r.get('/', asincrono(async (req, res) => {
  const rango = v.rangoFechas(param(req, 'desde'), param(req, 'hasta'));
  if (rango.error) { throw E.solicitudInvalida(rango.error, rango.campos); }
  const uCrudo = param(req, 'usuarioId');
  const eCrudo = param(req, 'entidad');
  const f = exigirValido(v.reunir({
    usuarioId: vacio(uCrudo) ? { valor: null } : v.id(uCrudo, 'Usuario no válido'),
    entidad: vacio(eCrudo) ? { valor: null } : v.opcion(eCrudo, auditoria.ENTIDADES, 'Entidad no válida')
  }));
  if (f.usuarioId !== null) {
    const existe = await db.consultar('SELECT 1 FROM usuario WHERE id = $1', [f.usuarioId]);
    if (existe.rowCount === 0) { throw E.solicitudInvalida('Revise los datos ingresados', { usuarioId: 'Usuario no válido' }); }
  }
  const p = paginacion(req, 20);
  res.json(await auditoria.listar({
    usuarioId: f.usuarioId, entidad: f.entidad,
    desde: rango.valor ? rango.valor.desde : null, hasta: rango.valor ? rango.valor.hasta : null,
    pagina: p.pagina, tamano: p.tamano
  }));
}));

// El registro de auditoría es de solo lectura: cualquier intento de modificarlo o borrarlo se rechaza.
// (Además, el usuario de base de datos de la aplicación no tiene permiso de UPDATE ni DELETE sobre la tabla.)
r.all('*', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') { return next(); }
  res.set('Allow', 'GET');
  return res.status(405).json({ error: 'El registro de auditoría es de solo lectura' });
});

module.exports = r;
