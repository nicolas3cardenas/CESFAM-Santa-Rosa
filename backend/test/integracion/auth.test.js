'use strict';
// Pruebas de integración de autenticación y sesión (plan de pruebas: P1, P2, P3, T-1, T-3, T-4, T-8).
const jwt = require('jsonwebtoken');
const { reiniciarBD, admin, cerrarPoolDeLaApp, config } = require('../ayudas/bd');
const api = require('../ayudas/api');
const correo = require('../../src/servicios/correo');
const claves = require('../../src/lib/claves');

const { request, app, login, CLAVE_DEMO, CUENTAS } = api;
const MSG_LOGIN = 'Correo o contraseña incorrectos';

beforeAll(async () => { await reiniciarBD(); });
afterAll(async () => { await cerrarPoolDeLaApp(); });

async function usuarioDe(email) {
  return (await admin('SELECT id, password_hash, intentos_fallidos, bloqueado_hasta FROM usuario WHERE email = $1', [email])).rows[0];
}
const tokenDeEnlace = (enlace) => enlace.split('/').pop();

describe('Inicio de sesión', () => {
  test('P1-3: con credenciales correctas entrega token, datos del usuario y permisos (sin el hash)', async () => {
    const r = await login(CUENTAS.directora);
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
    expect(r.body.usuario).toMatchObject({ correo: 'directora@demo.cl', rol: 'Directora', programaId: null });
    expect(r.body.permisos.dashboard).toBe(true);
    expect(r.body.permisos.cargarRem).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain('hash');
    expect(JSON.stringify(r.body)).not.toContain('$2');
  });

  test('P1-3: el correo no distingue mayúsculas (se guarda en minúsculas)', async () => {
    const r = await login('DIRECTORA@Demo.CL');
    expect(r.status).toBe(200);
  });

  test('P1-3: correo inexistente y contraseña incorrecta dan EXACTAMENTE la misma respuesta', async () => {
    const a = await login('nadie@demo.cl', 'ClaveCualquiera1');
    const b = await login(CUENTAS.directora, 'ClaveIncorrecta1');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual({ error: MSG_LOGIN });
    expect(b.body).toEqual(a.body);
  });

  test('P1-1: correo con formato inválido: 400 y mensaje "Ingrese un correo válido"', async () => {
    const largo = 'a'.repeat(95) + '@demo.cl';   // 103 caracteres
    for (const c of ['', 'sin-arroba', 'a b@demo.cl', 'a@demo', largo, null, 123, ['a@demo.cl'], { $ne: '' }]) {
      const r = await login(c);
      expect(r.status).toBe(400);
      expect(r.body.campos.correo).toBe('Ingrese un correo válido');
    }
  });

  test('P1-2: contraseña de menos de 8 o más de 64 caracteres: 400', async () => {
    for (const c of ['', '1234567', 'a'.repeat(65), null, 12345678]) {
      const r = await login(CUENTAS.directora, c);
      expect(r.status).toBe(400);
      expect(r.body.campos.clave).toBe('La contraseña debe tener entre 8 y 64 caracteres');
    }
  });

  test('P1-2: contraseña de 64 caracteres es aceptada para validar (y falla solo por incorrecta)', async () => {
    const r = await login(CUENTAS.directora, 'a'.repeat(64));
    expect(r.status).toBe(401);
  });

  test('solicitud sin cuerpo JSON o con JSON malformado: 400', async () => {
    const a = await request(app).post('/api/auth/login');
    expect(a.status).toBe(400);
    const b = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"correo": ');
    expect(b.status).toBe(400);
    expect(b.body.error).toBe('La solicitud no tiene un formato válido');
    const c = await request(app).post('/api/auth/login').send([1, 2]);
    expect(c.status).toBe(400);
  });

  test('T-1: inyección SQL en correo y contraseña se trata como texto: no inicia sesión, no da error y las tablas siguen intactas', async () => {
    const antes = (await admin('SELECT count(*) AS n FROM usuario')).rows[0].n;
    const intentos = [
      ["a'--@demo.cl", "' OR '1'='1' --"],
      ["x'; DROP TABLE usuario; --@demo.cl", "'; DROP TABLE usuario; --"],
      ["directora@demo.cl' OR 1=1 --@x.cl", 'ClaveDemo2026']
    ];
    for (const [c, k] of intentos) {
      const r = await login(c, k);
      expect([400, 401]).toContain(r.status);
      expect(r.status).not.toBe(500);
    }
    const despues = (await admin('SELECT count(*) AS n FROM usuario')).rows[0].n;
    expect(despues).toBe(antes);
  });

  test('P14-4: una cuenta desactivada no puede iniciar sesión (mismo mensaje)', async () => {
    const r = await login(api.CUENTA_DESACTIVADA);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: MSG_LOGIN });
  });

  test('un intento fallido queda en la auditoría, sin guardar la contraseña', async () => {
    await login('inexistente@demo.cl', 'ClaveSecreta123');
    await login(CUENTAS.gestor, 'OtraClaveSecreta1');
    const r = await admin("SELECT detalle::text AS d, accion FROM log_auditoria WHERE accion = 'LOGIN_FALLIDO' ORDER BY id DESC LIMIT 2");
    expect(r.rowCount).toBe(2);
    r.rows.forEach((f) => { expect(f.d).not.toContain('ClaveSecreta123'); expect(f.d).not.toContain('OtraClaveSecreta1'); });
    expect(r.rows[1].d).toContain('inexistente@demo.cl');
  });

  test('la contraseña se guarda con bcrypt (nunca en claro)', async () => {
    const u = await usuarioDe(CUENTAS.directora);
    expect(u.password_hash).toMatch(/^\$2[aby]\$\d\d\$/);
    expect(u.password_hash).not.toContain('ClaveDemo2026');
  });
});

describe('Bloqueo de cuenta (T-8, P1-3)', () => {
  beforeEach(async () => { await reiniciarBD(); });

  test('T-8: cinco contraseñas incorrectas seguidas bloquean 15 minutos y el mensaje nunca cambia', async () => {
    const respuestas = [];
    for (let i = 0; i < 5; i++) { respuestas.push(await login(CUENTAS.subdireccion, 'ClaveIncorrecta' + i)); }
    respuestas.forEach((r) => { expect(r.status).toBe(401); expect(r.body).toEqual({ error: MSG_LOGIN }); });

    const u = await usuarioDe(CUENTAS.subdireccion);
    const minutos = (new Date(u.bloqueado_hasta).getTime() - Date.now()) / 60000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15);

    // Ya bloqueada: ni siquiera la contraseña correcta entra, y el mensaje es el mismo
    const r = await login(CUENTAS.subdireccion);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: MSG_LOGIN });

    const aud = await admin("SELECT accion FROM log_auditoria WHERE accion = 'CUENTA_BLOQUEADA'");
    expect(aud.rowCount).toBe(1);
  });

  test('T-8: cuatro intentos fallidos todavía no bloquean', async () => {
    for (let i = 0; i < 4; i++) { await login(CUENTAS.subdireccion, 'ClaveIncorrecta' + i); }
    const r = await login(CUENTAS.subdireccion);
    expect(r.status).toBe(200);
    const u = await usuarioDe(CUENTAS.subdireccion);
    expect(u.intentos_fallidos).toBe(0);          // un inicio correcto reinicia el contador
    expect(u.bloqueado_hasta).toBeNull();
  });

  test('T-8: pasados los 15 minutos la cuenta vuelve a funcionar', async () => {
    for (let i = 0; i < 5; i++) { await login(CUENTAS.subdireccion, 'ClaveIncorrecta' + i); }
    expect((await login(CUENTAS.subdireccion)).status).toBe(401);
    await admin("UPDATE usuario SET bloqueado_hasta = now() - interval '1 minute' WHERE email = $1", [CUENTAS.subdireccion]);
    expect((await login(CUENTAS.subdireccion)).status).toBe(200);
  });

  test('T-8: el bloqueo de una cuenta no afecta a las demás', async () => {
    for (let i = 0; i < 5; i++) { await login(CUENTAS.subdireccion, 'ClaveIncorrecta' + i); }
    expect((await login(CUENTAS.directora)).status).toBe(200);
  });

  test('T-8: intentar con un correo que no existe no bloquea ni cambia nada', async () => {
    for (let i = 0; i < 8; i++) { expect((await login('fantasma@demo.cl', 'ClaveIncorrecta1')).status).toBe(401); }
    const n = (await admin('SELECT count(*) AS n FROM usuario WHERE bloqueado_hasta IS NOT NULL')).rows[0].n;
    expect(n).toBe(0);
  });

  test('T-8 (estrés): 20 intentos fallidos simultáneos no rompen la cuenta ni dan errores 500', async () => {
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => login(CUENTAS.gestor, 'ClaveIncorrecta' + i)));
    rs.forEach((r) => { expect(r.status).toBe(401); });
    const u = await usuarioDe(CUENTAS.gestor);
    expect(u.intentos_fallidos).toBeLessThanOrEqual(5);
    expect(u.intentos_fallidos).toBeGreaterThanOrEqual(0);
    expect(u.bloqueado_hasta).not.toBeNull();
  });
});

describe('Recuperación de contraseña (P2-1, P2-2, P2-3, P3-4)', () => {
  beforeEach(async () => { await reiniciarBD(); });
  const pedir = (c) => request(app).post('/api/auth/olvide').send({ correo: c });
  const restablecer = (token, cuerpo) => request(app).post('/api/auth/restablecer/' + token).send(cuerpo);

  test('P2-1: correo con formato inválido: 400', async () => {
    for (const c of ['', 'sin-arroba', 'a b@demo.cl', 'a'.repeat(101) + '@d.cl', null]) {
      const r = await pedir(c);
      expect(r.status).toBe(400);
      expect(r.body.campos.correo).toBeDefined();
    }
  });

  test('P2-2: la respuesta es idéntica si el correo está registrado o no, y solo en el primer caso se genera un enlace', async () => {
    const antes = correo.enviadosCantidad();
    const si = await pedir(CUENTAS.directora);
    const no = await pedir('nadie@demo.cl');
    expect(si.status).toBe(200);
    expect(no.status).toBe(200);
    expect(si.body).toEqual({ mensaje: 'Si el correo está registrado, recibirá un enlace' });
    expect(no.body).toEqual(si.body);
    expect(correo.enviadosCantidad()).toBe(antes + 1);
    expect((await admin('SELECT count(*) AS n FROM token_recuperacion')).rows[0].n).toBe(1);
  });

  test('P2-2: una cuenta desactivada tampoco recibe enlace (y la respuesta es la misma)', async () => {
    const antes = correo.enviadosCantidad();
    const r = await pedir(api.CUENTA_DESACTIVADA);
    expect(r.body).toEqual({ mensaje: 'Si el correo está registrado, recibirá un enlace' });
    expect(correo.enviadosCantidad()).toBe(antes);
  });

  test('P3-4: el enlace funciona una vez; la contraseña cambia y el enlace usado ya no sirve', async () => {
    await pedir(CUENTAS.directora);
    const token = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    expect((await request(app).get('/api/auth/restablecer/' + token)).body).toEqual({ valido: true });
    const ok = await restablecer(token, { clave: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    expect(ok.status).toBe(200);

    expect((await login(CUENTAS.directora, 'NuevaClave2026')).status).toBe(200);
    expect((await login(CUENTAS.directora, CLAVE_DEMO)).status).toBe(401);

    const otra = await restablecer(token, { clave: 'OtraClave2026', confirmacion: 'OtraClave2026' });
    expect(otra.status).toBe(400);
    expect(otra.body.error).toBe('Enlace no válido');
    expect((await request(app).get('/api/auth/restablecer/' + token)).status).toBe(400);
  });

  test('P3-4: en la base solo queda el hash del enlace, nunca el enlace', async () => {
    await pedir(CUENTAS.directora);
    const token = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    const r = await admin('SELECT token_hash, usado_en, expira_en > now() AS vigente FROM token_recuperacion');
    expect(r.rows[0].token_hash).toHaveLength(64);
    expect(r.rows[0].token_hash).not.toBe(token);
    expect(r.rows[0].vigente).toBe(true);
  });

  test('P3-4: un enlace vencido (más de 30 minutos) se rechaza con "Enlace no válido"', async () => {
    await pedir(CUENTAS.directora);
    const token = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    await admin("UPDATE token_recuperacion SET creado_en = now() - interval '2 hours', expira_en = now() - interval '90 minutes'");
    const r = await restablecer(token, { clave: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Enlace no válido');
    expect((await login(CUENTAS.directora)).status).toBe(200);   // la clave no cambió
  });

  test('P3-4: el enlace vence a los 30 minutos exactos de su emisión', async () => {
    await pedir(CUENTAS.directora);
    const r = await admin("SELECT extract(epoch FROM (expira_en - creado_en)) / 60 AS minutos FROM token_recuperacion");
    expect(Math.round(r.rows[0].minutos)).toBe(30);
  });

  test('P3-4: un enlace alterado o con formato raro se rechaza', async () => {
    await pedir(CUENTAS.directora);
    const token = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    const alterado = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');
    for (const t of [alterado, 'abc', token.toUpperCase(), "' OR 1=1 --", '0'.repeat(64)]) {
      const r = await restablecer(encodeURIComponent(t), { clave: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('Enlace no válido');
    }
  });

  test('P2-3: pedir dos enlaces seguidos deja vigente solo el último', async () => {
    await pedir(CUENTAS.directora);
    const primero = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    await pedir(CUENTAS.directora);
    const segundo = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    expect(segundo).not.toBe(primero);
    expect((await request(app).get('/api/auth/restablecer/' + primero)).status).toBe(400);
    expect((await request(app).get('/api/auth/restablecer/' + segundo)).status).toBe(200);
  });

  test('P3-2 / P3-3: contraseña nueva inválida o sin coincidir: 400 y el enlace NO se gasta', async () => {
    await pedir(CUENTAS.directora);
    const token = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    const corta = await restablecer(token, { clave: '1234567', confirmacion: '1234567' });
    expect(corta.status).toBe(400);
    expect(corta.body.campos.clave).toBe('La contraseña debe tener entre 8 y 64 caracteres');
    const distinta = await restablecer(token, { clave: 'NuevaClave2026', confirmacion: 'NuevaClave2027' });
    expect(distinta.status).toBe(400);
    expect(distinta.body.campos.confirmacion).toBe('Las contraseñas no coinciden');
    const ok = await restablecer(token, { clave: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    expect(ok.status).toBe(200);
  });

  test('P3-4 (estrés): dos solicitudes simultáneas con el mismo enlace: solo una cambia la contraseña', async () => {
    await pedir(CUENTAS.directora);
    const token = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    const [a, b] = await Promise.all([
      restablecer(token, { clave: 'ClaveUno2026', confirmacion: 'ClaveUno2026' }),
      restablecer(token, { clave: 'ClaveDos2026', confirmacion: 'ClaveDos2026' })
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    const ganadora = a.status === 200 ? 'ClaveUno2026' : 'ClaveDos2026';
    expect((await login(CUENTAS.directora, ganadora)).status).toBe(200);
  });

  test('restablecer la contraseña también desbloquea la cuenta', async () => {
    for (let i = 0; i < 5; i++) { await login(CUENTAS.directora, 'ClaveIncorrecta' + i); }
    expect((await login(CUENTAS.directora)).status).toBe(401);
    await pedir(CUENTAS.directora);
    const token = tokenDeEnlace(correo.ultimoEnlaceEnPruebas(CUENTAS.directora));
    await restablecer(token, { clave: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    expect((await login(CUENTAS.directora, 'NuevaClave2026')).status).toBe(200);
  });
});

describe('Cambio de contraseña con la sesión iniciada (P3-1, P3-2, P3-3)', () => {
  beforeEach(async () => { await reiniciarBD(); await api.sesiones(['directora']); });
  const cambiar = (cuerpo) => api.como('directora').post('/api/auth/cambiar-clave').send(cuerpo);

  test('sin sesión: 401', async () => {
    const r = await request(app).post('/api/auth/cambiar-clave').send({ claveActual: CLAVE_DEMO, claveNueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    expect(r.status).toBe(401);
  });

  test('P3-1: contraseña actual incorrecta o vacía: 400 y no cambia', async () => {
    for (const actual of ['ClaveIncorrecta1', '', undefined]) {
      const r = await cambiar({ claveActual: actual, claveNueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
      expect(r.status).toBe(400);
      expect(r.body.campos.claveActual).toBeDefined();
    }
    expect((await login(CUENTAS.directora)).status).toBe(200);
  });

  test('P3-2: nueva de menos de 8, de más de 64 o igual a la actual: 400', async () => {
    const corta = await cambiar({ claveActual: CLAVE_DEMO, claveNueva: '1234567', confirmacion: '1234567' });
    const larga = await cambiar({ claveActual: CLAVE_DEMO, claveNueva: 'a'.repeat(65), confirmacion: 'a'.repeat(65) });
    const igual = await cambiar({ claveActual: CLAVE_DEMO, claveNueva: CLAVE_DEMO, confirmacion: CLAVE_DEMO });
    expect(corta.status).toBe(400);
    expect(larga.status).toBe(400);
    expect(igual.status).toBe(400);
    expect(igual.body.campos.claveNueva).toBe('La contraseña nueva debe ser distinta de la actual');
  });

  test('P3-3: la confirmación debe ser igual: "Las contraseñas no coinciden"', async () => {
    const r = await cambiar({ claveActual: CLAVE_DEMO, claveNueva: 'NuevaClave2026', confirmacion: 'NuevaClave2027' });
    expect(r.status).toBe(400);
    expect(r.body.campos.confirmacion).toBe('Las contraseñas no coinciden');
  });

  test('P3-5: cambio correcto: entrega un token nuevo, el anterior deja de servir y la clave nueva funciona', async () => {
    const tokenViejo = api.tokens.directora;
    const r = await cambiar({ claveActual: CLAVE_DEMO, claveNueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
    expect((await api.conToken(tokenViejo).get('/api/auth/yo')).status).toBe(401);
    expect((await api.conToken(r.body.token).get('/api/auth/yo')).status).toBe(200);
    expect((await login(CUENTAS.directora, 'NuevaClave2026')).status).toBe(200);
    expect((await login(CUENTAS.directora, CLAVE_DEMO)).status).toBe(401);
    const aud = await admin("SELECT detalle::text AS d FROM log_auditoria WHERE accion = 'CAMBIO_CLAVE'");
    expect(aud.rowCount).toBe(1);
    expect(aud.rows[0].d).not.toContain('NuevaClave2026');
  });
});

describe('Sesión y token (T-3, T-4)', () => {
  beforeAll(async () => { await reiniciarBD(); await api.sesiones(); });

  const RUTAS_PROTEGIDAS = [
    '/api/auth/yo', '/api/catalogos', '/api/dashboard', '/api/reportes', '/api/comparativo?anioActual=2026&anioComparar=2025',
    '/api/indicadores', '/api/indicadores/1', '/api/indicadores/1/detalle', '/api/indicadores/1/comentarios',
    '/api/exportar?formato=CSV&periodo=2026-06', '/api/cargas', '/api/cargas/1', '/api/poblacion?periodo=2026-06',
    '/api/usuarios', '/api/usuarios/1', '/api/auditoria'
  ];

  test('T-3: sin token, toda ruta protegida responde 401', async () => {
    for (const ruta of RUTAS_PROTEGIDAS) {
      const r = await request(app).get(ruta);
      expect(r.status).toBe(401);
      expect(r.body.error).toBeDefined();
    }
    for (const [metodo, ruta] of [['post', '/api/cargas'], ['post', '/api/poblacion'], ['post', '/api/usuarios'], ['put', '/api/indicadores/1'], ['patch', '/api/usuarios/1/estado'], ['post', '/api/indicadores/1/comentarios']]) {
      expect((await request(app)[metodo](ruta).send({})).status).toBe(401);
    }
  });

  test('T-3: cabeceras de autorización mal formadas: 401', async () => {
    for (const cab of ['', 'Bearer', 'Bearer ', 'Basic abc', 'abc', 'Bearer a.b', 'Bearer a.b.c', 'Bearer ' + 'x'.repeat(50)]) {
      const r = await request(app).get('/api/auth/yo').set('Authorization', cab);
      expect(r.status).toBe(401);
    }
  });

  test('T-4: un token vencido se rechaza con 401', async () => {
    const u = (await admin('SELECT id, password_hash FROM usuario WHERE email = $1', [CUENTAS.directora])).rows[0];
    const vencido = jwt.sign({ ph: claves.huellaClave(u.password_hash), ini: Math.floor(Date.now() / 1000) }, config.jwtSecreto, { algorithm: 'HS256', subject: String(u.id), expiresIn: -10 });
    const r = await api.conToken(vencido).get('/api/auth/yo');
    expect(r.status).toBe(401);
    expect(r.body.error).toContain('Inicie sesión');
  });

  test('T-4: un token con un carácter cambiado, firmado con otra clave o sin firma se rechaza', async () => {
    const t = api.tokens.directora;
    const alterado = t.slice(0, -1) + (t.slice(-1) === 'A' ? 'B' : 'A');
    const ajeno = jwt.sign({ ph: 'x', ini: Math.floor(Date.now() / 1000) }, 'otra-clave-secreta-de-un-atacante-0123456789', { algorithm: 'HS256', subject: '1', expiresIn: 600 });
    const partes = t.split('.');
    const sinFirma = partes[0].replace(/./g, 'e').slice(0, 0) + Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + partes[1] + '.';
    for (const malo of [alterado, ajeno, sinFirma]) {
      expect((await api.conToken(malo).get('/api/auth/yo')).status).toBe(401);
    }
  });

  test('T-4: un token válido de OTRO usuario no sirve si el usuario no existe', async () => {
    const t = jwt.sign({ ph: 'x', ini: Math.floor(Date.now() / 1000) }, config.jwtSecreto, { algorithm: 'HS256', subject: '9999', expiresIn: 600 });
    expect((await api.conToken(t).get('/api/auth/yo')).status).toBe(401);
  });

  test('T-4: una sesión que supera la duración máxima (8 horas) se rechaza aunque no esté vencida', async () => {
    const u = (await admin('SELECT id, password_hash FROM usuario WHERE email = $1', [CUENTAS.directora])).rows[0];
    const antiguo = jwt.sign({ ph: claves.huellaClave(u.password_hash), ini: Math.floor(Date.now() / 1000) - 9 * 3600 }, config.jwtSecreto, { algorithm: 'HS256', subject: String(u.id), expiresIn: 600 });
    expect((await api.conToken(antiguo).get('/api/auth/yo')).status).toBe(401);
  });

  test('cierre por inactividad: el token se renueva mientras se usa (cabecera X-Token-Renovado) y conserva su inicio', async () => {
    const u = (await admin('SELECT id, password_hash FROM usuario WHERE email = $1', [CUENTAS.directora])).rows[0];
    const ahora = Math.floor(Date.now() / 1000);
    const ini = ahora - 3600;
    const viejo = jwt.sign({ ph: claves.huellaClave(u.password_hash), ini, iat: ahora - 600 }, config.jwtSecreto, { algorithm: 'HS256', subject: String(u.id), expiresIn: 1800 });
    const r = await api.conToken(viejo).get('/api/auth/yo');
    expect(r.status).toBe(200);
    const nuevo = r.headers['x-token-renovado'];
    expect(typeof nuevo).toBe('string');
    expect(jwt.verify(nuevo, config.jwtSecreto, { algorithms: ['HS256'] }).ini).toBe(ini);
    expect((await api.conToken(nuevo).get('/api/auth/yo')).status).toBe(200);
    // un token recién emitido no se renueva en cada solicitud
    const fresco = await api.como('directora').get('/api/auth/yo');
    expect(fresco.headers['x-token-renovado']).toBeUndefined();
  });

  test('T-4: si desactivan la cuenta, el token deja de servir de inmediato', async () => {
    await api.sesiones(['jefeSaludMental']);
    expect((await api.como('jefeSaludMental').get('/api/auth/yo')).status).toBe(200);
    await admin("UPDATE usuario SET activo = false WHERE email = $1", [CUENTAS.jefeSaludMental]);
    expect((await api.como('jefeSaludMental').get('/api/auth/yo')).status).toBe(401);
    await admin("UPDATE usuario SET activo = true WHERE email = $1", [CUENTAS.jefeSaludMental]);
  });

  test('T-5: si le cambian el rol, rige el de la base y no el que tenía al iniciar sesión', async () => {
    expect((await api.como('gestor').get('/api/usuarios')).status).toBe(200);
    await admin("UPDATE usuario SET rol_id = (SELECT id FROM rol WHERE nombre = 'Directora') WHERE email = $1", [CUENTAS.gestor]);
    expect((await api.como('gestor').get('/api/usuarios')).status).toBe(403);
    await admin("UPDATE usuario SET rol_id = (SELECT id FROM rol WHERE nombre = 'Gestor de Información') WHERE email = $1", [CUENTAS.gestor]);
  });

  test('/api/auth/yo entrega el usuario y sus permisos', async () => {
    const r = await api.como('jefe').get('/api/auth/yo');
    expect(r.status).toBe(200);
    expect(r.body.usuario).toMatchObject({ rol: 'Jefe de Programa', programa: 'Matronas' });
    expect(r.body.permisos.comentar).toBe(true);
    expect(r.body.permisos.cargarRem).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain('hash');
  });

  test('cerrar sesión responde 204 y deja registro', async () => {
    const r = await api.como('directora').post('/api/auth/salir');
    expect(r.status).toBe(204);
    const aud = await admin("SELECT count(*) AS n FROM log_auditoria WHERE accion = 'LOGOUT'");
    expect(aud.rows[0].n).toBe(1);
  });
});

describe('Límite de intentos por IP', () => {
  test('T-8: pasado el límite, el inicio de sesión responde 429', async () => {
    const { crearApp } = require('../../src/app');
    const limitada = crearApp({ limiteAutenticacion: 3 });
    const intentar = () => request(limitada).post('/api/auth/login').send({ correo: 'nadie@demo.cl', clave: 'ClaveIncorrecta1' });
    expect((await intentar()).status).toBe(401);
    expect((await intentar()).status).toBe(401);
    expect((await intentar()).status).toBe(401);
    const r = await intentar();
    expect(r.status).toBe(429);
    expect(r.body.error).toContain('Demasiados intentos');
  });
});
