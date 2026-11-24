# Frontend (React + Vite)

Aplicación web del sistema de metas sanitarias del CESFAM Santa Rosa. Reproduce las 17 pantallas del prototipo (`../prototipo/`, abrir `index.html`) y las conecta con la API del backend (contrato en `../docs/API.md`).

- React 19 + Vite 7. Sin librería de rutas: el enrutador propio (`src/router.jsx`) usa la API de historial del navegador, así que las direcciones son limpias (`/dashboard`, `/reportes`…) y el enlace de recuperación de contraseña que envía el backend (`/restablecer/<token>`) funciona tal cual.
- Necesita **Node 20.19 o superior** (o 22). Compruebe con `node --version`.

## Cómo ponerlo en marcha

Necesita **dos terminales de VS Code abiertas a la vez**: una con el backend y otra con el frontend.

**Terminal 1 (backend)**, dentro de la carpeta `backend`:

```
npm run dev
```

Debe aparecer `CESFAM Santa Rosa · API escuchando en http://localhost:3001`. Déjela abierta.

**Terminal 2 (frontend)**: Terminal → Nueva terminal, y desde la carpeta del proyecto:

```
cd frontend
npm install
copy .env.example .env
npm run dev
```

(Si dice que ya existe `.env`, está bien.)

Abra <http://localhost:5173> en el navegador. Cuentas de demostración y clave: ver el README de la carpeta principal.

Otros comandos:

```
npm run build      (genera la carpeta dist/ para producción; sirve para comprobar que compila)
npm run preview    (sirve dist/ en el puerto 4173)
```

El backend ya acepta peticiones desde `http://localhost:5173`. Si Vite usara otro puerto, habría que cambiar `FRONTEND_URL` y `CORS_ORIGIN` en el `.env` del backend. El puerto está fijo en `vite.config.js` (`strictPort`): si el 5173 está ocupado, Vite avisa en vez de cambiar de puerto en silencio.

### Si algo falla

| Síntoma | Qué hacer |
|---|---|
| En el login dice que no se pudo conectar con el servidor | El backend no está andando (terminal 1) o `VITE_API_URL` del `.env` no apunta a `http://localhost:3001/api`. Después de cambiar el `.env` hay que detener Vite (Ctrl+C) y volver a ejecutar `npm run dev`. |
| `npm install` falla con `EBADENGINE` | La versión de Node es menor a 20.19. Instale la LTS desde nodejs.org. |
| Una pantalla queda en blanco | Abra las herramientas del navegador (F12 → pestaña Consola) y copie el mensaje rojo; con eso se corrige. |
| Una pantalla muestra datos raros o vacíos | F12 → pestaña Red: haga clic en la petición que falló y copie la respuesta. |

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/main.jsx`, `src/App.jsx` | Arranque, tabla de rutas y guardia de acceso por permiso |
| `src/api.js` | Cliente de la API: token en memoria, renovación, 401/403, descargas, subida de archivos |
| `src/sesion.jsx` | Sesión, catálogos, mensajes flash entre pantallas |
| `src/router.jsx` | Enrutador con la API de historial |
| `src/layout.jsx` | Menú lateral según permisos, barra superior, tarjeta de acceso |
| `src/ui.jsx` | Componentes comunes (campos, avisos, botones con guarda de doble clic, paginación, confirmación) |
| `src/util.js` | Validaciones y formatos (fechas en hora de Chile, números con coma decimal) |
| `src/pantallas/auth.jsx` | 01 Inicio de sesión, 02 Olvidé mi contraseña / restablecer, 03 Cambiar contraseña |
| `src/pantallas/consultas.jsx` | 04 Dashboard, 05 Reportes, 06 Comparativo, 07 Detalle, 08 Exportar |
| `src/pantallas/cargas.jsx` | 09 Carga de REM, 10 Resultado de la validación, 11 Ingreso de población |
| `src/pantallas/administracion.jsx` | 12–13 Indicadores, 14–15 Usuarios, 16 Auditoría, 17 Acceso denegado |
| `src/estilos.css` | Estilos del prototipo |

## Pantallas, rutas del navegador y rutas de la API

| Pantalla | Ruta del navegador | Rutas de la API | Permiso |
|---|---|---|---|
| 01 Inicio de sesión | `/login` | `POST /auth/login` | público |
| 02 Olvidé mi contraseña | `/olvide`, `/restablecer/:token` | `POST /auth/olvide`, `GET` y `POST /auth/restablecer/:token` | público |
| 03 Cambiar contraseña | `/cambiar-clave` | `POST /auth/cambiar-clave` | sesión iniciada |
| 04 Dashboard | `/dashboard` | `GET /dashboard`, `GET /catalogos` | `dashboard` |
| 05 Reportes | `/reportes` | `GET /reportes` | `reportes` |
| 06 Comparativo anual | `/comparativo` | `GET /comparativo` | `comparativo` |
| 07 Detalle del indicador | `/detalle/:id` | `GET /indicadores/:id/detalle`, `GET` y `POST /indicadores/:id/comentarios` | `detalleIndicador` |
| 08 Exportar datos | `/exportar` | `GET /exportar` (descarga) | `exportar` |
| 09 Carga de REM | `/cargas` | `POST /cargas` (multipart), `GET /cargas` | `cargarRem` |
| 10 Resultado de la validación | `/cargas/:id` | `GET /cargas/:id` | `cargarRem` |
| 11 Ingreso de población | `/poblacion` | `GET /poblacion?periodo=`, `POST /poblacion` | `ingresarPoblacion` |
| 12 y 13 Indicadores | `/indicadores`, `/indicadores/nuevo`, `/indicadores/:id/editar` | `GET /indicadores`, `GET/POST/PUT /indicadores/:id` | `parametrizarIndicadores` |
| 14 y 15 Usuarios | `/usuarios`, `/usuarios/nuevo`, `/usuarios/:id/editar` | `GET /usuarios`, `GET/POST/PUT /usuarios/:id`, `PATCH /usuarios/:id/estado` | `gestionarUsuarios` |
| 16 Auditoría | `/auditoria` | `GET /auditoria` | `verAuditoria` |
| 17 Acceso denegado | `/acceso-denegado` | (cualquier respuesta `403`) | — |

## Reglas de seguridad y de comportamiento que cumple

1. **El token vive solo en memoria** (variable del módulo `api.js`); no se guarda en `localStorage`, `sessionStorage` ni cookies. Recargar la página (F5) cierra la sesión: es lo esperado.
2. **Renovación:** si una respuesta trae `X-Token-Renovado`, se reemplaza el token.
3. **`401`** → vuelve al inicio de sesión mostrando el mensaje de la API (por ejemplo, que la sesión expiró). **`403`** → pantalla 17.
4. **El menú y las rutas se arman con `permisos`** que entrega el login. Ocultar un botón no protege nada (el servidor revisa siempre); solo ordena la pantalla.
5. **Errores de validación:** se muestra `error` y cada mensaje de `campos` junto a su campo, con el foco en el primero.
6. **Textos de personas** (comentarios, nombres, observaciones) se dibujan como texto de React; nunca `dangerouslySetInnerHTML`.
7. **Inicio de sesión:** siempre el mismo mensaje de la API (correo inexistente, clave mala o cuenta bloqueada), sin pistas para quien intenta adivinar.
8. **Doble clic:** los botones de envío se deshabilitan mientras la solicitud está en curso (cargas, población, guardados).
9. **Descargas:** `fetch` con el token, `blob()` y un enlace temporal; el nombre del archivo viene de `Content-Disposition`.
10. Las credenciales de demostración **no** se muestran en la pantalla de inicio de sesión.

## Cómo se probó

- **Recorrido automático en un navegador real (Playwright/Chromium)** contra una API simulada construida a partir de `../docs/API.md`: 108 comprobaciones (inicio de sesión y errores, menús de los cuatro roles, las 17 pantallas, el recuadro "Cómo se calculó" del detalle con numerador ÷ denominador × 100, descarga real del CSV, renovación y vencimiento del token, pantallas 403, comentarios con HTML que no se ejecuta, carga de REM con y sin errores, doble clic, reglas de población, altas y ediciones con validaciones, auditoría con paginación y filtros, menú en pantalla de celular sin desplazamiento horizontal). Resultado: 108 de 108.
- **Pendiente de comprobar con el backend real** en el computador del equipo: cualquier diferencia entre lo que la API responde de verdad y lo que dice `../docs/API.md` solo se ve ahí. Los casos de `../docs/PRUEBAS.md` marcados como "Playwright" o "manual" se registran siguiendo la sección 4 de ese documento.
