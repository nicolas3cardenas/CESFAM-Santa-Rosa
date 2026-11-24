'use strict';
// Funciones comunes de las rutas: lectura segura de parámetros y respuestas de validación.
const { E } = require('../middleware/errores');
const v = require('../lib/validaciones');

// Si hay errores de validación, responde 400 con el detalle por campo
function exigirValido(reunido, mensaje) {
  if (!reunido.ok) { throw E.solicitudInvalida(mensaje || 'Revise los datos ingresados', reunido.campos); }
  return reunido.valores;
}

// Lee un parámetro de la URL. Si se repite (?a=1&a=2) o viene como objeto, se deja tal cual para que la validación lo rechace.
function param(req, nombre) { return req.query[nombre]; }

function vacio(x) { return x === undefined || x === null || x === ''; }

// :id de la ruta -> entero positivo; si no lo es, 404 (no existe ese recurso)
function idDeRuta(req, nombre, mensajeNoExiste) {
  const r = v.id(req.params[nombre || 'id']);
  if (r.error) { throw E.noEncontrado(mensajeNoExiste || 'No encontrado'); }
  return r.valor;
}

// Cuerpo JSON: debe ser un objeto
function cuerpo(req) {
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw E.solicitudInvalida('La solicitud debe enviar los datos en formato JSON');
  }
  return req.body;
}

// Paginación: pagina >= 1, tamano 1..100
function paginacion(req, tamanoPorDefecto) {
  const pagina = vacio(param(req, 'pagina')) ? { valor: 1 } : v.entero(param(req, 'pagina'), 1, 100000, 'Página no válida');
  const tamano = vacio(param(req, 'tamano')) ? { valor: tamanoPorDefecto || 20 } : v.entero(param(req, 'tamano'), 1, 100, 'Tamaño de página no válido');
  const r = v.reunir({ pagina, tamano });
  return exigirValido(r);
}

module.exports = { exigirValido, param, vacio, idDeRuta, cuerpo, paginacion };
