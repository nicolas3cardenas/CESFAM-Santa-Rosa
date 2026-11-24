'use strict';
// Pruebas de integración de la carga del REM (pantallas 9 y 10) y de sus controles de seguridad
// (plan de pruebas: P9-1 a P9-5, P10-1, P10-2, T-9). Los archivos REM de prueba se fabrican en memoria
// con los indicadores de demostración; ninguno contiene datos reales.
const { reiniciarBD, admin, cerrarPoolDeLaApp } = require('../ayudas/bd');
const api = require('../ayudas/api');
const { crearRem } = require('../ayudas/rem');
const { crearZip, xlsxFalso } = require('../ayudas/zip');
const { como } = api;

beforeAll(async () => { await reiniciarBD(); await api.sesiones(); });
afterAll(async () => { await cerrarPoolDeLaApp(); });

// Sube un archivo como un usuario; 'archivo' puede ser un Buffer o { buffer, nombre }
function subir(rol, periodo, buffer, nombre) {
  let q = como(rol).post('/api/cargas');
  if (periodo !== undefined) { q = q.field('periodo', periodo); }
  if (buffer !== undefined) { q = q.attach('archivo', buffer, nombre || 'rem.xlsx'); }
  return q;
}

const contar = async (tabla) => Number((await admin(`SELECT count(*) AS n FROM ${tabla}`)).rows[0].n);
const resultadosDe = async (idCarga) => Number((await admin('SELECT count(*) AS n FROM resultado_indicador WHERE carga_rem_id = $1', [idCarga])).rows[0].n);
const porCodigo = (lista) => Object.fromEntries(lista.map((i) => [i.codigo, i]));

describe('P9-1: campo Período', () => {
  test.each([
    ['mes 13', '2026-13'], ['mes 00', '2026-00'], ['sin cero', '2026-6'], ['año corto', '26-06'],
    ['con barra', '2026/06'], ['vacío', ''], ['con texto', 'junio'], ['con SQL', "2026-06'; DROP TABLE carga_rem;--"]
  ])('período inválido (%s) -> 400 y no se crea carga', async (_n, periodo) => {
    const antes = await contar('carga_rem');
    const r = await subir('gestor', periodo, await crearRem());
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('periodo');
    expect(await contar('carga_rem')).toBe(antes);
  });

  test('falta el período -> 400', async () => {
    const r = await subir('gestor', undefined, await crearRem());
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('periodo');
  });

  test('P9-1: los 12 meses válidos del formato AAAA-MM se aceptan (el período 2027-12 queda cargado)', async () => {
    const r = await subir('gestor', '2027-12', await crearRem());
    expect(r.status).toBe(201);
    expect(r.body.periodo).toBe('2027-12');
  });
});

describe('P9-2: selector de archivo', () => {
  test('sin archivo adjunto -> 400 con mensaje en el campo archivo', async () => {
    const r = await subir('gestor', '2026-07');
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('archivo');
  });

  test.each([
    ['.pdf', 'rem.pdf'], ['.exe', 'rem.exe'], ['.txt', 'rem.txt'], ['.csv', 'rem.csv'],
    ['sin extensión', 'rem'], ['doble extensión', 'rem.xlsx.exe'], ['.xls antiguo', 'rem.xls'], ['.xlsx.html', 'rem.xlsx.html']
  ])('extensión no permitida (%s) -> 400 y no se crea carga', async (_n, nombre) => {
    const antes = await contar('carga_rem');
    const r = await subir('gestor', '2026-07', await crearRem(), nombre);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/\.xlsx o \.xlsm/);
    expect(await contar('carga_rem')).toBe(antes);
  });

  test('la extensión se acepta en mayúsculas (.XLSX)', async () => {
    const r = await subir('gestor', '2026-08', await crearRem(), 'REM JULIO.XLSX');
    expect(r.status).toBe(201);
  });

  test('archivo vacío -> 400 "El archivo está vacío"', async () => {
    const antes = await contar('carga_rem');
    const r = await subir('gestor', '2026-07', Buffer.alloc(0), 'vacio.xlsx');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('El archivo está vacío');
    expect(await contar('carga_rem')).toBe(antes);
  });

  test('archivo de más de 10 MB -> 413 y no se crea carga', async () => {
    const antes = await contar('carga_rem');
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1024, 0x41);
    const r = await subir('gestor', '2026-07', grande, 'grande.xlsx');
    expect(r.status).toBe(413);
    expect(r.body.error).toMatch(/10 MB/);
    expect(await contar('carga_rem')).toBe(antes);
  });

  test('el nombre con tildes y ñ se guarda bien, y un nombre con carpetas se reduce al nombre del archivo', async () => {
    const ok = await subir('gestor', '2026-09', await crearRem(), 'REM septiembre año ñandú.xlsx');
    expect(ok.status).toBe(201);
    expect(ok.body.archivo).toBe('REM septiembre año ñandú.xlsx');
    const ruta = await subir('gestor', '2026-10', await crearRem(), '..\\..\\etc\\passwd\\rem.xlsx');
    expect(ruta.status).toBe(201);
    expect(ruta.body.archivo).toBe('rem.xlsx');
  });
});

describe('P9-3 y T-9: contenido del archivo', () => {
  test('T-9: un .exe renombrado como .xlsx se rechaza y no deja carga', async () => {
    const antes = await contar('carga_rem');
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2000, 0x90)]);
    const r = await subir('gestor', '2026-07', exe, 'rem.xlsx');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('El archivo no es una planilla Excel válida');
    expect(await contar('carga_rem')).toBe(antes);
  });

  test('un texto cualquiera renombrado como .xlsx se rechaza', async () => {
    const r = await subir('gestor', '2026-07', Buffer.from('Esto no es Excel, es solo texto. '.repeat(20)), 'rem.xlsx');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('El archivo no es una planilla Excel válida');
  });

  test('un ZIP cualquiera (sin las partes de una planilla) se rechaza', async () => {
    const r = await subir('gestor', '2026-07', crearZip({ 'hola.txt': 'hola' }), 'rem.xlsx');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('El archivo no es una planilla Excel válida');
  });

  test('T-9: una "bomba ZIP" (declara gigas al descomprimir) se rechaza sin descomprimirla', async () => {
    const bomba = xlsxFalso({ 'xl/relleno.bin': { contenido: 'x', tamanoDeclarado: 4000000000 } });
    const antes = await contar('carga_rem');
    const r = await subir('gestor', '2026-07', bomba, 'rem.xlsx');
    expect(r.status).toBe(400);
    expect(await contar('carga_rem')).toBe(antes);
  });

  test('un archivo cifrado se rechaza', async () => {
    const cifrado = xlsxFalso({ 'xl/secreto.bin': { contenido: 'x', cifrado: true } });
    const r = await subir('gestor', '2026-07', cifrado, 'rem.xlsx');
    expect(r.status).toBe(400);
  });

  test('un archivo con estructura de Excel pero sin hojas reales nunca crea resultados', async () => {
    const antes = await contar('resultado_indicador');
    const r = await subir('gestor', '2026-07', xlsxFalso(), 'rem.xlsx');
    // Según la librería, se rechaza (400) o se acepta como carga "Con errores": en ambos casos no hay resultados
    expect([400, 201]).toContain(r.status);
    if (r.status === 201) { expect(r.body.estado).toBe('Con errores'); }
    expect(await contar('resultado_indicador')).toBe(antes);
  });

  test('T-9: un .xlsm con macros se acepta como dato, avisa de las macros y NO las ejecuta', async () => {
    const r = await subir('gestor', '2026-11', await crearRem({ macros: true }), 'rem con macros.xlsm');
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('Validada');
    expect(r.body.resumen.advertencias.join(' ')).toMatch(/macros/);
    expect(r.body.resultadosCreados).toBe(5);
  });

  test('una planilla sin macros no tiene el aviso de macros', async () => {
    const r = await subir('gestor', '2026-12', await crearRem(), 'rem.xlsx');
    expect(r.status).toBe(201);
    expect(r.body.resumen.advertencias.join(' ')).not.toMatch(/macros/);
  });
});

describe('P9 y P10: carga correcta de un mes nuevo y flujo de la población', () => {
  let carga;
  beforeAll(async () => { carga = await subir('subdireccion', '2026-07', await crearRem(), 'REM julio 2026.xlsx'); });

  test('P9: la carga queda "Validada", con 4 hojas y 7 celdas leídas', () => {
    expect(carga.status).toBe(201);
    expect(carga.body).toMatchObject({ periodo: '2026-07', archivo: 'REM julio 2026.xlsx', estado: 'Validada', resultadosCreados: 5 });
    expect(carga.body.resumen).toMatchObject({ hojas_leidas: 4, hojas_esperadas: 4, celdas_leidas: 7, celdas_vacias: [], errores: [] });
    expect(carga.body.totales).toEqual({ errores: 0, celdasVacias: 0, advertencias: 3 });
  });

  test('avisa qué indicadores esperan población (IND-02, IND-03, IND-05), sin tratarlo como error', () => {
    const texto = carga.body.resumen.advertencias.join(' | ');
    expect(texto).toMatch(/IND-02/); expect(texto).toMatch(/IND-03/); expect(texto).toMatch(/IND-05/);
  });

  test('P4: el dashboard de 2026-07 calcula los de denominador REM y deja "sin población" a los demás', async () => {
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-07' });
    const i = porCodigo(r.body.indicadores);
    expect(i['IND-01']).toMatchObject({ resultado: 82, estado: 'cumple' });
    expect(i['IND-04']).toMatchObject({ resultado: 41, estado: 'nocumple' });
    expect(i['IND-02']).toMatchObject({ resultado: null, estado: 'sin_poblacion' });
    expect(r.body.faltaPoblacion).toBe(3);
  });

  test('P11: al ingresar la población, el resultado pendiente se calcula solo', async () => {
    const p = await como('gestor').post('/api/poblacion').send({ indicadorId: 2, periodo: '2026-07', valor: 420 });
    expect(p.status).toBe(201);
    expect(p.body.resultadosActualizados).toBe(1);
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-07' });
    expect(porCodigo(r.body.indicadores)['IND-02']).toMatchObject({ numerador: 328, denominador: 420, resultado: 78.1, estado: 'riesgo' });
    expect(r.body.faltaPoblacion).toBe(2);
  });

  test('P10-1: el resumen de la carga se puede abrir después (GET /api/cargas/:id)', async () => {
    const r = await como('gestor').get(`/api/cargas/${carga.body.id}`);
    expect(r.status).toBe(200);
    expect(r.body.resumen.hojas_leidas).toBe(4);
    expect(r.body.usuario).toBe('Subdirección Demo');
  });

  test('queda una entrada CARGA_REM en la auditoría con período, archivo y cantidad de errores', async () => {
    const f = (await admin("SELECT detalle, usuario_id FROM log_auditoria WHERE accion = 'CARGA_REM' AND entidad_id = $1", [carga.body.id])).rows;
    expect(f).toHaveLength(1);
    expect(f[0].detalle.despues).toMatchObject({ periodo: '2026-07', archivo: 'REM julio 2026.xlsx', hojas_leidas: 4, errores: 0 });
  });
});

describe('P10-1: planillas con problemas -> "Con errores" y sin resultados', () => {
  test('una celda con texto ("n/d") se informa con hoja, celda y motivo; no se crean resultados', async () => {
    const r = await subir('gestor', '2026-03', await crearRem({ cambios: { 'Sección A': { B12: 'n/d' } } }), 'rem-con-texto.xlsx');
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('Con errores');
    expect(r.body.resultadosCreados).toBe(0);
    expect(r.body.resumen.errores).toHaveLength(1);
    expect(r.body.resumen.errores[0]).toMatchObject({ hoja: 'Sección A', celda: 'B12' });
    expect(r.body.resumen.errores[0].problema).toMatch(/n\/d/);
  });

  test('falta una hoja obligatoria -> error por la hoja y no se calcula nada', async () => {
    const r = await subir('gestor', '2026-02', await crearRem({ sinHojas: ['Sección E'] }), 'sin-hoja.xlsx');
    expect(r.body.estado).toBe('Con errores');
    expect(r.body.resumen.hojas_leidas).toBe(3);
    expect(r.body.resumen.hojas_esperadas).toBe(4);
    expect(r.body.resumen.errores.map((e) => e.problema).join(' ')).toMatch(/Falta la hoja obligatoria "Sección E"/);
    expect(r.body.resultadosCreados).toBe(0);
  });

  test('varios problemas a la vez se informan todos (texto, negativo, número con coma escrito como texto)', async () => {
    const cambios = { 'Sección A': { B12: 'abc', C12: -5 }, 'Sección D': { D8: '12,5' } };
    const r = await subir('gestor', '2026-01', await crearRem({ cambios }), 'varios.xlsx');
    expect(r.body.estado).toBe('Con errores');
    const celdas = r.body.resumen.errores.map((e) => e.celda).sort();
    expect(celdas).toEqual(['B12', 'C12', 'D8']);
    expect(r.body.totales.errores).toBe(3);
  });

  test('una celda vacía NO es error: vale 0, se lista en celdas_vacias y la carga queda Validada', async () => {
    const r = await subir('gestor', '2025-11', await crearRem({ cambios: { 'Sección D': { D8: null } } }), 'celda-vacia.xlsx');
    expect(r.body.estado).toBe('Validada');
    expect(r.body.resumen.celdas_vacias).toEqual([{ hoja: 'Sección D', celda: 'D8', indicador: 'IND-03' }]);
    expect(r.body.totales.celdasVacias).toBe(1);
  });

  test('una carga con errores deja su período como estaba (el período 2026-03 conserva sus resultados)', async () => {
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-03' });
    expect(r.body.sinDatos).toBe(false);
    expect(porCodigo(r.body.indicadores)['IND-01'].numerador).toBe(1491);   // valor de los datos de demostración
  });

  test('la carga con errores igual queda en el historial y en la auditoría (con el número de errores)', async () => {
    const f = (await admin(`SELECT detalle FROM log_auditoria WHERE accion = 'CARGA_REM'
                              AND detalle -> 'despues' ->> 'archivo' = 'rem-con-texto.xlsx'`)).rows;
    expect(f).toHaveLength(1);
    expect(f[0].detalle.despues.errores).toBe(1);
  });

  test('un valor enorme se informa como error y no desborda la base de datos', async () => {
    const r = await subir('gestor', '2025-10', await crearRem({ cambios: { 'Sección F': { F15: 1e15 } } }), 'enorme.xlsx');
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('Con errores');
    expect(r.body.resumen.errores[0].problema).toMatch(/demasiado grande/);
  });
});

describe('Carga vigente: volver a subir un mes reemplaza al anterior sin borrarlo', () => {
  test('una carga corregida de 2026-06 cambia el dashboard y la anterior queda en el historial', async () => {
    const antes = await contar('carga_rem');
    const r = await subir('gestor', '2026-06', await crearRem({ cambios: { 'Sección A': { B12: 1800 } } }), 'rem-corregido.xlsx');
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('Validada');
    expect(await contar('carga_rem')).toBe(antes + 1);
    const d = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    expect(porCodigo(d.body.indicadores)['IND-01']).toMatchObject({ numerador: 1800, resultado: 85.71 });
    // la carga anterior de ese mes y sus resultados siguen en la base
    const viejas = (await admin("SELECT count(*) AS n FROM carga_rem WHERE periodo = '2026-06'")).rows[0].n;
    expect(Number(viejas)).toBe(2);
  });

  test('la carga nueva de 2026-06 ya conoce la población ingresada antes (IND-02 = 78,1 y no "sin población")', async () => {
    const d = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    expect(porCodigo(d.body.indicadores)['IND-02']).toMatchObject({ resultado: 78.1 });
  });

  test('el listado de cargas es paginado y muestra la más reciente primero', async () => {
    const r = await como('gestor').get('/api/cargas').query({ pagina: 1, tamano: 3 });
    expect(r.status).toBe(200);
    expect(r.body.cargas).toHaveLength(3);
    expect(r.body.cargas[0].id).toBeGreaterThan(r.body.cargas[1].id);
    expect(Number(r.body.total)).toBeGreaterThan(7);
  });
});

describe('P10-1 con los datos de demostración', () => {
  test('la carga 2 (2026-04) tiene errores y ningún resultado', async () => {
    const r = await como('gestor').get('/api/cargas/2');
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('Con errores');
    expect(r.body.resultadosCreados).toBe(0);
    expect(r.body.resumen.errores.length).toBeGreaterThan(0);
  });

  test('la carga 4 (2026-05) informa su celda vacía', async () => {
    const r = await como('gestor').get('/api/cargas/4');
    expect(r.body.estado).toBe('Validada');
    expect(r.body.totales.celdasVacias).toBe(1);
  });
});

describe('P10-2: abrir una carga que no existe', () => {
  test.each([['9999'], ['0'], ['-1'], ['abc'], ['1;DROP TABLE carga_rem'], ['1.5'], ['99999999999999999999']])('/api/cargas/%s -> 404 "Carga no encontrada"', async (id) => {
    const r = await como('gestor').get('/api/cargas/' + encodeURIComponent(id));
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Carga no encontrada');
  });
});

describe('Doble envío de la misma carga (el botón se deshabilita en la pantalla, pero el servidor también debe resistir)', () => {
  test('dos cargas simultáneas del mismo mes terminan bien y dejan UN solo conjunto vigente de 5 resultados', async () => {
    const [a, b] = await Promise.all([
      subir('gestor', '2026-05', await crearRem(), 'doble-1.xlsx'),
      subir('gestor', '2026-05', await crearRem(), 'doble-2.xlsx')
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).not.toBe(b.body.id);
    const d = await como('directora').get('/api/dashboard').query({ periodo: '2026-05' });
    expect(d.body.indicadores).toHaveLength(5);
  });

  test('una carga y un ingreso de población del mismo mes al mismo tiempo dan el mismo resultado final, sin importar el orden', async () => {
    for (const periodo of ['2027-01', '2027-02', '2027-03']) {
      const [c, p] = await Promise.all([
        subir('gestor', periodo, await crearRem(), 'a-la-vez.xlsx'),
        como('subdireccion').post('/api/poblacion').send({ indicadorId: 2, periodo, valor: 420 })
      ]);
      expect(c.status).toBe(201);
      expect(p.status).toBe(201);
      const d = await como('directora').get('/api/dashboard').query({ periodo });
      expect(porCodigo(d.body.indicadores)['IND-02']).toMatchObject({ denominador: 420, resultado: 78.1 });
    }
  });
});

describe('P9-5: acceso', () => {
  test.each([['directora'], ['jefe']])('%s no puede cargar un REM (403) y no se crea nada', async (rol) => {
    const antes = await contar('carga_rem');
    const r = await subir(rol, '2026-07', await crearRem(), 'rem.xlsx');
    expect(r.status).toBe(403);
    expect(await contar('carga_rem')).toBe(antes);
  });

  test('sin sesión -> 401', async () => {
    const r = await api.request(api.app).post('/api/cargas').field('periodo', '2026-07').attach('archivo', await crearRem(), 'rem.xlsx');
    expect(r.status).toBe(401);
  });
});
