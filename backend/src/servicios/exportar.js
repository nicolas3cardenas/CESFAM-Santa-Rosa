'use strict';
// Exportación de resultados a CSV o XLSX (pantalla 8).
const { aCsv, protegerFormula } = require('../lib/csv');
const { TEXTO_ESTADO } = require('../lib/calculo');
const resultados = require('./resultados');

const COLUMNAS = ['Código', 'Indicador', 'Programa', 'Meta (%)', 'Numerador', 'Denominador', 'Resultado (%)', 'Estado'];

function filasDe(items) {
  return items.map((i) => [i.codigo, i.nombre, i.programa, i.meta, i.numerador, i.denominador, i.resultado, TEXTO_ESTADO[i.estado] || i.estado]);
}

async function datos(periodo, programaId) {
  const items = await resultados.porPeriodos([periodo], { programaId });
  return filasDe(items);
}

function generarCsv(filas) { return aCsv(COLUMNAS, filas); }

async function generarXlsx(filas, periodo) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CESFAM Santa Rosa';
  const ws = wb.addWorksheet('Resultados ' + periodo);
  ws.addRow(COLUMNAS).font = { bold: true };
  filas.forEach((f) => {
    // Los textos se escriben como TEXTO; protegerFormula evita que Excel los interprete como fórmula
    ws.addRow(f.map((x) => (typeof x === 'string' ? protegerFormula(x) : x)));
  });
  [10, 48, 16, 10, 12, 14, 14, 16].forEach((ancho, i) => { ws.getColumn(i + 1).width = ancho; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { COLUMNAS, datos, generarCsv, generarXlsx };
