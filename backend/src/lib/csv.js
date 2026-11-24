'use strict';
// Exportación a CSV pensada para Excel en español de Chile:
//  - separador punto y coma (el que usa Excel con configuración regional de Chile)
//  - decimales con coma
//  - UTF-8 con marca BOM para que las tildes y la ñ se vean bien
// Protección contra "inyección de fórmulas": un texto que empiece con = + - @ (o tabulación)
// podría ejecutarse como fórmula al abrir el archivo en Excel; se le antepone un apóstrofe.

const BOM = '﻿';

function protegerFormula(texto) {
  return /^[=+\-@\t\r]/.test(texto) ? "'" + texto : texto;
}

function celda(valor) {
  if (valor === null || valor === undefined) { return ''; }
  let t;
  if (typeof valor === 'number') {
    t = String(valor).replace('.', ',');
  } else {
    t = protegerFormula(String(valor));
  }
  if (/[;"\r\n]/.test(t)) { t = '"' + t.replace(/"/g, '""') + '"'; }
  return t;
}

function aCsv(columnas, filas) {
  const lineas = [columnas.map(celda).join(';')];
  filas.forEach((f) => { lineas.push(f.map(celda).join(';')); });
  return BOM + lineas.join('\r\n') + '\r\n';
}

module.exports = { BOM, protegerFormula, celda, aCsv };
