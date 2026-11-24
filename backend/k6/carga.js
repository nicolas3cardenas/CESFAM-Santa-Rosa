// Prueba de carga con k6 (plan de pruebas: T-11 y P5-6, requisito RNF-03: cada respuesta en menos de 3 segundos).
//
// Simula 10 personas usando el sistema a la vez durante 1 minuto: la Directora mira el dashboard y el comparativo,
// la Subdirección consulta reportes y exporta, y una Jefa de Programa revisa los reportes de su programa.
//
// Antes de correrla:
//   1. Tenga el servidor andando (en otra terminal):   npm run dev
//   2. La base debe tener los datos de demostración:     npm run db:crear   (carga database/06_datos_demo.sql)
//   3. Instale k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/). En Windows:  winget install k6
//
// Cómo correrla (desde la carpeta backend):
//   k6 run --summary-export=resultados/k6.json k6/carga.js
//   (otra dirección: k6 run -e BASE_URL=http://localhost:3001 k6/carga.js)
//
// Luego "npm run informe" lee resultados/k6.json y completa los casos T-11 y P5-6.
// OJO: esta prueba hace inicios de sesión; el límite de la API es de 30 solicitudes de autenticación cada 15 minutos
// por dirección IP. Si la repite varias veces seguidas, espere 15 minutos o reinicie el servidor.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3001';
const CLAVE = __ENV.CLAVE_DEMO || 'ClaveDemo2026';

export const options = {
  scenarios: {
    diez_personas: { executor: 'constant-vus', vus: 10, duration: '1m' }
  },
  thresholds: {
    // RNF-03: ninguna consulta pasa de 3 segundos
    http_req_duration: ['p(95)<3000', 'max<3000'],
    // y ninguna debe fallar
    http_req_failed: ['rate==0'],
    checks: ['rate==1']
  }
};

function ingresar(correo) {
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ correo, clave: CLAVE }), { headers: { 'Content-Type': 'application/json' } });
  if (r.status !== 200) { fail(`No se pudo iniciar sesión como ${correo}: ${r.status} ${r.body}`); }
  return r.json('token');
}

// Se ejecuta una sola vez antes de empezar: inicia sesión con tres cuentas de la demostración
export function setup() {
  const directora = ingresar('directora@demo.cl');
  const subdireccion = ingresar('subdireccion@demo.cl');
  const jefe = ingresar('jefe.matronas@demo.cl');
  const cat = http.get(`${BASE}/api/catalogos`, { headers: { Authorization: `Bearer ${directora}` } });
  if (cat.status !== 200) { fail('No se pudo leer /api/catalogos: ' + cat.status); }
  const periodos = cat.json('periodos');
  const anios = cat.json('anios');
  if (!periodos || periodos.length === 0 || !anios || anios.length < 2) {
    fail('La base no tiene los datos de demostración (npm run db:crear).');
  }
  return { directora, subdireccion, jefe, periodo: periodos[0], anioActual: anios[0], anioComparar: anios[1] };
}

const con = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export default function (d) {
  // El número de la persona (1 a 10) decide qué hace; así las cuatro consultas del plan se reparten
  const quien = (__VU - 1) % 4;
  let r;

  if (quien === 0) {
    r = http.get(`${BASE}/api/dashboard`, con(d.directora));
    check(r, { 'dashboard 200': (x) => x.status === 200 });
    r = http.get(`${BASE}/api/comparativo?anioActual=${d.anioActual}&anioComparar=${d.anioComparar}`, con(d.directora));
    check(r, { 'comparativo 200': (x) => x.status === 200 });
  } else if (quien === 1) {
    r = http.get(`${BASE}/api/reportes?mes=${d.periodo}`, con(d.subdireccion));
    check(r, { 'reportes 200': (x) => x.status === 200 });
    r = http.get(`${BASE}/api/exportar?formato=CSV&periodo=${d.periodo}`, con(d.subdireccion));
    check(r, { 'exportar CSV 200': (x) => x.status === 200 && x.body.indexOf('Indicador') >= 0 });
  } else if (quien === 2) {
    r = http.get(`${BASE}/api/reportes?mes=${d.periodo}`, con(d.jefe));
    check(r, { 'reportes del Jefe 200': (x) => x.status === 200 });
    r = http.get(`${BASE}/api/indicadores/1/detalle`, con(d.jefe));
    check(r, { 'detalle 200': (x) => x.status === 200 });
  } else {
    r = http.get(`${BASE}/api/exportar?formato=XLSX&periodo=${d.periodo}`, con(d.subdireccion));
    check(r, { 'exportar XLSX 200': (x) => x.status === 200 && x.body.length > 1000 });
    r = http.get(`${BASE}/api/dashboard?periodo=${d.periodo}`, con(d.directora));
    check(r, { 'dashboard de un mes 200': (x) => x.status === 200 });
  }
  sleep(1);
}
