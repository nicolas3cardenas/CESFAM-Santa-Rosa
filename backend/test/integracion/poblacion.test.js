'use strict';
// Pruebas de integración del ingreso de población (pantalla 11): P11-1 a P11-6.
// Indicadores de la demostración con denominador "Población": IND-02 (id 2), IND-03 (id 3) e IND-05 (id 5).
const { reiniciarBD, admin, cerrarPoolDeLaApp } = require('../ayudas/bd');
const api = require('../ayudas/api');
const { como } = api;

beforeAll(async () => { await reiniciarBD(); await api.sesiones(); });
afterAll(async () => { await cerrarPoolDeLaApp(); });

const MENSAJE_VALOR = 'Ingrese un entero entre 1 y 1.000.000';
const contar = async (sql, params) => Number((await admin(sql, params)).rows[0].n);
const filasPoblacion = () => contar('SELECT count(*) AS n FROM poblacion_denominador');
const auditoriasPoblacion = () => contar("SELECT count(*) AS n FROM log_auditoria WHERE accion = 'INGRESO_POBLACION'");

// Cada prueba que guarda algo usa un período propio (2030-01, 2030-02... 2031-01...) para no chocar con la restricción de unicidad
let contadorPeriodo = 0;
function periodoNuevo() {
  const n = contadorPeriodo; contadorPeriodo += 1;
  return `${2030 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}
const guardar = (rol, cuerpo) => como(rol).post('/api/poblacion').send(cuerpo);

describe('P11-1: lista de indicadores con población', () => {
  test('solo aparecen los indicadores activos con denominador "Población", con su valor o "pendiente"', async () => {
    const r = await como('gestor').get('/api/poblacion').query({ periodo: '2026-06' });
    expect(r.status).toBe(200);
    expect(r.body.periodo).toBe('2026-06');
    expect(r.body.indicadores.map((i) => i.codigo).sort()).toEqual(['IND-02', 'IND-03', 'IND-05']);
    const por = Object.fromEntries(r.body.indicadores.map((i) => [i.codigo, i]));
    expect(por['IND-02']).toMatchObject({ valor: 420, pendiente: false });
    expect(por['IND-05']).toMatchObject({ valor: null, pendiente: true });
  });

  test('un período sin ninguna población ingresada deja los tres pendientes', async () => {
    const r = await como('subdireccion').get('/api/poblacion').query({ periodo: '2026-01' });
    expect(r.body.indicadores.every((i) => i.pendiente)).toBe(true);
  });

  test.each([[undefined], [''], ['2026-13'], ['2026-6'], ["2026-06' OR '1'='1"]])('período %j en la consulta -> 400', async (periodo) => {
    const r = await como('gestor').get('/api/poblacion').query(periodo === undefined ? {} : { periodo });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('periodo');
  });

  test('un indicador desactivado ya no aparece en la lista', async () => {
    await admin('UPDATE indicador SET activo = false WHERE id = 3');
    try {
      const r = await como('gestor').get('/api/poblacion').query({ periodo: '2026-06' });
      expect(r.body.indicadores.map((i) => i.codigo).sort()).toEqual(['IND-02', 'IND-05']);
    } finally { await admin('UPDATE indicador SET activo = true WHERE id = 3'); }
  });
});

describe('P11-1: indicador no válido enviado a mano (modificando la solicitud)', () => {
  const casos = [
    ['con denominador del REM (IND-01)', 1], ['con denominador del REM (IND-04)', 4], ['que no existe', 9999],
    ['texto', 'abc'], ['nulo', null], ['cero', 0], ['negativo', -1], ['decimal', 1.5], ['con SQL', '2 OR 1=1'], ['arreglo', [2]], ['objeto', { id: 2 }]
  ];
  test.each(casos)('indicador %s -> 400 y no se guarda nada', async (_n, indicadorId) => {
    const antes = await filasPoblacion();
    const r = await guardar('gestor', { indicadorId, periodo: periodoNuevo(), valor: 100 });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('indicadorId');
    expect(await filasPoblacion()).toBe(antes);
  });

  test('un indicador desactivado -> 400', async () => {
    await admin('UPDATE indicador SET activo = false WHERE id = 2');
    try {
      const antes = await filasPoblacion();
      const r = await guardar('gestor', { indicadorId: 2, periodo: periodoNuevo(), valor: 100 });
      expect(r.status).toBe(400);
      expect(r.body.campos).toHaveProperty('indicadorId');
      expect(await filasPoblacion()).toBe(antes);
    } finally { await admin('UPDATE indicador SET activo = true WHERE id = 2'); }
  });

  test('falta el indicador -> 400', async () => {
    const r = await guardar('gestor', { periodo: periodoNuevo(), valor: 100 });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('indicadorId');
  });
});

describe('P11-2: período y población repetida', () => {
  test.each([['mes 13', '2026-13'], ['mes 00', '2026-00'], ['sin cero', '2026-6'], ['vacío', ''], ['nulo', null], ['número', 202606], ['SQL', "2026-06'; DELETE FROM poblacion_denominador;--"]])(
    'período inválido (%s) -> 400', async (_n, periodo) => {
      const antes = await filasPoblacion();
      const r = await guardar('gestor', { indicadorId: 2, periodo, valor: 100 });
      expect(r.status).toBe(400);
      expect(r.body.campos).toHaveProperty('periodo');
      expect(await filasPoblacion()).toBe(antes);
    });

  test('si ya hay población para ese indicador y período: 409 "Ya existe población para ese período" y NO se sobrescribe', async () => {
    const antes = await filasPoblacion();
    const r = await guardar('gestor', { indicadorId: 2, periodo: '2026-06', valor: 999 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Ya existe población para ese período');
    expect((await admin("SELECT valor FROM poblacion_denominador WHERE indicador_id = 2 AND periodo = '2026-06'")).rows[0].valor).toBe(420);
    expect(await filasPoblacion()).toBe(antes);
  });

  test('el mismo período para otro indicador sí se puede guardar', async () => {
    const periodo = periodoNuevo();
    expect((await guardar('gestor', { indicadorId: 2, periodo, valor: 400 })).status).toBe(201);
    expect((await guardar('gestor', { indicadorId: 3, periodo, valor: 1400 })).status).toBe(201);
  });
});

describe('P11-3: campo Población (entero de 1 a 1.000.000)', () => {
  test.each([[1], [420], [999999], [1000000], ['1500'], ['007']])('valor válido %j -> 201 y queda guardado como entero', async (valor) => {
    const periodo = periodoNuevo();
    const r = await guardar('gestor', { indicadorId: 2, periodo, valor });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ indicadorId: 2, periodo, valor: Number(valor) });
    expect((await admin('SELECT valor FROM poblacion_denominador WHERE indicador_id = 2 AND periodo = $1', [periodo])).rows[0].valor).toBe(Number(valor));
  });

  describe('valores inválidos', () => {
    let antesInvalidos;
    let auditoriaAntes;
    beforeAll(async () => { antesInvalidos = await filasPoblacion(); auditoriaAntes = await auditoriasPoblacion(); });

    const invalidos = [
      ['letras', 'abc'], ['punto decimal (texto)', '1.5'], ['punto decimal (número)', 1.5], ['coma decimal', '1,5'],
      ['negativo (número)', -5], ['negativo (texto)', '-5'], ['cero (número)', 0], ['cero (texto)', '0'],
      ['vacío', ''], ['nulo', null], ['notación científica', '1e3'], ['hexadecimal', '0x10'],
      ['espacio al inicio', ' 5'], ['espacio al final', '5 '], ['espacio interno', '1 000'],
      ['dígitos de ancho completo', '５００'], ['dígitos árabes', '٣٠٠'],
      ['uno más que el máximo (número)', 1000001], ['uno más que el máximo (texto)', '1000001'],
      ['muy largo', '9'.repeat(30)], ['entero no seguro', 9007199254740993], ['verdadero', true], ['arreglo', [100]], ['objeto', { valor: 100 }]
    ];
    test.each(invalidos)('valor inválido (%s) -> 400 con el mensaje del plan', async (_n, valor) => {
      const r = await guardar('gestor', { indicadorId: 2, periodo: periodoNuevo(), valor });
      expect(r.status).toBe(400);
      expect(r.body.campos.valor).toBe(MENSAJE_VALOR);
    });

    test('falta el valor -> 400', async () => {
      const r = await guardar('gestor', { indicadorId: 2, periodo: periodoNuevo() });
      expect(r.status).toBe(400);
      expect(r.body.campos.valor).toBe(MENSAJE_VALOR);
    });

    test('P11-5: nada de lo rechazado dejó filas ni auditoría', async () => {
      expect(await filasPoblacion()).toBe(antesInvalidos);
      expect(await auditoriasPoblacion()).toBe(auditoriaAntes);
    });
  });

  test('la base de datos también rechaza el valor 0, el negativo y el que pasa de 1.000.000 (segunda barrera)', async () => {
    for (const valor of [0, -1, 1000001]) {
      await expect(admin("INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id) VALUES (2, '2099-01', $1, 2)", [valor])).rejects.toThrow();
    }
  });
});

describe('P11-4: doble clic (dos solicitudes iguales a la vez)', () => {
  test('se guarda un solo registro y una sola entrada de auditoría; la otra respuesta es 409', async () => {
    const periodo = periodoNuevo();
    const filas = await filasPoblacion();
    const auditorias = await auditoriasPoblacion();
    const [a, b] = await Promise.all([
      guardar('gestor', { indicadorId: 5, periodo, valor: 900 }),
      guardar('gestor', { indicadorId: 5, periodo, valor: 900 })
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await filasPoblacion()).toBe(filas + 1);
    expect(await auditoriasPoblacion()).toBe(auditorias + 1);
  });

  test('cinco solicitudes simultáneas con valores distintos: gana una sola y el valor guardado es el de la respuesta 201', async () => {
    const periodo = periodoNuevo();
    const rs = await Promise.all([100, 200, 300, 400, 500].map((valor) => guardar('subdireccion', { indicadorId: 3, periodo, valor })));
    const ok = rs.filter((r) => r.status === 201);
    expect(ok).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(4);
    expect((await admin('SELECT valor FROM poblacion_denominador WHERE indicador_id = 3 AND periodo = $1', [periodo])).rows[0].valor).toBe(ok[0].body.valor);
  });
});

describe('P11-5: registro de auditoría', () => {
  test('cada guardado deja usuario, fecha y valor ingresado', async () => {
    const periodo = periodoNuevo();
    const r = await guardar('subdireccion', { indicadorId: 3, periodo, valor: 1234 });
    expect(r.status).toBe(201);
    const f = (await admin(
      `SELECT l.detalle, l.fecha_hora, u.email FROM log_auditoria l JOIN usuario u ON u.id = l.usuario_id
        WHERE l.accion = 'INGRESO_POBLACION' AND l.entidad_id = $1`, [r.body.id])).rows;
    expect(f).toHaveLength(1);
    expect(f[0].email).toBe('subdireccion@demo.cl');
    expect(f[0].detalle).toEqual({ antes: null, despues: { indicador: 'IND-03', periodo, valor: 1234 } });
    expect(Date.now() - new Date(f[0].fecha_hora).getTime()).toBeLessThan(60 * 1000);
  });

  test('si el guardado es rechazado (duplicado) no se escribe auditoría', async () => {
    const antes = await auditoriasPoblacion();
    const r = await guardar('gestor', { indicadorId: 2, periodo: '2026-06', valor: 5 });
    expect(r.status).toBe(409);
    expect(await auditoriasPoblacion()).toBe(antes);
  });

  test('si el guardado es rechazado por permisos (403) tampoco', async () => {
    const antes = await auditoriasPoblacion();
    const r = await guardar('directora', { indicadorId: 2, periodo: periodoNuevo(), valor: 5 });
    expect(r.status).toBe(403);
    expect(await auditoriasPoblacion()).toBe(antes);
  });
});

describe('Cálculo al ingresar la población', () => {
  test('IND-05 de 2026-06 estaba "sin población": al ingresarla se calcula 558 / 900 = 62 % y pasa a "no cumple"', async () => {
    const antes = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    expect(antes.body.indicadores.find((i) => i.codigo === 'IND-05')).toMatchObject({ resultado: null, estado: 'sin_poblacion' });
    const r = await guardar('gestor', { indicadorId: 5, periodo: '2026-06', valor: 900 });
    expect(r.status).toBe(201);
    expect(r.body.resultadosActualizados).toBe(1);
    const despues = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    expect(despues.body.indicadores.find((i) => i.codigo === 'IND-05')).toMatchObject({ numerador: 558, denominador: 900, resultado: 62, estado: 'nocumple' });
    expect(despues.body.faltaPoblacion).toBe(0);
  });

  test('un período sin REM cargado se guarda igual (no hay resultado que actualizar)', async () => {
    const r = await guardar('gestor', { indicadorId: 2, periodo: periodoNuevo(), valor: 410 });
    expect(r.status).toBe(201);
    expect(r.body.resultadosActualizados).toBe(0);
  });

  test('una población ingresada NO modifica los resultados que ya estaban calculados', async () => {
    // 2026-05 (IND-02 ya tiene resultado con su población): se compara antes y después de ingresar otra población
    const antes = await como('directora').get('/api/dashboard').query({ periodo: '2026-05' });
    await guardar('gestor', { indicadorId: 5, periodo: '2026-05', valor: 880 }).then((r) => expect([201, 409]).toContain(r.status));
    const despues = await como('directora').get('/api/dashboard').query({ periodo: '2026-05' });
    const ind = (d, c) => d.body.indicadores.find((i) => i.codigo === c);
    expect(ind(despues, 'IND-02').resultado).toBe(ind(antes, 'IND-02').resultado);
    expect(ind(despues, 'IND-03').resultado).toBe(ind(antes, 'IND-03').resultado);
  });
});

describe('P11-6: acceso', () => {
  test.each([['directora'], ['jefe']])('%s no puede ver ni guardar población (403)', async (rol) => {
    const antes = await filasPoblacion();
    expect((await como(rol).get('/api/poblacion').query({ periodo: '2026-06' })).status).toBe(403);
    expect((await guardar(rol, { indicadorId: 2, periodo: periodoNuevo(), valor: 100 })).status).toBe(403);
    expect(await filasPoblacion()).toBe(antes);
  });

  test.each([['gestor'], ['subdireccion']])('%s sí puede', async (rol) => {
    expect((await como(rol).get('/api/poblacion').query({ periodo: '2026-06' })).status).toBe(200);
  });

  test('sin sesión -> 401', async () => {
    const r = await api.request(api.app).post('/api/poblacion').send({ indicadorId: 2, periodo: '2098-12', valor: 100 });
    expect(r.status).toBe(401);
  });
});
