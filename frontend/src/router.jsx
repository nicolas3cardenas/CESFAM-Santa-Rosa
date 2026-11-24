// Enrutador mínimo con la API de historial del navegador (direcciones limpias: /dashboard, /reportes...).
// El enlace de recuperación de contraseña que envía el backend es /restablecer/<token>, por eso no se usa "#".
import { createContext, useContext, useEffect, useState } from 'react';

const RutaCtx = createContext({ ruta: '/', busqueda: '' });

export function navegar(destino, { reemplazar = false } = {}) {
  if (reemplazar) { window.history.replaceState(null, '', destino); } else { window.history.pushState(null, '', destino); }
  window.dispatchEvent(new Event('navegacion'));
  window.scrollTo(0, 0);
}

export function RouterProvider({ children }) {
  const [estado, setEstado] = useState({ ruta: window.location.pathname, busqueda: window.location.search });
  useEffect(() => {
    const actualizar = () => setEstado((previo) => (
      previo.ruta === window.location.pathname && previo.busqueda === window.location.search
        ? previo
        : { ruta: window.location.pathname, busqueda: window.location.search }
    ));
    window.addEventListener('popstate', actualizar);
    window.addEventListener('navegacion', actualizar);
    // Los efectos de los hijos corren antes que este: si uno ya redirigió al montarse (por ejemplo, "/" -> "/login"), se pone al día aquí
    actualizar();
    return () => {
      window.removeEventListener('popstate', actualizar);
      window.removeEventListener('navegacion', actualizar);
    };
  }, []);
  return <RutaCtx.Provider value={estado}>{children}</RutaCtx.Provider>;
}

export const useRuta = () => useContext(RutaCtx);
export function useQuery() {
  const { busqueda } = useRuta();
  return new URLSearchParams(busqueda);
}

// Enlace interno: no recarga la página (ni pierde la sesión, que vive en memoria)
export function Link({ a, children, className, ...resto }) {
  function clic(ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) { return; }
    ev.preventDefault();
    navegar(a);
  }
  return <a href={a} className={className} onClick={clic} {...resto}>{children}</a>;
}

// '/detalle/:id' contra '/detalle/3' -> { id: '3' }; null si no coincide
export function coincide(patron, ruta) {
  const ps = patron.split('/');
  const rs = (ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta).split('/');
  if (ps.length !== rs.length) { return null; }
  const params = {};
  for (let i = 0; i < ps.length; i += 1) {
    if (ps[i].startsWith(':')) {
      try { params[ps[i].slice(1)] = decodeURIComponent(rs[i]); } catch (e) { return null; }
    } else if (ps[i] !== rs[i]) {
      return null;
    }
  }
  return params;
}
