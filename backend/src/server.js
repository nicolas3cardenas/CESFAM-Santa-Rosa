'use strict';
const config = require('./config');
const db = require('./db');
const { crearApp } = require('./app');

async function iniciar() {
  try {
    await db.consultar('SELECT 1');
  } catch (err) {
    console.error('No se pudo conectar a la base de datos. Revise DATABASE_URL en el archivo .env y que PostgreSQL esté encendido.');
    console.error('Detalle:', err.message);
    process.exit(1);
  }
  const app = crearApp();
  const servidor = app.listen(config.puerto, () => {
    console.log(`CESFAM Santa Rosa · API escuchando en http://localhost:${config.puerto} (entorno: ${config.entorno})`);
  });
  const cerrar = () => {
    console.log('Cerrando...');
    servidor.close(() => { db.cerrar().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

iniciar();
