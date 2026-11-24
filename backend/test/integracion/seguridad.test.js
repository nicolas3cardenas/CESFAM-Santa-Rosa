'use strict';
// Pruebas de seguridad que cruzan todas las pantallas (plan de pruebas: T-1, T-2, y las reglas de la sección 6.4 del informe):
// inyección SQL y scripts en TODOS los campos de texto, cabeceras de seguridad, CORS, errores sin detalles técnicos,
// solicitudes mal formadas y datos que la API no debe aceptar (campos de más, caracteres nulos, etc.).
const express = require('express');
const { reiniciarBD, admin, cerrarPoolDeLaApp, config } = require('../ayudas/bd');
const api = require('../ayudas/api');
const db = require('../../src/db');
const { manejadorErrores } = require('../../src/middleware/errores');
const { como, request, app } = api;

beforeAll(async () => { await reiniciarBD(); await api.sesiones(); });
afterAll(async () => { await cerrarPoolDeLaApp(); });

const TABLAS = ['rol', 'programa', 'usuario', 'token_recuperacion', 'indicador', 'carga_rem', 'poblacion_denominador', 'resultado_indicador', 'comentario_indicador', 'log_auditoria'];
const conteos = async () => {
  const salida = {};
  for (const t of TABLAS) { salida[t] = Number((await admin(`SELECT count(*) AS n FROM ${t}`)).rows[0].n); }
  return salida;
};

// Los textos de ataque más comunes
const SQL = ["' OR 1=1 --", "'; DROP TABLE usuario; --", "\" OR \"\"=\"", "1; DELETE FROM indicador", "' UNION SELECT password_hash FROM usuario --", "\\'; TRUNCATE log_auditoria; --", '%', '_'];
const XSS = ['<script>alert(1)</script>', '<img src=x onerror=alert(2)>', '"><svg/onload=alert(3)>', 'javascript:alert(4)', '{{7*7}}', '${7*7}'];

describe('T-1: inyección SQL en cada cuadro de texto', () => {
  test.each(SQL.map((x) => [x]))('búsquedas y filtros con %j: 200 o 400, nunca 500, sin filas de más y sin tocar las tablas', async (texto) => {
    const antes = await conteos();
    const llamadas = [
      como('gestor').get('/api/usuarios').query({ q: texto }),
      como('gestor').get('/api/usuarios').query({ rolId: texto }),
      como('gestor').get('/api/indicadores').query({ q: texto }),
      como('gestor').get('/api/indicadores').query({ programaId: texto }),
      como('gestor').get('/api/auditoria').query({ entidad: texto }),
      como('gestor').get('/api/auditoria').query({ usuarioId: texto }),
      como('gestor').get('/api/poblacion').query({ periodo: texto }),
      como('directora').get('/api/reportes').query({ mes: texto }),
      como('directora').get('/api/reportes').query({ programaId: texto }),
      como('directora').get('/api/comparativo').query({ anioActual: texto, anioComparar: texto }),
      como('directora').get('/api/reportes').query({ desde: texto, hasta: texto }),
      como('directora').get('/api/reportes').query({ corte: texto }),
      como('directora').get('/api/dashboard').query({ periodo: texto }),
      como('directora').get('/api/exportar').query({ formato: texto, periodo: texto }),
      como('jefe').get('/api/indicadores/1/comentarios').query({ periodo: texto })
    ];
    for (const r of await Promise.all(llamadas)) {
      expect([200, 400]).toContain(r.status);
      expect(r.status).not.toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/syntax error|pg_catalog|relation "|violates|SELECT |password_hash/i);
    }
    expect(await conteos()).toEqual(antes);
  });

  test.each(SQL.map((x) => [x]))('campos de formularios con %j: lo que se acepta se guarda como texto, lo demás da 400; las tablas siguen', async (texto) => {
    const antes = await conteos();
    // comentario (solo el Jefe)
    const com = await como('jefe').post('/api/indicadores/1/comentarios').send({ periodo: '2026-06', texto });
    expect(com.status).toBe(201);
    expect(com.body.texto).toBe(texto);
    // nombre de un indicador nuevo
    const ind = await como('gestor').post('/api/indicadores').send({
      nombre: texto, programaId: 1, remCodigo: 'SQL-' + Math.random().toString(36).slice(2, 8), seccion: 'Sección A', celdaNumerador: 'B50',
      origenDenominador: 'POBLACION', metaNacional: 10, pesoRelativo: 1, referenteResponsable: texto
    });
    expect(ind.status).toBe(201);
    expect(ind.body.nombre).toBe(texto);
    // nombre de un usuario nuevo
    const usu = await como('gestor').post('/api/usuarios').send({ nombre: texto, correo: `sql${Date.now()}${Math.floor(Math.random() * 1e6)}@demo.cl`, rolId: 3, clave: 'Clave-Nueva-2026' });
    expect(usu.status).toBe(201);
    expect(usu.body.nombre).toBe(texto);
    // la celda de Excel y el correo tienen formato fijo: estos textos se rechazan
    const malos = await Promise.all([
      como('gestor').post('/api/indicadores').send({ nombre: 'X', programaId: 1, remCodigo: 'OK-1', celdaNumerador: texto, origenDenominador: 'POBLACION', metaNacional: 10, pesoRelativo: 1 }),
      como('gestor').post('/api/usuarios').send({ nombre: 'X', correo: texto, rolId: 3, clave: 'Clave-Nueva-2026' })
    ]);
    malos.forEach((r) => { expect(r.status).toBe(400); });
    // todo quedó guardado exactamente como se escribió
    const bd = await admin('SELECT nombre FROM indicador WHERE id = $1', [ind.body.id]);
    expect(bd.rows[0].nombre).toBe(texto);
    const despues = await conteos();
    expect(despues.comentario_indicador).toBe(antes.comentario_indicador + 1);
    expect(despues.indicador).toBe(antes.indicador + 1);
    expect(despues.usuario).toBe(antes.usuario + 1);
    ['rol', 'programa', 'carga_rem', 'resultado_indicador', 'poblacion_denominador'].forEach((t) => expect(despues[t]).toBe(antes[t]));
  });

  test('en la ruta de la dirección (/api/indicadores/:id) el texto no llega a la consulta', async () => {
    const antes = await conteos();
    for (const id of ["1%20OR%201=1", "1;DROP%20TABLE%20usuario", "99999999999999999999", "-1", "0", "1.5", "abc", "%00", "..%2F..%2Fetc%2Fpasswd"]) {
      for (const ruta of [`/api/indicadores/${id}`, `/api/indicadores/${id}/comentarios`, `/api/indicadores/${id}/detalle`, `/api/usuarios/${id}`, `/api/cargas/${id}`]) {
        const r = await como('gestor').get(ruta);
        expect([400, 403, 404]).toContain(r.status);
      }
    }
    expect(await conteos()).toEqual(antes);
  });
});

describe('T-2: scripts en campos de texto', () => {
  test.each(XSS.map((x) => [x]))('%j se guarda y se entrega como texto en JSON, con nosniff', async (texto) => {
    const c = await como('jefe').post('/api/indicadores/1/comentarios').send({ periodo: '2026-06', texto });
    expect(c.status).toBe(201);
    expect(c.body.texto).toBe(texto);
    const l = await como('directora').get('/api/indicadores/1/comentarios').query({ periodo: '2026-06' });
    expect(l.body.comentarios.map((x) => x.texto)).toContain(texto);
    expect(l.headers['content-type']).toMatch(/^application\/json/);
    expect(l.headers['x-content-type-options']).toBe('nosniff');
    // el nombre de una persona o de un indicador también viaja como texto
    const u = await como('gestor').post('/api/usuarios').send({ nombre: texto, correo: `xss${Date.now()}${Math.floor(Math.random() * 1e6)}@demo.cl`, rolId: 3, clave: 'Clave-Nueva-2026' });
    expect(u.status).toBe(201);
    const lu = await como('gestor').get('/api/usuarios').query({ q: texto.slice(0, 8) });
    expect(lu.headers['content-type']).toMatch(/^application\/json/);
  });

  test('un error nunca devuelve HTML con el texto escrito (no hay reflejo del dato)', async () => {
    const r = await como('gestor').get('/api/usuarios').query({ q: '<script>alert(1)</script>'.repeat(10) });
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(JSON.stringify(r.body)).not.toContain('<script>');
    const ruta = '/api/' + encodeURIComponent('<script>alert(1)</script>');
    expect((await request(app).get(ruta)).status).toBe(401);   // sin sesión ni siquiera se revela si la ruta existe
    const r404 = await como('gestor').get(ruta);
    expect(r404.status).toBe(404);
    expect(r404.headers['content-type']).toMatch(/^application\/json/);
    expect(r404.text).not.toContain('<script>');
  });

  test('la exportación a CSV no deja que una fórmula se ejecute en Excel (=, +, -, @ al comienzo se neutralizan)', async () => {
    const nombre = '=HYPERLINK("http://malo.example","Pulse aquí")';
    const crear = await como('gestor').post('/api/indicadores').send({
      nombre, programaId: 1, remCodigo: 'FORM-1', seccion: 'Sección A', celdaNumerador: 'B60', origenDenominador: 'POBLACION', metaNacional: 10, pesoRelativo: 1
    });
    expect(crear.status).toBe(201);
    const r = await como('directora').get('/api/exportar').query({ formato: 'CSV', periodo: '2026-06' });
    expect(r.status).toBe(200);
    const fila = r.text.split('\r\n').find((l) => l.startsWith('FORM-1'));
    expect(fila).toBeDefined();
    const celdas = fila.split(';');
    expect(celdas[1].replace(/^"/, '')).toMatch(/^'=/);   // quedó como texto: comienza con apóstrofo
  });
});

describe('Cabeceras de seguridad y caché', () => {
  test('helmet: nosniff, sin X-Powered-By y con política de contenido', async () => {
    const r = await request(app).get('/api/salud');
    expect(r.status).toBe(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['content-security-policy']).toBeDefined();
    expect(r.headers['strict-transport-security']).toBeDefined();
  });

  test('las respuestas de la API (datos de salud y de sesión) no se guardan en caché, tampoco los errores', async () => {
    const casos = [
      await como('directora').get('/api/dashboard'),
      await request(app).get('/api/dashboard'),                        // 401
      await como('jefe').get('/api/usuarios'),                         // 403
      await como('gestor').get('/api/indicadores/999999'),             // 404
      await como('gestor').get('/api/usuarios').query({ q: 'a'.repeat(200) }),   // 400
      await request(app).post('/api/auth/login').send({ correo: 'a@b.cl', clave: 'x' })
    ];
    casos.forEach((r) => { expect(r.headers['cache-control']).toBe('no-store'); });
    expect(casos.map((r) => r.status)).toEqual([200, 401, 403, 404, 400, 400]);
  });
});

describe('CORS: solo el frontend autorizado puede llamar desde un navegador', () => {
  const PERMITIDO = config.corsOrigenes[0];

  test('el origen del frontend recibe permiso y puede leer la cabecera de renovación del token', async () => {
    const r = await request(app).get('/api/salud').set('Origin', PERMITIDO);
    expect(r.headers['access-control-allow-origin']).toBe(PERMITIDO);
    expect(r.headers['access-control-expose-headers']).toContain('X-Token-Renovado');
  });

  test.each([['https://sitio-malicioso.example'], ['http://localhost:9999'], ['null'], ['http://localhost:5173.malo.example']])(
    'el origen %s NO recibe permiso', async (origen) => {
      const r = await request(app).get('/api/salud').set('Origin', origen);
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
      const pre = await request(app).options('/api/usuarios').set('Origin', origen).set('Access-Control-Request-Method', 'GET');
      expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    }
  );

  test('la verificación previa (preflight) del frontend autoriza solo los métodos y cabeceras que se usan', async () => {
    const r = await request(app).options('/api/usuarios/1/estado').set('Origin', PERMITIDO)
      .set('Access-Control-Request-Method', 'PATCH').set('Access-Control-Request-Headers', 'authorization,content-type');
    expect([200, 204]).toContain(r.status);
    expect(r.headers['access-control-allow-origin']).toBe(PERMITIDO);
    expect(r.headers['access-control-allow-methods']).toContain('PATCH');
    expect(r.headers['access-control-allow-methods']).not.toContain('TRACE');
    expect(r.headers['access-control-allow-headers'].toLowerCase()).toContain('authorization');
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();   // el token va en la cabecera Authorization, no en cookies
  });
});

describe('Solicitudes mal formadas', () => {
  test('JSON roto -> 400 con mensaje genérico', async () => {
    for (const cuerpo of ['{"correo": ', '{correo:1}', '[[[[', 'null', '"texto"', '{"a":1}}']) {
      const r = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(cuerpo);
      expect(r.status).toBe(400);
      expect(r.body.error).toBeDefined();
      expect(JSON.stringify(r.body)).not.toMatch(/Unexpected|SyntaxError|JSON\.parse|at /);
    }
  });

  test('cuerpo de más de 100 KB -> 413', async () => {
    const r = await como('gestor').post('/api/usuarios').send({ nombre: 'x'.repeat(150 * 1024) });
    expect(r.status).toBe(413);
  });

  test('un formulario clásico (no JSON) a una ruta JSON -> 400, no 500', async () => {
    const r = await request(app).post('/api/auth/login').set('Content-Type', 'application/x-www-form-urlencoded').send('correo=a@b.cl&clave=12345678');
    expect(r.status).toBe(400);
  });

  test('"__proto__" y "constructor" en el cuerpo no cambian el comportamiento del servidor', async () => {
    const r = await request(app).post('/api/auth/login').set('Content-Type', 'application/json')
      .send('{"correo":"directora@demo.cl","clave":"mala-clave-1","__proto__":{"admin":true,"rol":"Gestor"},"constructor":{"prototype":{"admin":true}}}');
    expect(r.status).toBe(401);
    expect({}.admin).toBeUndefined();
    const u = await como('gestor').post('/api/usuarios').set('Content-Type', 'application/json')
      .send('{"nombre":"Proto","correo":"proto@demo.cl","rolId":3,"clave":"Clave-Nueva-2026","__proto__":{"rolId":1}}');
    expect(u.status).toBe(201);
    expect(u.body.rol).toBe('Gestor de Información');
    expect({}.rolId).toBeUndefined();
  });

  test('campos de más en el cuerpo se ignoran: no se puede fijar el id, la contraseña guardada, el bloqueo ni el estado', async () => {
    const r = await como('gestor').post('/api/usuarios').send({
      nombre: 'Persona Extra', correo: 'extra@demo.cl', rolId: 3, clave: 'Clave-Nueva-2026',
      id: 1, activo: false, password_hash: '$2b$04$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', intentos_fallidos: 99, bloqueado_hasta: '2099-01-01'
    });
    expect(r.status).toBe(201);
    expect(r.body.id).not.toBe(1);
    expect(r.body.activo).toBe(true);
    const bd = (await admin("SELECT activo, intentos_fallidos, bloqueado_hasta, password_hash FROM usuario WHERE email = 'extra@demo.cl'")).rows[0];
    expect(bd).toMatchObject({ activo: true, intentos_fallidos: 0, bloqueado_hasta: null });
    expect(bd.password_hash).not.toContain('aaaaaaaa');
    const entra = await api.login('extra@demo.cl', 'Clave-Nueva-2026');
    expect(entra.status).toBe(200);
  });

  test('el carácter nulo (\\u0000) se rechaza con 400 en vez de romper la base', async () => {
    const r1 = await como('jefe').post('/api/indicadores/1/comentarios').send({ periodo: '2026-06', texto: 'hola\u0000mundo' });
    expect(r1.status).toBe(400);
    const r2 = await como('gestor').get('/api/usuarios').query({ q: 'a\u0000b' });
    expect(r2.status).toBe(400);
    const r3 = await api.login('a\u0000@demo.cl', 'ClaveDemo2026');
    expect([400, 401]).toContain(r3.status);
  });

  test('tipos equivocados (números, listas, objetos donde va texto) -> 400, nunca 500', async () => {
    const raros = [123, true, [], ['a'], { a: 1 }, null, 1e999, -0];
    for (const x of raros) {
      for (const r of [
        await como('jefe').post('/api/indicadores/1/comentarios').send({ periodo: x, texto: x }),
        await como('gestor').post('/api/usuarios').send({ nombre: x, correo: x, rolId: x, clave: x }),
        await como('gestor').post('/api/indicadores').send({ nombre: x, programaId: x, remCodigo: x, celdaNumerador: x, origenDenominador: x, metaNacional: x, pesoRelativo: x }),
        await como('subdireccion').post('/api/poblacion').send({ indicadorId: x, periodo: x, valor: x }),
        await api.login(x, x)
      ]) {
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
      }
    }
  });
});

describe('Errores inesperados: la persona ve un mensaje genérico, sin detalles técnicos', () => {
  const montar = (error) => {
    const a = express();
    a.get('/x', (req, res, next) => next(error));
    a.use(manejadorErrores);
    return a;
  };

  test.each([
    ['consulta SQL con datos', Object.assign(new Error('relation "usuario" does not exist: SELECT password_hash FROM usuario WHERE email = \'a@b.cl\''), { code: '42P01' })],
    ['falla de conexión', Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' })],
    ['error cualquiera con pila de llamadas', new TypeError("Cannot read properties of undefined (reading 'id')")]
  ])('%s -> 500 genérico', async (_t, error) => {
    const r = await request(montar(error)).get('/x');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Ocurrió un error inesperado. Intente nuevamente más tarde.' });
    expect(r.text).not.toMatch(/SELECT|password|ECONNREFUSED|10\.0\.0\.5|TypeError|undefined|\.js:/);
  });

  test('una restricción de la base que se escapó de la validación se informa sin detalles (400 / 409)', async () => {
    const dup = await request(montar(Object.assign(new Error('duplicate key value violates unique constraint "usuario_email_key"'), { code: '23505' }))).get('/x');
    expect(dup.status).toBe(409);
    expect(dup.text).not.toContain('usuario_email_key');
    const chk = await request(montar(Object.assign(new Error('new row violates check constraint "ck_x"'), { code: '23514' }))).get('/x');
    expect(chk.status).toBe(400);
    expect(chk.text).not.toContain('ck_x');
  });

  test('si la base de datos se cae en medio de una consulta real, la API responde 500 genérico (y se recupera después)', async () => {
    const original = db.consultar;
    db.consultar = async () => { throw Object.assign(new Error('connection terminated unexpectedly: host=10.0.0.5 user=cesfam_api'), { code: '57P01' }); };
    let r;
    try { r = await como('gestor').get('/api/catalogos'); } finally { db.consultar = original; }
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Ocurrió un error inesperado. Intente nuevamente más tarde.' });
    expect(r.text).not.toMatch(/10\.0\.0\.5|cesfam_api|connection terminated/);
    expect((await como('gestor').get('/api/catalogos')).status).toBe(200);
  });

  test('una ruta que no existe responde 404 en JSON y un método no permitido no filtra información', async () => {
    const r = await como('gestor').get('/api/no-existe');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Ruta no encontrada' });
    const t = await como('gestor').delete('/api/salud');
    expect([404, 405]).toContain(t.status);
    expect(t.text).not.toMatch(/Cannot DELETE|express|node/i);
  });
});

describe('Privilegios de la base de datos (el usuario de la aplicación solo puede lo necesario)', () => {
  const { Client } = require('pg');
  const comoApp = async (sql) => {
    const c = new Client({ connectionString: config.databaseUrl });
    await c.connect();
    try { return await c.query(sql); } finally { await c.end(); }
  };

  test.each([
    ['borrar usuarios', 'DELETE FROM usuario'],
    ['borrar indicadores', 'DELETE FROM indicador'],
    ['borrar resultados', 'DELETE FROM resultado_indicador'],
    ['borrar cargas', 'DELETE FROM carga_rem'],
    ['modificar la población ya ingresada', 'UPDATE poblacion_denominador SET valor = 1'],
    ['modificar comentarios', "UPDATE comentario_indicador SET texto = 'x'"],
    ['modificar la auditoría', "UPDATE log_auditoria SET accion = 'x'"],
    ['borrar la auditoría', 'DELETE FROM log_auditoria'],
    ['vaciar tablas', 'TRUNCATE usuario CASCADE'],
    ['borrar una tabla', 'DROP TABLE usuario CASCADE'],
    ['crear usuarios de base de datos', "CREATE ROLE intruso LOGIN PASSWORD 'x'"],
    ['crear tablas', 'CREATE TABLE intruso (id int)']
  ])('no puede %s', async (_t, sql) => {
    await expect(comoApp(sql)).rejects.toMatchObject({ code: '42501' });
  });

  test('lo que sí puede: leer, agregar y modificar lo que la aplicación gestiona', async () => {
    expect((await comoApp('SELECT count(*)::int AS n FROM usuario')).rows[0].n).toBeGreaterThan(0);
    await comoApp("UPDATE usuario SET nombre = nombre WHERE id = 1");
    await comoApp("UPDATE indicador SET nombre = nombre WHERE id = 1");
  });
});
