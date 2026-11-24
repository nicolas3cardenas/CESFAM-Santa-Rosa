'use strict';
// Conexión a PostgreSQL. Todas las consultas del sistema usan parámetros ($1, $2...):
// los valores nunca se pegan dentro del texto SQL (defensa contra inyección SQL, T-1).
const { Pool, types } = require('pg');
const config = require('./config');

// pg entrega numeric y bigint como texto; aquí los convertimos a número de JavaScript.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));   // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));   // bigint (count)

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});
pool.on('error', (err) => { console.error('[bd] error en una conexión inactiva:', err.message); });

function consultar(texto, parametros) { return pool.query(texto, parametros); }

// Ejecuta varias consultas como una sola unidad: si algo falla, no queda nada a medias.
async function transaccion(funcion) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await funcion(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    try { await cliente.query('ROLLBACK'); } catch (e) { /* la conexión ya estaba rota */ }
    throw err;
  } finally {
    cliente.release();
  }
}

function cerrar() { return pool.end(); }

module.exports = { pool, consultar, transaccion, cerrar };
