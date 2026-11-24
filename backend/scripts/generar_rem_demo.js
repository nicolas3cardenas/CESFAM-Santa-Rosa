'use strict';
// Genera una planilla REM DE PRUEBA (todos los valores son inventados) para probar la pantalla "Cargar REM".
// Las hojas y celdas coinciden con los 5 indicadores de demostración (database/06_datos_demo.sql).
// NUNCA use datos reales de pacientes ni el REM real del CESFAM en una prueba o demostración con herramientas externas.
//
//   npm run rem:demo -- 2026-07                 -> datos_demo/rem_demo_2026-07.xlsx (planilla correcta)
//   npm run rem:demo -- 2026-07 --con-errores   -> una hoja faltante y una celda con texto, para ver la pantalla "Con errores"
//   npm run rem:demo -- 2026-07 --celda-vacia   -> deja una celda en blanco (se cuenta como 0 y se avisa)
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const args = process.argv.slice(2);
const periodo = args.find((a) => /^\d{4}-\d{2}$/.test(a)) || '2026-07';
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
  console.error('El período debe tener el formato AAAA-MM, por ejemplo 2026-07.');
  process.exit(1);
}
const conErrores = args.includes('--con-errores');
const celdaVacia = args.includes('--celda-vacia');

// Variación pequeña y repetible según el mes, para que cada mes dé cifras algo distintas
const mes = Number(periodo.slice(5));
const v = (base, paso) => base + ((mes * 7) % 5) * paso;

const hojas = {
  'Sección A': { B12: v(1700, 8), C12: 2100, B20: v(320, 4) },   // IND-01 (numerador y denominador REM) e IND-02 (numerador)
  'Sección D': { D8: v(1060, 10) },                              // IND-03 (numerador)
  'Sección E': { E10: v(120, 2), E20: 300 },                     // IND-04 (numerador y denominador REM)
  'Sección F': { F15: v(550, 6) }                                // IND-05 (numerador)
};
if (conErrores) {
  delete hojas['Sección E'];            // hoja faltante
  hojas['Sección D'].D8 = 'n/d';        // texto donde va un número
}
if (celdaVacia) { delete hojas['Sección D'].D8; }   // la celda D8 queda en blanco

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Datos de prueba (inventados)';
  Object.keys(hojas).forEach((nombre) => {
    const ws = wb.addWorksheet(nombre);
    ws.getCell('A1').value = 'DATOS DE PRUEBA - no son datos reales';
    Object.keys(hojas[nombre]).forEach((celda) => { ws.getCell(celda).value = hojas[nombre][celda]; });
  });
  const carpeta = path.join(__dirname, '..', 'datos_demo');
  fs.mkdirSync(carpeta, { recursive: true });
  const sufijo = conErrores ? '_con_errores' : celdaVacia ? '_celda_vacia' : '';
  const archivo = path.join(carpeta, `rem_demo_${periodo}${sufijo}.xlsx`);
  fs.writeFileSync(archivo, Buffer.from(await wb.xlsx.writeBuffer()));
  console.log('Planilla de prueba creada: ' + archivo);
  console.log('Súbala en la pantalla "Cargar REM" eligiendo el período ' + periodo + '.');
}

main().catch((e) => { console.error('No se pudo crear la planilla:', e.message); process.exit(1); });
