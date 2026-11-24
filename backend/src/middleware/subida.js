'use strict';
// Recepción del archivo REM (multipart). El archivo se guarda en MEMORIA, nunca en disco:
// no hay nombres de archivo que puedan escribir fuera de una carpeta ni archivos olvidados en el servidor.
const multer = require('multer');
const config = require('../config');

const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxArchivoBytes, files: 1, fields: 4, fieldSize: 1024, parts: 8 }
}).single('archivo');

function recibirArchivo(req, res, next) {
  subir(req, res, (err) => (err ? next(err) : next()));
}

// multer entrega el nombre leído como latin1; se corrige para que las tildes y la ñ se vean bien.
function nombreOriginal(archivo) {
  if (!archivo || typeof archivo.originalname !== 'string') { return ''; }
  const arreglado = Buffer.from(archivo.originalname, 'latin1').toString('utf8');
  const nombre = arreglado.indexOf('�') >= 0 ? archivo.originalname : arreglado;
  // solo el nombre, sin carpetas ni caracteres de control, y de largo acotado
  return nombre.split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, '').slice(0, 255);
}

module.exports = { recibirArchivo, nombreOriginal };
