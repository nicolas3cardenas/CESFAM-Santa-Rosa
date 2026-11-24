'use strict';
// Pruebas de integración de la pantalla 16 (Registro de auditoría): P16-1 a P16-4 por la API.
// Datos: los 6 registros de la demostración (todos de junio de 2026), por eso los filtros usan fechas de junio.
const { Client } = require('pg');
const { reiniciarBD, admin, cerrarPoolDeLaApp, config } = require('../ayudas/bd');
const api = require('../ayudas/api');
const { como } = api;

let GESTOR_ID;
beforeAll(async () => {
  await reiniciarBD(); await api.sesiones();
  GESTOR_ID = (await admin("SELECT id FROM usuario WHERE email = 'gestor@demo.cl'")).rows[0].id;
});
afterAll(async () => { await cerrarPoolDeLaApp(); });

const lista = (q) => como('gestor').get('/api/auditoria').query(q || {});
const JUNIO = { desde: '2026-06-01', hasta: '2026-06-30' };
const instantanea = async () => JSON.stringify((await admin('SELECT * FROM log_auditoria ORDER BY id')).rows);

describe('Lista y orden', () => {
  test('sin filtros trae los registros más nuevos primero, con quién, qué, cuándo y el detalle', async () => {
    const r = await lista(JUNIO);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 6, pagina: 1, tamano: 20 });
    expect(r.body.registros).toHaveLength(6);
    expect(r.body.registros.map((x) => x.accion)).toEqual([
      'INGRESO_POBLACION', 'CARGA_REM', 'ACTUALIZAR_INDICADOR', 'CREAR_USUARIO', 'DESACTIVAR_USUARIO', 'LOGIN_FALLIDO'
    ]);
    const fechas = r.body.registros.map((x) => new Date(x.fecha).getTime());
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
    expect(r.body.registros[0]).toEqual(expect.objectContaining({
      id: expect.any(Number), accion: 'INGRESO_POBLACION', entidad: 'poblacion_denominador', entidadId: 11,
      usuario: { id: expect.any(Number), nombre: expect.any(String) }
    }));
  });

  test('P16-3: el detalle muestra el valor anterior y el nuevo', async () => {
    const r = await lista({ ...JUNIO, entidad: 'indicador' });
    expect(r.body.registros).toHaveLength(1);
    expect(r.body.registros[0].detalle).toEqual({ antes: { meta_nacional: 55 }, despues: { meta_nacional: 60 } });
  });

  test('un registro sin usuario (intento de ingreso con un correo desconocido) se entrega con usuario nulo', async () => {
    const r = await lista({ ...JUNIO, desde: '2026-06-05', hasta: '2026-06-05' });
    expect(r.body.registros).toHaveLength(1);
    expect(r.body.registros[0]).toMatchObject({ accion: 'LOGIN_FALLIDO', usuario: null });
  });

  test('ningún registro trae contraseñas, hashes ni tokens', async () => {
    const texto = JSON.stringify((await lista({ tamano: 100 })).body).toLowerCase();
    ['password', '$2a$', '$2b$', 'token', 'clave'].forEach((x) => expect(texto).not.toContain(x));
  });
});

describe('P16-1: fechas Desde y Hasta', () => {
  test('rango con ambos extremos incluidos (Hasta cuenta el día completo)', async () => {
    const r = await lista({ desde: '2026-06-12', hasta: '2026-06-12' });
    expect(r.body.registros.map((x) => x.accion)).toEqual(['INGRESO_POBLACION', 'CARGA_REM']);
    expect((await lista({ desde: '2026-06-10', hasta: '2026-06-12' })).body.total).toBe(3);
  });

  test('un rango sin registros devuelve lista vacía y total 0 (no es un error)', async () => {
    const r = await lista({ desde: '2025-01-01', hasta: '2025-01-31' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 0, registros: [] });
  });

  test.each([
    ['fecha inexistente', { desde: '2026-02-30', hasta: '2026-03-10' }, 'desde'],
    ['mes 13', { desde: '2026-13-01', hasta: '2026-12-31' }, 'desde'],
    ['formato distinto', { desde: '12/06/2026', hasta: '2026-06-30' }, 'desde'],
    ['texto', { desde: 'ayer', hasta: 'hoy' }, 'desde'],
    ['hasta inexistente', { desde: '2026-06-01', hasta: '2026-06-31' }, 'hasta']
  ])('%s -> 400 y no consulta', async (_t, q, campo) => {
    const r = await lista(q);
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty(campo);
    expect(r.body).not.toHaveProperty('registros');
  });

  test('Hasta anterior a Desde -> 400', async () => {
    const r = await lista({ desde: '2026-06-30', hasta: '2026-06-01' });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('hasta');
  });

  test('solo una de las dos fechas -> 400', async () => {
    expect((await lista({ desde: '2026-06-01' })).status).toBe(400);
    expect((await lista({ hasta: '2026-06-30' })).status).toBe(400);
  });
});

describe('P16-2: listas Usuario y Entidad', () => {
  test('filtrar por usuario existente', async () => {
    const r = await lista({ ...JUNIO, usuarioId: GESTOR_ID });
    expect(r.body.total).toBe(4);
    expect(r.body.registros.every((x) => x.usuario.id === GESTOR_ID)).toBe(true);
  });

  test.each([['usuario', 3], ['indicador', 1], ['carga_rem', 1], ['poblacion_denominador', 1], ['comentario_indicador', 0]])(
    'filtrar por entidad %s -> %i registros', async (entidad, n) => {
      const r = await lista({ ...JUNIO, entidad });
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(n);
    }
  );

  test('usuario y entidad a la vez', async () => {
    const r = await lista({ ...JUNIO, usuarioId: GESTOR_ID, entidad: 'usuario' });
    expect(r.body.registros.map((x) => x.accion)).toEqual(['CREAR_USUARIO', 'DESACTIVAR_USUARIO']);
  });

  test('"Todos" (valores vacíos) no filtra', async () => {
    expect((await lista({ ...JUNIO, usuarioId: '', entidad: '' })).body.total).toBe(6);
  });

  test.each([['9999'], ['abc'], ['0'], ['-1'], ["1 OR 1=1"], ['1.5']])('Usuario fuera de la lista (%s) -> 400', async (usuarioId) => {
    const r = await lista({ ...JUNIO, usuarioId });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('usuarioId');
  });

  test.each([['tabla_que_no_existe'], ['usuario OR 1=1'], ["'; DROP TABLE log_auditoria;--"], ['USUARIO'], ['<script>']])(
    'Entidad fuera de la lista (%s) -> 400 y la tabla sigue intacta', async (entidad) => {
      const antes = await instantanea();
      const r = await lista({ ...JUNIO, entidad });
      expect(r.status).toBe(400);
      expect(r.body.campos).toHaveProperty('entidad');
      expect(await instantanea()).toBe(antes);
    }
  );

  test('parámetro repetido (?entidad=a&entidad=b) -> 400, no error 500', async () => {
    const r = await como('gestor').get('/api/auditoria?entidad=usuario&entidad=indicador');
    expect(r.status).toBe(400);
  });
});

describe('Paginación', () => {
  test('páginas de 2 registros: la segunda trae los dos siguientes, en orden', async () => {
    const r = await lista({ ...JUNIO, tamano: 2, pagina: 2 });
    expect(r.body).toMatchObject({ total: 6, pagina: 2, tamano: 2 });
    expect(r.body.registros.map((x) => x.accion)).toEqual(['ACTUALIZAR_INDICADOR', 'CREAR_USUARIO']);
  });

  test('una página más allá del final viene vacía pero con el total', async () => {
    const r = await lista({ ...JUNIO, tamano: 2, pagina: 50 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 6, registros: [] });
  });

  test.each([[{ pagina: '0' }], [{ pagina: '-1' }], [{ pagina: 'x' }], [{ tamano: '0' }], [{ tamano: '101' }], [{ tamano: 'mil' }]])(
    'paginación inválida %j -> 400', async (q) => {
      expect((await lista({ ...JUNIO, ...q })).status).toBe(400);
    }
  );
});

describe('P16-3: el registro es de solo lectura', () => {
  test.each(['post', 'put', 'patch', 'delete'])('%s sobre /api/auditoria y /api/auditoria/:id -> 405 y la tabla no cambia', async (metodo) => {
    const antes = await instantanea();
    for (const ruta of ['/api/auditoria', '/api/auditoria/1']) {
      const r = await como('gestor')[metodo](ruta).send({ accion: 'BORRADO', detalle: { x: 1 } });
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('GET');
      expect(r.body).toEqual({ error: 'El registro de auditoría es de solo lectura' });
    }
    expect(await instantanea()).toBe(antes);
  });

  test('el usuario de base de datos de la aplicación no puede modificar ni borrar registros (aunque alguien lo intentara desde el código)', async () => {
    const c = new Client({ connectionString: config.databaseUrl });
    await c.connect();
    try {
      const antes = await instantanea();
      await expect(c.query("UPDATE log_auditoria SET accion = 'X'")).rejects.toMatchObject({ code: '42501' });
      await expect(c.query('DELETE FROM log_auditoria')).rejects.toMatchObject({ code: '42501' });
      await expect(c.query('TRUNCATE log_auditoria')).rejects.toMatchObject({ code: '42501' });
      await expect(c.query('DROP TABLE log_auditoria')).rejects.toBeTruthy();
      expect(await instantanea()).toBe(antes);
      // sí puede agregar (así se registran las acciones) y leer
      await c.query("INSERT INTO log_auditoria (accion, entidad, detalle) VALUES ('PRUEBA', 'usuario', '{}'::jsonb)");
      expect((await c.query('SELECT count(*)::int AS n FROM log_auditoria')).rows[0].n).toBe(7);
    } finally { await c.end(); }
  });
});

describe('P16-4: acceso a la pantalla', () => {
  test.each([['directora'], ['subdireccion'], ['jefe']])('%s -> 403 sin ningún dato', async (rol) => {
    const r = await como(rol).get('/api/auditoria').query(JUNIO);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'No tiene permiso para realizar esta acción' });
  });

  test('sin sesión -> 401', async () => {
    expect((await api.request(api.app).get('/api/auditoria')).status).toBe(401);
  });
});

describe('Lo que queda registrado al usar el sistema', () => {
  test('una acción real del Gestor aparece en la lista con su nombre', async () => {
    const c = await como('jefe').post('/api/indicadores/1/comentarios').send({ periodo: '2026-06', texto: 'Comentario de prueba de auditoría' });
    expect(c.status).toBe(201);
    const r = await lista({ entidad: 'comentario_indicador' });
    expect(r.body.total).toBe(1);
    expect(r.body.registros[0]).toMatchObject({ accion: 'COMENTAR_INDICADOR', usuario: { nombre: 'Jefe Matronas Demo' } });
    expect(JSON.stringify(r.body.registros[0].detalle)).not.toContain('Comentario de prueba');   // el texto no se guarda en la auditoría
  });
});
