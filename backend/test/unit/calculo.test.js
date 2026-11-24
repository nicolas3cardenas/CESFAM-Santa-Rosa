'use strict';
const c = require('../../src/lib/calculo');

describe('Cálculo del resultado', () => {
  test('P4-3: resultado = numerador / denominador * 100 con 2 decimales', () => {
    expect(c.calcularResultado(1722, 2100)).toBe(82);
    expect(c.calcularResultado(307, 420)).toBe(73.1);
    expect(c.calcularResultado(1, 3)).toBe(33.33);
    expect(c.calcularResultado(2, 3)).toBe(66.67);
  });
  test('P4-3: denominador cero (o negativo) no tiene resultado', () => {
    expect(c.calcularResultado(10, 0)).toBeNull();
    expect(c.calcularResultado(0, 0)).toBeNull();
    expect(c.calcularResultado(10, -5)).toBeNull();
  });
  test('P4-3: numerador cero con denominador positivo da 0 %', () => {
    expect(c.calcularResultado(0, 500)).toBe(0);
  });
  test('resultado mayor a 100 % se calcula igual (el REM puede traer numerador mayor)', () => {
    expect(c.calcularResultado(120, 100)).toBe(120);
  });
});

describe('Estado según la meta', () => {
  test('cumple desde la meta (borde exacto)', () => {
    expect(c.estadoSegunMeta(80, 80)).toBe('cumple');
    expect(c.estadoSegunMeta(79.99, 80)).toBe('riesgo');
    expect(c.estadoSegunMeta(100, 80)).toBe('cumple');
  });
  test('en riesgo desde el 90 % de la meta (borde exacto: 72 para meta 80)', () => {
    expect(c.estadoSegunMeta(72, 80)).toBe('riesgo');
    expect(c.estadoSegunMeta(71.99, 80)).toBe('nocumple');
    expect(c.estadoSegunMeta(76.5, 85)).toBe('riesgo');
    expect(c.estadoSegunMeta(76.49, 85)).toBe('nocumple');
  });
  test('sin resultado no hay estado', () => {
    expect(c.estadoSegunMeta(null, 80)).toBeNull();
  });
  test('estados de la demostración: IND-01 (82 / 80), IND-04 (41 / 60)', () => {
    expect(c.estadoSegunMeta(82, 80)).toBe('cumple');
    expect(c.estadoSegunMeta(41, 60)).toBe('nocumple');
    expect(c.estadoSegunMeta(78.1, 85)).toBe('riesgo');
  });
});

describe('Armado del contrato de la API', () => {
  const base = { indicador_id: 5, codigo: 'IND-05', nombre: 'X', programa_id: 4, programa: 'Dietistas', origen_denominador: 'POBLACION', meta: 75, peso_relativo: 7, periodo: '2026-06' };
  test('P4-3: sin población aparece como sin_poblacion y sin resultado', () => {
    const it = c.armarItem({ ...base, tiene_resultado: true, numerador: 558, denominador: 0, resultado: null });
    expect(it.estado).toBe('sin_poblacion');
    expect(it.resultado).toBeNull();
    expect(it.numerador).toBe(558);
  });
  test('denominador del REM en cero se distingue de la falta de población', () => {
    const it = c.armarItem({ ...base, origen_denominador: 'REM', tiene_resultado: true, numerador: 5, denominador: 0, resultado: null });
    expect(it.estado).toBe('sin_denominador');
  });
  test('indicador sin fila de resultado en el período es sin_datos', () => {
    const it = c.armarItem({ ...base, tiene_resultado: false, numerador: null, denominador: null, resultado: null });
    expect(it.estado).toBe('sin_datos');
    expect(it.numerador).toBeNull();
  });
  test('indicador con resultado trae su estado', () => {
    const it = c.armarItem({ ...base, tiene_resultado: true, numerador: 558, denominador: 900, resultado: 62, meta: 75 });
    expect(it.estado).toBe('nocumple');
    expect(it.indicadorId).toBe(5);
    expect(it.programaId).toBe(4);
  });
  test('contarEstados suma cada categoría', () => {
    const r = c.contarEstados([{ estado: 'cumple' }, { estado: 'cumple' }, { estado: 'riesgo' }, { estado: 'nocumple' }, { estado: 'sin_poblacion' }, { estado: 'sin_datos' }]);
    expect(r).toEqual({ cumple: 2, riesgo: 1, nocumple: 1, sinPoblacion: 1, sinDatos: 1 });
  });
  test('promedio ignora nulos y redondea a 2 decimales', () => {
    expect(c.promedio([71, 74, 78, 82])).toBe(76.25);
    expect(c.promedio([55, null, 60])).toBe(57.5);
    expect(c.promedio([null, null])).toBeNull();
    expect(c.promedio([])).toBeNull();
  });
});
