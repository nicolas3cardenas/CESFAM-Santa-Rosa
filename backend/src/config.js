'use strict';
// Lee la configuración desde variables de entorno (archivo .env) y la valida al iniciar.
// Si algo falta, el servidor se niega a partir con un mensaje claro (mejor que fallar a medias).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const entorno = process.env.NODE_ENV || 'development';
const esTest = entorno === 'test';
const esProduccion = entorno === 'production';

function entero(nombre, porDefecto, min, max) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === '') { return porDefecto; }
  if (!/^[0-9]+$/.test(crudo) || Number(crudo) < min || Number(crudo) > max) {
    throw new Error(`Configuración inválida: ${nombre} debe ser un entero entre ${min} y ${max}.`);
  }
  return Number(crudo);
}

function nombreBase(url) {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')); } catch (e) { return ''; }
}

const databaseUrl = process.env[esTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL'];
const databaseAdminUrl = process.env[esTest ? 'TEST_DATABASE_ADMIN_URL' : 'DATABASE_ADMIN_URL'];

if (!databaseUrl) {
  throw new Error(`Falta ${esTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} en el archivo .env (vea .env.example).`);
}
// Las pruebas borran y recrean tablas: solo corren contra una base cuyo nombre termina en _test.
if (esTest) {
  for (const url of [databaseUrl, databaseAdminUrl]) {
    if (url && !/_test$/.test(nombreBase(url))) {
      throw new Error('Por seguridad, las pruebas solo corren contra una base de datos cuyo nombre termine en "_test".');
    }
  }
}

let jwtSecreto = process.env.JWT_SECRET || '';
if (esTest && !jwtSecreto) { jwtSecreto = 'secreto-solo-para-pruebas-automaticas-0123456789'; }
if (jwtSecreto.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres (vea .env.example para generar uno).');
}

const sesionMinutos = entero('SESION_MINUTOS', 30, 1, 240);

module.exports = {
  entorno, esTest, esProduccion,
  puerto: entero('PORT', 3001, 1, 65535),
  databaseUrl,
  databaseAdminUrl,
  nombreBase: nombreBase(databaseUrl),
  apiDbPassword: process.env.API_DB_PASSWORD || '',

  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  corsOrigenes: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  confiarEnProxy: process.env.TRUST_PROXY === '1',

  jwtSecreto,
  sesionMinutos,
  sesionMaxHoras: entero('SESION_MAX_HORAS', 8, 1, 72),
  renovarTrasSegundos: Math.min(300, sesionMinutos * 60 / 2),   // renovación deslizante del token
  bcryptRondas: esTest ? 4 : entero('BCRYPT_RONDAS', 10, 4, 15),

  maxIntentosFallidos: 5,        // informe 6.1: 5 intentos seguidos
  bloqueoMinutos: 15,            // informe 6.1: bloqueo de 15 minutos
  enlaceRecuperacionMinutos: 30, // informe 6.1: enlace de un solo uso, 30 minutos

  maxArchivoBytes: 10 * 1024 * 1024,   // NS-06: 10 MB
  zonaHoraria: 'America/Santiago',

  limiteAutenticacion: esTest ? 100000 : entero('LIMITE_AUTENTICACION', 30, 1, 100000),
  ventanaLimiteMs: 15 * 60 * 1000,

  modoCorreo: process.env.MODO_CORREO || 'consola',
  mostrarErrores: !esTest || process.env.LOG_ERRORES_TEST === '1'
};
