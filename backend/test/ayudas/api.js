'use strict';
// Ayudas para llamar a la API en las pruebas (supertest llama a la aplicación sin abrir un puerto).
const request = require('supertest');
const { crearApp } = require('../../src/app');

const CLAVE_DEMO = 'ClaveDemo2026';
const CUENTAS = {
  directora: 'directora@demo.cl',
  subdireccion: 'subdireccion@demo.cl',
  gestor: 'gestor@demo.cl',
  jefe: 'jefe.matronas@demo.cl',          // Jefe del programa Matronas
  jefeSaludMental: 'jefe.saludmental@demo.cl'
};
const CUENTA_DESACTIVADA = 'jefe.kine@demo.cl';

const app = crearApp();
const tokens = {};

function login(correo, clave) {
  return request(app).post('/api/auth/login').send({ correo, clave: clave === undefined ? CLAVE_DEMO : clave });
}

// Inicia sesión con cada cuenta de la demostración y guarda los tokens (llamar en beforeAll)
async function sesiones(roles) {
  for (const rol of roles || Object.keys(CUENTAS)) {
    const r = await login(CUENTAS[rol]);
    if (r.status !== 200) { throw new Error(`No se pudo iniciar sesión como ${rol}: ${r.status} ${JSON.stringify(r.body)}`); }
    tokens[rol] = r.body.token;
  }
}

// Llamadas ya autenticadas: como('gestor').get('/api/usuarios')
function como(rol) {
  const token = tokens[rol];
  if (!token) { throw new Error(`Falta iniciar sesión como "${rol}": llame antes a await sesiones() en beforeAll.`); }
  const con = (metodo) => (ruta) => request(app)[metodo](ruta).set('Authorization', 'Bearer ' + token);
  return { token, get: con('get'), post: con('post'), put: con('put'), patch: con('patch'), delete: con('delete') };
}

// Llamadas con un token cualquiera (vencido, alterado...)
function conToken(token) {
  const con = (metodo) => (ruta) => request(app)[metodo](ruta).set('Authorization', 'Bearer ' + token);
  return { get: con('get'), post: con('post'), put: con('put'), patch: con('patch'), delete: con('delete') };
}

// Descarga de archivos binarios (xlsx): supertest no guarda el cuerpo si no se le indica cómo leerlo
const leerBinario = (res, cb) => {
  const partes = [];
  res.on('data', (c) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

module.exports = { app, request, login, sesiones, como, conToken, leerBinario, tokens, CLAVE_DEMO, CUENTAS, CUENTA_DESACTIVADA };
