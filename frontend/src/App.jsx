// Tabla de pantallas y guardia de acceso. Qué se ve lo decide el servidor (siempre revisa el permiso);
// aquí solo se ordena la pantalla: sin sesión -> inicio de sesión; sin permiso -> pantalla 17.
import { useEffect } from 'react';
import { RouterProvider, navegar, coincide, useRuta } from './router.jsx';
import { SesionProvider, inicioDe, useSesion } from './sesion.jsx';
import { Shell } from './layout.jsx';
import { Login, Olvide, Restablecer, CambiarClave, AccesoDenegado, NoEncontrada } from './pantallas/auth.jsx';
import { Dashboard, Reportes, Comparativo, Detalle, Exportar } from './pantallas/consultas.jsx';
import { CargaRem, ResultadoValidacion, IngresoPoblacion } from './pantallas/cargas.jsx';
import { ListaIndicadores, FormularioIndicador, ListaUsuarios, FormularioUsuario, Auditoria } from './pantallas/administracion.jsx';

const RUTAS = [
  { patron: '/login', publica: true, c: Login },
  { patron: '/olvide', publica: true, c: Olvide },
  { patron: '/restablecer/:token', publica: true, c: Restablecer },
  { patron: '/cambiar-clave', c: CambiarClave },
  { patron: '/dashboard', permiso: 'dashboard', c: Dashboard },
  { patron: '/reportes', permiso: 'reportes', c: Reportes },
  { patron: '/comparativo', permiso: 'comparativo', c: Comparativo },
  { patron: '/detalle/:id', permiso: 'detalleIndicador', c: Detalle },
  { patron: '/exportar', permiso: 'exportar', c: Exportar },
  { patron: '/cargas', permiso: 'cargarRem', c: CargaRem },
  { patron: '/cargas/:id', permiso: 'cargarRem', c: ResultadoValidacion },
  { patron: '/poblacion', permiso: 'ingresarPoblacion', c: IngresoPoblacion },
  { patron: '/indicadores', permiso: 'parametrizarIndicadores', c: ListaIndicadores },
  { patron: '/indicadores/nuevo', permiso: 'parametrizarIndicadores', c: FormularioIndicador },
  { patron: '/indicadores/:id/editar', permiso: 'parametrizarIndicadores', c: FormularioIndicador },
  { patron: '/usuarios', permiso: 'gestionarUsuarios', c: ListaUsuarios },
  { patron: '/usuarios/nuevo', permiso: 'gestionarUsuarios', c: FormularioUsuario },
  { patron: '/usuarios/:id/editar', permiso: 'gestionarUsuarios', c: FormularioUsuario },
  { patron: '/auditoria', permiso: 'verAuditoria', c: Auditoria },
  { patron: '/acceso-denegado', c: AccesoDenegado }
];

function Redirigir({ a }) {
  useEffect(() => { navegar(a, { reemplazar: true }); }, [a]);
  return null;
}

function Rutas() {
  const { ruta } = useRuta();
  const { permisos } = useSesion();
  const hay = permisos !== null;

  let elegida = null; let params = {};
  for (let i = 0; i < RUTAS.length && !elegida; i += 1) {
    const p = coincide(RUTAS[i].patron, ruta);
    if (p) { elegida = RUTAS[i]; params = p; }
  }

  if (!elegida) { return hay ? <Shell>{ruta === '/' ? <Redirigir a={inicioDe(permisos)} /> : <NoEncontrada />}</Shell> : <Redirigir a="/login" />; }
  const Pantalla = elegida.c;
  if (elegida.publica) {
    if (hay && elegida.patron === '/login') { return <Redirigir a={inicioDe(permisos)} />; }
    return <Pantalla params={params} />;
  }
  if (!hay) { return <Redirigir a="/login" />; }
  if (elegida.permiso && !permisos[elegida.permiso]) { return <Shell><AccesoDenegado /></Shell>; }
  // key: al pasar de una pantalla a otra del mismo tipo (por ejemplo, de un indicador a otro) se parte de cero
  return <Shell><Pantalla key={ruta} params={params} /></Shell>;
}

export function App() {
  return (
    <RouterProvider>
      <SesionProvider>
        <Rutas />
      </SesionProvider>
    </RouterProvider>
  );
}
