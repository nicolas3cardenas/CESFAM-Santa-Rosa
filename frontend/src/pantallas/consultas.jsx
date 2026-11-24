// Pantallas 04 (dashboard), 05 (reportes), 06 (comparativo anual), 07 (detalle del indicador) y 08 (exportar datos).
import { useState } from 'react';
import { api } from '../api.js';
import { Link, useQuery } from '../router.jsx';
import { useSesion } from '../sesion.jsx';
import {
  AvisoDe, Aviso, BarraFila, Boton, Campo, Cargando, Chip, manejarError, propsCampo, useDatos, useEnfocarError, useEnvio, useTitulo
} from '../ui.jsx';
import { TEXTO_ESTADO, V, ancho, fechaHora, fechaIso, nombrePeriodo, numero, porcentaje } from '../util.js';

const textoResultado = (fila) => {
  if (fila.estado === 'sin_poblacion') { return 'Falta ingresar la población'; }
  if (fila.resultado === null || fila.resultado === undefined) { return '—'; }
  return porcentaje(fila.resultado);
};

/* ---------- 04 Dashboard ---------- */
export function Dashboard() {
  useTitulo('Dashboard');
  const { catalogos, permisos } = useSesion();
  const [periodoElegido, setPeriodo] = useState('');
  const [programaId, setProgramaId] = useState('');
  const periodo = periodoElegido || (catalogos && catalogos.periodos[0]) || '';
  const { datos: d, error, cargando } = useDatos(() => api.get('/dashboard', { periodo, programaId }), [periodo, programaId], Boolean(catalogos));

  return (
    <>
      <h1>Dashboard</h1>
      <p className="texto-2">Cumplimiento de las metas sanitarias por período.</p>

      <section className="tarjeta" aria-label="Filtros">
        <div className="filtros">
          <Campo id="periodo" etiqueta="Período">
            <select id="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {catalogos && catalogos.periodos.length === 0 && <option value="">Sin períodos con datos</option>}
              {catalogos && catalogos.periodos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
          <Campo id="programa" etiqueta="Programa">
            <select id="programa" value={programaId} onChange={(e) => setProgramaId(e.target.value)}>
              <option value="">Todos</option>
              {catalogos && catalogos.programas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
        </div>
      </section>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {(cargando || !catalogos) && !d && <Cargando />}
      {d && d.sinDatos && <Aviso tipo="info">{d.mensaje || 'Sin datos para el período'}</Aviso>}
      {d && !d.sinDatos && (
        <>
          {d.faltaPoblacion > 0 && (
            <Aviso tipo="alerta">
              Falta ingresar la población de {d.faltaPoblacion} indicador{d.faltaPoblacion > 1 ? 'es' : ''}: su resultado no se calcula hasta ingresarla.{' '}
              {permisos.ingresarPoblacion ? <Link a="/poblacion">Ingresar población</Link> : 'Pídala a la Subdirección o al Gestor de Información.'}
            </Aviso>
          )}
          <div className="tarjetas">
            <div className="tarjeta-dato cumple"><div className="cifra">{d.resumen.cumple}</div>Indicadores que cumplen</div>
            <div className="tarjeta-dato riesgo"><div className="cifra">{d.resumen.riesgo}</div>Indicadores en riesgo</div>
            <div className="tarjeta-dato nocumple"><div className="cifra">{d.resumen.nocumple}</div>Indicadores que no cumplen</div>
          </div>

          <section className="tarjeta">
            <h2>Resultado por indicador, {nombrePeriodo(d.periodo)}</h2>
            <div className="grafico" role="img" aria-label="Gráfico de barras con el porcentaje logrado de cada indicador y su meta">
              {d.indicadores.map((i) => (
                <BarraFila key={i.indicadorId} nombre={i.nombre} valor={i.resultado === null ? 0 : i.resultado} estado={i.estado}
                  meta={i.meta} texto={i.resultado === null ? 'Sin dato' : porcentaje(i.resultado)} />
              ))}
            </div>
            <div className="leyenda">
              <span className="l-cumple">Cumple</span><span className="l-riesgo">En riesgo</span><span className="l-nocumple">No cumple</span><span className="l-meta">Meta</span>
            </div>
          </section>

          <div className="tabla-contenedor">
            <table>
              <thead><tr><th>Indicador</th><th>Programa</th><th className="num">Meta</th><th className="num">Resultado</th><th>Estado</th></tr></thead>
              <tbody>
                {d.indicadores.map((i) => (
                  <tr key={i.indicadorId}>
                    <td><Link a={`/detalle/${i.indicadorId}?p=${d.periodo}`}>{i.nombre}</Link></td>
                    <td>{i.programa}</td>
                    <td className="num">{porcentaje(i.meta)}</td>
                    <td className="num">{textoResultado(i)}</td>
                    <td><Chip estado={i.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- 05 Reportes con filtros ---------- */
export function Reportes() {
  useTitulo('Reportes');
  const { catalogos, hayJefe } = useSesion();
  const [v, setV] = useState({ mes: '', desde: '', hasta: '', corte: '', programaId: '' });
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);
  const cambiar = (campo) => (e) => setV({ ...v, [campo]: e.target.value });

  const mes = v.mes || (catalogos && catalogos.periodos[0]) || '';
  const corte = v.corte || (catalogos && catalogos.cortes[0]) || '';
  // El Jefe de Programa ve únicamente su programa (el servidor también lo filtra)
  const programaId = hayJefe && catalogos && catalogos.programas[0] ? String(catalogos.programas[0].id) : v.programaId;

  function consultar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      const conRango = v.desde !== '' || v.hasta !== '';
      if (conRango) {
        const fd = V.fecha(v.desde); const fh = V.fecha(v.hasta);
        if (!fd) { e.desde = 'Ingrese una fecha que exista (DD-MM-AAAA)'; }
        if (!fh) { e.hasta = 'Ingrese una fecha que exista (DD-MM-AAAA)'; }
        if (fd && fh && fh < fd) { e.hasta = 'La fecha Hasta no puede ser anterior a Desde'; }
      }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }
      const params = conRango ? { desde: fechaIso(v.desde), hasta: fechaIso(v.hasta) } : { mes };
      params.corte = corte;
      params.programaId = programaId;
      try {
        const r = await api.get('/reportes', params);
        const programa = catalogos.programas.find((p) => String(p.id) === String(programaId));
        setResultado({
          datos: r,
          titulo: conRango ? `Del ${v.desde} al ${v.hasta}` : nombrePeriodo(r.titulo || mes),
          programa: programa ? programa.nombre : 'Todos'
        });
      } catch (err) { setResultado(null); manejarError(err, setErrores, setAviso); }
    });
  }

  const r = resultado && resultado.datos;
  return (
    <>
      <h1>Reportes</h1>
      <p className="texto-2">Elija los filtros y presione Consultar.</p>

      <form className="tarjeta" onSubmit={consultar} noValidate>
        <div className="filtros">
          <Campo id="mes" etiqueta="Mes" error={errores.mes}>
            <select {...propsCampo('mes', errores.mes)} value={mes} onChange={cambiar('mes')}>
              {catalogos && catalogos.periodos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
          <Campo id="desde" etiqueta="Desde" error={errores.desde}>
            <input {...propsCampo('desde', errores.desde)} type="text" inputMode="numeric" placeholder="DD-MM-AAAA" autoComplete="off" value={v.desde} onChange={cambiar('desde')} />
          </Campo>
          <Campo id="hasta" etiqueta="Hasta" error={errores.hasta}>
            <input {...propsCampo('hasta', errores.hasta)} type="text" inputMode="numeric" placeholder="DD-MM-AAAA" autoComplete="off" value={v.hasta} onChange={cambiar('hasta')} />
          </Campo>
          <Campo id="corte" etiqueta="Corte IAAPS">
            <select id="corte" value={corte} onChange={cambiar('corte')}>
              {catalogos && catalogos.cortes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo id="programa" etiqueta="Programa">
            <select id="programa" value={programaId} onChange={cambiar('programaId')} disabled={hayJefe}>
              {!hayJefe && <option value="">Todos</option>}
              {catalogos && catalogos.programas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
        </div>
        <p className="texto-2 pequeno">Las fechas son opcionales: si las completa, se usa el rango en lugar del mes.</p>
        <Boton ocupado={ocupado} textoOcupado="Consultando…" disabled={!catalogos}>Consultar</Boton>
      </form>

      <AvisoDe aviso={aviso} />
      {r && r.sinDatos && <Aviso tipo="info">{r.mensaje || 'Sin datos para el rango elegido'}</Aviso>}
      {r && !r.sinDatos && (
        <section className="tarjeta">
          <h2>Resultados: {resultado.titulo}</h2>
          <p className="texto-2 pequeno">Programa: {resultado.programa} · {r.corte}</p>
          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th>Indicador</th><th>Programa</th><th className="num">Meta</th>
                  {r.periodos.map((p) => <th key={p} className="num">{p}</th>)}
                  {r.modo === 'mes' && <th>Estado</th>}
                </tr>
              </thead>
              <tbody>
                {r.filas.map((f) => {
                  const ultimo = r.periodos[r.periodos.length - 1];
                  const primero = f.valores.find((x) => x.periodo === r.periodos[0]);
                  return (
                    <tr key={f.indicadorId}>
                      <td><Link a={`/detalle/${f.indicadorId}?p=${ultimo}`}>{f.nombre}</Link></td>
                      <td>{f.programa}</td>
                      <td className="num">{porcentaje(f.meta)}</td>
                      {r.periodos.map((p) => {
                        const x = f.valores.find((y) => y.periodo === p);
                        return <td key={p} className="num">{!x ? '—' : (x.estado === 'sin_poblacion' ? 'Falta población' : porcentaje(x.resultado))}</td>;
                      })}
                      {r.modo === 'mes' && <td>{primero ? <Chip estado={primero.estado} /> : <Chip estado="sin_datos" />}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

/* ---------- 06 Comparativo anual ---------- */
export function Comparativo() {
  useTitulo('Comparativo anual');
  const { catalogos } = useSesion();
  const [v, setV] = useState({ actual: '', comparar: '' });
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);

  const anios = catalogos ? catalogos.anios : [];
  const actual = v.actual || anios[0] || '';
  const comparar = v.comparar || anios.find((a) => a !== (v.actual || anios[0])) || '';

  function comparame(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      const e = {};
      if (!actual) { e.actual = 'No hay datos para el año elegido'; }
      if (!comparar) { e.comparar = 'No hay datos para el año elegido'; }
      else if (comparar === actual) { e.comparar = 'Elija un año distinto del año actual'; }
      setErrores(e);
      if (Object.keys(e).length > 0) { return; }
      try {
        setResultado(await api.get('/comparativo', { anioActual: actual, anioComparar: comparar }));
      } catch (err) { setResultado(null); manejarError(err, setErrores, setAviso); }
    });
  }

  const r = resultado;
  return (
    <>
      <h1>Comparativo anual</h1>
      <p className="texto-2">Compara el resultado promedio de cada indicador entre dos años.</p>

      <form className="tarjeta" onSubmit={comparame} noValidate>
        <div className="filtros">
          <Campo id="actual" etiqueta="Año actual" error={errores.actual}>
            <select {...propsCampo('actual', errores.actual)} value={actual} onChange={(e) => setV({ ...v, actual: e.target.value })}>
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo id="comparar" etiqueta="Año a comparar" error={errores.comparar}>
            <select {...propsCampo('comparar', errores.comparar)} value={comparar} onChange={(e) => setV({ ...v, comparar: e.target.value })}>
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Campo>
          <div className="campo"><Boton ocupado={ocupado} textoOcupado="Comparando…" disabled={!catalogos}>Comparar</Boton></div>
        </div>
      </form>

      <AvisoDe aviso={aviso} />
      {r && r.indicadores.length === 0 && <Aviso tipo="info">Sin datos para comparar.</Aviso>}
      {r && r.indicadores.length > 0 && (
        <>
          <section className="tarjeta">
            <h2>{r.anioActual} frente a {r.anioComparar}</h2>
            <div className="grafico" role="img" aria-label="Gráfico de barras que compara cada indicador entre dos años">
              {r.indicadores.map((i) => (
                <div className="barra-fila" key={i.indicadorId}>
                  <span className="barra-nombre">{i.nombre}</span>
                  <div className="pistas">
                    <div className="barra-pista">
                      <div className={`barra-relleno ${['cumple', 'riesgo', 'nocumple'].includes(i.actual.estado) ? i.actual.estado : 'neutro'}`} style={{ width: `${ancho(i.actual.resultado)}%` }} />
                      <div className="barra-meta" style={{ left: `${ancho(i.meta)}%` }} title={`Meta ${i.meta} %`} />
                    </div>
                    <div className="barra-pista"><div className="barra-relleno anterior" style={{ width: `${ancho(i.comparado.resultado)}%` }} /></div>
                  </div>
                  <span className="barra-valor">{porcentaje(i.actual.resultado)} / {porcentaje(i.comparado.resultado)}</span>
                </div>
              ))}
            </div>
            <div className="leyenda">
              <span className="l-cumple">Año actual (color según la meta)</span><span className="l-ant">Año a comparar</span><span className="l-meta">Meta</span>
            </div>
          </section>

          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr><th>Indicador</th><th className="num">Meta</th><th className="num">{r.anioActual}</th><th className="num">{r.anioComparar}</th><th className="num">Variación</th><th>Estado {r.anioActual}</th></tr>
              </thead>
              <tbody>
                {r.indicadores.map((i) => {
                  const dif = i.diferencia;
                  const flecha = dif === null || dif === undefined ? '' : (dif > 0 ? '▲ +' : (dif < 0 ? '▼ ' : '= '));
                  return (
                    <tr key={i.indicadorId}>
                      <td>{i.nombre}</td>
                      <td className="num">{porcentaje(i.meta)}</td>
                      <td className="num">{porcentaje(i.actual.resultado)}</td>
                      <td className="num">{porcentaje(i.comparado.resultado)}</td>
                      <td className="num">{dif === null || dif === undefined ? '—' : `${flecha}${numero(dif)} pp`}</td>
                      <td><Chip estado={i.actual.estado} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- 07 Detalle del indicador ---------- */
export function Detalle({ params }) {
  useTitulo('Detalle de indicador');
  const { permisos } = useSesion();
  const consulta = useQuery();
  const pedido = consulta.get('p');
  const [periodoElegido, setPeriodo] = useState(pedido || '');
  const ficha = useDatos(() => api.get(`/indicadores/${encodeURIComponent(params.id)}/detalle`), [params.id]);
  const comentarios = useDatos(() => api.get(`/indicadores/${encodeURIComponent(params.id)}/comentarios`), [params.id], permisos.verComentarios);

  const [texto, setTexto] = useState('');
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);

  const d = ficha.datos;
  if (ficha.cargando && !d) { return <Cargando />; }
  if (!d) {
    return (
      <>
        <p className="migas"><Link a="/reportes">Reportes</Link> › Detalle del indicador</p>
        <Aviso tipo="error">{ficha.status === 404 ? 'Indicador no encontrado' : (ficha.error || 'No se pudo cargar el indicador')}</Aviso>
      </>
    );
  }

  const ind = d.indicador;
  const historial = (d.historial || []).slice().sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
  const periodos = historial.map((h) => h.periodo).reverse();
  const periodo = periodos.includes(periodoElegido) ? periodoElegido : (periodos[0] || '');
  const actual = historial.find((h) => h.periodo === periodo);
  const origen = ind.origenDenominador === 'REM' ? `Celda ${ind.celdaDenominador} del REM` : 'Población ingresada a mano';

  function publicar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      if (!V.largo(texto, 1, 500)) { setErrores({ texto: 'Escriba un comentario de 1 a 500 caracteres' }); return; }
      if (!periodo) { setErrores({ texto: 'Este indicador todavía no tiene un período para comentar' }); return; }
      setErrores({});
      try {
        await api.post(`/indicadores/${encodeURIComponent(params.id)}/comentarios`, { periodo, texto });
        setTexto('');
        setAviso({ tipo: 'exito', texto: 'Comentario publicado.' });
        comentarios.recargar();
      } catch (err) {
        if (err.campos && err.campos.texto) { setErrores({ texto: err.campos.texto }); }
        manejarError(err, undefined, setAviso);
      }
    });
  }

  return (
    <>
      <p className="migas"><Link a="/reportes">Reportes</Link> › Detalle del indicador</p>
      <h1>{ind.nombre}</h1>
      <p className="texto-2">{ind.remCodigo} · Programa {ind.programa}</p>
      <AvisoDe aviso={aviso} />

      <div className="dos-columnas">
        <section className="tarjeta" aria-label="Cálculo del indicador">
          <Campo id="periodo" etiqueta="Período" estilo={{ maxWidth: 240 }}>
            <select id="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {periodos.length === 0 && <option value="">Sin resultados</option>}
              {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
          {actual && actual.estado === 'sin_poblacion' && (
            <Aviso tipo="alerta">
              Falta ingresar la población{' '}
              {permisos.ingresarPoblacion && <Link a="/poblacion">Ingresar población</Link>}
            </Aviso>
          )}
          <dl className="datos">
            <dt>Meta</dt><dd>{porcentaje(ind.metaNacional)}</dd>
            <dt>Peso relativo</dt><dd>{numero(ind.pesoRelativo)}</dd>
            <dt>Numerador</dt><dd>Celda {ind.celdaNumerador} del REM</dd>
            <dt>Origen del denominador</dt><dd>{origen}</dd>
            {actual && actual.estado === 'sin_poblacion' && (<><dt>Resultado</dt><dd><Chip estado="sin_poblacion" /></dd></>)}
            {actual && actual.estado !== 'sin_poblacion' && (
              <>
                <dt>Numerador del período</dt><dd>{numero(actual.numerador)}</dd>
                <dt>Denominador del período</dt><dd>{numero(actual.denominador)}</dd>
                <dt>Resultado</dt><dd>{porcentaje(actual.resultado)}</dd>
                <dt>Estado</dt><dd><Chip estado={actual.estado} /></dd>
              </>
            )}
          </dl>
          {actual && actual.estado !== 'sin_poblacion' && actual.resultado !== null && actual.resultado !== undefined && (
            <div className="calculo" id="calculo-indicador">
              <h3>Cómo se calculó este resultado</h3>
              <p className="formula">Resultado (%) = Numerador ÷ Denominador × 100</p>
              <p className="formula-valores">
                {numero(actual.numerador)} ÷ {numero(actual.denominador)} × 100 = <strong>{porcentaje(actual.resultado)}</strong>
              </p>
              <p className="texto-2">
                El numerador sale de la celda {ind.celdaNumerador} del REM cargado para {periodo}.{' '}
                {ind.origenDenominador === 'REM'
                  ? `El denominador sale de la celda ${ind.celdaDenominador} del mismo REM.`
                  : 'El denominador es la población que se ingresó a mano para ese mes.'}{' '}
                Se compara con la meta de {porcentaje(ind.metaNacional)}: {TEXTO_ESTADO[actual.estado] || actual.estado}.
              </p>
            </div>
          )}
          {historial.length === 0 && <p className="texto-2" style={{ marginTop: 16 }}>Este indicador todavía no tiene resultados.</p>}
          {historial.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Evolución mensual</h3>
              <div className="grafico">
                {historial.map((h) => (
                  <BarraFila key={h.periodo} nombre={h.periodo} valor={h.resultado === null ? 0 : h.resultado} estado={h.estado}
                    meta={ind.metaNacional} texto={h.resultado === null ? 'Sin dato' : porcentaje(h.resultado)} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="tarjeta" aria-label="Comentarios">
          <h2>Comentarios del Jefe de Programa</h2>
          {comentarios.cargando && !comentarios.datos && <Cargando />}
          {comentarios.error && <Aviso tipo="error">{comentarios.error}</Aviso>}
          {comentarios.datos && (
            <ul className="comentarios" id="lista-comentarios">
              {comentarios.datos.comentarios.length === 0 && <li className="texto-2">Este indicador todavía no tiene comentarios.</li>}
              {comentarios.datos.comentarios.map((c) => (
                <li className="comentario" key={c.id}>
                  {/* Los textos de personas se muestran siempre como texto de React, nunca como HTML */}
                  <div className="meta">{c.autor} · {fechaHora(c.fecha)} · {c.periodo}</div>
                  <div className="texto">{c.texto}</div>
                </li>
              ))}
            </ul>
          )}
          {permisos.comentar ? (
            <form onSubmit={publicar} noValidate>
              <Campo id="comentario" etiqueta="Escriba un comentario" error={errores.texto}>
                <textarea {...propsCampo('comentario', errores.texto)} placeholder="Por ejemplo: según mis registros el resultado es distinto"
                  value={texto} onChange={(e) => setTexto(e.target.value)} />
                <div className="contador">{texto.length} / 500</div>
              </Campo>
              <Boton ocupado={ocupado} textoOcupado="Publicando…">Publicar comentario</Boton>
            </form>
          ) : (
            <p className="texto-2 pequeno">Solo el Jefe de Programa puede comentar un indicador de su programa.</p>
          )}
        </section>
      </div>
    </>
  );
}

/* ---------- 08 Exportar datos ---------- */
export function Exportar() {
  useTitulo('Exportar datos');
  const { catalogos, hayJefe, usuario } = useSesion();
  const [v, setV] = useState({ formato: '', periodo: '' });
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null);
  const [ocupado, ejecutar] = useEnvio();
  useEnfocarError(errores);

  const formato = v.formato || (catalogos && catalogos.formatos[0]) || 'CSV';
  const periodo = v.periodo || (catalogos && catalogos.periodos[0]) || '';

  function exportar(ev) {
    ev.preventDefault();
    ejecutar(async () => {
      setAviso(null);
      if (!periodo) { setErrores({ periodo: 'No hay períodos con datos para exportar' }); return; }
      setErrores({});
      try {
        const { blob, nombre } = await api.descargar('/exportar', { formato, periodo });
        const archivo = nombre || `metas_${periodo}.${formato.toLowerCase()}`;
        // Descarga con un enlace temporal (el token viaja en la cabecera, no en la dirección)
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url; enlace.download = archivo;
        document.body.appendChild(enlace); enlace.click(); enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setAviso({ tipo: 'exito', texto: `Archivo ${archivo} generado y descargado.` });
      } catch (err) { manejarError(err, setErrores, setAviso); }
    });
  }

  return (
    <>
      <h1>Exportar datos</h1>
      <p className="texto-2">Descargue los resultados de un período en CSV o en Excel (XLSX).</p>
      <AvisoDe aviso={aviso} />
      <form className="tarjeta formulario" onSubmit={exportar} noValidate>
        <div className="fila">
          <Campo id="formato" etiqueta="Formato" error={errores.formato}>
            <select {...propsCampo('formato', errores.formato)} value={formato} onChange={(e) => setV({ ...v, formato: e.target.value })}>
              {(catalogos ? catalogos.formatos : ['CSV', 'XLSX']).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Campo>
          <Campo id="periodo" etiqueta="Período" error={errores.periodo}>
            <select {...propsCampo('periodo', errores.periodo)} value={periodo} onChange={(e) => setV({ ...v, periodo: e.target.value })}>
              {catalogos && catalogos.periodos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
        </div>
        <p className="texto-2 pequeno">
          {hayJefe ? `El archivo incluye solo los indicadores de su programa (${usuario.programa}).` : 'El archivo incluye los indicadores de todos los programas.'}
        </p>
        <Boton ocupado={ocupado} textoOcupado="Generando archivo…" disabled={!catalogos}>Exportar</Boton>
      </form>
    </>
  );
}
