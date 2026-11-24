'use strict';
// Listas que usan los filtros y formularios, y resolución del programa según el rol.
const db = require('../db');
const { E } = require('../middleware/errores');
const { ROL } = require('../lib/permisos');
const v = require('../lib/validaciones');

// Cortes IAAPS: por ahora son solo una etiqueta (la definición de cada corte está pendiente con el cliente).
const CORTES = ['Todos los cortes', 'Corte 1', 'Corte 2', 'Corte 3'];
const FORMATOS = ['CSV', 'XLSX'];
const ORIGENES = ['REM', 'POBLACION'];

// Períodos que tienen resultados: los de cargas VÁLIDAS (las "con errores" no cuentan), del más nuevo al más antiguo
async function periodosConDatos() {
  const r = await db.consultar(
    `SELECT DISTINCT c.periodo
       FROM carga_rem c
      WHERE EXISTS (SELECT 1 FROM resultado_indicador r WHERE r.carga_rem_id = c.id)
      ORDER BY c.periodo DESC`);
  return r.rows.map((x) => x.periodo);
}

function aniosDe(periodos) {
  const set = new Set(periodos.map((p) => p.slice(0, 4)));
  return Array.from(set).sort().reverse();
}

async function roles() {
  const r = await db.consultar('SELECT id, nombre, requiere_programa FROM rol ORDER BY id');
  return r.rows.map((x) => ({ id: x.id, nombre: x.nombre, requierePrograma: x.requiere_programa }));
}

async function todosLosProgramas() {
  const r = await db.consultar('SELECT id, nombre FROM programa ORDER BY nombre');
  return r.rows;
}

// El Jefe de Programa solo ve su propio programa
async function programasVisibles(usuario) {
  const todos = await todosLosProgramas();
  if (usuario.rol === ROL.JEFE) { return todos.filter((p) => p.id === usuario.programaId); }
  return todos;
}

// Decide el filtro de programa de una consulta:
//  - Jefe de Programa: siempre su programa; si pide otro programa -> 403 (P4-2, T-6)
//  - Otros roles: el programa pedido (debe existir) o ninguno (todos)
// 'crudo' es lo que llegó en la solicitud (puede faltar, venir vacío o ser cualquier cosa).
async function resolverPrograma(usuario, crudo) {
  const sinValor = crudo === undefined || crudo === null || crudo === '';
  if (usuario.rol === ROL.JEFE) {
    if (!sinValor) {
      const pedido = v.id(crudo);
      if (pedido.error || pedido.valor !== usuario.programaId) { throw E.prohibido('No tiene permiso para ver ese programa'); }
    }
    return usuario.programaId;
  }
  if (sinValor) { return null; }
  const pedido = v.id(crudo, 'Programa no válido');
  if (pedido.error) { throw E.solicitudInvalida('Programa no válido', { programaId: 'Programa no válido' }); }
  const existe = await db.consultar('SELECT 1 FROM programa WHERE id = $1', [pedido.valor]);
  if (existe.rowCount === 0) { throw E.solicitudInvalida('Programa no válido', { programaId: 'Programa no válido' }); }
  return pedido.valor;
}

async function obtenerTodo(usuario) {
  const periodos = await periodosConDatos();
  return {
    programas: await programasVisibles(usuario),
    roles: await roles(),
    periodos,
    anios: aniosDe(periodos),
    cortes: CORTES,
    formatos: FORMATOS,
    origenesDenominador: ORIGENES
  };
}

module.exports = { CORTES, FORMATOS, ORIGENES, periodosConDatos, aniosDe, roles, todosLosProgramas, programasVisibles, resolverPrograma, obtenerTodo };
