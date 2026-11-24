'use strict';
// Matriz de permisos por rol (informe, sección 6.2; igual a la del prototipo).
// El servidor la revisa en CADA solicitud: ocultar un botón en la pantalla no es seguridad.

const ROL = {
  DIRECTORA: 'Directora',
  SUBDIRECCION: 'Subdirección',
  GESTOR: 'Gestor de Información',
  JEFE: 'Jefe de Programa'
};

const D = ROL.DIRECTORA; const S = ROL.SUBDIRECCION; const G = ROL.GESTOR; const J = ROL.JEFE;

const ACCIONES = {
  dashboard: [D, S],
  comparativo: [D, S],
  reportes: [D, S, J],          // el Jefe solo ve su programa (lo filtra el servidor)
  detalleIndicador: [D, S, J],
  exportar: [D, S, J],
  verComentarios: [D, S, J],
  comentar: [J],                // solo el Jefe, solo en indicadores de su programa
  cargarRem: [S, G],
  ingresarPoblacion: [S, G],
  parametrizarIndicadores: [S, G],
  gestionarUsuarios: [G],
  verAuditoria: [G]
};

function puede(rol, accion) {
  const permitidos = ACCIONES[accion];
  return Array.isArray(permitidos) && permitidos.indexOf(rol) >= 0;
}

function permisosDe(rol) {
  const salida = {};
  Object.keys(ACCIONES).forEach((a) => { salida[a] = puede(rol, a); });
  return salida;
}

module.exports = { ROL, ACCIONES, puede, permisosDe };
