import { createRoot } from 'react-dom/client';
import './estilos.css';
import { App } from './App.jsx';

// El enlace de recuperación que envía el backend llega como /restablecer/<token>: la aplicación lo atiende tal cual.
createRoot(document.getElementById('raiz')).render(<App />);
