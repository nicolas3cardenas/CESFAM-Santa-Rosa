'use strict';
// Pruebas de integración de las consultas: dashboard, reportes, comparativo, detalle, comentarios, exportación
// (plan de pruebas: P4, P5, P6, P7, P8, T-2, T-6). Usan los datos de demostración de database/06_datos_demo.sql.
const ExcelJS = require('exceljs');
const { reiniciarBD, admin, cerrarPoolDeLaApp } = require('../ayudas/bd');
const api = require('../ayudas/api');
const { como, leerBinario } = api;

beforeAll(async () => { await reiniciarBD(); await api.sesiones(); });
afterAll(async () => { await cerrarPoolDeLaApp(); });

const porCodigo = (lista) => Object.fromEntries(lista.map((i) => [i.codigo, i]));

describe('Catálogos', () => {
  test('P4-1: lista los períodos con datos (más nuevo primero), años, roles, cortes y formatos', async () => {
    const r = await como('directora').get('/api/catalogos');
    expect(r.status).toBe(200);
    expect(r.body.periodos).toEqual(['2026-06', '2026-05', '2026-04', '2026-03', '2025-12', '2024-12']);
    expect(r.body.anios).toEqual(['2026', '2025', '2024']);
    expect(r.body.roles.map((x) => x.nombre)).toEqual(['Directora', 'Subdirección', 'Gestor de Información', 'Jefe de Programa']);
    expect(r.body.programas.map((x) => x.nombre)).toEqual(['Dietistas', 'Kinesiología', 'Matronas', 'Salud Mental']);
    expect(r.body.cortes).toContain('Corte 1');
    expect(r.body.formatos).toEqual(['CSV', 'XLSX']);
  });

  test('P4-2: el Jefe de Programa solo recibe su propio programa', async () => {
    const r = await como('jefe').get('/api/catalogos');
    expect(r.body.programas.map((x) => x.nombre)).toEqual(['Matronas']);
  });

  test('P4-1: una carga con errores no agrega su período a la lista (2026-04 ya estaba por la carga corregida)', async () => {
    const r = await como('gestor').get('/api/catalogos');
    expect(r.body.periodos.filter((p) => p === '2026-04')).toHaveLength(1);
  });
});

describe('Dashboard (P4)', () => {
  test('P4-3: junio 2026: cuenta de estados, resultado por indicador y aviso de población faltante', async () => {
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    expect(r.status).toBe(200);
    expect(r.body.sinDatos).toBe(false);
    expect(r.body.resumen).toEqual({ cumple: 2, riesgo: 1, nocumple: 1, sinPoblacion: 1, sinDatos: 0 });
    expect(r.body.faltaPoblacion).toBe(1);
    const i = porCodigo(r.body.indicadores);
    expect(i['IND-01']).toMatchObject({ resultado: 82, meta: 80, estado: 'cumple', numerador: 1722, denominador: 2100, programa: 'Matronas' });
    expect(i['IND-02']).toMatchObject({ resultado: 78.1, estado: 'riesgo' });
    expect(i['IND-03']).toMatchObject({ resultado: 72, estado: 'cumple' });
    expect(i['IND-04']).toMatchObject({ resultado: 41, estado: 'nocumple' });
    expect(i['IND-05']).toMatchObject({ resultado: null, estado: 'sin_poblacion', numerador: 558 });
  });

  test('P4-1: sin período usa el más reciente con datos', async () => {
    const r = await como('subdireccion').get('/api/dashboard');
    expect(r.body.periodo).toBe('2026-06');
  });

  test('P4-1: un período válido pero sin datos responde "Sin datos para el período"', async () => {
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-01' });
    expect(r.status).toBe(200);
    expect(r.body.sinDatos).toBe(true);
    expect(r.body.mensaje).toBe('Sin datos para el período');
    expect(r.body.indicadores).toEqual([]);
  });

  test('P4-1: un período con formato inválido (o con tipo raro) es 400', async () => {
    for (const p of ['2026-13', '2026-6', 'junio', '2026-06-01', "' OR 1=1 --"]) {
      const r = await como('directora').get('/api/dashboard').query({ periodo: p });
      expect(r.status).toBe(400);
    }
    const arreglo = await como('directora').get('/api/dashboard?periodo=2026-06&periodo=2026-05');
    expect(arreglo.status).toBe(400);
    const objeto = await como('directora').get('/api/dashboard?periodo[a]=1');
    expect(objeto.status).toBe(400);
  });

  test('P4-2: filtro por programa; programa inexistente o con formato raro: 400', async () => {
    const mat = (await admin("SELECT id FROM programa WHERE nombre = 'Matronas'")).rows[0].id;
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-06', programaId: mat });
    expect(r.body.indicadores.map((x) => x.codigo)).toEqual(['IND-01', 'IND-02']);
    for (const malo of ['9999', 'abc', '1 OR 1=1', '-1']) {
      expect((await como('directora').get('/api/dashboard').query({ periodo: '2026-06', programaId: malo })).status).toBe(400);
    }
  });

  test('P4-4: el resultado de un indicador sin fila en esa carga aparece como "sin datos"', async () => {
    // un indicador nuevo no tiene resultado en las cargas anteriores a su creación
    await admin(`INSERT INTO indicador (nombre, programa_id, rem_codigo, seccion, celda_numerador, origen_denominador, celda_denominador, meta_nacional)
                 VALUES ('Indicador nuevo', 1, 'IND-99', 'Sección A', 'B99', 'REM', 'C99', 50)`);
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    const nuevo = porCodigo(r.body.indicadores)['IND-99'];
    expect(nuevo.estado).toBe('sin_datos');
    expect(nuevo.resultado).toBeNull();
    expect(r.body.resumen.sinDatos).toBe(1);
    await admin("DELETE FROM indicador WHERE rem_codigo = 'IND-99'");
  });

  test('P4-1: un indicador desactivado no aparece en el dashboard', async () => {
    await admin("UPDATE indicador SET activo = false WHERE rem_codigo = 'IND-04'");
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-06' });
    expect(r.body.indicadores.map((x) => x.codigo)).not.toContain('IND-04');
    await admin("UPDATE indicador SET activo = true WHERE rem_codigo = 'IND-04'");
  });

  test('P4-1: de dos cargas del mismo mes rige la más reciente que generó resultados (abril: la corregida)', async () => {
    const r = await como('directora').get('/api/dashboard').query({ periodo: '2026-04' });
    expect(r.body.sinDatos).toBe(false);
    expect(porCodigo(r.body.indicadores)['IND-01'].resultado).toBe(74);
  });
});

describe('Reportes (P5)', () => {
  test('P5-1: un mes de la lista: todos los indicadores, un valor por indicador', async () => {
    const r = await como('directora').get('/api/reportes').query({ mes: '2026-05' });
    expect(r.status).toBe(200);
    expect(r.body.modo).toBe('mes');
    expect(r.body.filas).toHaveLength(5);
    const f = r.body.filas.find((x) => x.codigo === 'IND-01');
    expect(f.valores).toHaveLength(1);
    expect(f.valores[0]).toMatchObject({ periodo: '2026-05', resultado: 78, estado: 'riesgo' });
  });

  test('P5-1: sin parámetros usa el mes más reciente', async () => {
    const r = await como('directora').get('/api/reportes');
    expect(r.body.periodos).toEqual(['2026-06']);
  });

  test('P5-1: un mes fuera de la lista (sin datos o con formato inválido): 400', async () => {
    for (const mes of ['2026-01', '2026-13', 'xx', '2026-06-01']) {
      const r = await como('directora').get('/api/reportes').query({ mes });
      expect(r.status).toBe(400);
      expect(r.body.campos.mes).toBeDefined();
    }
  });

  test('P5-2: rango de fechas: trae los meses con datos dentro del rango', async () => {
    const r = await como('directora').get('/api/reportes').query({ desde: '2026-03-15', hasta: '2026-05-02' });
    expect(r.status).toBe(200);
    expect(r.body.modo).toBe('rango');
    expect(r.body.periodos).toEqual(['2026-03', '2026-04', '2026-05']);
    const f = r.body.filas.find((x) => x.codigo === 'IND-01');
    expect(f.valores.map((v) => v.resultado)).toEqual([71, 74, 78]);
  });

  test('P5-2: un rango sin datos responde "Sin datos para el rango elegido"', async () => {
    const r = await como('directora').get('/api/reportes').query({ desde: '2023-01-01', hasta: '2023-12-31' });
    expect(r.status).toBe(200);
    expect(r.body.sinDatos).toBe(true);
    expect(r.body.mensaje).toBe('Sin datos para el rango elegido');
  });

  test('P5-2: fechas inexistentes (31-02), Hasta anterior a Desde o solo una de las dos: 400', async () => {
    const a = await como('directora').get('/api/reportes').query({ desde: '2026-02-31', hasta: '2026-03-01' });
    expect(a.status).toBe(400);
    expect(a.body.campos.desde).toBeDefined();
    const b = await como('directora').get('/api/reportes').query({ desde: '2026-05-10', hasta: '2026-05-09' });
    expect(b.status).toBe(400);
    expect(b.body.campos.hasta).toBe('La fecha Hasta no puede ser anterior a Desde');
    const c = await como('directora').get('/api/reportes').query({ desde: '2026-05-10' });
    expect(c.status).toBe(400);
    const d = await como('directora').get('/api/reportes').query({ desde: '10-05-2026', hasta: '11-05-2026' });
    expect(d.status).toBe(400);
  });

  test('P5-3: el corte IAAPS debe ser uno de la lista', async () => {
    expect((await como('directora').get('/api/reportes').query({ corte: 'Corte 1' })).status).toBe(200);
    expect((await como('directora').get('/api/reportes').query({ corte: 'Corte 9' })).status).toBe(400);
    expect((await como('directora').get('/api/reportes').query({ corte: "' OR 1=1 --" })).status).toBe(400);
  });

  test('P5-4 / P4-2 / T-6: el Jefe de Programa solo ve su programa; pedir otro es 403', async () => {
    const mia = await como('jefe').get('/api/reportes').query({ mes: '2026-06' });
    expect(mia.status).toBe(200);
    expect(mia.body.filas.map((f) => f.codigo)).toEqual(['IND-01', 'IND-02']);
    const matId = mia.body.filas[0].programaId;
    expect((await como('jefe').get('/api/reportes').query({ mes: '2026-06', programaId: matId })).status).toBe(200);
    const otro = (await admin("SELECT id FROM programa WHERE nombre = 'Salud Mental'")).rows[0].id;
    const r = await como('jefe').get('/api/reportes').query({ mes: '2026-06', programaId: otro });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'No tiene permiso para ver ese programa' });
    expect((await como('jefe').get('/api/reportes').query({ programaId: 'abc' })).status).toBe(403);
  });

  test('P5-4: la Directora puede filtrar cualquier programa; uno inexistente es 400', async () => {
    const sm = (await admin("SELECT id FROM programa WHERE nombre = 'Salud Mental'")).rows[0].id;
    const r = await como('directora').get('/api/reportes').query({ mes: '2026-06', programaId: sm });
    expect(r.body.filas.map((f) => f.codigo)).toEqual(['IND-03']);
    expect((await como('directora').get('/api/reportes').query({ programaId: '9999' })).status).toBe(400);
  });
});

describe('Comparativo anual (P6)', () => {
  const comparar = (rol, q) => como(rol).get('/api/comparativo').query(q);

  test('P6-1: compara dos años con el promedio de sus resultados mensuales', async () => {
    const r = await comparar('directora', { anioActual: '2026', anioComparar: '2025' });
    expect(r.status).toBe(200);
    const i = porCodigo(r.body.indicadores);
    expect(i['IND-01'].actual.resultado).toBe(76.25);       // promedio de 71, 74, 78, 82
    expect(i['IND-01'].comparado.resultado).toBe(70);
    expect(i['IND-01'].diferencia).toBe(6.25);
    expect(i['IND-04'].diferencia).toBe(-8.25);              // 35,75 contra 44
    expect(i['IND-05'].actual.meses).toBe(3);                // junio no cuenta: falta la población
  });

  test('P6-2: mismo año, año sin datos o fuera de la lista: 400', async () => {
    const mismo = await comparar('directora', { anioActual: '2026', anioComparar: '2026' });
    expect(mismo.status).toBe(400);
    expect(mismo.body.campos.anioComparar).toBe('Elija un año distinto al actual');
    for (const q of [{ anioActual: '2026', anioComparar: '2023' }, { anioActual: '2023', anioComparar: '2026' }, { anioActual: '26', anioComparar: '2025' }, { anioActual: '2026' }, {}]) {
      expect((await comparar('directora', q)).status).toBe(400);
    }
  });

  test('P6-1: el Jefe de Programa no tiene acceso al comparativo', async () => {
    expect((await comparar('jefe', { anioActual: '2026', anioComparar: '2025' })).status).toBe(403);
  });
});

describe('Detalle de un indicador (pantalla 7) y alcance por programa (T-6)', () => {
  test('la Directora ve el resultado del período y la evolución mensual en orden', async () => {
    const r = await como('directora').get('/api/indicadores/1/detalle').query({ periodo: '2026-06' });
    expect(r.status).toBe(200);
    expect(r.body.indicador).toMatchObject({ remCodigo: 'IND-01', programa: 'Matronas', metaNacional: 80 });
    expect(r.body.resultado).toMatchObject({ resultado: 82, estado: 'cumple' });
    expect(r.body.historial.map((h) => h.periodo)).toEqual(['2024-12', '2025-12', '2026-03', '2026-04', '2026-05', '2026-06']);
  });

  test('T-6: el Jefe de Matronas ve su indicador pero NO el de otro programa (403 y sin datos)', async () => {
    expect((await como('jefe').get('/api/indicadores/1/detalle')).status).toBe(200);
    const r = await como('jefe').get('/api/indicadores/3/detalle');      // IND-03 es de Salud Mental
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'No tiene permiso para ver ese indicador' });
  });

  test('indicador inexistente o identificador inválido: 404; período inválido: 400', async () => {
    expect((await como('directora').get('/api/indicadores/9999/detalle')).status).toBe(404);
    expect((await como('directora').get('/api/indicadores/abc/detalle')).status).toBe(404);
    expect((await como('directora').get('/api/indicadores/1%20OR%201=1/detalle')).status).toBe(404);
    expect((await como('directora').get('/api/indicadores/1/detalle').query({ periodo: '2026-13' })).status).toBe(400);
  });
});

describe('Comentarios del Jefe de Programa (P7)', () => {
  const comentar = (rol, id, cuerpo) => como(rol).post(`/api/indicadores/${id}/comentarios`).send(cuerpo);

  test('P7-5: la Directora ve los comentarios de un indicador; el texto con HTML se entrega sin alterar', async () => {
    const r = await como('directora').get('/api/indicadores/1/comentarios');
    expect(r.status).toBe(200);
    expect(r.body.comentarios).toHaveLength(2);
    expect(r.body.comentarios.map((c) => c.texto).join('|')).toContain('<script>alert(1)</script>');
    const junio = await como('directora').get('/api/indicadores/1/comentarios').query({ periodo: '2026-06' });
    expect(junio.body.comentarios).toHaveLength(1);
    expect(junio.body.comentarios[0].autor).toBe('Jefe Matronas Demo');
  });

  test('P7-5 / T-6: el Jefe no ve comentarios de otro programa', async () => {
    expect((await como('jefe').get('/api/indicadores/1/comentarios')).status).toBe(200);
    expect((await como('jefe').get('/api/indicadores/3/comentarios')).status).toBe(403);
  });

  test('P7-1: el Jefe publica un comentario de 1 a 500 caracteres en un indicador de su programa', async () => {
    const r = await comentar('jefe', 1, { periodo: '2026-06', texto: '  Revisar el rango de edad.  ' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ texto: 'Revisar el rango de edad.', periodo: '2026-06', autor: 'Jefe Matronas Demo' });
    expect((await comentar('jefe', 1, { periodo: '2026-06', texto: 'a' })).status).toBe(201);
    expect((await comentar('jefe', 1, { periodo: '2026-06', texto: 'a'.repeat(500) })).status).toBe(201);
  });

  test('P7-1: vacío, solo espacios, más de 500 caracteres, sin período o con tipos raros: 400 y no se guarda', async () => {
    const antes = (await admin('SELECT count(*) AS n FROM comentario_indicador')).rows[0].n;
    const casos = [
      { periodo: '2026-06', texto: '' }, { periodo: '2026-06', texto: '    ' }, { periodo: '2026-06', texto: 'a'.repeat(501) },
      { periodo: '2026-06' }, { texto: 'Hola' }, { periodo: '2026-13', texto: 'Hola' }, { periodo: '2026-06', texto: 12345 },
      { periodo: '2026-06', texto: ['a'] }, { periodo: '2026-06', texto: 'con\u0000nulo' }
    ];
    for (const c of casos) { expect((await comentar('jefe', 1, c)).status).toBe(400); }
    expect((await admin('SELECT count(*) AS n FROM comentario_indicador')).rows[0].n).toBe(antes);
  });

  test('P7-2 / T-2: <script> y comillas se guardan tal cual y vuelven como texto; la base no tiene versión "escapada"', async () => {
    const xss = '<script>alert(1)</script> <img src=x onerror=alert(2)> \' " ; -- &amp;';
    const r = await comentar('jefe', 2, { periodo: '2026-06', texto: xss });
    expect(r.status).toBe(201);
    expect(r.body.texto).toBe(xss);
    const lista = await como('directora').get('/api/indicadores/2/comentarios');
    expect(lista.body.comentarios.map((c) => c.texto)).toContain(xss);
    expect(lista.headers['content-type']).toContain('application/json');
    expect(lista.headers['x-content-type-options']).toBe('nosniff');
    const bd = await admin('SELECT texto FROM comentario_indicador WHERE id = $1', [r.body.id]);
    expect(bd.rows[0].texto).toBe(xss);
  });

  test('P7-4: la Directora, la Subdirección y el Gestor no pueden comentar (403)', async () => {
    for (const rol of ['directora', 'subdireccion', 'gestor']) {
      const r = await comentar(rol, 1, { periodo: '2026-06', texto: 'Hola' });
      expect(r.status).toBe(403);
    }
  });

  test('P7-4 / T-6: el Jefe no puede comentar un indicador de otro programa (403) ni uno inexistente (404)', async () => {
    expect((await comentar('jefe', 3, { periodo: '2026-06', texto: 'Hola' })).status).toBe(403);
    expect((await comentar('jefe', 9999, { periodo: '2026-06', texto: 'Hola' })).status).toBe(404);
    expect((await comentar('jefe', 'abc', { periodo: '2026-06', texto: 'Hola' })).status).toBe(404);
  });

  test('P7-1: la auditoría registra el comentario sin copiar su texto', async () => {
    const r = await admin("SELECT detalle::text AS d FROM log_auditoria WHERE accion = 'COMENTAR_INDICADOR' ORDER BY id DESC LIMIT 1");
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].d).not.toContain('script');
  });
});

describe('Exportación (P8)', () => {
  test('P8-3: CSV: tipo, nombre de archivo, BOM, separador ";" y una fila por indicador', async () => {
    const r = await como('directora').get('/api/exportar').query({ formato: 'CSV', periodo: '2026-06' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toBe('attachment; filename="metas_2026-06.csv"');
    expect(r.text.charCodeAt(0)).toBe(0xFEFF);
    const lineas = r.text.slice(1).trim().split('\r\n');
    expect(lineas[0]).toBe('Código;Indicador;Programa;Meta (%);Numerador;Denominador;Resultado (%);Estado');
    expect(lineas).toHaveLength(6);
    expect(lineas.find((l) => l.startsWith('IND-01'))).toBe('IND-01;Cobertura de examen preventivo en mujeres;Matronas;80;1722;2100;82;Cumple');
    expect(lineas.find((l) => l.startsWith('IND-02'))).toContain(';78,1;En riesgo');
    expect(lineas.find((l) => l.startsWith('IND-05'))).toContain(';Sin población');
  });

  test('P8-3: XLSX: archivo Excel con encabezados y una fila por indicador', async () => {
    const r = await como('subdireccion').get('/api/exportar').query({ formato: 'XLSX', periodo: '2026-06' }).buffer(true).parse(leerBinario);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.headers['content-disposition']).toBe('attachment; filename="metas_2026-06.xlsx"');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A1').value).toBe('Código');
    expect(ws.getCell('H1').value).toBe('Estado');
    const fila = [2, 3, 4, 5, 6].find((n) => ws.getCell('A' + n).value === 'IND-01');   // orden: por programa y código
    expect(fila).toBeDefined();
    expect(ws.getCell('G' + fila).value).toBe(82);
    expect(ws.getCell('H' + fila).value).toBe('Cumple');
    expect(ws.getCell('A7').value).toBeNull();                                          // exactamente 5 indicadores
  });

  test('P8-1: formato distinto de CSV o XLSX (PDF, minúsculas, vacío, con inyección): 400', async () => {
    for (const formato of ['PDF', 'csv', '', 'CSV;DROP', undefined]) {
      const r = await como('directora').get('/api/exportar').query({ formato, periodo: '2026-06' });
      expect(r.status).toBe(400);
      expect(r.body.campos.formato).toBeDefined();
    }
  });

  test('P8-2: período fuera de la lista o con formato inválido: 400', async () => {
    for (const periodo of ['2026-01', '2026-13', '../../etc/passwd', undefined]) {
      expect((await como('directora').get('/api/exportar').query({ formato: 'CSV', periodo })).status).toBe(400);
    }
  });

  test('P8-3 / T-6: el archivo del Jefe de Programa solo tiene datos de su programa; pedir otro es 403', async () => {
    const r = await como('jefe').get('/api/exportar').query({ formato: 'CSV', periodo: '2026-06' });
    expect(r.status).toBe(200);
    const lineas = r.text.slice(1).trim().split('\r\n');
    expect(lineas).toHaveLength(3);
    expect(r.text).not.toContain('IND-03');
    expect(r.text).not.toContain('Salud Mental');
    const otro = (await admin("SELECT id FROM programa WHERE nombre = 'Salud Mental'")).rows[0].id;
    expect((await como('jefe').get('/api/exportar').query({ formato: 'CSV', periodo: '2026-06', programaId: otro })).status).toBe(403);
  });

  test('T-2: un nombre de indicador que parece fórmula se exporta neutralizado', async () => {
    await admin("UPDATE indicador SET nombre = '=HYPERLINK(\"http://malo.cl\",\"clic\")' WHERE rem_codigo = 'IND-02'");
    const r = await como('directora').get('/api/exportar').query({ formato: 'CSV', periodo: '2026-06' });
    const linea = r.text.split('\r\n').find((l) => l.startsWith('IND-02'));
    expect(linea).toContain(";\"'=HYPERLINK(");
    await admin("UPDATE indicador SET nombre = 'Ingreso precoz a control prenatal' WHERE rem_codigo = 'IND-02'");
  });

  test('el Gestor de Información no puede exportar (403)', async () => {
    expect((await como('gestor').get('/api/exportar').query({ formato: 'CSV', periodo: '2026-06' })).status).toBe(403);
  });
});
