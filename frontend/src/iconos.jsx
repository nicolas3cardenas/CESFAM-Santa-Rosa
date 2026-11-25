// Íconos del sistema: dibujos SVG propios (sin librerías ni internet). Todos son decorativos: el texto va siempre al lado.
const ICONOS = {
  // menú lateral
  dashboard: <path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" />,
  reportes: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  comparativo: <path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4" />,
  exportar: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  carga: <path d="M12 21V9M7 14l5-5 5 5M4 3h16" />,
  poblacion: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3 3 0 010 6M22 20c0-2.5-1.5-4.5-4-5.3" /></>,
  indicadores: <path d="M4 6h16M4 12h16M4 18h10" />,
  usuarios: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></>,
  auditoria: <path d="M12 8v5l3 2M21 12a9 9 0 11-3-6.7M21 4v5h-5" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  // estados y avisos
  cumple: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>,
  riesgo: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" /></>,
  nocumple: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  sindato: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  // pantalla de acceso y barra superior
  escudo: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  formula: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2" /></>,
  planilla: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  flecha: <path d="M6 9l6 6 6-6" />,
  salir: <path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" />,
  llave: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>
};

export function Icono({ nombre, tamano }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" width={tamano} height={tamano}>
      {ICONOS[nombre]}
    </svg>
  );
}
