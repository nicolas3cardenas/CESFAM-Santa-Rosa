'use strict';
const p = require('../../src/lib/permisos');
const { ROL } = p;

describe('Matriz de permisos (informe 6.2)', () => {
  test('T-5: Directora ve dashboard, comparativo, reportes y exporta; no carga REM ni gestiona usuarios', () => {
    ['dashboard', 'comparativo', 'reportes', 'detalleIndicador', 'exportar', 'verComentarios'].forEach((a) => { expect(p.puede(ROL.DIRECTORA, a)).toBe(true); });
    ['cargarRem', 'ingresarPoblacion', 'parametrizarIndicadores', 'gestionarUsuarios', 'verAuditoria', 'comentar'].forEach((a) => { expect(p.puede(ROL.DIRECTORA, a)).toBe(false); });
  });
  test('T-5: Subdirección ve todo lo de la Directora y además carga REM, población e indicadores; no usuarios ni auditoría', () => {
    ['dashboard', 'comparativo', 'reportes', 'exportar', 'cargarRem', 'ingresarPoblacion', 'parametrizarIndicadores'].forEach((a) => { expect(p.puede(ROL.SUBDIRECCION, a)).toBe(true); });
    ['gestionarUsuarios', 'verAuditoria', 'comentar'].forEach((a) => { expect(p.puede(ROL.SUBDIRECCION, a)).toBe(false); });
  });
  test('T-5: Gestor carga REM, población, indicadores, usuarios y auditoría; no ve dashboard ni reportes', () => {
    ['cargarRem', 'ingresarPoblacion', 'parametrizarIndicadores', 'gestionarUsuarios', 'verAuditoria'].forEach((a) => { expect(p.puede(ROL.GESTOR, a)).toBe(true); });
    ['dashboard', 'comparativo', 'reportes', 'exportar', 'detalleIndicador', 'comentar'].forEach((a) => { expect(p.puede(ROL.GESTOR, a)).toBe(false); });
  });
  test('P7-4: solo el Jefe de Programa comenta', () => {
    expect(p.puede(ROL.JEFE, 'comentar')).toBe(true);
    [ROL.DIRECTORA, ROL.SUBDIRECCION, ROL.GESTOR].forEach((r) => { expect(p.puede(r, 'comentar')).toBe(false); });
  });
  test('T-5: el Jefe ve reportes, detalle, exporta y ve comentarios; nada de administración, dashboard ni comparativo', () => {
    ['reportes', 'detalleIndicador', 'exportar', 'verComentarios', 'comentar'].forEach((a) => { expect(p.puede(ROL.JEFE, a)).toBe(true); });
    ['dashboard', 'comparativo', 'cargarRem', 'ingresarPoblacion', 'parametrizarIndicadores', 'gestionarUsuarios', 'verAuditoria'].forEach((a) => { expect(p.puede(ROL.JEFE, a)).toBe(false); });
  });
  test('T-5: un rol o una acción desconocidos no tienen permiso', () => {
    expect(p.puede('Intruso', 'dashboard')).toBe(false);
    expect(p.puede(ROL.GESTOR, 'accionInventada')).toBe(false);
    expect(p.puede(undefined, 'dashboard')).toBe(false);
  });
  test('permisosDe entrega todas las acciones como verdadero o falso', () => {
    const r = p.permisosDe(ROL.JEFE);
    expect(Object.keys(r).length).toBe(Object.keys(p.ACCIONES).length);
    Object.values(r).forEach((x) => { expect(typeof x).toBe('boolean'); });
  });
});
