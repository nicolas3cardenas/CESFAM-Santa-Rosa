'use strict';
const csv = require('../../src/lib/csv');
const fechas = require('../../src/lib/fechas');

describe('Exportación CSV', () => {
  test('P8-3: usa punto y coma, coma decimal, BOM y saltos de línea de Windows', () => {
    const t = csv.aCsv(['Indicador', 'Resultado'], [['IND-01', 82.1], ['IND-02', 78]]);
    expect(t.charCodeAt(0)).toBe(0xFEFF);
    expect(t).toContain('Indicador;Resultado\r\n');
    expect(t).toContain('IND-01;82,1\r\n');
    expect(t).toContain('IND-02;78\r\n');
  });
  test('P8-3: textos con punto y coma, comillas o saltos de línea van entre comillas', () => {
    expect(csv.celda('a;b')).toBe('"a;b"');
    expect(csv.celda('dice "hola"')).toBe('"dice ""hola"""');
    expect(csv.celda('línea1\nlínea2')).toBe('"línea1\nlínea2"');
  });
  test('T-2: un texto que parece fórmula se neutraliza con un apóstrofe', () => {
    ['=1+1', '+cmd', '-2+3', '@SUMA(A1)', '\tx'].forEach((x) => { expect(csv.celda(x).startsWith("'")).toBe(true); });
    expect(csv.celda('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
  });
  test('los números negativos no se alteran (no son texto)', () => {
    expect(csv.celda(-5)).toBe('-5');
    expect(csv.celda(null)).toBe('');
    expect(csv.celda(undefined)).toBe('');
  });
});

describe('Períodos', () => {
  test('P5-1: períodos dentro de un rango de fechas', () => {
    const lista = ['2026-06', '2026-05', '2026-04', '2026-03', '2025-12'];
    expect(fechas.periodosEnRango(lista, '2026-03-15', '2026-05-02')).toEqual(['2026-05', '2026-04', '2026-03']);
    expect(fechas.periodosEnRango(lista, '2024-01-01', '2024-12-31')).toEqual([]);
  });
  test('nombre legible del período', () => {
    expect(fechas.nombrePeriodo('2026-06')).toBe('junio 2026');
    expect(fechas.nombrePeriodo('xx')).toBe('xx');
  });
});
