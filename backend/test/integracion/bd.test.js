'use strict';
// Pruebas de la base de datos (plan de pruebas: T-10, además de la normalización y la integridad del modelo del informe).
// T-10: se ejecuta el bloque E de database/03_verificar_tablas.sql (el mismo que se muestra en pgAdmin)
// y se comprueba que la base rechaza los 8 casos inválidos, cada uno con su mensaje.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { config, reiniciarBD } = require('../ayudas/bd');
const lib = require('../../scripts/lib_bd');

const DIR = path.join(__dirname, '..', '..', '..', 'database');
const sql = (nombre) => fs.readFileSync(path.join(DIR, nombre), 'utf8');

let c;
const avisos = [];
beforeAll(async () => {
  await lib.asegurarBaseYRol(config.databaseAdminUrl, process.env.API_DB_PASSWORD);
  c = new Client({ connectionString: config.databaseAdminUrl });
  await c.connect();
  c.on('notice', (m) => avisos.push(m.message));
  await c.query(sql('01_crear_tablas.sql'));
  await c.query(sql('02_datos_prueba.sql'));
});
afterAll(async () => { await c.end(); await reiniciarBD(); });

const n = async (consulta, params) => Number((await c.query(consulta, params)).rows[0].n);
const rechaza = (consulta, params, codigo) => expect(c.query(consulta, params)).rejects.toMatchObject({ code: codigo });

describe('T-10: integridad de la base de datos (bloque E de 03_verificar_tablas.sql)', () => {
  const TABLAS = ['rol', 'programa', 'usuario', 'token_recuperacion', 'indicador', 'carga_rem', 'poblacion_denominador', 'resultado_indicador', 'comentario_indicador', 'log_auditoria'];
  let antes;

  test('los 10 bloques de tablas existen y 02_datos_prueba.sql deja datos de ejemplo', async () => {
    const r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    expect(r.rows.map((x) => x.table_name)).toEqual([...TABLAS].sort());
    expect(await n('SELECT count(*) AS n FROM usuario')).toBeGreaterThan(0);
    expect(await n('SELECT count(*) AS n FROM indicador')).toBeGreaterThan(0);
  });

  test('el bloque E rechaza los 8 casos inválidos, cada uno con su mensaje', async () => {
    antes = {};
    for (const t of TABLAS) { antes[t] = await n(`SELECT count(*) AS n FROM ${t}`); }
    const texto = sql('03_verificar_tablas.sql');
    const inicio = texto.indexOf('DO $$');
    expect(inicio).toBeGreaterThan(0);
    avisos.length = 0;
    await c.query(texto.slice(inicio));
    expect(avisos).toHaveLength(8);
    avisos.forEach((a) => { expect(a).toMatch(/^OK \(rechazado\): /); expect(a).not.toContain('FALLO'); });
    const pares = [
      ['población negativa', 'poblacion_denominador_valor_check'],
      ['población duplicada', 'poblacion_unica_por_periodo'],
      ['período 2026-13', 'carga_rem_periodo_check'],
      ['correo repetido', 'usuario_email_key'],
      ['Jefe sin programa', 'debe tener un programa'],
      ['indicador REM sin celda', 'indicador_origen_denominador'],
      ['comentario vacío', 'comentario_indicador_texto_check'],
      ['indicador inexistente', 'comentario_indicador_indicador_id_fkey']
    ];
    pares.forEach(([caso, mensaje], i) => {
      expect(avisos[i]).toContain(caso);
      expect(avisos[i]).toContain(mensaje);
    });
  });

  test('el bloque E no deja datos nuevos', async () => {
    for (const t of TABLAS) { expect(await n(`SELECT count(*) AS n FROM ${t}`)).toBe(antes[t]); }
  });

  test('se puede repetir el bloque E las veces que haga falta con el mismo resultado', async () => {
    avisos.length = 0;
    const texto = sql('03_verificar_tablas.sql');
    await c.query(texto.slice(texto.indexOf('DO $$')));
    expect(avisos).toHaveLength(8);
    expect(avisos.every((a) => a.startsWith('OK (rechazado)'))).toBe(true);
  });
});

describe('Restricciones del modelo (cada una con su código de error de PostgreSQL)', () => {
  const ids = {};
  beforeAll(async () => {
    ids.indicadorRem = (await c.query("SELECT id FROM indicador WHERE origen_denominador = 'REM' LIMIT 1")).rows[0].id;
    ids.indicadorPob = (await c.query("SELECT id FROM indicador WHERE origen_denominador = 'POBLACION' LIMIT 1")).rows[0].id;
    ids.usuario = (await c.query('SELECT id FROM usuario ORDER BY id LIMIT 1')).rows[0].id;
    ids.programa = (await c.query('SELECT id FROM programa ORDER BY id LIMIT 1')).rows[0].id;
  });

  test.each([
    ['población de 0', 0], ['población de 1.000.001', 1000001], ['población negativa', -1]
  ])('%s -> 23514 (check)', async (_t, valor) => {
    await rechaza('INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id) VALUES ($1, $2, $3, $4)', [ids.indicadorPob, '2031-01', valor, ids.usuario], '23514');
  });

  test.each([['2026-00'], ['2026-13'], ['26-05'], ['2026/05'], ['2026-5'], ['abcd-ef']])('período %s -> 23514', async (periodo) => {
    await rechaza('INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id) VALUES ($1, $2, 10, $3)', [ids.indicadorPob, periodo, ids.usuario], '23514');
  });

  test.each([[1], [1000000]])('población de %i es válida (límites)', async (valor) => {
    await c.query('BEGIN');
    try {
      await c.query('INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id) VALUES ($1, $2, $3, $4)', [ids.indicadorPob, '2031-02', valor, ids.usuario]);
    } finally { await c.query('ROLLBACK'); }
  });

  test('un indicador con origen REM exige celda de denominador y uno con población no la admite (23514)', async () => {
    await rechaza(`INSERT INTO indicador (nombre, programa_id, rem_codigo, celda_numerador, origen_denominador, celda_denominador, meta_nacional, peso_relativo)
                   VALUES ('X', $1, 'T-10A', 'B1', 'REM', NULL, 10, 1)`, [ids.programa], '23514');
    await rechaza(`INSERT INTO indicador (nombre, programa_id, rem_codigo, celda_numerador, origen_denominador, celda_denominador, meta_nacional, peso_relativo)
                   VALUES ('X', $1, 'T-10B', 'B1', 'POBLACION', 'C1', 10, 1)`, [ids.programa], '23514');
  });

  test('origen del denominador fuera de la lista (23514)', async () => {
    await rechaza(`INSERT INTO indicador (nombre, programa_id, rem_codigo, celda_numerador, origen_denominador, meta_nacional, peso_relativo)
                   VALUES ('X', $1, 'T-10C', 'B1', 'OTRO', 10, 1)`, [ids.programa], '23514');
  });

  test('un indicador de un programa que no existe (23503, clave foránea)', async () => {
    await rechaza(`INSERT INTO indicador (nombre, programa_id, rem_codigo, celda_numerador, origen_denominador, meta_nacional, peso_relativo)
                   VALUES ('X', 999999, 'T-10D', 'B1', 'POBLACION', 10, 1)`, [], '23503');
  });

  // Se prueba dentro de una transacción que se deshace: aunque la base aceptara el borrado, no quedaría rastro
  const rechazaBorrado = async (consulta, tabla) => {
    await c.query('BEGIN');
    try { await expect(c.query(consulta)).rejects.toMatchObject({ code: '23503' }); } finally { await c.query('ROLLBACK'); }
    expect(await n(`SELECT count(*) AS n FROM ${tabla}`)).toBeGreaterThan(0);
  };

  test.each([
    ['un indicador con población ingresada', 'DELETE FROM indicador WHERE id = (SELECT indicador_id FROM poblacion_denominador LIMIT 1)', 'indicador'],
    ['un indicador con comentarios', 'DELETE FROM indicador WHERE id = (SELECT indicador_id FROM comentario_indicador LIMIT 1)', 'indicador'],
    ['un usuario que ingresó población', 'DELETE FROM usuario WHERE id = (SELECT usuario_id FROM poblacion_denominador LIMIT 1)', 'usuario'],
    ['un usuario que hizo una carga', 'DELETE FROM usuario WHERE id = (SELECT usuario_id FROM carga_rem LIMIT 1)', 'usuario'],
    ['un programa con indicadores', 'DELETE FROM programa WHERE id = (SELECT programa_id FROM indicador LIMIT 1)', 'programa'],
    ['un programa con usuarios', 'DELETE FROM programa WHERE id = (SELECT programa_id FROM usuario WHERE programa_id IS NOT NULL LIMIT 1)', 'programa'],
    ['un rol que tiene usuarios', 'DELETE FROM rol WHERE id = (SELECT rol_id FROM usuario LIMIT 1)', 'rol']
  ])('no se puede borrar %s (23503, ON DELETE RESTRICT)', async (_t, consulta, tabla) => {
    await rechazaBorrado(consulta, tabla);
  });

  test('al borrar una carga se borran sus resultados (ON DELETE CASCADE), nunca queda un resultado sin carga', async () => {
    await c.query('BEGIN');
    try {
      const carga = (await c.query('SELECT carga_rem_id AS id FROM resultado_indicador LIMIT 1')).rows[0].id;
      const antes = await n('SELECT count(*) AS n FROM resultado_indicador WHERE carga_rem_id = $1', [carga]);
      expect(antes).toBeGreaterThan(0);
      await c.query('DELETE FROM carga_rem WHERE id = $1', [carga]);
      expect(await n('SELECT count(*) AS n FROM resultado_indicador WHERE carga_rem_id = $1', [carga])).toBe(0);
    } finally { await c.query('ROLLBACK'); }
  });

  test('al borrar un usuario sin otros datos, su historial de auditoría se conserva con usuario nulo (ON DELETE SET NULL)', async () => {
    await c.query('BEGIN');
    try {
      await c.query("INSERT INTO usuario (nombre, email, password_hash, rol_id) VALUES ('Temporal', 'temporal@demo.cl', 'x', (SELECT id FROM rol WHERE requiere_programa = false LIMIT 1))");
      const id = (await c.query("SELECT id FROM usuario WHERE email = 'temporal@demo.cl'")).rows[0].id;
      await c.query("INSERT INTO log_auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES ($1, 'PRUEBA', 'usuario', $1, '{}'::jsonb)", [id]);
      await c.query('DELETE FROM usuario WHERE id = $1', [id]);
      const f = (await c.query("SELECT usuario_id FROM log_auditoria WHERE accion = 'PRUEBA'")).rows;
      expect(f).toHaveLength(1);
      expect(f[0].usuario_id).toBeNull();
    } finally { await c.query('ROLLBACK'); }
  });

  test('correo repetido (23505). La aplicación además guarda los correos en minúsculas, así "A@x.cl" y "a@x.cl" son el mismo', async () => {
    const correo = (await c.query('SELECT email FROM usuario ORDER BY id LIMIT 1')).rows[0].email;
    await rechaza(`INSERT INTO usuario (nombre, email, password_hash, rol_id)
                   VALUES ('Repetido', $1, 'x', (SELECT id FROM rol WHERE requiere_programa = false LIMIT 1))`, [correo], '23505');
  });

  test('un solo resultado por indicador y carga (23505)', async () => {
    const fila = (await c.query('SELECT indicador_id, carga_rem_id FROM resultado_indicador LIMIT 1')).rows;
    expect(fila).toHaveLength(1);
    await rechaza('INSERT INTO resultado_indicador (indicador_id, carga_rem_id, valor_numerador, valor_denominador, valor_resultado) VALUES ($1, $2, 1, 1, 100)',
      [fila[0].indicador_id, fila[0].carga_rem_id], '23505');
  });

  test('un resultado con denominador 0 no puede traer porcentaje (23514) y no admite valores negativos', async () => {
    const fila = (await c.query('SELECT indicador_id, carga_rem_id FROM resultado_indicador LIMIT 1')).rows[0];
    await c.query('BEGIN');
    try {
      await c.query('DELETE FROM resultado_indicador WHERE indicador_id = $1 AND carga_rem_id = $2', [fila.indicador_id, fila.carga_rem_id]);
      await expect(c.query('INSERT INTO resultado_indicador (indicador_id, carga_rem_id, valor_numerador, valor_denominador, valor_resultado) VALUES ($1, $2, 5, 0, 50)', [fila.indicador_id, fila.carga_rem_id])).rejects.toMatchObject({ code: '23514' });
    } finally { await c.query('ROLLBACK'); }
    await c.query('BEGIN');
    try {
      await c.query('DELETE FROM resultado_indicador WHERE indicador_id = $1 AND carga_rem_id = $2', [fila.indicador_id, fila.carga_rem_id]);
      await expect(c.query('INSERT INTO resultado_indicador (indicador_id, carga_rem_id, valor_numerador, valor_denominador, valor_resultado) VALUES ($1, $2, -1, 10, NULL)', [fila.indicador_id, fila.carga_rem_id])).rejects.toMatchObject({ code: '23514' });
    } finally { await c.query('ROLLBACK'); }
  });

  test('un campo obligatorio no puede quedar vacío (23502)', async () => {
    await rechaza('INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto) VALUES ($1, $2, $3, NULL)', [ids.indicadorRem, ids.usuario, '2026-06'], '23502');
    await rechaza('INSERT INTO log_auditoria (usuario_id, accion, entidad) VALUES ($1, NULL, \'usuario\')', [ids.usuario], '23502');
  });

  test('el texto de un comentario no puede quedar vacío (23514) ni pasar de 500 caracteres (22001)', async () => {
    await rechaza('INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto) VALUES ($1, $2, $3, $4)', [ids.indicadorRem, ids.usuario, '2026-06', ''], '23514');
    await rechaza('INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto) VALUES ($1, $2, $3, $4)', [ids.indicadorRem, ids.usuario, '2026-06', '   '], '23514');
    await rechaza('INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto) VALUES ($1, $2, $3, $4)', [ids.indicadorRem, ids.usuario, '2026-06', 'x'.repeat(501)], '22001');   // varchar(500)
  });
});

describe('Los scripts se pueden ejecutar de nuevo sin dejar basura', () => {
  test('01_crear_tablas.sql vuelve a dejar las tablas vacías (y 02 las vuelve a llenar)', async () => {
    await c.query(sql('01_crear_tablas.sql'));
    for (const t of ['usuario', 'indicador', 'poblacion_denominador', 'comentario_indicador', 'log_auditoria']) {
      expect(await n(`SELECT count(*) AS n FROM ${t}`)).toBe(0);
    }
    await c.query(sql('02_datos_prueba.sql'));
    expect(await n('SELECT count(*) AS n FROM usuario')).toBeGreaterThan(0);
  });

  test('los scripts de la aplicación (01, 04, 05, 06) dejan los datos de demostración completos', async () => {
    await reiniciarBD();
    const r = await c.query(`SELECT (SELECT count(*) FROM rol)::int AS roles, (SELECT count(*) FROM programa)::int AS programas,
      (SELECT count(*) FROM usuario)::int AS usuarios, (SELECT count(*) FROM indicador)::int AS indicadores,
      (SELECT count(*) FROM resultado_indicador)::int AS resultados`);
    expect(r.rows[0]).toEqual({ roles: 4, programas: 4, usuarios: 6, indicadores: 5, resultados: 30 });
  });
});
