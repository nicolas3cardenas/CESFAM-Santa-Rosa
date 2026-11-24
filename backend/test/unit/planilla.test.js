'use strict';
// Pruebas de la recepción de archivos del REM (pantalla 9) y de la lectura de celdas.
const { validarArchivo, normalizarCelda } = require('../../src/lib/planilla');
const { inspeccionarZip } = require('../../src/lib/zip');
const { crearZip, xlsxFalso } = require('../ayudas/zip');

const archivo = (nombre, buffer) => ({ nombre, buffer });

describe('Validación del archivo subido', () => {
  test('P9-2: acepta .xlsx y .xlsm (sin importar mayúsculas)', () => {
    expect(validarArchivo(archivo('rem.xlsx', xlsxFalso())).ok).toBe(true);
    expect(validarArchivo(archivo('REM.XLSM', xlsxFalso())).ok).toBe(true);
  });
  test('P9-2: rechaza otras extensiones (.pdf, .exe, .xls, .csv, sin extensión, doble extensión)', () => {
    ['rem.pdf', 'rem.exe', 'rem.xls', 'rem.csv', 'rem', 'rem.xlsx.exe', 'rem.xlsx.', '.xlsx.txt'].forEach((n) => {
      const r = validarArchivo(archivo(n, xlsxFalso()));
      expect(r.ok).toBe(false);
      expect(r.estado).toBe(400);
    });
  });
  test('P9-2: rechaza un archivo vacío', () => {
    const r = validarArchivo(archivo('rem.xlsx', Buffer.alloc(0)));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('El archivo está vacío');
  });
  test('P9-2: borde de 10 MB (exacto pasa la revisión de tamaño; un byte más se rechaza con 413)', () => {
    const justo = Buffer.concat([xlsxFalso(), Buffer.alloc(10 * 1024 * 1024 - xlsxFalso().length)]);
    expect(justo.length).toBe(10 * 1024 * 1024);
    expect(validarArchivo(archivo('rem.xlsx', justo)).estado).not.toBe(413);
    const demas = Buffer.concat([justo, Buffer.alloc(1)]);
    const r = validarArchivo(archivo('rem.xlsx', demas));
    expect(r.ok).toBe(false);
    expect(r.estado).toBe(413);
  });
  test('P9-3 / T-9: un .exe renombrado a .xlsx se rechaza (no es un ZIP)', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2000, 7)]);
    const r = validarArchivo(archivo('rem.xlsx', exe));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('El archivo no es una planilla Excel válida');
  });
  test('P9-3: un ZIP cualquiera (sin las partes de Excel) se rechaza', () => {
    const r = validarArchivo(archivo('rem.xlsx', crearZip({ 'hola.txt': 'hola' })));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('El archivo no es una planilla Excel válida');
  });
  test('P9-3 / T-9: un .xlsm con macros se acepta pero se marca (las macros no se ejecutan)', () => {
    const r = validarArchivo(archivo('rem.xlsm', xlsxFalso({ 'xl/vbaProject.bin': 'VBA' })));
    expect(r.ok).toBe(true);
    expect(r.macros).toBe(true);
    expect(validarArchivo(archivo('rem.xlsx', xlsxFalso())).macros).toBe(false);
  });
  test('P9-3: bomba ZIP (tamaño descomprimido declarado enorme) se rechaza', () => {
    const bomba = xlsxFalso({ 'xl/worksheets/sheet1.xml': { contenido: 'x', tamanoDeclarado: 200 * 1024 * 1024 } });
    const r = validarArchivo(archivo('rem.xlsx', bomba));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('demasiado grande');
  });
  test('P9-3: archivo cifrado y ZIP cortado se rechazan', () => {
    expect(validarArchivo(archivo('rem.xlsx', xlsxFalso({ 'secreto.bin': { contenido: 'x', cifrado: true } }))).ok).toBe(false);
    const cortado = xlsxFalso().subarray(0, xlsxFalso().length - 10);
    expect(validarArchivo(archivo('rem.xlsx', cortado)).ok).toBe(false);
  });
  test('P9-2: sin archivo adjunto', () => {
    expect(validarArchivo(undefined).ok).toBe(false);
    expect(validarArchivo({ nombre: 'a.xlsx' }).ok).toBe(false);
  });
});

describe('Inspección del ZIP', () => {
  test('lista las entradas con su tamaño', () => {
    const r = inspeccionarZip(crearZip({ 'a.txt': 'hola', 'b/c.txt': 'mundo!' }));
    expect(r.ok).toBe(true);
    expect(r.entradas.map((e) => e.nombre)).toEqual(['a.txt', 'b/c.txt']);
    expect(r.entradas[1].descomprimido).toBe(6);
  });
  test('P9-3: demasiadas entradas se rechaza', () => {
    const muchas = {}; for (let i = 0; i < 30; i++) { muchas['f' + i] = 'x'; }
    expect(inspeccionarZip(crearZip(muchas), { maxEntradas: 10 }).ok).toBe(false);
  });
  test('P9-3: entradas de texto basura y buffers diminutos no rompen la revisión', () => {
    [Buffer.alloc(0), Buffer.from('PK'), Buffer.from('PK\u0003\u0004' + 'x'.repeat(100)), null, 'texto'].forEach((b) => {
      expect(inspeccionarZip(b).ok).toBe(false);
    });
  });
});

describe('Valor de una celda', () => {
  test('P10-1: números válidos', () => {
    expect(normalizarCelda(123)).toEqual({ numero: 123 });
    expect(normalizarCelda(0)).toEqual({ numero: 0 });
    expect(normalizarCelda(12.5)).toEqual({ numero: 12.5 });
    expect(normalizarCelda('  42 ')).toEqual({ numero: 42 });
  });
  test('P10-1: celdas vacías (sin dato o solo espacios)', () => {
    [null, undefined, '', '   '].forEach((v) => { expect(normalizarCelda(v)).toEqual({ vacia: true }); });
  });
  test('P10-1: texto, fecha, booleano y errores de Excel no son números', () => {
    expect(normalizarCelda('n/d').invalida).toBeDefined();
    expect(normalizarCelda('n/d').texto).toBe('n/d');
    expect(normalizarCelda('1.234').invalida).toBeDefined();
    expect(normalizarCelda(new Date('2026-01-01')).invalida).toBeDefined();
    expect(normalizarCelda(true).invalida).toBeDefined();
    expect(normalizarCelda({ error: '#DIV/0!' }).invalida).toBe('tiene un error de Excel');
    expect(normalizarCelda(NaN).invalida).toBeDefined();
    expect(normalizarCelda(Infinity).invalida).toBeDefined();
  });
  test('P10-1: una fórmula vale su resultado calculado', () => {
    expect(normalizarCelda({ formula: 'SUM(A1:A3)', result: 55 })).toEqual({ numero: 55 });
    expect(normalizarCelda({ formula: 'A1/0', result: { error: '#DIV/0!' } }).invalida).toBe('tiene un error de Excel');
    expect(normalizarCelda({ formula: 'X', result: undefined })).toEqual({ vacia: true });
  });
  test('texto enriquecido con solo dígitos cuenta como número', () => {
    expect(normalizarCelda({ richText: [{ text: '1' }, { text: '2' }] })).toEqual({ numero: 12 });
  });
});
