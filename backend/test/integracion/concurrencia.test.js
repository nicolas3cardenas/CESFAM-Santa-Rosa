'use strict';
// Pruebas de concurrencia y de tiempos de respuesta (plan de pruebas: T-7 en el servidor, P5-6 y T-11 versión rápida).
// Qué se comprueba: que varias personas usando el sistema a la vez no generan errores 500, duplicados ni datos a medias.
// La prueba de carga completa (10 usuarios durante un minuto) está en k6/carga.js.
const { reiniciarBD, admin, cerrarPoolDeLaApp } = require('../ayudas/bd');
const api = require('../ayudas/api');
const { crearRem } = require('../ayudas/rem');
const { como, leerBinario } = api;

beforeAll(async () => { await reiniciarBD(); await api.sesiones(); });
afterAll(async () => { await cerrarPoolDeLaApp(); });

const contar = async (sql, params) => Number((await admin(sql, params)).rows[0].n);
const subir = (periodo, buffer, nombre) => como('gestor').post('/api/cargas').field('periodo', periodo).attach('archivo', buffer, nombre || 'rem.xlsx');
const medir = async (promesa) => { const t0 = Date.now(); const r = await promesa; r.ms = Date.now() - t0; return r; };

describe('T-11 / P5-6: 10 personas consultando a la vez (versión rápida; la completa es k6/carga.js)', () => {
  const consultas = () => [
    medir(como('directora').get('/api/dashboard')),
    medir(como('subdireccion').get('/api/reportes').query({ mes: '2026-06' })),
    medir(como('directora').get('/api/comparativo').query({ anioActual: '2026', anioComparar: '2025' })),
    medir(como('subdireccion').get('/api/exportar').query({ formato: 'CSV', periodo: '2026-06' })),
    medir(como('jefe').get('/api/reportes').query({ mes: '2026-06' }))
  ];

  test('50 consultas simultáneas (10 personas x 5 consultas): todas 200 y cada una en menos de 3 segundos (RNF-03)', async () => {
    const todas = await Promise.all([].concat(...Array.from({ length: 10 }, consultas)));
    todas.forEach((r) => { expect(r.status).toBe(200); expect(r.ms).toBeLessThan(3000); });
  });

  test('100 consultas a la vez (más que las conexiones del grupo de la base) se atienden en fila, sin errores', async () => {
    const todas = await Promise.all(Array.from({ length: 100 }, (_, i) => como(i % 2 ? 'directora' : 'subdireccion').get('/api/dashboard')));
    expect(todas.map((r) => r.status).filter((s) => s !== 200)).toEqual([]);
  });

  test('exportar XLSX a la vez desde varias personas entrega archivos completos', async () => {
    const todas = await Promise.all(Array.from({ length: 6 }, () => como('directora').get('/api/exportar').query({ formato: 'XLSX', periodo: '2026-06' }).buffer(true).parse(leerBinario)));
    todas.forEach((r) => { expect(r.status).toBe(200); expect(r.body.slice(0, 2).toString()).toBe('PK'); });
    expect(new Set(todas.map((r) => r.body.length)).size).toBeLessThanOrEqual(2);
  });

  test('20 inicios de sesión correctos a la vez: todos entran y no se bloquea ni se cuenta ningún intento fallido', async () => {
    const todas = await Promise.all(Array.from({ length: 20 }, () => api.login('directora@demo.cl')));
    expect(todas.map((r) => r.status)).toEqual(Array(20).fill(200));
    const u = (await admin("SELECT intentos_fallidos, bloqueado_hasta FROM usuario WHERE email = 'directora@demo.cl'")).rows[0];
    expect(u).toEqual({ intentos_fallidos: 0, bloqueado_hasta: null });
  });
});

describe('T-7 (servidor): doble clic y solicitudes repetidas dejan una sola operación', () => {
  test('8 cargas del mismo mes a la vez: todas terminan, cada una queda registrada y solo una es la vigente (5 resultados visibles)', async () => {
    const antes = await contar('SELECT count(*) AS n FROM carga_rem');
    const rs = await Promise.all(Array.from({ length: 8 }, async (_, i) => subir('2026-08', await crearRem(), `a-la-vez-${i}.xlsx`)));
    expect(rs.map((r) => r.status)).toEqual(Array(8).fill(201));
    expect(new Set(rs.map((r) => r.body.id)).size).toBe(8);
    expect(await contar('SELECT count(*) AS n FROM carga_rem')).toBe(antes + 8);
    expect(await contar("SELECT count(*) AS n FROM carga_rem WHERE periodo = '2026-08'")).toBe(8);
    // un solo resultado por indicador y carga (la base lo exige) y 5 por carga
    expect(await contar('SELECT count(*) AS n FROM resultado_indicador r JOIN carga_rem c ON c.id = r.carga_rem_id WHERE c.periodo = \'2026-08\'')).toBe(40);
    const d = await como('directora').get('/api/dashboard').query({ periodo: '2026-08' });
    expect(d.body.indicadores).toHaveLength(5);
  });

  test('mientras se hacen cargas, quien consulta ve el mes completo o no lo ve: nunca una parte de los indicadores', async () => {
    const periodo = '2026-10';
    const cargas = Promise.all(Array.from({ length: 4 }, async (_, i) => subir(periodo, await crearRem(), `carga-${i}.xlsx`)));
    const lecturas = [];
    for (let i = 0; i < 12; i += 1) { lecturas.push(como('directora').get('/api/dashboard').query({ periodo })); }
    const [subidas, vistas] = await Promise.all([cargas, Promise.all(lecturas)]);
    expect(subidas.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    vistas.forEach((r) => {
      expect(r.status).toBe(200);
      // o todavía no había datos ("Sin datos para el período") o ya estaban los 5 indicadores: nunca una parte
      expect(r.body.indicadores).toHaveLength(r.body.sinDatos ? 0 : 5);
    });
    const final = await como('directora').get('/api/dashboard').query({ periodo });
    expect(final.body.sinDatos).toBe(false);
    expect(final.body.indicadores).toHaveLength(5);
  });

  test('6 intentos de crear la misma cuenta a la vez: se crea una y las demás responden 409, con una sola auditoría', async () => {
    const cuerpo = { nombre: 'Persona Doble', correo: 'doble.clic@demo.cl', rolId: 3, clave: 'Clave-Nueva-2026' };
    const rs = await Promise.all(Array.from({ length: 6 }, () => como('gestor').post('/api/usuarios').send(cuerpo)));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
    expect(await contar("SELECT count(*) AS n FROM usuario WHERE email = 'doble.clic@demo.cl'")).toBe(1);
    expect(await contar("SELECT count(*) AS n FROM log_auditoria WHERE accion = 'CREAR_USUARIO' AND detalle->'despues'->>'correo' = 'doble.clic@demo.cl'")).toBe(1);
  });

  test('población: 6 ingresos iguales a la vez dejan una fila y una auditoría', async () => {
    const rs = await Promise.all(Array.from({ length: 6 }, () => como('subdireccion').post('/api/poblacion').send({ indicadorId: 3, periodo: '2026-07', valor: 1480 })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
    expect(await contar("SELECT count(*) AS n FROM poblacion_denominador WHERE indicador_id = 3 AND periodo = '2026-07'")).toBe(1);
    expect(await contar("SELECT count(*) AS n FROM log_auditoria WHERE accion = 'INGRESO_POBLACION' AND detalle->'despues'->>'periodo' = '2026-07' AND detalle->'despues'->>'indicador' = 'IND-03'")).toBe(1);
  });

  test('15 comentarios a la vez se guardan todos (cada clic distinto es un comentario distinto)', async () => {
    const antes = await contar('SELECT count(*) AS n FROM comentario_indicador');
    const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => como('jefe').post('/api/indicadores/1/comentarios').send({ periodo: '2026-06', texto: `Comentario simultáneo ${i}` })));
    expect(rs.map((r) => r.status)).toEqual(Array(15).fill(201));
    expect(await contar('SELECT count(*) AS n FROM comentario_indicador')).toBe(antes + 15);
  });

  test('10 ediciones simultáneas del mismo indicador: la auditoría forma una cadena sin saltos (cada "antes" es el "después" anterior)', async () => {
    const actual = (await como('gestor').get('/api/indicadores/1')).body;
    const base = {
      nombre: actual.nombre, programaId: actual.programaId, remCodigo: actual.remCodigo, seccion: actual.seccion, celdaNumerador: actual.celdaNumerador,
      origenDenominador: actual.origenDenominador, celdaDenominador: actual.celdaDenominador, codigoPrestacion: actual.codigoPrestacion,
      metaNacional: actual.metaNacional, pesoRelativo: actual.pesoRelativo, referenteResponsable: actual.referenteResponsable
    };
    const metas = [11, 22, 33, 44, 55, 66, 77, 88, 12, 23];
    const rs = await Promise.all(metas.map((m) => como(m % 2 ? 'gestor' : 'subdireccion').put('/api/indicadores/1').send({ ...base, metaNacional: m })));
    expect(rs.map((r) => r.status)).toEqual(Array(10).fill(200));
    const filas = (await admin("SELECT detalle FROM log_auditoria WHERE accion = 'ACTUALIZAR_INDICADOR' AND entidad_id = 1 ORDER BY id")).rows;
    expect(filas).toHaveLength(10);
    let esperado = actual.metaNacional;
    filas.forEach((f) => {
      expect(f.detalle.antes.meta_nacional).toBe(esperado);
      esperado = f.detalle.despues.meta_nacional;
    });
    const final = (await admin('SELECT meta_nacional FROM indicador WHERE id = 1')).rows[0].meta_nacional;
    expect(final).toBe(esperado);
    expect(metas).toContain(final);
  });

  test('activar y desactivar la misma cuenta a la vez termina en un estado válido y la auditoría coincide con él', async () => {
    const id = (await admin("SELECT id FROM usuario WHERE email = 'jefe.saludmental@demo.cl'")).rows[0].id;
    const rs = await Promise.all([false, true, false, true, false, true].map((activo) => como('gestor').patch(`/api/usuarios/${id}/estado`).send({ activo })));
    rs.forEach((r) => expect(r.status).toBe(200));
    const final = (await admin('SELECT activo FROM usuario WHERE id = $1', [id])).rows[0].activo;
    const ultima = (await admin("SELECT accion FROM log_auditoria WHERE entidad = 'usuario' AND entidad_id = $1 AND accion IN ('ACTIVAR_USUARIO', 'DESACTIVAR_USUARIO') ORDER BY id DESC LIMIT 1", [id])).rows[0];
    expect(ultima.accion).toBe(final ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO');
  });
});

describe('Sesiones simultáneas', () => {
  test('cambiar la contraseña con dos sesiones abiertas: la otra sesión deja de servir, la nueva sirve', async () => {
    const a = await api.login('subdireccion@demo.cl');
    const b = await api.login('subdireccion@demo.cl');
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect((await api.conToken(a.body.token).get('/api/dashboard')).status).toBe(200);
    const cambio = await api.conToken(a.body.token).post('/api/auth/cambiar-clave').send({ claveActual: 'ClaveDemo2026', claveNueva: 'Otra-Clave-2026', confirmacion: 'Otra-Clave-2026' });
    expect(cambio.status).toBe(200);
    expect((await api.conToken(b.body.token).get('/api/dashboard')).status).toBe(401);
    expect((await api.conToken(cambio.body.token).get('/api/dashboard')).status).toBe(200);
  });
});
