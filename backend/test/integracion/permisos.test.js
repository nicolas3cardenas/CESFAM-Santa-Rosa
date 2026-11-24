'use strict';
// Pruebas de integración de los permisos por rol (plan de pruebas: T-5, T-6, P4-2, P7-4, P9-5, P11-6, P12-3, P14-1, P16-4, P17-1).
// El servidor decide en cada solicitud: aquí se pide cada ruta con cada rol, también modificando la solicitud
// como lo haría alguien que se salta los botones de la pantalla.
const { reiniciarBD, cerrarPoolDeLaApp } = require('../ayudas/bd');
const api = require('../ayudas/api');
const { como } = api;

beforeAll(async () => { await reiniciarBD(); await api.sesiones(); });
afterAll(async () => { await cerrarPoolDeLaApp(); });

const D = 'directora'; const S = 'subdireccion'; const G = 'gestor'; const J = 'jefe';
const TODOS = [D, S, G, J];

// [método, ruta, cuerpo, roles que SÍ pueden]
const MATRIZ = [
  ['get', '/api/catalogos', null, TODOS],
  ['get', '/api/dashboard', null, [D, S]],
  ['get', '/api/comparativo?anioActual=2026&anioComparar=2025', null, [D, S]],
  ['get', '/api/reportes', null, [D, S, J]],
  ['get', '/api/indicadores/1/detalle', null, [D, S, J]],
  ['get', '/api/indicadores/1/comentarios', null, [D, S, J]],
  ['get', '/api/exportar?formato=CSV&periodo=2026-06', null, [D, S, J]],
  ['get', '/api/indicadores', null, [S, G]],
  ['get', '/api/indicadores/1', null, [S, G]],
  ['get', '/api/cargas', null, [S, G]],
  ['get', '/api/cargas/1', null, [S, G]],
  ['get', '/api/poblacion?periodo=2026-06', null, [S, G]],
  ['get', '/api/usuarios', null, [G]],
  ['get', '/api/usuarios/1', null, [G]],
  ['get', '/api/auditoria', null, [G]]
];

describe('T-5: cada rol solo entra a lo suyo (lecturas)', () => {
  MATRIZ.forEach(([metodo, ruta, cuerpo, permitidos]) => {
    test(`${metodo.toUpperCase()} ${ruta.split('?')[0]}: permitido a ${permitidos.join(', ')}`, async () => {
      for (const rol of TODOS) {
        const r = await como(rol)[metodo](ruta);
        if (permitidos.indexOf(rol) >= 0) {
          expect(r.status).toBe(200);
        } else {
          expect(r.status).toBe(403);
          expect(r.body).toEqual({ error: 'No tiene permiso para realizar esta acción' });   // sin ningún dato de la ruta bloqueada
        }
      }
    });
  });
});

describe('T-5: cada rol solo hace lo suyo (escrituras, también con datos inválidos: el permiso se revisa primero)', () => {
  const ESCRITURAS = [
    ['P9-5: cargar un REM', 'post', '/api/cargas', {}, [S, G]],
    ['P11-6: ingresar población', 'post', '/api/poblacion', { indicadorId: 2, periodo: '2026-07', valor: 100 }, [S, G]],
    ['P12-3: crear un indicador', 'post', '/api/indicadores', {}, [S, G]],
    ['P12-3: editar un indicador', 'put', '/api/indicadores/1', {}, [S, G]],
    ['P14-1: crear un usuario', 'post', '/api/usuarios', {}, [G]],
    ['P14-1: editar un usuario', 'put', '/api/usuarios/4', {}, [G]],
    ['P14-4: activar o desactivar un usuario', 'patch', '/api/usuarios/4/estado', {}, [G]],
    ['P7-4: comentar un indicador', 'post', '/api/indicadores/1/comentarios', {}, [J]]
  ];
  ESCRITURAS.forEach(([titulo, metodo, ruta, cuerpo, permitidos]) => {
    test(`${titulo}: solo ${permitidos.join(', ')}`, async () => {
      for (const rol of TODOS) {
        if (permitidos.indexOf(rol) >= 0) { continue; }
        const r = await como(rol)[metodo](ruta).send(cuerpo);
        expect(r.status).toBe(403);
        expect(r.body).toEqual({ error: 'No tiene permiso para realizar esta acción' });
      }
    });
  });

  test('P16-4: la auditoría solo la ve el Gestor y nadie puede modificarla ni borrarla (405)', async () => {
    for (const rol of [D, S, J]) { expect((await como(rol).get('/api/auditoria')).status).toBe(403); }
    for (const metodo of ['post', 'put', 'patch', 'delete']) {
      const r = await como(G)[metodo]('/api/auditoria').send({});
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('GET');
    }
    expect((await como(G).delete('/api/auditoria/1')).status).toBe(405);
  });
});

describe('P17-1 / T-6: el rechazo no muestra datos y el Jefe se queda en su programa', () => {
  test('P17-1: el Jefe de Programa que pide la lista de usuarios recibe 403 sin ningún dato de usuarios', async () => {
    const r = await como(J).get('/api/usuarios');
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain('demo.cl');
  });

  test('T-6: el Jefe de Matronas pide indicadores de Salud Mental por todas las vías y recibe 403', async () => {
    const rutas = ['/api/indicadores/3/detalle', '/api/indicadores/3/comentarios'];
    for (const ruta of rutas) { expect((await como(J).get(ruta)).status).toBe(403); }
    expect((await como(J).get('/api/reportes?programaId=2')).status).toBe(403);
    expect((await como(J).get('/api/exportar?formato=CSV&periodo=2026-06&programaId=2')).status).toBe(403);
    expect((await como(J).post('/api/indicadores/3/comentarios').send({ periodo: '2026-06', texto: 'x' })).status).toBe(403);
  });

  test('T-6: el Jefe de Salud Mental ve lo suyo y no lo de Matronas', async () => {
    const mio = await como('jefeSaludMental').get('/api/reportes').query({ mes: '2026-06' });
    expect(mio.body.filas.map((f) => f.codigo)).toEqual(['IND-03']);
    expect((await como('jefeSaludMental').get('/api/indicadores/1/detalle')).status).toBe(403);
  });

  test('T-5: una ruta que no existe responde 404 con mensaje genérico y sin pistas técnicas', async () => {
    const r = await como(D).get('/api/no-existe');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Ruta no encontrada' });
  });
});
