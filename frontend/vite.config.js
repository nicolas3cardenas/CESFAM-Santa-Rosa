import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El backend acepta peticiones desde http://localhost:5173 (FRONTEND_URL y CORS_ORIGIN del .env del backend).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true }
});
