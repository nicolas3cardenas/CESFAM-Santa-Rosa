'use strict';
// Envío del enlace de recuperación de contraseña.
// PENDIENTE: el CESFAM aún no define su servidor de correo. Mientras tanto, en desarrollo el enlace
// se escribe en la consola del servidor (MODO_CORREO=consola). Para enviar correos reales habría que
// agregar aquí un envío por SMTP (por ejemplo con nodemailer) sin tocar el resto del sistema.
const config = require('../config');

const enviadosEnPruebas = [];

async function enviarEnlaceRecuperacion(destino, enlace) {
  if (config.esTest) { enviadosEnPruebas.push({ destino, enlace }); return; }
  if (config.modoCorreo === 'consola' && !config.esProduccion) {
    console.log(`[correo] Enlace de recuperación para ${destino}: ${enlace}`);
  }
}

// Solo para las pruebas automáticas: último enlace "enviado" a un correo
function ultimoEnlaceEnPruebas(destino) {
  for (let i = enviadosEnPruebas.length - 1; i >= 0; i--) {
    if (enviadosEnPruebas[i].destino === destino) { return enviadosEnPruebas[i].enlace; }
  }
  return null;
}
function enviadosCantidad() { return enviadosEnPruebas.length; }

module.exports = { enviarEnlaceRecuperacion, ultimoEnlaceEnPruebas, enviadosCantidad };
