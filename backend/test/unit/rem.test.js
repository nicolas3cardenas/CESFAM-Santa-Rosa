'use strict';
// Pruebas de la evaluación del REM: validación (pantalla 10) y cálculo de resultados.
const { evaluarRem, celdasPedidas } = require('../../src/lib/rem');

const IND = [
  { id: 1, rem_codigo: 'IND-01', seccion: 'Sección A', celda_numerador: 'B12', origen_denominador: 'REM', celda_denominador: 'C12' },
  { id: 2, rem_codigo: 'IND-02', seccion: 'Sección A', celda_numerador: 'B20', origen_denominador: 'POBLACION', celda_denominador: null },
  { id: 3, rem_codigo: 'IND-03', seccion: 'Sección D', celda_numerador: 'D8', origen_denominador: 'POBLACION', celda_denominador: null }
];
const planillaOk = () => ({
  hojas: ['Sección A', 'Sección D'],
  libro: { 'Sección A': { B12: 1722, C12: 2100, B20: 328 }, 'Sección D': { D8: 1080 } }
});
const POB = { 2: 420, 3: 1500 };

describe('Cálculo desde una planilla correcta', () => {
  test('P10-1: calcula los tres resultados y el resumen queda sin errores', () => {
    const r = evaluarRem(IND, planillaOk(), POB);
    expect(r.resumen.errores).toEqual([]);
    expect(r.resumen.hojas_leidas).toBe(2);
    expect(r.resumen.hojas_esperadas).toBe(2);
    expect(r.resumen.celdas_leidas).toBe(4);
    expect(r.resultados).toEqual([
      { indicadorId: 1, numerador: 1722, denominador: 2100, resultado: 82 },
      { indicadorId: 2, numerador: 328, denominador: 420, resultado: 78.1 },
      { indicadorId: 3, numerador: 1080, denominador: 1500, resultado: 72 }
    ]);
  });
  test('P4-3: sin población el resultado queda sin calcular y se avisa, pero la carga es válida', () => {
    const r = evaluarRem(IND, planillaOk(), { 2: 420 });
    expect(r.resumen.errores).toEqual([]);
    expect(r.resumen.advertencias).toEqual(['Falta ingresar la población de IND-03 para este período']);
    const i3 = r.resultados.find((x) => x.indicadorId === 3);
    expect(i3.denominador).toBe(0);
    expect(i3.resultado).toBeNull();
    expect(i3.numerador).toBe(1080);
  });
  test('P4-3: población en cero cuenta como faltante', () => {
    const r = evaluarRem(IND, planillaOk(), { 2: 0, 3: 1500 });
    expect(r.resultados[1].resultado).toBeNull();
  });
  test('el nombre de la hoja se busca sin distinguir mayúsculas ni espacios de los bordes', () => {
    const p = { hojas: ['sección a', 'SECCIÓN D '], libro: { 'sección a': { B12: 1, C12: 2, B20: 3 }, 'SECCIÓN D ': { D8: 4 } } };
    const r = evaluarRem(IND, p, POB);
    expect(r.resumen.errores).toEqual([]);
    expect(r.resultados).toHaveLength(3);
  });
});

describe('Errores de la planilla (P10-1)', () => {
  test('P10-1: falta una hoja obligatoria: se informa y no se crean resultados', () => {
    const p = planillaOk(); p.hojas = ['Sección A']; delete p.libro['Sección D'];
    const r = evaluarRem(IND, p, POB);
    expect(r.resultados).toEqual([]);
    expect(r.resumen.hojas_leidas).toBe(1);
    expect(r.resumen.hojas_esperadas).toBe(2);
    expect(r.resumen.errores).toEqual([{ hoja: 'Sección D', celda: '', problema: 'Falta la hoja obligatoria "Sección D"' }]);
  });
  test('P10-1: celda con texto "n/d": mensaje con lo que dice la celda y sin resultados', () => {
    const p = planillaOk(); p.libro['Sección A'].B12 = 'n/d';
    const r = evaluarRem(IND, p, POB);
    expect(r.resultados).toEqual([]);
    expect(r.resumen.errores).toEqual([{ hoja: 'Sección A', celda: 'B12', problema: 'La celda no contiene un número (dice "n/d")' }]);
  });
  test('P10-1: error de Excel, negativo y valor gigante', () => {
    const p = planillaOk();
    p.libro['Sección A'].B12 = { error: '#DIV/0!' };
    p.libro['Sección A'].C12 = -5;
    p.libro['Sección A'].B20 = 1e12;
    const r = evaluarRem(IND, p, POB);
    const mensajes = r.resumen.errores.map((e) => e.celda + ': ' + e.problema);
    expect(mensajes).toEqual([
      'B12: La celda tiene un error de Excel (#DIV/0!)',
      'C12: El valor es negativo',
      'B20: El valor es demasiado grande'
    ]);
    expect(r.resultados).toEqual([]);
  });
  test('P10-1: errores de varias celdas se informan todos juntos (hoja faltante + celda mala)', () => {
    const p = { hojas: ['Sección A'], libro: { 'Sección A': { B12: 'x', C12: 10, B20: 5 } } };
    const r = evaluarRem(IND, p, POB);
    expect(r.resumen.errores).toHaveLength(2);
  });
  test('P10-1: texto muy largo en la celda se recorta en el mensaje', () => {
    const p = planillaOk(); p.libro['Sección A'].B12 = 'z'.repeat(500);
    const r = evaluarRem(IND, p, POB);
    expect(r.resumen.errores[0].problema.length).toBeLessThan(120);
  });
  test('T-2: el texto de una celda con HTML se informa tal cual (el frontend lo muestra como texto)', () => {
    const p = planillaOk(); p.libro['Sección A'].B12 = '<script>alert(1)</script>';
    const r = evaluarRem(IND, p, POB);
    expect(r.resumen.errores[0].problema).toContain('<script>alert(1)</script>');
  });
  test('P10-1: planilla sin hojas', () => {
    const r = evaluarRem(IND, { hojas: [], libro: {} }, POB);
    expect(r.resumen.hojas_leidas).toBe(0);
    expect(r.resumen.errores.length).toBeGreaterThan(0);
    expect(r.resultados).toEqual([]);
  });
  test('P10-1: sin indicadores activos no hay nada que calcular', () => {
    const r = evaluarRem([], planillaOk(), POB);
    expect(r.resumen.errores).toHaveLength(1);
  });
});

describe('Celdas vacías y denominador del REM', () => {
  test('P10-1: una celda vacía no es error: vale 0 y se informa', () => {
    const p = planillaOk(); p.libro['Sección D'].D8 = null;
    const r = evaluarRem(IND, p, POB);
    expect(r.resumen.errores).toEqual([]);
    expect(r.resumen.celdas_vacias).toEqual([{ hoja: 'Sección D', celda: 'D8', indicador: 'IND-03' }]);
    expect(r.resultados[2]).toEqual({ indicadorId: 3, numerador: 0, denominador: 1500, resultado: 0 });
  });
  test('P4-3: denominador del REM en cero deja el resultado sin calcular', () => {
    const p = planillaOk(); p.libro['Sección A'].C12 = 0;
    const r = evaluarRem(IND, p, POB);
    expect(r.resultados[0].resultado).toBeNull();
    expect(r.resultados[0].denominador).toBe(0);
  });
  test('una misma celda usada por dos indicadores se lee una sola vez', () => {
    const dos = [IND[0], { ...IND[0], id: 9, rem_codigo: 'IND-09' }];
    const r = evaluarRem(dos, planillaOk(), POB);
    expect(r.resumen.celdas_leidas).toBe(2);
    expect(r.resultados).toHaveLength(2);
  });
  test('indicador sin sección usa la primera hoja', () => {
    const sin = [{ id: 7, rem_codigo: 'IND-07', seccion: null, celda_numerador: 'A1', origen_denominador: 'REM', celda_denominador: 'A2' }];
    const r = evaluarRem(sin, { hojas: ['Hoja1', 'Otra'], libro: { Hoja1: { A1: 50, A2: 200 } } }, {});
    expect(r.resumen.errores).toEqual([]);
    expect(r.resultados[0].resultado).toBe(25);
  });
});

describe('Celdas que hay que leer', () => {
  test('celdasPedidas no repite celdas y pide el denominador solo si viene del REM', () => {
    const lista = celdasPedidas(IND);
    expect(lista).toEqual([
      { hoja: 'Sección A', celda: 'B12' }, { hoja: 'Sección A', celda: 'C12' },
      { hoja: 'Sección A', celda: 'B20' }, { hoja: 'Sección D', celda: 'D8' }
    ]);
  });
});
