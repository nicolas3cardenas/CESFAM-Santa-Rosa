// Pantallas 09 (carga de REM), 10 (resultado de la validación) y 11 (ingreso de población).
import { useState } from 'react';
import { api } from '../api.js';
import { Link, navegar } from '../router.jsx';
import { useSesion } from '../sesion.jsx';
import {
  AvisoDe, Aviso, Boton, Campo, Cargando, manejarError, Paginacion, propsCampo, useDatos, useEnfocarError, useEnvio, useTitulo
} from '../ui.jsx';
import { V, fechaHora, numero, periodoActual } from '../util.js';

const MAXIMO = 10 * 1024 * 1024; // 10 MB

function ChipCarga({ estado }) {
  const ok = estado === 'Validada';
  return <span className={`chip ${ok ? 'cumple' : 'nocumple'}`}><span aria-hidden="true">{ok ? '✔' : '✖'}</span>{estado}</span>;
}

/* ---------- 09 Carga de REM ---------- */
export function CargaRem() {
  useTitulo('Carga de REM');
  const { catalogos, cargarCatalogos } = useSesion();
  const [periodo, setPeriodo] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);
  const lista = useDatos(() => api.get('/cargas', { pagina, tamano: 10 }), [pagina]);

  const sugeridos = Array.from(new Set([periodoActual()].concat(catalogos ? catalogos.periodos : [])));

  function cargar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      if (!V.periodo(periodo)) { e.periodo = 'Ingrese el período como AAAA-MM, con mes de 01 a 12 (por ejemplo 2026-06)'; }
      if (!archivo) { e.archivo = 'Seleccione un archivo .xlsx o .xlsm'; }
      else if (!/\.(xlsx|xlsm)$/i.test(archivo.name)) { e.archivo = 'El archivo debe ser .xlsx o .xlsm'; }
      else if (archivo.size === 0) { e.archivo = 'El archivo está vacío'; }
      else if (archivo.size > MAXIMO) { e.archivo = 'El archivo pesa más de 10 MB'; }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }
      const datos = new FormData();
      datos.append('periodo', periodo);
      datos.append('archivo', archivo); // no se fija el Content-Type: el navegador arma el multipart
      try {
        const r = await api.subir('/cargas', datos);
        cargarCatalogos().catch(() => {}); // un período nuevo debe aparecer en las listas
        navegar(`/cargas/${r.id}`);
      } catch (err) { manejarError(err, setErrores, setAviso); }
    });
  }

  const d = lista.datos;
  return (
    <>
      <h1>Carga de REM</h1>
      <p className="texto-2">Suba la planilla REM del mes. El sistema la revisa y le muestra el resultado de la validación.</p>
      <AvisoDe aviso={aviso} />

      <form className="tarjeta formulario" onSubmit={cargar} noValidate>
        <Campo id="periodo" etiqueta="Período" ayuda="Año y mes, por ejemplo 2026-06." error={errores.periodo}>
          <input {...propsCampo('periodo', errores.periodo)} type="text" list="periodos" inputMode="numeric" placeholder="AAAA-MM" autoComplete="off"
            value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          <datalist id="periodos">{sugeridos.map((p) => <option key={p} value={p} />)}</datalist>
        </Campo>
        <Campo id="archivo" etiqueta="Archivo REM" ayuda="Solo .xlsx o .xlsm, de hasta 10 MB." error={errores.archivo}>
          <input {...propsCampo('archivo', errores.archivo)} type="file" accept=".xlsx,.xlsm"
            onChange={(e) => setArchivo(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
        </Campo>
        <Boton ocupado={ocupado} textoOcupado="Validando…">Cargar y validar</Boton>
      </form>

      <h2>Cargas anteriores</h2>
      {lista.error && <Aviso tipo="error">{lista.error}</Aviso>}
      {lista.cargando && !d && <Cargando />}
      {d && (
        <>
          <div className="tabla-contenedor">
            <table>
              <thead><tr><th>N.º</th><th>Período</th><th>Archivo</th><th>Cargado por</th><th>Fecha</th><th>Estado</th><th>Resultado</th></tr></thead>
              <tbody>
                {d.cargas.length === 0 && <tr><td colSpan="7" className="sin-resultados">Todavía no hay cargas.</td></tr>}
                {d.cargas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td><td className="nw">{c.periodo}</td><td>{c.archivo}</td><td className="nw">{c.usuario}</td>
                    <td className="nw">{fechaHora(c.fecha)}</td><td><ChipCarga estado={c.estado} /></td>
                    <td className="nw"><Link a={`/cargas/${c.id}`}>Ver resultado</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.total > d.tamano && <Paginacion pagina={d.pagina} total={d.total} tamano={d.tamano} alCambiar={setPagina} />}
        </>
      )}
    </>
  );
}

/* ---------- 10 Resultado de la validación ---------- */
export function ResultadoValidacion({ params }) {
  useTitulo('Resultado de la validación');
  const { datos: c, cargando, error, status } = useDatos(() => api.get(`/cargas/${encodeURIComponent(params.id)}`), [params.id]);

  const migas = <p className="migas"><Link a="/cargas">Carga de REM</Link> › Resultado de la validación</p>;
  if (cargando && !c) { return <>{migas}<Cargando /></>; }
  if (!c) {
    return (
      <>
        {migas}
        <h1>Resultado de la validación</h1>
        <Aviso tipo="error">{status === 404 ? 'Carga no encontrada' : (error || 'No se pudo cargar el resultado')}</Aviso>
        {status === 404 && <p className="texto-2">No existe una carga con ese número. Vuelva a la carga de REM para subir un archivo.</p>}
        <Link a="/cargas" className="btn btn-secundario">Volver a la carga de REM</Link>
      </>
    );
  }

  const r = c.resumen || {};
  const errores = r.errores || [];
  const vacias = Array.isArray(r.celdas_vacias) ? r.celdas_vacias : [];
  const advertencias = r.advertencias || [];
  const totales = c.totales || {};
  const ok = c.estado === 'Validada';
  const nVacias = totales.celdasVacias !== undefined ? totales.celdasVacias : vacias.length;
  const nErrores = totales.errores !== undefined ? totales.errores : errores.length;

  return (
    <>
      {migas}
      <h1>Resultado de la validación</h1>
      {ok
        ? <Aviso tipo="exito">La planilla es válida: se leyeron todas las hojas y se crearon los resultados del período {c.periodo}.</Aviso>
        : <Aviso tipo="error">La planilla tiene errores: no se crearon resultados. Corrija el archivo y cárguelo de nuevo.</Aviso>}

      <div className="tarjetas">
        <div className="tarjeta-dato"><div className="cifra">{numero(r.hojas_leidas)} de {numero(r.hojas_esperadas)}</div>Hojas leídas</div>
        <div className="tarjeta-dato"><div className="cifra">{numero(r.celdas_leidas)}</div>Celdas leídas</div>
        <div className="tarjeta-dato riesgo"><div className="cifra">{nVacias}</div>Celdas vacías</div>
        <div className={`tarjeta-dato ${nErrores ? 'nocumple' : 'cumple'}`}><div className="cifra">{nErrores}</div>Errores</div>
      </div>

      <section className="tarjeta" aria-label="Datos de la carga">
        <dl className="datos">
          <dt>Carga n.º</dt><dd>{c.id}</dd>
          <dt>Período</dt><dd>{c.periodo}</dd>
          <dt>Archivo</dt><dd>{c.archivo}</dd>
          <dt>Cargado por</dt><dd>{c.usuario}</dd>
          <dt>Fecha</dt><dd>{fechaHora(c.fecha)}</dd>
          <dt>Estado</dt><dd><ChipCarga estado={c.estado} /></dd>
          {c.resultadosCreados !== undefined && (<><dt>Resultados creados</dt><dd>{c.resultadosCreados}</dd></>)}
        </dl>
      </section>

      {errores.length > 0 && (
        <>
          <h2>Detalle de los errores</h2>
          <div className="tabla-contenedor" style={{ marginBottom: 20 }}>
            <table>
              <thead><tr><th>Hoja</th><th>Celda</th><th>Problema</th></tr></thead>
              <tbody>{errores.map((e, i) => <tr key={i}><td>{e.hoja}</td><td>{e.celda || '—'}</td><td>{e.problema}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}

      {vacias.length > 0 && (
        <>
          <h2>Celdas en blanco</h2>
          <p className="texto-2 pequeno">Una celda en blanco cuenta como 0. Revise que sea correcto.</p>
          <div className="tabla-contenedor" style={{ marginBottom: 20 }}>
            <table>
              <thead><tr><th>Hoja</th><th>Celda</th><th>Indicador</th></tr></thead>
              <tbody>{vacias.map((v, i) => <tr key={i}><td>{v.hoja}</td><td>{v.celda}</td><td>{v.indicador || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}

      {advertencias.length > 0 && (
        <Aviso tipo="alerta">
          <span>Advertencias:</span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Aviso>
      )}

      <section className="tarjeta" aria-label="Resumen guardado">
        <h2>Resumen guardado de la validación</h2>
        <p className="texto-2 pequeno">Este resumen se guarda tal cual en el campo resumen_validacion (JSONB); su estructura cambia de una carga a otra.</p>
        <pre className="json">{JSON.stringify(r, null, 2)}</pre>
      </section>

      <div className="acciones"><Link a="/cargas" className="btn btn-primario">Cargar otro archivo</Link></div>
    </>
  );
}

/* ---------- 11 Ingreso de población ---------- */
export function IngresoPoblacion() {
  useTitulo('Ingreso de población');
  const { catalogos } = useSesion();
  const [v, setV] = useState({ periodo: '', indicadorId: '', valor: '' });
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);

  const periodo = v.periodo || (catalogos && catalogos.periodos[0]) || '';
  const lista = useDatos(() => api.get('/poblacion', { periodo }), [periodo], Boolean(catalogos && periodo));
  const indicadores = lista.datos ? lista.datos.indicadores : [];

  function guardar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      const elegido = indicadores.find((i) => String(i.indicadorId) === String(v.indicadorId));
      if (v.indicadorId === '') { e.indicadorId = 'Seleccione un indicador'; }
      if (!periodo) { e.periodo = 'Seleccione un período'; }
      if (!V.entero(v.valor, 1, 1000000)) { e.valor = 'Ingrese un entero entre 1 y 1.000.000'; }
      if (elegido && elegido.valor !== null && elegido.valor !== undefined) { e.periodo = 'Ya existe población para ese período'; }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }
      try {
        const r = await api.post('/poblacion', { indicadorId: Number(v.indicadorId), periodo, valor: v.valor });
        setAviso({
          tipo: 'exito',
          texto: `Población guardada: ${elegido ? elegido.codigo : `indicador ${r.indicadorId}`}, ${periodo}, ${numero(r.valor)}. ${r.resultadosActualizados ? 'Se calculó el resultado del indicador. ' : ''}Queda registrada en la auditoría.`
        });
        setV({ ...v, valor: '' });
        lista.recargar();
      } catch (err) {
        // "Ya existe población para ese período" se muestra junto a la lista de períodos
        if (err.status === 409) { setErrores({ periodo: err.mensaje }); setAviso(null); } else { manejarError(err, setErrores, setAviso); }
      }
    });
  }

  return (
    <>
      <h1>Ingreso de población</h1>
      <p className="texto-2">Registre el denominador de los indicadores cuya población no viene en el REM. Cada indicador y mes se ingresa una sola vez.</p>
      <AvisoDe aviso={aviso} />

      <form className="tarjeta formulario" onSubmit={guardar} noValidate>
        <div className="fila">
          <Campo id="indicadorId" etiqueta="Indicador" ayuda="Solo aparecen los indicadores activos cuyo denominador se ingresa a mano." error={errores.indicadorId}>
            <select {...propsCampo('indicadorId', errores.indicadorId)} value={v.indicadorId} onChange={(e) => setV({ ...v, indicadorId: e.target.value })}>
              <option value="">Seleccione un indicador</option>
              {indicadores.map((i) => <option key={i.indicadorId} value={i.indicadorId}>{i.codigo} · {i.nombre}{i.pendiente ? ' (falta ingresar)' : ''}</option>)}
            </select>
          </Campo>
          <Campo id="periodo" etiqueta="Período" error={errores.periodo}>
            <select {...propsCampo('periodo', errores.periodo)} value={periodo} onChange={(e) => setV({ ...v, periodo: e.target.value, indicadorId: '' })}>
              {catalogos && catalogos.periodos.length === 0 && <option value="">Sin períodos con datos</option>}
              {catalogos && catalogos.periodos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
        </div>
        <Campo id="valor" etiqueta="Población" ayuda="Número entero de 1 a 1.000.000, escrito sin puntos ni comas." error={errores.valor} estilo={{ maxWidth: 320 }}>
          <input {...propsCampo('valor', errores.valor)} type="text" inputMode="numeric" autoComplete="off" placeholder="Por ejemplo: 900"
            value={v.valor} onChange={(e) => setV({ ...v, valor: e.target.value })} />
        </Campo>
        <Boton ocupado={ocupado} textoOcupado="Guardando…" disabled={!catalogos}>Guardar</Boton>
      </form>

      <h2>Población del período {periodo}</h2>
      {lista.error && <Aviso tipo="error">{lista.error}</Aviso>}
      {lista.cargando && !lista.datos && <Cargando />}
      {lista.datos && (
        <div className="tabla-contenedor">
          <table>
            <thead><tr><th>Indicador</th><th>Programa</th><th className="num">Población</th><th>Ingresada</th></tr></thead>
            <tbody>
              {indicadores.length === 0 && <tr><td colSpan="4" className="sin-resultados">No hay indicadores con población ingresada a mano.</td></tr>}
              {indicadores.map((i) => (
                <tr key={i.indicadorId}>
                  <td>{i.codigo} · {i.nombre}</td>
                  <td>{i.programa}</td>
                  <td className="num">{i.pendiente ? <span className="chip neutro">Falta ingresar</span> : numero(i.valor)}</td>
                  <td className="nw">{i.pendiente ? '—' : fechaHora(i.fechaIngreso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
