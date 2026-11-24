'use strict';
// Pruebas de integración de la gestión de usuarios (pantallas 14 y 15): P14-1 a P14-4 y P15-1 a P15-6 por la API.
const { reiniciarBD, admin, cerrarPoolDeLaApp } = require('../ayudas/bd');
const api = require('../ayudas/api');
const { como, login, conToken } = api;

let ROL; let PROG;   // nombre -> id
beforeAll(async () => {
  await reiniciarBD(); await api.sesiones();
  const c = await como('gestor').get('/api/catalogos');
  ROL = Object.fromEntries(c.body.roles.map((x) => [x.nombre, x.id]));
  PROG = Object.fromEntries(c.body.programas.map((x) => [x.nombre, x.id]));
});
afterAll(async () => { await cerrarPoolDeLaApp(); });

const contar = async (sql, params) => Number((await admin(sql, params)).rows[0].n);
const totalUsuarios = () => contar('SELECT count(*) AS n FROM usuario');
const auditorias = (accion) => contar('SELECT count(*) AS n FROM log_auditoria WHERE accion = $1', [accion]);

const CLAVE_NUEVA = 'Clave-Nueva-2026';
const cuerpo = (cambios) => Object.assign({
  nombre: 'Persona Nueva', correo: 'persona.nueva@demo.cl', rolId: ROL['Jefe de Programa'], programaId: PROG.Matronas, clave: CLAVE_NUEVA
}, cambios);
const crear = (cambios, rol) => como(rol || 'gestor').post('/api/usuarios').send(cuerpo(cambios));
let correoUnico = 0;
const correoNuevo = () => { correoUnico += 1; return `usuario${correoUnico}@demo.cl`; };

describe('P14-2: cuadro Buscar y P14-3: lista Rol', () => {
  test('sin filtros lista las 6 cuentas ordenadas por nombre y NUNCA incluye contraseñas ni contadores de bloqueo', async () => {
    const r = await como('gestor').get('/api/usuarios');
    expect(r.status).toBe(200);
    expect(r.body.usuarios).toHaveLength(6);
    const nombres = r.body.usuarios.map((u) => u.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    const texto = JSON.stringify(r.body).toLowerCase();
    ['password', 'hash', 'bloqueado', 'intentos', '$2a$', '$2b$'].forEach((x) => expect(texto).not.toContain(x));
    expect(r.body.usuarios[0]).toEqual(expect.objectContaining({ id: expect.any(Number), nombre: expect.any(String), correo: expect.any(String), rol: expect.any(String), activo: expect.any(Boolean) }));
  });

  test('buscar por nombre o por correo, sin distinguir mayúsculas', async () => {
    expect((await como('gestor').get('/api/usuarios').query({ q: 'JEFE' })).body.usuarios).toHaveLength(3);
    expect((await como('gestor').get('/api/usuarios').query({ q: 'gestor@demo' })).body.usuarios).toHaveLength(1);
  });

  test.each([["'"], ['"'], ['<b>'], ['%'], ['_'], ['\\'], ["' OR 1=1 --"], ['; DROP TABLE usuario;--']])('el texto %j se busca como texto (200, sin resultados) y la tabla sigue intacta', async (q) => {
    const r = await como('gestor').get('/api/usuarios').query({ q });
    expect(r.status).toBe(200);
    expect(r.body.usuarios).toEqual([]);
    expect(await totalUsuarios()).toBe(6);
  });

  test('100 caracteres se aceptan y 101 -> 400', async () => {
    expect((await como('gestor').get('/api/usuarios').query({ q: 'a'.repeat(100) })).status).toBe(200);
    const r = await como('gestor').get('/api/usuarios').query({ q: 'a'.repeat(101) });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('q');
  });

  test('P14-3: filtrar por rol existente; "Todos" (vacío) trae todos', async () => {
    const r = await como('gestor').get('/api/usuarios').query({ rolId: ROL['Jefe de Programa'] });
    expect(r.body.usuarios).toHaveLength(3);
    expect(r.body.usuarios.every((u) => u.rol === 'Jefe de Programa')).toBe(true);
    expect((await como('gestor').get('/api/usuarios?rolId=')).body.usuarios).toHaveLength(6);
  });

  test.each([['9999'], ['abc'], ['0'], ['-1'], ['1 OR 1=1']])('rol fuera de la lista (%s) -> 400', async (rolId) => {
    const r = await como('gestor').get('/api/usuarios').query({ rolId });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('rolId');
  });
});

describe('P15: crear un usuario', () => {
  test('P15-4/P15-5: Jefe de Programa con programa: 201, sin contraseña en la respuesta, y puede iniciar sesión con su clave', async () => {
    const r = await crear({ correo: 'Jefe.Dietistas@Demo.cl', nombre: '  Jefe Dietistas Demo ', programaId: PROG.Dietistas });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nombre: 'Jefe Dietistas Demo', correo: 'jefe.dietistas@demo.cl', rol: 'Jefe de Programa', programa: 'Dietistas', activo: true });
    expect(JSON.stringify(r.body)).not.toContain(CLAVE_NUEVA);
    const sesion = await login('jefe.dietistas@demo.cl', CLAVE_NUEVA);
    expect(sesion.status).toBe(200);
    expect(sesion.body.usuario).toMatchObject({ rol: 'Jefe de Programa', programa: 'Dietistas' });
  });

  test('P15-5: en la base solo se guarda el hash (bcrypt), nunca la contraseña', async () => {
    const f = (await admin("SELECT password_hash FROM usuario WHERE email = 'jefe.dietistas@demo.cl'")).rows[0];
    expect(f.password_hash).toMatch(/^\$2[aby]\$\d\d\$/);
    expect(f.password_hash).not.toContain(CLAVE_NUEVA);
  });

  test('un rol sin programa (Gestor) se crea sin programa', async () => {
    const r = await crear({ correo: correoNuevo(), rolId: ROL['Gestor de Información'], programaId: null });
    expect(r.status).toBe(201);
    expect(r.body.programa).toBeNull();
  });

  test('queda CREAR_USUARIO en la auditoría, con rol y programa, SIN la contraseña', async () => {
    const r = await crear({ correo: correoNuevo(), nombre: 'Auditada' });
    const f = (await admin("SELECT detalle FROM log_auditoria WHERE accion = 'CREAR_USUARIO' AND entidad_id = $1", [r.body.id])).rows;
    expect(f).toHaveLength(1);
    expect(f[0].detalle.despues).toMatchObject({ nombre: 'Auditada', rol: 'Jefe de Programa', programa: 'Matronas' });
    expect(JSON.stringify(f[0].detalle)).not.toContain(CLAVE_NUEVA);
    expect(JSON.stringify(f[0].detalle).toLowerCase()).not.toContain('hash');
  });

  test('límites válidos: nombre de 100 caracteres, correo de 100 y contraseña de 8 y de 64 caracteres', async () => {
    const correo100 = 'a'.repeat(100 - '@demo.cl'.length) + '@demo.cl';
    expect(correo100).toHaveLength(100);
    expect((await crear({ nombre: 'n'.repeat(100), correo: correo100, clave: 'a'.repeat(8) })).status).toBe(201);
    expect((await crear({ correo: correoNuevo(), clave: 'b'.repeat(64) })).status).toBe(201);
  });
});

describe('P15: datos inválidos -> 400 y no se guarda', () => {
  let usuariosAntes; let auditoriaAntes;
  beforeAll(async () => { usuariosAntes = await totalUsuarios(); auditoriaAntes = await auditorias('CREAR_USUARIO'); });

  const casos = [
    ['P15-1 nombre vacío', { nombre: '' }, 'nombre'],
    ['P15-1 nombre solo espacios', { nombre: '    ' }, 'nombre'],
    ['P15-1 nombre de 101 caracteres', { nombre: 'n'.repeat(101) }, 'nombre'],
    ['P15-1 nombre que no es texto', { nombre: 42 }, 'nombre'],
    ['P15-2 correo sin @', { correo: 'persona.demo.cl' }, 'correo'],
    ['P15-2 correo con espacios', { correo: 'per sona@demo.cl' }, 'correo'],
    ['P15-2 correo sin dominio', { correo: 'persona@' }, 'correo'],
    ['P15-2 correo sin punto en el dominio', { correo: 'persona@demo' }, 'correo'],
    ['P15-2 correo de 101 caracteres', { correo: 'a'.repeat(101 - '@demo.cl'.length) + '@demo.cl' }, 'correo'],
    ['P15-2 correo vacío', { correo: '' }, 'correo'],
    ['P15-2 correo nulo', { correo: null }, 'correo'],
    ['P15-2 correo con dos @', { correo: 'a@b@demo.cl' }, 'correo'],
    ['P15-3 rol que no existe', { rolId: 9999 }, 'rolId'],
    ['P15-3 rol con texto', { rolId: 'Directora' }, 'rolId'],
    ['P15-3 rol vacío', { rolId: null }, 'rolId'],
    ['P15-4 Jefe de Programa sin programa', { programaId: null }, 'programaId'],
    ['P15-4 programa que no existe', { programaId: 9999 }, 'programaId'],
    ['P15-5 contraseña de 7 caracteres', { clave: 'abcdefg' }, 'clave'],
    ['P15-5 contraseña de 65 caracteres', { clave: 'a'.repeat(65) }, 'clave'],
    ['P15-5 contraseña vacía', { clave: '' }, 'clave'],
    ['P15-5 contraseña que no es texto', { clave: 12345678 }, 'clave'],
    ['P15-5 contraseña con carácter nulo', { clave: 'abcd\u0000efgh' }, 'clave']
  ];
  test.each(casos)('%s', async (_d, cambios, campo) => {
    const r = await crear(Object.assign({ correo: 'invalido.' + Math.random().toString(36).slice(2, 8) + '@demo.cl' }, cambios));
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty(campo);
  });

  test.each([['Directora'], ['Subdirección'], ['Gestor de Información']])('P15-4: el rol %s con un programa asignado -> 400', async (rol) => {
    const r = await crear({ correo: correoNuevo(), rolId: ROL[rol], programaId: PROG.Matronas });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('programaId');
  });

  test('nada de lo rechazado dejó usuarios ni auditoría', async () => {
    expect(await totalUsuarios()).toBe(usuariosAntes);
    expect(await auditorias('CREAR_USUARIO')).toBe(auditoriaAntes);
  });

  test('P15-4: el trigger de la base también rechaza un Jefe sin programa y otro rol con programa', async () => {
    const sql = "INSERT INTO usuario (nombre, email, password_hash, rol_id, programa_id) VALUES ('x', $1, 'HASH_NO_REAL', $2, $3)";
    await expect(admin(sql, ['x1@demo.cl', ROL['Jefe de Programa'], null])).rejects.toThrow();
    await expect(admin(sql, ['x2@demo.cl', ROL['Gestor de Información'], PROG.Matronas])).rejects.toThrow();
  });
});

describe('P15-2: correo repetido', () => {
  test('un correo ya registrado -> 409 "El correo ya está registrado" y no se crea otro usuario', async () => {
    const antes = await totalUsuarios();
    const r = await crear({ correo: 'gestor@demo.cl' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('El correo ya está registrado');
    expect(await totalUsuarios()).toBe(antes);
  });

  test('con otras mayúsculas también cuenta como repetido', async () => {
    expect((await crear({ correo: 'GESTOR@DEMO.CL' })).status).toBe(409);
  });

  test('P15-6: dos envíos iguales a la vez (doble clic) crean un solo usuario y una sola auditoría', async () => {
    const correo = correoNuevo();
    const antes = await auditorias('CREAR_USUARIO');
    const [a, b] = await Promise.all([crear({ correo }), crear({ correo })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await contar('SELECT count(*) AS n FROM usuario WHERE email = $1', [correo])).toBe(1);
    expect(await auditorias('CREAR_USUARIO')).toBe(antes + 1);
  });

  test('la base también rechaza el correo repetido (restricción UNIQUE)', async () => {
    await expect(admin("INSERT INTO usuario (nombre, email, password_hash, rol_id) VALUES ('x', 'gestor@demo.cl', 'HASH_NO_REAL', $1)", [ROL['Gestor de Información']])).rejects.toThrow();
  });
});

describe('Editar un usuario (PUT)', () => {
  let u;
  beforeAll(async () => { u = (await crear({ correo: 'editable@demo.cl', nombre: 'Editable' })).body; });
  const editar = (id, cambios, rol) => como(rol || 'gestor').put('/api/usuarios/' + id).send(Object.assign(
    { nombre: u.nombre, correo: u.correo, rolId: u.rolId, programaId: u.programaId }, cambios));

  test('cambiar solo el nombre: la auditoría guarda antes y después solo de ese campo', async () => {
    const r = await editar(u.id, { nombre: 'Nombre Cambiado' });
    expect(r.status).toBe(200);
    expect(r.body.nombre).toBe('Nombre Cambiado');
    const f = (await admin("SELECT detalle FROM log_auditoria WHERE accion = 'ACTUALIZAR_USUARIO' AND entidad_id = $1", [u.id])).rows;
    expect(f).toHaveLength(1);
    expect(f[0].detalle).toEqual({ antes: { nombre: 'Editable' }, despues: { nombre: 'Nombre Cambiado' } });
    u.nombre = 'Nombre Cambiado';
  });

  test('guardar sin cambios no deja auditoría', async () => {
    const antes = await auditorias('ACTUALIZAR_USUARIO');
    expect((await editar(u.id, {})).status).toBe(200);
    expect(await auditorias('ACTUALIZAR_USUARIO')).toBe(antes);
  });

  test('cambiar de programa registra el nombre del programa anterior y el nuevo', async () => {
    const r = await editar(u.id, { programaId: PROG['Salud Mental'] });
    expect(r.status).toBe(200);
    const f = (await admin("SELECT detalle FROM log_auditoria WHERE accion = 'ACTUALIZAR_USUARIO' AND entidad_id = $1 ORDER BY id DESC LIMIT 1", [u.id])).rows[0];
    expect(f.detalle).toEqual({ antes: { programa: 'Matronas' }, despues: { programa: 'Salud Mental' } });
    u.programaId = PROG['Salud Mental'];
  });

  test('el correo repetido al editar -> 409 y no cambia', async () => {
    const r = await editar(u.id, { correo: 'directora@demo.cl' });
    expect(r.status).toBe(409);
    expect((await admin('SELECT email FROM usuario WHERE id = $1', [u.id])).rows[0].email).toBe('editable@demo.cl');
  });

  test('las reglas de rol y programa también valen al editar (Jefe sin programa, Gestor con programa)', async () => {
    expect((await editar(u.id, { programaId: null })).status).toBe(400);
    expect((await editar(u.id, { rolId: ROL['Gestor de Información'] })).status).toBe(400);
  });

  test('la contraseña NO se cambia por esta vía: un campo "clave" en el cuerpo se ignora', async () => {
    const r = await editar(u.id, { clave: 'Otra-Clave-9999' });
    expect(r.status).toBe(200);
    expect((await login('editable@demo.cl', CLAVE_NUEVA)).status).toBe(200);
    expect((await login('editable@demo.cl', 'Otra-Clave-9999')).status).toBe(401);
  });

  test('el cambio de rol vale de inmediato con el mismo token (se vuelve a leer de la base en cada solicitud)', async () => {
    const sesion = await login('editable@demo.cl', CLAVE_NUEVA);
    const t = conToken(sesion.body.token);
    expect((await t.get('/api/cargas')).status).toBe(403);               // Jefe de Programa: no carga REM
    expect((await editar(u.id, { rolId: ROL['Subdirección'], programaId: null })).status).toBe(200);
    expect((await t.get('/api/cargas')).status).toBe(200);               // ahora es Subdirección
    expect((await editar(u.id, { rolId: ROL['Jefe de Programa'], programaId: PROG.Matronas })).status).toBe(200);
    expect((await t.get('/api/cargas')).status).toBe(403);               // y vuelve a perderlo
  });

  test('un usuario no puede cambiar su propio rol', async () => {
    const yo = (await como('gestor').get('/api/auth/yo')).body.usuario || (await como('gestor').get('/api/auth/yo')).body;
    const r = await como('gestor').put('/api/usuarios/' + yo.id).send({ nombre: yo.nombre, correo: yo.correo, rolId: ROL.Directora, programaId: null });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('rolId');
  });

  test.each([['9999'], ['0'], ['abc'], ['-1']])('editar o leer el usuario %s -> 404 "Usuario no encontrado"', async (x) => {
    const put = await como('gestor').put('/api/usuarios/' + x).send(cuerpo());
    const get = await como('gestor').get('/api/usuarios/' + x);
    expect([put.status, get.status]).toEqual([404, 404]);
    expect(get.body.error).toBe('Usuario no encontrado');
  });

  test('GET /api/usuarios/:id devuelve la ficha sin datos de contraseña', async () => {
    const r = await como('gestor').get('/api/usuarios/' + u.id);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body).toLowerCase()).not.toContain('hash');
  });
});

describe('P14-4: activar / desactivar', () => {
  // Cuenta de demostración que no usan las otras pruebas de este archivo: jefe.saludmental@demo.cl (id 5)
  const CORREO = 'jefe.saludmental@demo.cl';
  const idDe = async () => (await admin('SELECT id FROM usuario WHERE email = $1', [CORREO])).rows[0].id;
  const estado = async (id, activo, rol) => como(rol || 'gestor').patch(`/api/usuarios/${id}/estado`).send({ activo });

  test('al desactivar, la cuenta no puede iniciar sesión y su sesión abierta deja de servir al instante', async () => {
    const id = await idDe();
    expect((await como('jefeSaludMental').get('/api/reportes').query({ mes: '2026-06' })).status).toBe(200);
    const r = await estado(id, false);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cambiado: true, usuario: { activo: false } });
    const intento = await login(CORREO);
    expect(intento.status).toBe(401);
    expect(intento.body.error).toBe('Correo o contraseña incorrectos');
    expect((await como('jefeSaludMental').get('/api/reportes').query({ mes: '2026-06' })).status).toBe(401);
  });

  test('repetir la orden (doble clic) no cambia nada y no deja una segunda auditoría', async () => {
    const id = await idDe();
    const antes = await auditorias('DESACTIVAR_USUARIO');
    const r = await estado(id, false);
    expect(r.status).toBe(200);
    expect(r.body.cambiado).toBe(false);
    expect(await auditorias('DESACTIVAR_USUARIO')).toBe(antes);
  });

  test('al reactivar vuelve a entrar con su contraseña', async () => {
    const id = await idDe();
    const r = await estado(id, true);
    expect(r.body).toMatchObject({ cambiado: true, usuario: { activo: true } });
    expect((await login(CORREO)).status).toBe(200);
  });

  test('cada cambio queda en la auditoría con el estado anterior y el nuevo', async () => {
    const id = await idDe();
    const f = (await admin("SELECT accion, detalle FROM log_auditoria WHERE entidad = 'usuario' AND entidad_id = $1 AND accion IN ('ACTIVAR_USUARIO', 'DESACTIVAR_USUARIO') ORDER BY id", [id])).rows;
    expect(f.map((x) => x.accion)).toEqual(['DESACTIVAR_USUARIO', 'ACTIVAR_USUARIO']);
    expect(f[0].detalle).toEqual({ antes: { activo: true }, despues: { activo: false } });
  });

  test('dos órdenes iguales a la vez dejan una sola auditoría', async () => {
    const id = await idDe();
    const antes = await auditorias('DESACTIVAR_USUARIO');
    const [a, b] = await Promise.all([estado(id, false), estado(id, false)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.cambiado, b.body.cambiado].sort()).toEqual([false, true]);
    expect(await auditorias('DESACTIVAR_USUARIO')).toBe(antes + 1);
    await estado(id, true);
  });

  test('nadie puede desactivar su propia cuenta', async () => {
    const yo = await admin("SELECT id FROM usuario WHERE email = 'gestor@demo.cl'");
    const r = await estado(yo.rows[0].id, false);
    expect(r.status).toBe(400);
    expect((await como('gestor').get('/api/usuarios')).status).toBe(200);
  });

  test.each([['sí'], ['true'], [null], [1], [undefined]])('el valor %j no es verdadero/falso -> 400', async (activo) => {
    const id = await idDe();
    const r = await como('gestor').patch(`/api/usuarios/${id}/estado`).send(activo === undefined ? {} : { activo });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('activo');
  });

  test('un usuario que no existe -> 404', async () => {
    expect((await estado(9999, false)).status).toBe(404);
  });
});

describe('P14-1 y P15 acceso: solo el Gestor de Información', () => {
  test.each([['directora'], ['subdireccion'], ['jefe']])('%s recibe 403 en listar, crear, editar y cambiar estado, y no se modifica nada', async (rol) => {
    const antes = await totalUsuarios();
    expect((await como(rol).get('/api/usuarios')).status).toBe(403);
    expect((await crear({ correo: correoNuevo() }, rol)).status).toBe(403);
    expect((await como(rol).put('/api/usuarios/1').send(cuerpo())).status).toBe(403);
    expect((await como(rol).patch('/api/usuarios/1/estado').send({ activo: false })).status).toBe(403);
    expect(await totalUsuarios()).toBe(antes);
    expect((await admin('SELECT activo FROM usuario WHERE id = 1')).rows[0].activo).toBe(true);
  });
});
