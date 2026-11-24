'use strict';
// Recepción y lectura de la planilla REM (.xlsx / .xlsm).
//
//  validarArchivo()  -> revisa nombre, tamaño y estructura ANTES de leerlo (NS-06)
//  normalizarCelda() -> interpreta el valor de una celda (número, vacía, inválida)
//  extraerCeldas()   -> abre la planilla con exceljs y entrega solo las celdas que usan los indicadores
//
// Las macros (.xlsm) NO se ejecutan: exceljs solo lee los valores de las celdas y no interpreta VBA.

const { inspeccionarZip } = require('./zip');

const MAX_BYTES = 10 * 1024 * 1024;

function validarArchivo(archivo, maxBytes) {
  const limite = maxBytes || MAX_BYTES;
  if (!archivo || !Buffer.isBuffer(archivo.buffer)) { return { ok: false, estado: 400, error: 'Debe adjuntar un archivo' }; }
  const nombre = typeof archivo.nombre === 'string' ? archivo.nombre : '';
  if (!/\.(xlsx|xlsm)$/i.test(nombre)) { return { ok: false, estado: 400, error: 'El archivo debe ser una planilla Excel (.xlsx o .xlsm)' }; }
  if (archivo.buffer.length === 0) { return { ok: false, estado: 400, error: 'El archivo está vacío' }; }
  if (archivo.buffer.length > limite) { return { ok: false, estado: 413, error: 'El archivo supera los 10 MB permitidos' }; }

  const zip = inspeccionarZip(archivo.buffer);
  const NO_VALIDO = 'El archivo no es una planilla Excel válida';
  if (!zip.ok) { return { ok: false, estado: 400, error: NO_VALIDO, motivo: zip.motivo }; }
  const nombres = zip.entradas.map((e) => e.nombre);
  if (nombres.indexOf('[Content_Types].xml') < 0 || nombres.indexOf('xl/workbook.xml') < 0) {
    return { ok: false, estado: 400, error: NO_VALIDO, motivo: 'faltan partes de una planilla Excel' };
  }
  const tieneMacros = nombres.some((n) => /(^|\/)vbaProject\.bin$/i.test(n));
  return { ok: true, macros: tieneMacros };
}

// Interpreta lo que devuelve exceljs para una celda.
//   { vacia: true }              celda sin dato
//   { numero: 123 }              número válido
//   { invalida: 'motivo', texto } no es un número utilizable
function normalizarCelda(valor) {
  if (valor === null || valor === undefined) { return { vacia: true }; }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) { return { invalida: 'el valor no es un número', texto: String(valor) }; }
    return { numero: valor };
  }
  if (typeof valor === 'string') {
    const t = valor.trim();
    if (t === '') { return { vacia: true }; }
    if (/^[0-9]+$/.test(t)) { return { numero: Number(t) }; }
    return { invalida: 'no contiene un número', texto: t };
  }
  if (typeof valor === 'boolean') { return { invalida: 'no contiene un número', texto: valor ? 'VERDADERO' : 'FALSO' }; }
  if (valor instanceof Date) { return { invalida: 'contiene una fecha en lugar de un número', texto: valor.toISOString().slice(0, 10) }; }
  if (typeof valor === 'object') {
    if (valor.error) { return { invalida: 'tiene un error de Excel', texto: String(valor.error) }; }
    if (Object.prototype.hasOwnProperty.call(valor, 'result') || Object.prototype.hasOwnProperty.call(valor, 'formula') || Object.prototype.hasOwnProperty.call(valor, 'sharedFormula')) {
      return normalizarCelda(valor.result);      // fórmula: vale su resultado calculado por Excel
    }
    if (Array.isArray(valor.richText)) { return normalizarCelda(valor.richText.map((x) => x.text).join('')); }
    if (typeof valor.text === 'string') { return normalizarCelda(valor.text); }
  }
  return { invalida: 'no contiene un número', texto: '' };
}

function mismaHoja(a, b) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }

// Abre la planilla y devuelve { hojas: [nombres], libro: { 'Sección A': { B12: <valor crudo>, ... } } }
// con SOLO las celdas pedidas: pedidas = [{ hoja, celda }]. hoja === null significa "la primera hoja".
// El nombre de la hoja se busca sin distinguir mayúsculas ("sección a" encuentra "Sección A").
async function extraerCeldas(buffer, pedidas) {
  const ExcelJS = require('exceljs');   // se carga aquí para que las pruebas puras no la necesiten
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const hojas = wb.worksheets.map((w) => w.name);
  const libro = {};
  pedidas.forEach((p) => {
    const ws = p.hoja === null ? wb.worksheets[0] : wb.worksheets.find((w) => mismaHoja(w.name, p.hoja));
    if (!ws) { return; }
    if (!libro[ws.name]) { libro[ws.name] = {}; }          // se indexa por el nombre REAL de la hoja
    libro[ws.name][p.celda] = ws.getCell(p.celda).value;
  });
  return { hojas, libro };
}

module.exports = { MAX_BYTES, validarArchivo, normalizarCelda, extraerCeldas, mismaHoja };
