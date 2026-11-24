'use strict';
// Evaluación de una planilla REM contra los indicadores configurados. Es lógica pura (sin base de datos
// ni librería de Excel): recibe los valores ya leídos y devuelve el resumen de validación y los resultados.
//
// Reglas (informe, pantallas 9 y 10):
//  - Cada indicador dice en qué hoja (seccion) y celda está su numerador y, si el denominador viene del REM, su celda.
//  - Falta una hoja obligatoria, o una celda no contiene un número  -> la carga queda "Con errores" y NO se calculan resultados.
//  - Una celda vacía NO es error: vale 0 y se informa en celdas_vacias.
//  - El denominador "POBLACION" sale de lo ingresado a mano; si falta, el resultado queda sin calcular (null)
//    y se avisa, pero la carga es válida (la población se puede ingresar después).

const { normalizarCelda, mismaHoja } = require('./planilla');
const { calcularResultado } = require('./calculo');

const MAX_VALOR = 9999999999;   // límite de numeric(12,2)
const MAX_RESULTADO = 9999999.99;   // límite de numeric(9,2)

function recortar(t) { return t.length > 40 ? t.slice(0, 40) + '…' : t; }

function mensajeInvalida(n) {
  if (n.invalida === 'tiene un error de Excel') { return `La celda tiene un error de Excel (${recortar(n.texto)})`; }
  if (n.texto) { return `La celda ${n.invalida} (dice "${recortar(n.texto)}")`; }
  return `La celda ${n.invalida}`;
}

// Lista de celdas que hay que leer: [{ hoja, celda }] sin repetir
function celdasPedidas(indicadores) {
  const vistas = new Set(); const lista = [];
  indicadores.forEach((i) => {
    const hoja = i.seccion ? i.seccion.trim() : null;
    const celdas = [i.celda_numerador];
    if (i.origen_denominador === 'REM') { celdas.push(i.celda_denominador); }
    celdas.forEach((c) => {
      const k = (hoja === null ? '' : hoja.toLowerCase()) + '|' + c;
      if (!vistas.has(k)) { vistas.add(k); lista.push({ hoja, celda: c }); }
    });
  });
  return lista;
}

function evaluarRem(indicadores, planilla, poblacion) {
  const hojasPlanilla = planilla.hojas || [];
  const resumen = { hojas_leidas: 0, hojas_esperadas: 0, celdas_leidas: 0, celdas_vacias: [], errores: [], advertencias: [] };
  const resultados = [];

  if (indicadores.length === 0) {
    resumen.errores.push({ hoja: '', celda: '', problema: 'No hay indicadores activos para calcular' });
    return { resumen, resultados };
  }

  // Hojas obligatorias (una por cada "seccion" distinta; sin seccion = primera hoja)
  const esperadas = []; const claveEsperada = new Set();
  indicadores.forEach((i) => {
    const k = i.seccion ? i.seccion.trim().toLowerCase() : '';
    if (!claveEsperada.has(k)) { claveEsperada.add(k); esperadas.push(i.seccion ? i.seccion.trim() : null); }
  });
  resumen.hojas_esperadas = esperadas.length;

  const nombreReal = new Map();        // clave de sección -> nombre real de la hoja en la planilla
  esperadas.forEach((s) => {
    const real = s === null ? hojasPlanilla[0] : hojasPlanilla.find((h) => mismaHoja(h, s));
    const k = s === null ? '' : s.toLowerCase();
    if (real === undefined) {
      resumen.errores.push({ hoja: s === null ? '(primera hoja)' : s, celda: '', problema: s === null ? 'La planilla no tiene hojas' : `Falta la hoja obligatoria "${s}"` });
    } else {
      nombreReal.set(k, real);
      resumen.hojas_leidas++;
    }
  });

  const celdasVistas = new Set();
  const errorCeldaVista = new Set();
  const valores = new Map();           // 'hojaReal|celda' -> número (las vacías valen 0)

  function leer(ind, hojaKey, celda) {
    const real = nombreReal.get(hojaKey);
    if (real === undefined) { return null; }          // la hoja falta: ya está informado
    const clave = real + '|' + celda;
    if (!celdasVistas.has(clave)) {
      celdasVistas.add(clave);
      resumen.celdas_leidas++;
      const crudo = planilla.libro && planilla.libro[real] ? planilla.libro[real][celda] : undefined;
      const n = normalizarCelda(crudo);
      if (n.vacia) {
        resumen.celdas_vacias.push({ hoja: real, celda, indicador: ind.rem_codigo });
        valores.set(clave, 0);
      } else if (n.invalida) {
        resumen.errores.push({ hoja: real, celda, problema: mensajeInvalida(n) });
        errorCeldaVista.add(clave);
      } else if (n.numero < 0) {
        resumen.errores.push({ hoja: real, celda, problema: 'El valor es negativo' });
        errorCeldaVista.add(clave);
      } else if (n.numero > MAX_VALOR) {
        resumen.errores.push({ hoja: real, celda, problema: 'El valor es demasiado grande' });
        errorCeldaVista.add(clave);
      } else {
        valores.set(clave, n.numero);
      }
    }
    return clave;
  }

  const filas = indicadores.map((i) => {
    const hojaKey = i.seccion ? i.seccion.trim().toLowerCase() : '';
    const kNum = leer(i, hojaKey, i.celda_numerador);
    let kDen = null;
    if (i.origen_denominador === 'REM') { kDen = leer(i, hojaKey, i.celda_denominador); }
    return { i, kNum, kDen };
  });

  // Aviso de población faltante (no es un error)
  indicadores.forEach((i) => {
    if (i.origen_denominador === 'POBLACION' && !(poblacion && poblacion[i.id] > 0)) {
      resumen.advertencias.push(`Falta ingresar la población de ${i.rem_codigo} para este período`);
    }
  });

  if (resumen.errores.length > 0) { return { resumen, resultados: [] }; }

  filas.forEach(({ i, kNum, kDen }) => {
    const numerador = valores.get(kNum);
    let denominador;
    if (i.origen_denominador === 'REM') { denominador = valores.get(kDen); }
    else { denominador = poblacion && poblacion[i.id] > 0 ? poblacion[i.id] : 0; }
    const resultado = calcularResultado(numerador, denominador);
    if (resultado !== null && resultado > MAX_RESULTADO) {
      resumen.errores.push({ hoja: '', celda: '', problema: `El resultado de ${i.rem_codigo} es demasiado grande: revise su numerador y su denominador` });
    }
    resultados.push({ indicadorId: i.id, numerador, denominador, resultado });
  });
  if (resumen.errores.length > 0) { return { resumen, resultados: [] }; }
  return { resumen, resultados };
}

module.exports = { evaluarRem, celdasPedidas, MAX_VALOR, MAX_RESULTADO };
