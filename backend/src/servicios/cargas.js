'use strict';
// Carga del REM (pantallas 9 y 10): valida el archivo, lo lee, calcula los resultados y deja el historial.
const db = require('../db');
const { E, ErrorHttp } = require('../middleware/errores');
const planilla = require('../lib/planilla');
const { evaluarRem, celdasPedidas } = require('../lib/rem');
const auditoria = require('./auditoria');

const SQL_INDICADORES_ACTIVOS = `
  SELECT id, rem_codigo, seccion, celda_numerador, origen_denominador, celda_denominador
    FROM indicador WHERE activo ORDER BY id`;

function estadoDe(resumen) { return resumen && Array.isArray(resumen.errores) && resumen.errores.length > 0 ? 'Con errores' : 'Validada'; }

function aApi(f) {
  const resumen = f.resumen_validacion || {};
  return {
    id: f.id, periodo: f.periodo, archivo: f.archivo_nombre, usuario: f.usuario, fecha: f.fecha_carga,
    estado: estadoDe(resumen), resumen,
    totales: {
      errores: Array.isArray(resumen.errores) ? resumen.errores.length : 0,
      celdasVacias: Array.isArray(resumen.celdas_vacias) ? resumen.celdas_vacias.length : 0,
      advertencias: Array.isArray(resumen.advertencias) ? resumen.advertencias.length : 0
    },
    resultadosCreados: f.n_resultados
  };
}

const SELECT_CARGA = `
  SELECT c.id, c.periodo, c.archivo_nombre, c.fecha_carga, c.resumen_validacion, u.nombre AS usuario,
         (SELECT count(*) FROM resultado_indicador r WHERE r.carga_rem_id = c.id) AS n_resultados
    FROM carga_rem c JOIN usuario u ON u.id = c.usuario_id`;

async function obtener(id) {
  const r = await db.consultar(`${SELECT_CARGA} WHERE c.id = $1`, [id]);
  if (r.rowCount === 0) { throw E.noEncontrado('Carga no encontrada'); }
  return aApi(r.rows[0]);
}

async function listar(pagina, tamano) {
  const total = await db.consultar('SELECT count(*) AS n FROM carga_rem');
  const r = await db.consultar(`${SELECT_CARGA} ORDER BY c.fecha_carga DESC, c.id DESC LIMIT $1 OFFSET $2`, [tamano, (pagina - 1) * tamano]);
  return { total: total.rows[0].n, pagina, tamano, cargas: r.rows.map(aApi) };
}

// archivo = { nombre, buffer }. El período ya viene validado (AAAA-MM).
async function procesar(usuario, periodo, archivo) {
  // 1. Revisión del archivo ANTES de leerlo (extensión, tamaño, estructura ZIP, macros)
  const revision = planilla.validarArchivo(archivo);
  if (!revision.ok) { throw new ErrorHttp(revision.estado, revision.error); }

  // 2. Lectura de las celdas que usan los indicadores activos
  const indicadores = (await db.consultar(SQL_INDICADORES_ACTIVOS)).rows;
  let lectura;
  try {
    lectura = await planilla.extraerCeldas(archivo.buffer, celdasPedidas(indicadores));
  } catch (err) {
    // Un archivo que parecía Excel pero no se puede abrir (dañado, con XML roto, etc.)
    throw new ErrorHttp(400, 'El archivo no es una planilla Excel válida');
  }

  // 3. Evaluación y guardado en una sola transacción. El candado por período evita que una carga y
  //    un ingreso de población del mismo mes se pisen entre sí (también lo toma poblacion.ingresar).
  const idCarga = await db.transaccion(async (cl) => {
    await cl.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['periodo:' + periodo]);
    const pob = await cl.query(
      `SELECT p.indicador_id, p.valor FROM poblacion_denominador p
        WHERE p.periodo = $1`, [periodo]);
    const poblacion = {};
    pob.rows.forEach((x) => { poblacion[x.indicador_id] = x.valor; });

    const { resumen, resultados } = evaluarRem(indicadores, lectura, poblacion);
    if (revision.macros) { resumen.advertencias.push('El archivo contiene macros: no se ejecutan, solo se leyeron los valores de las celdas'); }

    const ins = await cl.query(
      'INSERT INTO carga_rem (periodo, archivo_nombre, usuario_id, resumen_validacion) VALUES ($1, $2, $3, $4::jsonb) RETURNING id',
      [periodo, archivo.nombre, usuario.id, JSON.stringify(resumen)]);
    const id = ins.rows[0].id;
    for (const r of resultados) {
      await cl.query(
        `INSERT INTO resultado_indicador (indicador_id, carga_rem_id, valor_numerador, valor_denominador, valor_resultado)
         VALUES ($1, $2, $3, $4, $5)`, [r.indicadorId, id, r.numerador, r.denominador, r.resultado]);
    }
    await auditoria.registrar(cl, {
      usuarioId: usuario.id, accion: 'CARGA_REM', entidad: 'carga_rem', entidadId: id,
      detalle: { antes: null, despues: { periodo, archivo: archivo.nombre, hojas_leidas: resumen.hojas_leidas, errores: resumen.errores.length } }
    });
    return id;
  });
  return obtener(idCarga);
}

module.exports = { estadoDe, aApi, obtener, listar, procesar };
