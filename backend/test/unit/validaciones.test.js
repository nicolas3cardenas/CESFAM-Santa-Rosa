'use strict';
// Pruebas unitarias de las validaciones del servidor (plan de pruebas, sección 7.3).
// Cada prueba lleva el código del caso del plan (P1-1, P11-3...) para el informe de resultados.
const v = require('../../src/lib/validaciones');

const repetir = (c, n) => c.repeat(n);

describe('Correo', () => {
  test('P1-1: acepta un correo válido y lo pasa a minúsculas', () => {
    expect(v.correo('Directora@Demo.CL')).toEqual({ valor: 'directora@demo.cl' });
  });
  test('P1-1: rechaza vacío, sin @, con espacios y sin dominio', () => {
    ['', 'sin-arroba.cl', 'a b@demo.cl', 'a@demo', 'a@@demo.cl', ' a@demo.cl', 'a@demo.cl '].forEach((c) => {
      expect(v.correo(c).error).toBe('Ingrese un correo válido');
    });
  });
  test('P1-1: borde de 100 caracteres (100 sí, 101 no)', () => {
    const base = '@demo.cl';
    expect(v.correo(repetir('a', 100 - base.length) + base).valor).toBeDefined();
    expect(v.correo(repetir('a', 101 - base.length) + base).error).toBeDefined();
  });
  test('P1-1 / T-1: rechaza tipos que no son texto y el carácter nulo', () => {
    [null, undefined, 123, {}, [], true, ['a@demo.cl']].forEach((x) => { expect(v.correo(x).error).toBeDefined(); });
    expect(v.correo('a\u0000@demo.cl').error).toBeDefined();
  });
});

describe('Contraseña', () => {
  test('P1-2: bordes 7, 8, 64 y 65 caracteres', () => {
    expect(v.clave(repetir('a', 7)).error).toBeDefined();
    expect(v.clave(repetir('a', 8)).valor).toBeDefined();
    expect(v.clave(repetir('a', 64)).valor).toBeDefined();
    expect(v.clave(repetir('a', 65)).error).toBeDefined();
  });
  test('P1-2: rechaza vacía y tipos que no son texto', () => {
    ['', null, undefined, 12345678, {}].forEach((x) => { expect(v.clave(x).error).toBe('La contraseña debe tener entre 8 y 64 caracteres'); });
  });
  test('P1-2: un texto que pasa de 72 bytes se rechaza aunque tenga menos de 64 caracteres (límite de bcrypt)', () => {
    expect(v.clave(repetir('ñ', 36)).valor).toBeDefined();   // 36 caracteres = 72 bytes
    expect(v.clave(repetir('ñ', 37)).error).toBeDefined();   // 74 bytes
  });
});

describe('Período y fechas', () => {
  test('P9-1: período AAAA-MM válido', () => {
    ['2026-01', '2026-12', '1999-06'].forEach((p) => { expect(v.periodo(p).valor).toBe(p); });
  });
  test('P9-1 / P11-2: período inválido (mes 13, mes 00, formato distinto)', () => {
    ['2026-13', '2026-00', '26-06', '2026/06', '2026-6', '2026-06-01', '', null, 202606].forEach((p) => {
      expect(v.periodo(p).error).toBe('Ingrese un período válido (AAAA-MM)');
    });
  });
  test('P5-2: fecha que existe', () => {
    expect(v.fecha('2026-02-28').valor).toBe('2026-02-28');
    expect(v.fecha('2028-02-29').valor).toBe('2028-02-29');
  });
  test('P5-2: fecha inexistente (31-02, 29-02 en año no bisiesto, mes 13, formato)', () => {
    ['2026-02-31', '2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '31-02-2026', '2026-2-3', ''].forEach((f) => {
      expect(v.fecha(f).error).toBeDefined();
    });
  });
  test('P5-2 / P16-1: Hasta no puede ser anterior a Desde', () => {
    const r = v.rangoFechas('2026-05-10', '2026-05-09');
    expect(r.campos.hasta).toBe('La fecha Hasta no puede ser anterior a Desde');
    expect(v.rangoFechas('2026-05-10', '2026-05-10').valor).toEqual({ desde: '2026-05-10', hasta: '2026-05-10' });
  });
  test('P5-2 / P16-1: ambas fechas o ninguna', () => {
    expect(v.rangoFechas(undefined, undefined).valor).toBeNull();
    expect(v.rangoFechas('', '').valor).toBeNull();
    expect(v.rangoFechas('2026-05-10', undefined).campos.hasta).toBeDefined();
    expect(v.rangoFechas('2026-02-31', '2026-03-01').campos.desde).toBeDefined();
  });
  test('P6-1: año de 4 dígitos', () => {
    expect(v.anio('2026').valor).toBe('2026');
    ['26', '20260', 'abcd', '', null].forEach((a) => { expect(v.anio(a).error).toBeDefined(); });
  });
});

describe('Población (entero de 1 a 1.000.000)', () => {
  const MSG = 'Ingrese un entero entre 1 y 1.000.000';
  const poblacion = (x) => v.entero(x, 1, 1000000, MSG);
  test('P11-3: acepta enteros válidos como número o como texto', () => {
    expect(poblacion(1).valor).toBe(1);
    expect(poblacion('1500').valor).toBe(1500);
    expect(poblacion(1000000).valor).toBe(1000000);
    expect(poblacion('1000000').valor).toBe(1000000);
  });
  test('P11-3: rechaza letras, decimales con punto o coma, negativos, cero, vacío, notación científica y más de 1.000.000', () => {
    ['abc', '1.5', '1,5', '-5', '0', '', '1e3', '1000001', ' 5', '5 ', '+5', '0x10', '１２３'].forEach((x) => {
      expect(poblacion(x).error).toBe(MSG);
    });
    [1.5, -1, 0, 1000001, NaN, Infinity, 1e21, null, undefined, {}, [5], true].forEach((x) => { expect(poblacion(x).error).toBe(MSG); });
  });
  test('P11-3: borde 999.999 / 1.000.000 / 1.000.001', () => {
    expect(poblacion(999999).valor).toBe(999999);
    expect(poblacion(1000000).valor).toBe(1000000);
    expect(poblacion(1000001).error).toBeDefined();
  });
});

describe('Textos', () => {
  test('P7-1: comentario de 1 a 500 caracteres; vacío, solo espacios y 501 se rechazan', () => {
    expect(v.texto('Hola', 1, 500, 'El comentario').valor).toBe('Hola');
    expect(v.texto(repetir('a', 500), 1, 500).valor).toHaveLength(500);
    expect(v.texto(repetir('a', 501), 1, 500).error).toBeDefined();
    expect(v.texto('', 1, 500).error).toBeDefined();
    expect(v.texto('     ', 1, 500).error).toBeDefined();
    expect(v.texto('\n\t ', 1, 500).error).toBeDefined();
  });
  test('P7-2 / T-2: el HTML se acepta como texto y no se altera', () => {
    expect(v.texto('<script>alert(1)</script>', 1, 500).valor).toBe('<script>alert(1)</script>');
  });
  test('P7-1: el carácter nulo se rechaza (PostgreSQL no lo admite)', () => {
    expect(v.texto('ho\u0000la', 1, 500).error).toBeDefined();
  });
  test('P7-1: un emoji cuenta como un carácter, igual que en la base', () => {
    expect(v.texto('😀'.repeat(500), 1, 500).valor).toBeDefined();
    expect(v.texto('😀'.repeat(501), 1, 500).error).toBeDefined();
  });
  test('P12-1 / P14-2: búsqueda de hasta 100 caracteres, con comillas y signos como texto', () => {
    expect(v.texto("' OR 1=1 --", 0, 100).valor).toBe("' OR 1=1 --");
    expect(v.texto(repetir('a', 101), 0, 100).error).toBeDefined();
  });
  test('P13-8: opcionales (vacío queda null)', () => {
    expect(v.textoOpcional(undefined, 50).valor).toBeNull();
    expect(v.textoOpcional('   ', 50).valor).toBeNull();
    expect(v.textoOpcional(repetir('a', 51), 50).error).toBeDefined();
    expect(v.textoOpcional(repetir('a', 50), 50).valor).toHaveLength(50);
  });
  test('P13-1 / P15-1: nombre de 1 a 200 / 1 a 100', () => {
    expect(v.texto(repetir('a', 200), 1, 200).valor).toBeDefined();
    expect(v.texto(repetir('a', 201), 1, 200).error).toBeDefined();
    expect(v.texto(repetir('a', 100), 1, 100).valor).toBeDefined();
    expect(v.texto(repetir('a', 101), 1, 100).error).toBeDefined();
    expect(v.texto('  ', 1, 100).error).toBeDefined();
  });
  test('P13-3: código REM de 1 a 20 caracteres', () => {
    expect(v.texto(repetir('a', 20), 1, 20).valor).toBeDefined();
    expect(v.texto(repetir('a', 21), 1, 20).error).toBeDefined();
    expect(v.texto('', 1, 20).error).toBeDefined();
  });
});

describe('Celda de Excel, meta y peso', () => {
  test('P13-4: celdas válidas (se pasan a mayúsculas)', () => {
    expect(v.celdaExcel('B12').valor).toBe('B12');
    expect(v.celdaExcel('aa100').valor).toBe('AA100');
    expect(v.celdaExcel('XFD1048576').valor).toBeDefined();
  });
  test('P13-4: celdas inválidas (12B, B-12, B0, vacía, con espacios, muy larga)', () => {
    ['12B', 'B-12', 'B0', '', 'B 12', 'ABCD1', 'B12:C13', "B1'; DROP TABLE x;--", null, 12].forEach((c) => {
      expect(v.celdaExcel(c).error).toBeDefined();
    });
  });
  test('P13-6: meta nacional >= 0 con hasta 2 decimales', () => {
    const meta = (x) => v.decimal(x, 0, 99999.99, 2, 'Meta no válida');
    expect(meta(0).valor).toBe(0);
    expect(meta(80).valor).toBe(80);
    expect(meta('80,5').valor).toBe(80.5);
    expect(meta('80.55').valor).toBe(80.55);
    expect(meta(99999.99).valor).toBe(99999.99);
    ['abc', '-1', -1, '80.555', 80.555, '', '1e2', 1e-7, '8 0', NaN, Infinity, 100000, null].forEach((x) => { expect(meta(x).error).toBe('Meta no válida'); });
  });
  test('P13-7: peso relativo de 0 a 100 con hasta 2 decimales', () => {
    const peso = (x) => v.decimal(x, 0, 100, 2, 'Peso no válido');
    expect(peso(0).valor).toBe(0);
    expect(peso(100).valor).toBe(100);
    expect(peso('12,25').valor).toBe(12.25);
    ['abc', -1, 100.01, 101, '100,01', '', null].forEach((x) => { expect(peso(x).error).toBe('Peso no válido'); });
  });
});

describe('Identificadores y listas', () => {
  test('P2-5 / P12-2 / P13-2 / P15-3: identificador entero positivo', () => {
    expect(v.id('7').valor).toBe(7);
    expect(v.id(7).valor).toBe(7);
    ['0', '-1', '01', '1.5', 'abc', '', '1 OR 1=1', '99999999999', null, [], {}].forEach((x) => { expect(v.id(x).error).toBeDefined(); });
  });
  test('P8-1 / P5-3: valor dentro de la lista', () => {
    const formatos = ['CSV', 'XLSX'];
    expect(v.opcion('CSV', formatos).valor).toBe('CSV');
    ['PDF', 'csv', '', null, ['CSV'], 'CSV;'].forEach((x) => { expect(v.opcion(x, formatos).error).toBeDefined(); });
  });
  test('P14-4: booleano estricto', () => {
    expect(v.booleano(true).valor).toBe(true);
    expect(v.booleano(false).valor).toBe(false);
    ['true', 1, 0, null, undefined].forEach((x) => { expect(v.booleano(x).error).toBeDefined(); });
  });
  test('reunir: junta valores y errores por campo', () => {
    const r = v.reunir({ a: { valor: 1 }, b: { error: 'mal' } });
    expect(r.ok).toBe(false);
    expect(r.valores).toEqual({ a: 1 });
    expect(r.campos).toEqual({ b: 'mal' });
  });
});
