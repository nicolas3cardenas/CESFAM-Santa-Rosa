'use strict';
// Arma el informe de resultados de las pruebas (lo ESPERADO por el plan frente a lo OBTENIDO al ejecutarlo).
//
//   1) npm run test:cobertura        -> deja resultados/jest.json y resultados/cobertura/
//   2) (opcional) k6 run --summary-export=resultados/k6.json ../k6/carga.js
//   3) (opcional) resultados/manual.json con lo que se probó a mano o con Playwright (ver docs/PRUEBAS.md)
//   4) npm run informe               -> escribe docs/resultados_pruebas.md y docs/resultados_pruebas.csv
//
// Cada prueba automática lleva en su nombre el código del plan (P5-1, T-6...). Este script relaciona ambos.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DOCS = path.join(RAIZ, '..', 'docs');
const casos = require('../test/casos_plan.json');

function leerJson(ruta) {
  if (!fs.existsSync(ruta)) { return null; }
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '')); } catch (e) { console.error('No se pudo leer ' + ruta + ': ' + e.message); return null; }
}

const jest = leerJson(path.join(RAIZ, 'resultados', 'jest.json'));
if (!jest) {
  console.error('No encuentro resultados/jest.json. Primero ejecute:  npm run test:cobertura');
  process.exit(1);
}
const cobertura = leerJson(path.join(RAIZ, 'resultados', 'cobertura', 'coverage-summary.json'));
const manual = leerJson(path.join(RAIZ, 'resultados', 'manual.json')) || {};
const k6 = leerJson(path.join(RAIZ, 'resultados', 'k6.json'));

// ---------------------------------------------------------------------------------------------
// 1. Todas las pruebas automáticas (una por "it/test", con cada fila de test.each por separado)
// ---------------------------------------------------------------------------------------------
const pruebas = [];
(jest.testResults || []).forEach((archivo) => {
  (archivo.assertionResults || []).forEach((a) => {
    pruebas.push({
      archivo: path.basename(archivo.name || ''),
      nombre: a.fullName || ((a.ancestorTitles || []).concat(a.title).join(' ')),
      estado: a.status,
      mensaje: (a.failureMessages || []).join('\n').split('\n')[0] || ''
    });
  });
  // Un archivo que ni siquiera pudo arrancar (error de sintaxis, falta una variable del .env...) también cuenta como falla
  if ((archivo.assertionResults || []).length === 0 && archivo.status === 'failed') {
    pruebas.push({ archivo: path.basename(archivo.name || ''), nombre: '(el archivo de pruebas no pudo ejecutarse)', estado: 'failed', mensaje: String(archivo.message || '').split('\n')[0] });
  }
});

// Códigos del plan que aparecen en el nombre de una prueba. Entiende "P13-1 a P13-8" y "P9-1, P9-2".
function codigosDe(texto) {
  const salida = new Set();
  let m;
  const re = /(?<![A-Za-z0-9-])([PT]\d*-\d+)(?!\d)/g;
  while ((m = re.exec(texto)) !== null) { salida.add(m[1]); }
  const reRango = /(?<![A-Za-z0-9-])(P\d+)-(\d+)\s+a\s+(?:P\d+-)?(\d+)(?!\d)/g;
  while ((m = reRango.exec(texto)) !== null) {
    for (let i = Number(m[2]); i <= Number(m[3]); i += 1) { salida.add(`${m[1]}-${i}`); }
  }
  return salida;
}
pruebas.forEach((p) => { p.codigos = codigosDe(p.nombre); });

const porCodigo = {};
pruebas.forEach((p) => p.codigos.forEach((c) => { (porCodigo[c] = porCodigo[c] || []).push(p); }));

const total = pruebas.length;
const aprobadas = pruebas.filter((p) => p.estado === 'passed').length;
const falladas = pruebas.filter((p) => p.estado === 'failed').length;
const omitidas = total - aprobadas - falladas;

// ---------------------------------------------------------------------------------------------
// 2. Cada fila del plan: esperado vs obtenido
// ---------------------------------------------------------------------------------------------
const AUTO = /Jest|Supertest/;
const OTRO = /Playwright|[Mm]anual|k6|pgAdmin/;

function evaluarK6(codigo) {
  if (!k6 || (codigo !== 'P5-6' && codigo !== 'T-11')) { return null; }
  const m = k6.metrics || {};
  const dur = m.http_req_duration && (m.http_req_duration.values || m.http_req_duration);
  const fallos = m.http_req_failed && (m.http_req_failed.values || m.http_req_failed);
  if (!dur) { return null; }
  const p95 = dur['p(95)'];
  const maximo = dur.max === undefined ? p95 : dur.max;
  const tasa = fallos ? (fallos.rate !== undefined ? fallos.rate : fallos.value) : 0;
  const ok = p95 < 3000 && maximo < 3000 && (tasa || 0) === 0;
  return {
    estado: ok ? 'Cumple' : 'No cumple',
    obtenido: `k6 con 10 usuarios: p(95) = ${Math.round(p95)} ms, máximo = ${Math.round(maximo)} ms (límite 3000 ms); solicitudes con error: ${((tasa || 0) * 100).toFixed(2)} %`
  };
}

function evaluar(caso) {
  const tieneAuto = AUTO.test(caso.tipo);
  const tieneOtro = OTRO.test(caso.tipo);
  const lista = porCodigo[caso.codigo] || [];
  const partes = [];
  let fallo = false;
  let pendiente = false;
  let automaticaOk = false;

  if (lista.length > 0) {
    const ok = lista.filter((p) => p.estado === 'passed').length;
    const mal = lista.filter((p) => p.estado === 'failed').length;
    partes.push(`Automática: ${ok} de ${lista.length} pruebas aprobadas` + (mal ? ` (${mal} con falla)` : ''));
    if (mal > 0) { fallo = true; } else if (ok > 0) { automaticaOk = true; }
  } else if (tieneAuto) {
    partes.push('Automática: no hay una prueba con este código');
    pendiente = true;
  }

  let manualOk = false;
  const ext = evaluarK6(caso.codigo);
  const reg = manual[caso.codigo];
  if (ext) {
    partes.push(ext.obtenido);
    if (ext.estado === 'Cumple') { manualOk = true; } else { fallo = true; }
  }
  if (reg) {
    partes.push(`Registro ${reg.responsable ? 'de ' + reg.responsable : 'manual'}${reg.fecha ? ' (' + reg.fecha + ')' : ''}: ${reg.obtenido || reg.estado}`);
    if (/^cumple/i.test(reg.estado)) { manualOk = true; } else { fallo = true; }
  }
  const necesitaOtro = tieneOtro && !ext && !reg;
  if (necesitaOtro) { partes.push('Falta registrar la ejecución ' + (caso.tipo.match(/Playwright/) ? 'Playwright' : caso.tipo.match(/k6/) ? 'k6' : 'manual')); }

  let estado;
  if (fallo) { estado = 'No cumple'; }
  else if (tieneAuto && !tieneOtro && automaticaOk) { estado = 'Cumple'; }
  else if (!tieneAuto && manualOk) { estado = 'Cumple'; }
  else if (tieneAuto && tieneOtro && automaticaOk && manualOk) { estado = 'Cumple'; }
  else if (automaticaOk && necesitaOtro) { estado = 'Parcial'; }
  else if (pendiente && !necesitaOtro && !manualOk) { estado = 'Sin cubrir'; }
  else { estado = 'Pendiente'; }
  return { estado, obtenido: partes.join('. ') };
}

const filas = casos.map((c) => Object.assign({}, c, evaluar(c)));
const cuenta = (estado) => filas.filter((f) => f.estado === estado).length;

// ---------------------------------------------------------------------------------------------
// 3. Armado del documento
// ---------------------------------------------------------------------------------------------
const ahora = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' });
const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const pct = (x) => (x === undefined || x === null ? 'n/d' : `${Number(x).toFixed(1)} %`);

const md = [];
md.push('# Resultados de las pruebas: esperado frente a obtenido');
md.push('');
md.push(`Sistema de metas sanitarias del CESFAM Santa Rosa. Informe generado automáticamente el ${ahora} con \`npm run informe\`.`);
md.push('');
md.push('## 1. Resumen');
md.push('');
md.push('| Medida | Resultado |');
md.push('|---|---|');
md.push(`| Pruebas automáticas ejecutadas | ${total} |`);
md.push(`| Aprobadas | ${aprobadas} |`);
md.push(`| Con falla | ${falladas} |`);
if (omitidas) { md.push(`| Omitidas | ${omitidas} |`); }
md.push(`| Casos del plan de pruebas | ${filas.length} |`);
md.push(`| Casos que cumplen | ${cuenta('Cumple')} |`);
md.push(`| Casos parciales (la parte automática pasa; falta registrar la manual, Playwright o k6) | ${cuenta('Parcial')} |`);
md.push(`| Casos pendientes de ejecutar | ${cuenta('Pendiente')} |`);
md.push(`| Casos sin prueba con su código | ${cuenta('Sin cubrir')} |`);
md.push(`| Casos que no cumplen | ${cuenta('No cumple')} |`);
md.push('');
if (cobertura && cobertura.total) {
  const t = cobertura.total;
  md.push('## 2. Cobertura del código por las pruebas automáticas');
  md.push('');
  md.push('| Sentencias | Ramas | Funciones | Líneas |');
  md.push('|---|---|---|---|');
  md.push(`| ${pct(t.statements.pct)} | ${pct(t.branches.pct)} | ${pct(t.functions.pct)} | ${pct(t.lines.pct)} |`);
  md.push('');
} else {
  md.push('## 2. Cobertura del código');
  md.push('');
  md.push('No hay datos de cobertura. Ejecute `npm run test:cobertura` y luego `npm run informe`.');
  md.push('');
}

md.push('## 3. Cobertura del plan de pruebas por tipo');
md.push('');
md.push('| Tipo de prueba | Casos del plan | Cumplen |');
md.push('|---|---|---|');
[['Unitaria (Jest)', /Jest/], ['Integral (Supertest)', /Supertest/], ['Recorrido completo (Playwright)', /Playwright/], ['Manual / pgAdmin', /[Mm]anual|pgAdmin/], ['Rendimiento (k6)', /k6/]].forEach(([nombre, re]) => {
  const sel = filas.filter((f) => re.test(f.tipo));
  md.push(`| ${nombre} | ${sel.length} | ${sel.filter((f) => f.estado === 'Cumple').length} |`);
});
md.push('');
md.push('Un caso puede tener más de un tipo (por ejemplo, unitaria y manual), por eso las filas no suman el total.');
md.push('');

md.push('## 4. Comparación entre lo esperado y lo obtenido');
md.push('');
md.push('| Código | Qué se prueba | Resultado esperado | Si el dato no es válido | Tipo | Resultado obtenido | Estado |');
md.push('|---|---|---|---|---|---|---|');
filas.forEach((f) => {
  md.push(`| ${f.codigo} | ${esc(f.control)} | ${esc(f.esperado)} | ${esc(f.siInvalido)} | ${esc(f.tipo)} | ${esc(f.obtenido)} | **${f.estado}** |`);
});
md.push('');

const malas = pruebas.filter((p) => p.estado === 'failed');
md.push('## 5. Pruebas automáticas con falla');
md.push('');
if (malas.length === 0) { md.push('Ninguna.'); } else {
  md.push('| Archivo | Prueba | Mensaje |');
  md.push('|---|---|---|');
  malas.forEach((p) => md.push(`| ${esc(p.archivo)} | ${esc(p.nombre)} | ${esc(p.mensaje).slice(0, 200)} |`));
}
md.push('');

const sinCodigo = pruebas.filter((p) => p.codigos.size === 0);
md.push('## 6. Pruebas automáticas adicionales al plan');
md.push('');
md.push(`${sinCodigo.length} de las ${total} pruebas no llevan el código de un caso del plan: son comprobaciones extra (límites, concurrencia, auditoría, privilegios de la base de datos).`);
md.push('');
const porArchivo = {};
pruebas.forEach((p) => { porArchivo[p.archivo] = porArchivo[p.archivo] || { total: 0, aprobadas: 0 }; porArchivo[p.archivo].total += 1; if (p.estado === 'passed') { porArchivo[p.archivo].aprobadas += 1; } });
md.push('| Archivo de pruebas | Pruebas | Aprobadas |');
md.push('|---|---|---|');
Object.keys(porArchivo).sort().forEach((a) => md.push(`| ${a} | ${porArchivo[a].total} | ${porArchivo[a].aprobadas} |`));
md.push('');

md.push('## 7. Cómo se obtuvieron estos resultados');
md.push('');
md.push('1. `npm run db:crear:test` crea la base de pruebas (nombre terminado en `_test`).');
md.push('2. `npm run test:cobertura` ejecuta todas las pruebas automáticas y mide la cobertura.');
md.push('3. `k6 run --summary-export=resultados/k6.json ../k6/carga.js` mide los tiempos con 10 usuarios simultáneos.');
md.push('4. Lo probado a mano o con Playwright se anota en `resultados/manual.json` (ejemplo en `docs/PRUEBAS.md`).');
md.push('5. `npm run informe` genera este documento.');
md.push('');

fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(path.join(DOCS, 'resultados_pruebas.md'), md.join('\n'), 'utf8');

const csv = ['Código;Qué se prueba;Resultado esperado;Si el dato no es válido;Tipo;Resultado obtenido;Estado'];
const celdaCsv = (t) => '"' + String(t || '').replace(/"/g, '""') + '"';
filas.forEach((f) => csv.push([f.codigo, f.control, f.esperado, f.siInvalido, f.tipo, f.obtenido, f.estado].map(celdaCsv).join(';')));
fs.writeFileSync(path.join(DOCS, 'resultados_pruebas.csv'), '﻿' + csv.join('\r\n') + '\r\n', 'utf8');

console.log(`Pruebas automáticas: ${aprobadas} aprobadas, ${falladas} con falla, de ${total}.`);
console.log(`Plan de pruebas (${filas.length} casos): ${cuenta('Cumple')} cumplen, ${cuenta('Parcial')} parciales, ${cuenta('Pendiente')} pendientes, ${cuenta('Sin cubrir')} sin prueba con su código, ${cuenta('No cumple')} no cumplen.`);
console.log('Escribí docs/resultados_pruebas.md y docs/resultados_pruebas.csv');
if (falladas > 0 || cuenta('No cumple') > 0) { process.exitCode = 2; }
