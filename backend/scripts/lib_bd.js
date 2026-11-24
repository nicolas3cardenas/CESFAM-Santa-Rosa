'use strict';
// Funciones para crear la base de datos, el usuario de la aplicación y las tablas.
// Las usan "npm run db:crear" y las pruebas automáticas.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR_SQL = path.join(__dirname, '..', '..', 'database');
// Orden: tablas -> permisos -> catálogos base (roles y programas) -> datos de demostración
const ORDEN = ['01_crear_tablas.sql', '04_permisos.sql', '05_catalogos_base.sql', '06_datos_demo.sql'];

function leerSql(nombre) { return fs.readFileSync(path.join(DIR_SQL, nombre), 'utf8'); }

function nombreBase(url) {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')); } catch (e) { return ''; }
}

function urlMantenimiento(url) {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

async function conectar(url) {
  const c = new Client({ connectionString: url });
  await c.connect();
  return c;
}

// Crea (si no existen) el usuario "cesfam_api" y la base de datos
async function asegurarBaseYRol(adminUrl, claveApi) {
  const nombre = nombreBase(adminUrl);
  if (!/^[a-z][a-z0-9_]*$/.test(nombre)) { throw new Error('El nombre de la base de datos debe usar solo minúsculas, números y guion bajo.'); }
  if (!claveApi) { throw new Error('Falta API_DB_PASSWORD en el archivo .env (la clave que tendrá el usuario cesfam_api).'); }
  const c = await conectar(urlMantenimiento(adminUrl));
  try {
    const clave = c.escapeLiteral(claveApi);
    const rol = await c.query("SELECT 1 FROM pg_roles WHERE rolname = 'cesfam_api'");
    if (rol.rowCount === 0) { await c.query(`CREATE ROLE cesfam_api LOGIN PASSWORD ${clave}`); }
    else { await c.query(`ALTER ROLE cesfam_api PASSWORD ${clave}`); }
    const bd = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    if (bd.rowCount === 0) { await c.query(`CREATE DATABASE "${nombre}"`); }
    await c.query(`GRANT CONNECT ON DATABASE "${nombre}" TO cesfam_api`);
  } finally {
    await c.end();
  }
}

async function hayTablas(adminUrl) {
  const c = await conectar(adminUrl);
  try {
    const r = await c.query("SELECT to_regclass('public.usuario') IS NOT NULL AS existe");
    return r.rows[0].existe;
  } finally {
    await c.end();
  }
}

// BORRA y vuelve a crear las tablas, y carga catálogos y (opcionalmente) los datos de demostración
async function aplicarScripts(adminUrl, opciones) {
  const demo = !opciones || opciones.demo !== false;
  const c = await conectar(adminUrl);
  try {
    for (const archivo of ORDEN) {
      if (!demo && archivo.startsWith('06')) { continue; }
      await c.query(leerSql(archivo));
    }
  } finally {
    await c.end();
  }
}

module.exports = { ORDEN, nombreBase, asegurarBaseYRol, hayTablas, aplicarScripts };
