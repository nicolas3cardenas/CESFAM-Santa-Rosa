'use strict';
// Fabrica planillas REM de prueba con los indicadores de la demostración (IND-01 a IND-05).
// Los valores son inventados.
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

// Contenido de una planilla correcta: hoja -> celda -> valor
function contenidoBase() {
  return {
    'Sección A': { B12: 1722, C12: 2100, B20: 328 },   // IND-01 (numerador y denominador del REM) e IND-02 (numerador)
    'Sección D': { D8: 1080 },                          // IND-03 (numerador)
    'Sección E': { E10: 123, E20: 300 },                // IND-04 (numerador y denominador del REM)
    'Sección F': { F15: 558 }                           // IND-05 (numerador)
  };
}

// opciones.cambios: { 'Sección A': { B12: 'n/d' } } pisa valores; opciones.sinHojas: ['Sección E'] las omite;
// opciones.macros: agrega xl/vbaProject.bin al archivo (como un .xlsm real)
async function crearRem(opciones) {
  const o = opciones || {};
  const contenido = contenidoBase();
  Object.keys(o.cambios || {}).forEach((h) => { contenido[h] = Object.assign({}, contenido[h], o.cambios[h]); });
  const wb = new ExcelJS.Workbook();
  Object.keys(contenido).forEach((nombre) => {
    if ((o.sinHojas || []).indexOf(nombre) >= 0) { return; }
    const ws = wb.addWorksheet(nombre);
    Object.keys(contenido[nombre]).forEach((celda) => { ws.getCell(celda).value = contenido[nombre][celda]; });
  });
  let buf = Buffer.from(await wb.xlsx.writeBuffer());
  if (o.macros) {
    const zip = await JSZip.loadAsync(buf);
    zip.file('xl/vbaProject.bin', 'MACROS-DE-PRUEBA');
    buf = await zip.generateAsync({ type: 'nodebuffer' });
  }
  return buf;
}

module.exports = { crearRem, contenidoBase };
