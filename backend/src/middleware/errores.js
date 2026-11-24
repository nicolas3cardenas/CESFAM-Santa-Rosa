'use strict';
// Errores de la API. Regla (informe 6.4): a la persona se le muestra un mensaje genérico y claro;
// el detalle técnico (consulta SQL, pila de llamadas) solo queda en el registro del servidor.
const config = require('../config');

class ErrorHttp extends Error {
  constructor(estado, mensaje, extra) {
    super(mensaje);
    this.name = 'ErrorHttp';
    this.estado = estado;
    this.extra = extra || {};
  }
}

const E = {
  solicitudInvalida: (mensaje, campos) => new ErrorHttp(400, mensaje || 'Revise los datos ingresados', campos ? { campos } : {}),
  noAutenticado: (mensaje) => new ErrorHttp(401, mensaje || 'Debe iniciar sesión'),
  prohibido: (mensaje) => new ErrorHttp(403, mensaje || 'No tiene permiso para realizar esta acción'),
  noEncontrado: (mensaje) => new ErrorHttp(404, mensaje || 'No encontrado'),
  conflicto: (mensaje, campos) => new ErrorHttp(409, mensaje, campos ? { campos } : {})
};

// Envuelve un manejador async para que sus errores lleguen al manejador de errores de Express
const asincrono = (fn) => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };

function rutaNoEncontrada(req, res) { res.status(404).json({ error: 'Ruta no encontrada' }); }

// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) { return next(err); }

  if (err instanceof ErrorHttp) {
    const cuerpo = { error: err.message };
    if (err.extra.campos) { cuerpo.campos = err.extra.campos; }
    return res.status(err.estado).json(cuerpo);
  }
  // JSON mal formado o demasiado grande
  if (err.type === 'entity.parse.failed') { return res.status(400).json({ error: 'La solicitud no tiene un formato válido' }); }
  if (err.type === 'entity.too.large') { return res.status(413).json({ error: 'La solicitud es demasiado grande' }); }
  // Subida de archivos (multer)
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') { return res.status(413).json({ error: 'El archivo supera los 10 MB permitidos' }); }
    return res.status(400).json({ error: 'La solicitud con el archivo no es válida' });
  }
  // Red de seguridad: si una restricción de la base rechaza un dato que no se validó antes
  if (err.code === '23505') { return res.status(409).json({ error: 'El registro ya existe' }); }
  if (['23514', '23502', '23503', '22P02', '22001', '22003', '22007', '22008', '22021'].indexOf(err.code) >= 0) {
    return res.status(400).json({ error: 'Los datos enviados no son válidos' });
  }

  if (config.mostrarErrores) { console.error('[error]', req.method, req.path, err); }
  return res.status(500).json({ error: 'Ocurrió un error inesperado. Intente nuevamente más tarde.' });
}

module.exports = { ErrorHttp, E, asincrono, rutaNoEncontrada, manejadorErrores };
