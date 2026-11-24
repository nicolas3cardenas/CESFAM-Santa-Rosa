// Sesión de la persona (en memoria) y catálogos de las listas desplegables.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, configurar, fijarToken } from './api.js';
import { navegar } from './router.jsx';

const Ctx = createContext(null);
export const useSesion = () => useContext(Ctx);

// Pantalla de inicio de cada rol, según sus permisos
export function inicioDe(permisos) {
  if (permisos.dashboard) { return '/dashboard'; }
  if (permisos.reportes) { return '/reportes'; }
  if (permisos.cargarRem) { return '/cargas'; }
  return '/cambiar-clave';
}

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(null); // { usuario, permisos }
  const [catalogos, setCatalogos] = useState(null);
  const [errorCatalogos, setErrorCatalogos] = useState('');
  const [avisoLogin, setAvisoLogin] = useState(null);
  const flash = useRef(null);

  useEffect(() => {
    configurar({
      alVencer: (mensaje) => {
        setSesion(null); setCatalogos(null); setAvisoLogin(mensaje);
        navegar('/login', { reemplazar: true });
      },
      alDenegar: () => navegar('/acceso-denegado')
    });
  }, []);

  const cargarCatalogos = useCallback(async () => {
    try {
      const c = await api.get('/catalogos');
      setCatalogos(c); setErrorCatalogos('');
      return c;
    } catch (e) {
      if (!e.manejado) { setErrorCatalogos(e.mensaje); }
      throw e;
    }
  }, []);

  const iniciarSesion = useCallback(async (correo, clave) => {
    const r = await api.post('/auth/login', { correo, clave }, { sinSesion: true });
    fijarToken(r.token);
    setAvisoLogin(null);
    setSesion({ usuario: r.usuario, permisos: r.permisos });
    cargarCatalogos().catch(() => {});
    return r;
  }, [cargarCatalogos]);

  const cerrarSesion = useCallback(async () => {
    try { await api.post('/auth/salir', undefined, { sinSesion: true }); } catch (e) { /* igual se descarta el token */ }
    fijarToken(null); setSesion(null); setCatalogos(null); setAvisoLogin(null);
    navegar('/login', { reemplazar: true });
  }, []);

  // Mensaje que se muestra una sola vez en la pantalla siguiente (por ejemplo, "Usuario creado")
  const ponerFlash = useCallback((f) => { flash.current = f; }, []);
  const tomarFlash = useCallback(() => { const f = flash.current; flash.current = null; return f; }, []);

  const valor = useMemo(() => ({
    usuario: sesion ? sesion.usuario : null,
    permisos: sesion ? sesion.permisos : null,
    hayJefe: sesion ? sesion.usuario.rol === 'Jefe de Programa' : false,
    catalogos, errorCatalogos, cargarCatalogos, avisoLogin,
    iniciarSesion, cerrarSesion, ponerFlash, tomarFlash
  }), [sesion, catalogos, errorCatalogos, cargarCatalogos, avisoLogin, iniciarSesion, cerrarSesion, ponerFlash, tomarFlash]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
