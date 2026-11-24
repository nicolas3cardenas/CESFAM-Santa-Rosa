'use strict';
// Ayudas de base de datos para las pruebas de integración.
// Todo corre contra la base de PRUEBAS (nombre terminado en _test; config.js se niega a usar otra).
const { Client } = require('pg');
const config = require('../../src/config');
const lib = require('../../scripts/lib_bd');

if (!config.databaseAdminUrl) {
  throw new Error('Falta TEST_DATABASE_ADMIN_URL en el archivo .env (vea .env.example).');
}

// Deja la base de pruebas como nueva: tablas vacías + catálogos + datos de demostración (BORRA lo que haya)
async function reiniciarBD(opciones) {
  await lib.asegurarBaseYRol(config.databaseAdminUrl, process.env.API_DB_PASSWORD);
  await lib.aplicarScripts(config.databaseAdminUrl, opciones);
}

// Ejecuta una consulta como administrador (para preparar o revisar datos sin pasar por la API)
async function admin(sql, params) {
  const c = new Client({ connectionString: config.databaseAdminUrl });
  await c.connect();
  try { return await c.query(sql, params); } finally { await c.end(); }
}

async function cerrarPoolDeLaApp() { await require('../../src/db').cerrar(); }

module.exports = { reiniciarBD, admin, cerrarPoolDeLaApp, config };
