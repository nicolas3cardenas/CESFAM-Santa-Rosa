'use strict';
// Arma la aplicación Express (sin abrir el puerto: así las pruebas la usan directamente).
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const { crearRutas } = require('./rutas');
const { rutaNoEncontrada, manejadorErrores } = require('./middleware/errores');

function crearApp(opciones) {
  const app = express();
  app.disable('x-powered-by');
  if (config.confiarEnProxy) { app.set('trust proxy', 1); }

  // Cabeceras de seguridad (helmet): CSP, nosniff, no mostrar framework, etc.
  app.use(helmet());
  // CORS restringido: solo el origen del frontend puede llamar a la API desde un navegador
  app.use(cors({
    origin: config.corsOrigenes,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Token-Renovado', 'Content-Disposition'],
    maxAge: 600
  }));
  // Las respuestas de la API traen datos de salud y de sesión: que ningún navegador ni proxy las guarde
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // Cuerpos JSON pequeños (el archivo REM va por multipart, con su propio límite)
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', crearRutas(opciones));
  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
