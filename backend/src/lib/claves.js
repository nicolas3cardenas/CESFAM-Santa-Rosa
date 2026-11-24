'use strict';
// Todo lo que tiene que ver con contraseñas, enlaces de recuperación y tokens de sesión.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');

// --- Contraseñas (bcrypt: en la base solo se guarda el hash, nunca la contraseña) ---
function hashClave(clave) { return bcrypt.hash(clave, config.bcryptRondas); }
function compararClave(clave, hash) { return bcrypt.compare(clave, hash); }

// Cuando el correo no existe (o la cuenta no sirve) se hace igual una comparación falsa:
// así el tiempo de respuesta no delata si el correo está registrado.
let hashFalso = null;
async function compararFalso(clave) {
  if (!hashFalso) { hashFalso = await bcrypt.hash('clave-que-nadie-usa-' + Date.now(), config.bcryptRondas); }
  await bcrypt.compare(typeof clave === 'string' ? clave : '', hashFalso);
}

// --- Enlace de recuperación: se entrega el token y se guarda solo su hash SHA-256 (64 caracteres) ---
function generarToken() { return crypto.randomBytes(32).toString('hex'); }
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function tokenConFormato(token) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token); }

// --- Sesión (JWT HS256) ---
// "ph" es una huella del hash de la contraseña: al cambiar la contraseña, los tokens anteriores dejan de servir.
function huellaClave(passwordHash) { return crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16); }

function firmarSesion(usuario, inicioSegundos) {
  const ini = inicioSegundos || Math.floor(Date.now() / 1000);
  return jwt.sign({ ph: huellaClave(usuario.password_hash), ini }, config.jwtSecreto, {
    algorithm: 'HS256',
    subject: String(usuario.id),
    expiresIn: config.sesionMinutos * 60
  });
}

// Lanza un error si el token está vencido, alterado o firmado con otro algoritmo.
function verificarSesion(token) {
  return jwt.verify(token, config.jwtSecreto, { algorithms: ['HS256'] });
}

module.exports = { hashClave, compararClave, compararFalso, generarToken, hashToken, tokenConFormato, huellaClave, firmarSesion, verificarSesion };
