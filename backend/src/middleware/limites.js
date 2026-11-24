'use strict';
// Límite de solicitudes por IP en las rutas de autenticación (frena la adivinación de contraseñas
// y el uso del formulario "Olvidé mi contraseña" para llenar de correos).
const rateLimit = require('express-rate-limit');
const config = require('../config');

function crearLimitador(limite) {
  return rateLimit({
    windowMs: config.ventanaLimiteMs,
    limit: limite || config.limiteAutenticacion,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espere unos minutos e intente nuevamente.' }
  });
}

module.exports = { crearLimitador };
