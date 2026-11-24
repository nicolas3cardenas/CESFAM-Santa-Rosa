'use strict';
// Pruebas de integración de la parametrización de indicadores y del detalle (pantallas 12, 13 y 7):
// P12-1, P12-2, P13-1 a P13-8 (por la API) y la auditoría del antes/después.
const { reiniciarBD, admin, cerrarPoolDeLaApp } = require('../ayudas/bd');
const api = require('../ayudas/api');
const { como } = api;

let PROG;   // nombre de programa -> id
beforeAll(async () => {
  await reiniciarBD(); await api.sesiones();
  const c = await como('gestor').get('/api/catalogos');
  PROG = Object.fromEntries(c.body.programas.map((p) => [p.nombre, p.id]));
});
afterAll(async () => { await cerrarPoolDeLaApp(); });

const contar = async (sql, params) => Number((await admin(sql, params)).rows[0].n);
const totalIndicadores = () => contar('SELECT count(*) AS n FROM indicador');
const auditorias = (accion) => contar('SELECT count(*) AS n FROM log_auditoria WHERE accion = $1', [accion]);

// Un indicador correcto (con denominador del REM); cada prueba cambia solo lo que quiere probar
const cuerpo = (cambios) => Object.assign({
  nombre: 'Indicador de prueba', programaId: PROG.Matronas, remCodigo: 'IND-90', seccion: 'Sección A', celdaNumerador: 'B30',
  origenDenominador: 'REM', celdaDenominador: 'C30', codigoPrestacion: '24-01-001', metaNacional: 50, pesoRelativo: 10,
  referenteResponsable: 'Referente Demo'
}, cambios);
const crear = (cambios, rol) => como(rol || 'gestor').post('/api/indicadores').send(cuerpo(cambios));

describe('P12-1: cuadro Buscar', () => {
  test('sin filtros lista los 5 indicadores de la demostración, ordenados por programa y código', async () => {
    const r = await como('gestor').get('/api/indicadores');
    expect(r.status).toBe(200);
    expect(r.body.indicadores).toHaveLength(5);
    const nombres = r.body.indicadores.map((i) => i.programa);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    expect(r.body.indicadores[0]).toEqual(expect.objectContaining({ id: expect.any(Number), nombre: expect.any(String), remCodigo: expect.any(String), activo: true }));
  });

  test.each([['IND-03'], ['ind-03']])('buscar por código %s encuentra uno solo (sin distinguir mayúsculas)', async (q) => {
    const r = await como('subdireccion').get('/api/indicadores').query({ q });
    expect(r.body.indicadores.map((i) => i.remCodigo)).toEqual(['IND-03']);
  });

  test.each([["'"], ['"'], ['<script>alert(1)</script>'], ['%'], ['_'], ['\\'], ["x' OR '1'='1"], ['; DROP TABLE indicador;--']])(
    'el texto %j se busca como texto: responde 200 sin resultados y la tabla sigue intacta', async (q) => {
      const r = await como('gestor').get('/api/indicadores').query({ q });
      expect(r.status).toBe(200);
      expect(r.body.indicadores).toEqual([]);
      expect(await totalIndicadores()).toBe(5);
    });

  test('100 caracteres se aceptan; 101 -> 400 y no consulta', async () => {
    expect((await como('gestor').get('/api/indicadores').query({ q: 'a'.repeat(100) })).status).toBe(200);
    const r = await como('gestor').get('/api/indicadores').query({ q: 'a'.repeat(101) });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('q');
  });

  test('un parámetro repetido (?q=a&q=b) se rechaza', async () => {
    const r = await como('gestor').get('/api/indicadores?q=a&q=b');
    expect(r.status).toBe(400);
  });
});

describe('P12-2: lista Programa', () => {
  test('filtra por un programa existente', async () => {
    const r = await como('gestor').get('/api/indicadores').query({ programaId: PROG.Matronas });
    expect(r.status).toBe(200);
    expect(r.body.indicadores.length).toBeGreaterThan(0);
    expect(r.body.indicadores.every((i) => i.programaId === PROG.Matronas)).toBe(true);
  });

  test('"Todos" (vacío) trae todos', async () => {
    const r = await como('gestor').get('/api/indicadores?programaId=');
    expect(r.body.indicadores).toHaveLength(5);
  });

  test.each([['abc'], ['9999'], ['0'], ['-1'], ['1.5'], ['1 OR 1=1']])('programa fuera de la lista (%s) -> 400', async (programaId) => {
    const r = await como('gestor').get('/api/indicadores').query({ programaId });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('programaId');
  });
});

describe('P13: crear un indicador', () => {
  test('con denominador del REM: 201 y todos los campos de vuelta', async () => {
    const r = await crear();
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      nombre: 'Indicador de prueba', programaId: PROG.Matronas, programa: 'Matronas', remCodigo: 'IND-90', seccion: 'Sección A',
      celdaNumerador: 'B30', origenDenominador: 'REM', celdaDenominador: 'C30', codigoPrestacion: '24-01-001',
      metaNacional: 50, pesoRelativo: 10, referenteResponsable: 'Referente Demo', activo: true
    });
  });

  test('P13-5: con denominador "Población" la celda del denominador queda vacía', async () => {
    const r = await crear({ remCodigo: 'IND-91', origenDenominador: 'POBLACION', celdaDenominador: undefined });
    expect(r.status).toBe(201);
    expect(r.body.celdaDenominador).toBeNull();
    const vacia = await crear({ remCodigo: 'IND-92', origenDenominador: 'POBLACION', celdaDenominador: '' });
    expect(vacia.status).toBe(201);
    expect(vacia.body.celdaDenominador).toBeNull();
  });

  test('P13-8: sección, código de prestación y referente son opcionales (quedan en null)', async () => {
    const r = await crear({ remCodigo: 'IND-93', seccion: '', codigoPrestacion: undefined, referenteResponsable: null });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ seccion: null, codigoPrestacion: null, referenteResponsable: null });
  });

  test('las celdas se guardan en mayúscula y el nombre sin espacios sobrantes', async () => {
    const r = await crear({ remCodigo: 'IND-94', celdaNumerador: 'b31', celdaDenominador: 'c31', nombre: '   Con espacios   ' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ celdaNumerador: 'B31', celdaDenominador: 'C31', nombre: 'Con espacios' });
  });

  test('un nombre con HTML se guarda tal cual como texto (el frontend lo muestra escapado)', async () => {
    const nombre = '<img src=x onerror=alert(1)> & "comillas"';
    const r = await crear({ remCodigo: 'IND-95', nombre });
    expect(r.status).toBe(201);
    expect(r.body.nombre).toBe(nombre);
    expect(r.headers['content-type']).toMatch(/application\/json/);
  });

  test('P13-1/P13-7 límites: nombre de 200 caracteres, meta 0 y peso 100 se aceptan', async () => {
    const r = await crear({ remCodigo: 'IND-96', nombre: 'n'.repeat(200), metaNacional: 0, pesoRelativo: 100 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ metaNacional: 0, pesoRelativo: 100 });
  });

  test('queda CREAR_INDICADOR en la auditoría con código, nombre y meta', async () => {
    const antes = await auditorias('CREAR_INDICADOR');
    const r = await crear({ remCodigo: 'IND-97' });
    expect(await auditorias('CREAR_INDICADOR')).toBe(antes + 1);
    const f = (await admin("SELECT detalle FROM log_auditoria WHERE accion = 'CREAR_INDICADOR' AND entidad_id = $1", [r.body.id])).rows[0];
    expect(f.detalle).toEqual({ antes: null, despues: { codigo: 'IND-97', nombre: 'Indicador de prueba', meta_nacional: 50 } });
  });
});

describe('P13: datos inválidos -> 400, marca el campo y no guarda', () => {
  let indicadoresAntes; let auditoriaAntes;
  beforeAll(async () => { indicadoresAntes = await totalIndicadores(); auditoriaAntes = await auditorias('CREAR_INDICADOR'); });

  const casos = [
    // [descripción, cambios al cuerpo, campo que debe marcarse]
    ['P13-1 nombre vacío', { nombre: '' }, 'nombre'],
    ['P13-1 nombre solo espacios', { nombre: '     ' }, 'nombre'],
    ['P13-1 nombre de 201 caracteres', { nombre: 'n'.repeat(201) }, 'nombre'],
    ['P13-1 nombre que no es texto', { nombre: 123 }, 'nombre'],
    ['P13-1 nombre con carácter nulo', { nombre: 'ab\u0000c' }, 'nombre'],
    ['P13-2 programa que no existe', { programaId: 9999 }, 'programaId'],
    ['P13-2 programa con texto', { programaId: 'Matronas' }, 'programaId'],
    ['P13-2 programa vacío', { programaId: null }, 'programaId'],
    ['P13-3 código REM vacío', { remCodigo: '' }, 'remCodigo'],
    ['P13-3 código REM de 21 caracteres', { remCodigo: 'C'.repeat(21) }, 'remCodigo'],
    ['P13-4 celda del numerador vacía', { celdaNumerador: '' }, 'celdaNumerador'],
    ['P13-4 celda 12B', { celdaNumerador: '12B' }, 'celdaNumerador'],
    ['P13-4 celda B-12', { celdaNumerador: 'B-12' }, 'celdaNumerador'],
    ['P13-4 celda con espacio', { celdaNumerador: 'B 12' }, 'celdaNumerador'],
    ['P13-4 celda con otra hoja', { celdaNumerador: "Hoja1!B12" }, 'celdaNumerador'],
    ['P13-4 celda con fórmula', { celdaNumerador: '=B12+1' }, 'celdaNumerador'],
    ['P13-5 origen REM sin celda del denominador', { origenDenominador: 'REM', celdaDenominador: '' }, 'celdaDenominador'],
    ['P13-5 origen REM con celda inválida', { origenDenominador: 'REM', celdaDenominador: '33' }, 'celdaDenominador'],
    ['P13-5 origen Población con celda del denominador', { origenDenominador: 'POBLACION', celdaDenominador: 'C30' }, 'celdaDenominador'],
    ['P13-5 origen que no existe', { origenDenominador: 'OTRO' }, 'origenDenominador'],
    ['P13-5 origen en minúscula', { origenDenominador: 'rem' }, 'origenDenominador'],
    ['P13-6 meta con letras', { metaNacional: 'abc' }, 'metaNacional'],
    ['P13-6 meta negativa', { metaNacional: -1 }, 'metaNacional'],
    ['P13-6 meta con 3 decimales', { metaNacional: 80.123 }, 'metaNacional'],
    ['P13-6 meta en notación científica', { metaNacional: '1e2' }, 'metaNacional'],
    ['P13-6 meta vacía', { metaNacional: '' }, 'metaNacional'],
    ['P13-6 meta demasiado grande', { metaNacional: 100000 }, 'metaNacional'],
    ['P13-7 peso mayor a 100', { pesoRelativo: 100.01 }, 'pesoRelativo'],
    ['P13-7 peso negativo', { pesoRelativo: -0.5 }, 'pesoRelativo'],
    ['P13-7 peso con letras', { pesoRelativo: 'x' }, 'pesoRelativo'],
    ['P13-8 sección de 51 caracteres', { seccion: 's'.repeat(51) }, 'seccion'],
    ['P13-8 código de prestación de 51 caracteres', { codigoPrestacion: 'c'.repeat(51) }, 'codigoPrestacion'],
    ['P13-8 referente de 101 caracteres', { referenteResponsable: 'r'.repeat(101) }, 'referenteResponsable'],
    ['activo que no es verdadero/falso', { activo: 'quizás' }, 'activo']
  ];
  test.each(casos)('%s', async (_d, cambios, campo) => {
    const r = await crear(Object.assign({ remCodigo: 'IND-ERR' }, cambios));
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty(campo);
  });

  test('el cuerpo vacío, un arreglo o un texto no JSON se rechazan', async () => {
    expect((await como('gestor').post('/api/indicadores').send({})).status).toBe(400);
    expect((await como('gestor').post('/api/indicadores').send([cuerpo()])).status).toBe(400);
    const r = await como('gestor').post('/api/indicadores').set('Content-Type', 'application/json').send('{"nombre": ');
    expect(r.status).toBe(400);
  });

  test('nada de lo rechazado dejó indicadores ni auditoría', async () => {
    expect(await totalIndicadores()).toBe(indicadoresAntes);
    expect(await auditorias('CREAR_INDICADOR')).toBe(auditoriaAntes);
  });

  test('la base también rechaza la combinación inconsistente de origen y celda (segunda barrera)', async () => {
    const sql = `INSERT INTO indicador (nombre, programa_id, rem_codigo, celda_numerador, origen_denominador, celda_denominador, meta_nacional)
                 VALUES ('x', 1, 'X', 'A1', $1, $2, 10)`;
    await expect(admin(sql, ['REM', null])).rejects.toThrow();
    await expect(admin(sql, ['POBLACION', 'B2'])).rejects.toThrow();
  });
});

describe('P13: editar un indicador (PUT) y su auditoría de antes/después', () => {
  let id;
  beforeAll(async () => { id = (await crear({ remCodigo: 'IND-EDIT' })).body.id; });

  test('cambiar solo la meta: 200 y la auditoría guarda el valor anterior y el nuevo SOLO de ese campo', async () => {
    const r = await como('gestor').put('/api/indicadores/' + id).send(cuerpo({ remCodigo: 'IND-EDIT', metaNacional: 65 }));
    expect(r.status).toBe(200);
    expect(r.body.metaNacional).toBe(65);
    const f = (await admin("SELECT detalle, usuario_id FROM log_auditoria WHERE accion = 'ACTUALIZAR_INDICADOR' AND entidad_id = $1", [id])).rows;
    expect(f).toHaveLength(1);
    expect(f[0].detalle).toEqual({ antes: { meta_nacional: 50 }, despues: { meta_nacional: 65 } });
  });

  test('guardar sin cambios no deja auditoría', async () => {
    const antes = await auditorias('ACTUALIZAR_INDICADOR');
    const r = await como('gestor').put('/api/indicadores/' + id).send(cuerpo({ remCodigo: 'IND-EDIT', metaNacional: 65 }));
    expect(r.status).toBe(200);
    expect(await auditorias('ACTUALIZAR_INDICADOR')).toBe(antes);
  });

  test('cambiar varios campos a la vez los registra todos (origen, celda y programa)', async () => {
    const r = await como('subdireccion').put('/api/indicadores/' + id).send(
      cuerpo({ remCodigo: 'IND-EDIT', metaNacional: 65, programaId: PROG['Salud Mental'], origenDenominador: 'POBLACION', celdaDenominador: null }));
    expect(r.status).toBe(200);
    const f = (await admin("SELECT detalle FROM log_auditoria WHERE accion = 'ACTUALIZAR_INDICADOR' AND entidad_id = $1 ORDER BY id DESC LIMIT 1", [id])).rows[0];
    expect(f.detalle.antes).toEqual({ programa_id: PROG.Matronas, origen_denominador: 'REM', celda_denominador: 'C30' });
    expect(f.detalle.despues).toEqual({ programa_id: PROG['Salud Mental'], origen_denominador: 'POBLACION', celda_denominador: null });
  });

  test('un cambio inválido -> 400 y el indicador queda como estaba', async () => {
    const antes = (await admin('SELECT * FROM indicador WHERE id = $1', [id])).rows[0];
    const r = await como('gestor').put('/api/indicadores/' + id).send(cuerpo({ remCodigo: 'IND-EDIT', metaNacional: -5 }));
    expect(r.status).toBe(400);
    expect((await admin('SELECT * FROM indicador WHERE id = $1', [id])).rows[0]).toEqual(antes);
  });

  test('programa inexistente en la edición -> 400', async () => {
    const r = await como('gestor').put('/api/indicadores/' + id).send(cuerpo({ remCodigo: 'IND-EDIT', programaId: 9999 }));
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('programaId');
  });

  test.each([['9999'], ['0'], ['abc'], ['-3'], ['1;DROP TABLE indicador']])('editar o leer el indicador %s -> 404 "Indicador no encontrado"', async (x) => {
    const put = await como('gestor').put('/api/indicadores/' + encodeURIComponent(x)).send(cuerpo());
    const get = await como('gestor').get('/api/indicadores/' + encodeURIComponent(x));
    expect([put.status, get.status]).toEqual([404, 404]);
    expect(get.body.error).toBe('Indicador no encontrado');
  });

  test('desactivar un indicador: sale del dashboard y de las cargas nuevas; reactivarlo lo devuelve', async () => {
    const IND05 = (await como('gestor').get('/api/indicadores').query({ q: 'IND-05' })).body.indicadores[0];
    const base = Object.assign({}, IND05); delete base.id; delete base.programa;
    const off = await como('gestor').put('/api/indicadores/' + IND05.id).send(Object.assign({}, base, { activo: false }));
    expect(off.status).toBe(200);
    expect(off.body.activo).toBe(false);
    const d = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    expect(d.body.indicadores.map((i) => i.codigo)).not.toContain('IND-05');
    const on = await como('gestor').put('/api/indicadores/' + IND05.id).send(Object.assign({}, base, { activo: true }));
    expect(on.body.activo).toBe(true);
    const d2 = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    expect(d2.body.indicadores.map((i) => i.codigo)).toContain('IND-05');
  });
});

describe('Detalle de un indicador (pantalla 7)', () => {
  test('trae el indicador, el resultado del período y la evolución mensual ordenada', async () => {
    const r = await como('directora').get('/api/indicadores/1/detalle').query({ periodo: '2026-06' });
    expect(r.status).toBe(200);
    expect(r.body.indicador).toMatchObject({ id: 1, remCodigo: 'IND-01' });
    expect(r.body.resultado).toMatchObject({ periodo: '2026-06', resultado: 82, estado: 'cumple' });
    const periodos = r.body.historial.map((h) => h.periodo);
    expect(periodos).toEqual([...periodos].sort());
    expect(periodos).toContain('2026-06');
  });

  test('sin período devuelve solo el historial', async () => {
    const r = await como('subdireccion').get('/api/indicadores/1/detalle');
    expect(r.status).toBe(200);
    expect(r.body.resultado).toBeNull();
    expect(r.body.historial.length).toBeGreaterThan(1);
  });

  test.each([['2026-13'], ['junio'], ["2026-06'"]])('período %s -> 400', async (periodo) => {
    const r = await como('directora').get('/api/indicadores/1/detalle').query({ periodo });
    expect(r.status).toBe(400);
  });

  test('un indicador que no existe -> 404', async () => {
    expect((await como('directora').get('/api/indicadores/9999/detalle')).status).toBe(404);
  });
});

describe('P12-3 / P13: acceso', () => {
  test.each([['directora'], ['jefe']])('%s no puede ver, crear ni editar indicadores (403) y no se crea nada', async (rol) => {
    const antes = await totalIndicadores();
    expect((await como(rol).get('/api/indicadores')).status).toBe(403);
    expect((await crear({ remCodigo: 'IND-403' }, rol)).status).toBe(403);
    expect((await como(rol).put('/api/indicadores/1').send(cuerpo())).status).toBe(403);
    expect(await totalIndicadores()).toBe(antes);
  });
});
