# Sistema de metas sanitarias del CESFAM Santa Rosa

Proyecto Integrado (INACAP). Sistema web para seguir las metas sanitarias, los indicadores IAAPS y los REM del CESFAM Santa Rosa: carga de la planilla REM, cálculo del cumplimiento de cada indicador, dashboard, reportes, comparativo anual, exportación, comentarios de los Jefes de Programa y registro de auditoría.

- Backend: Node.js + Express, PostgreSQL, autenticación con JWT.
- Frontend: React (en `frontend/`; el prototipo aprobado está en `prototipo/`).
- Base de datos: PostgreSQL 17, con un usuario de la aplicación de privilegio mínimo.

## Carpetas

| Carpeta | Qué hay |
|---|---|
| `backend/` | La API (código en `src/`), scripts de base de datos y pruebas (`test/`), prueba de carga (`k6/`) |
| `database/` | Scripts SQL: tablas (01), datos de prueba (02), verificación (03), permisos (04), roles y programas (05), datos de demostración (06) |
| `docs/` | `API.md` (contrato para el frontend), `PRUEBAS.md` (cómo probar y cómo registrar resultados) |
| `frontend/` | La aplicación React (ver `frontend/README.md`) |
| `prototipo/` | Prototipo HTML de las 17 pantallas (abrir `index.html`) |

## Lo que necesita instalado

1. **Node.js 20 o 22 (LTS)**: <https://nodejs.org>. Compruebe con `node --version`.
2. **PostgreSQL 17** y pgAdmin (ya instalados). Anote la contraseña que le puso al usuario `postgres`.
3. **Visual Studio Code**.
4. **Git**.
5. Solo para la prueba de carga: **k6** (`winget install k6` en una terminal de Windows).

## Puesta en marcha (primera vez)

Todo se hace desde la terminal de VS Code (menú Terminal → Nueva terminal), dentro de la carpeta `backend`.

**1. Abrir la carpeta.** En VS Code: Archivo → Abrir carpeta → `cesfam-santa-rosa`. Luego, en la terminal:

```
cd backend
npm install
```

**2. Crear el archivo `.env`** (la configuración; este archivo nunca se sube a GitHub):

```
copy .env.example .env
```

Abra `.env` y complete:

| Variable | Qué poner |
|---|---|
| `DATABASE_ADMIN_URL` | `postgres://postgres:SU_CLAVE_DE_POSTGRES@localhost:5432/cesfam_santa_rosa` (cambie `SU_CLAVE_DE_POSTGRES` por la de su instalación) |
| `API_DB_PASSWORD` | Una contraseña nueva para el usuario de la aplicación (`cesfam_api`), por ejemplo una frase larga sin espacios |
| `DATABASE_URL` | `postgres://cesfam_api:LA_MISMA_CLAVE_DE_ARRIBA@localhost:5432/cesfam_santa_rosa` |
| `TEST_DATABASE_ADMIN_URL` y `TEST_DATABASE_URL` | Igual que las dos anteriores, pero con la base `cesfam_santa_rosa_test` (el nombre **debe** terminar en `_test`) |
| `JWT_SECRET` | Texto aleatorio largo. Para generarlo, en la terminal: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` y pegue el resultado |

Si la contraseña tiene símbolos como `@`, `:` o `/`, escríbalos codificados (`@` → `%40`, `:` → `%3A`, `/` → `%2F`) o use una contraseña solo con letras y números.

**3. Crear la base de datos** (crea el usuario `cesfam_api`, la base, las tablas, los permisos, los roles y los datos de demostración):

```
npm run db:crear
```

Debe terminar con `Listo: base "cesfam_santa_rosa" creada con tablas, permisos y datos.` Si la base ya tenía tablas, el comando se niega para no borrarlas; para recrearla a propósito use `npm run db:crear -- --forzar`.

Para verla en pgAdmin: clic derecho en *Databases* → *Refresh*; abra `cesfam_santa_rosa` → Schemas → public → Tables (deben aparecer 10 tablas).

**4. Levantar el servidor:**

```
npm run dev
```

Abra <http://localhost:3001/api/salud> en el navegador: debe decir `{"ok":true}`.

**5. Cuentas de demostración** (contraseña de todas: `ClaveDemo2026`):

| Correo | Rol |
|---|---|
| `directora@demo.cl` | Directora |
| `subdireccion@demo.cl` | Subdirección |
| `gestor@demo.cl` | Gestor de Información |
| `jefe.matronas@demo.cl` | Jefe de Programa (Matronas) |
| `jefe.saludmental@demo.cl` | Jefe de Programa (Salud Mental) |
| `jefe.kine@demo.cl` | Jefe de Programa (Kinesiología), cuenta **desactivada** a propósito |

**Antes de mostrar el sistema a alguien, cambie estas contraseñas** (pantalla "Cambiar contraseña") o cree las cuentas reales y desactive las de demostración.

## Probar el backend sin el frontend

Con el servidor andando, una prueba rápida desde la terminal (PowerShell):

```
curl.exe -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"correo\":\"directora@demo.cl\",\"clave\":\"ClaveDemo2026\"}"
```

Devuelve el token y los permisos. La lista completa de rutas está en `docs/API.md`.

### Probar la carga de un REM

El REM real del CESFAM **no** se usa para pruebas ni demostraciones. Para practicar hay un generador de planillas inventadas:

```
npm run rem:demo -- 2026-07
npm run rem:demo -- 2026-07 --con-errores
npm run rem:demo -- 2026-07 --celda-vacia
```

Crea los archivos en `backend/datos_demo/`. Se suben en la pantalla "Cargar REM" (o con `POST /api/cargas`). El segundo muestra la pantalla "Con errores" y el tercero el aviso de celda en blanco.

## Pruebas automáticas

Hay unas 670 pruebas (unitarias, de integración con la base de datos, de seguridad, de concurrencia y de la propia base). Usan **una base aparte** (`cesfam_santa_rosa_test`) y se niegan a correr contra otra.

```
npm run db:crear:test          (una sola vez)
npm test                       (todas las pruebas)
npm run test:cobertura         (todas, y mide cuánto código cubren)
npm run informe                (arma docs/resultados_pruebas.md y .csv: esperado vs obtenido)
```

Detalles y cómo registrar lo que se prueba a mano o con Playwright: `docs/PRUEBAS.md`.

Prueba de carga con 10 usuarios (servidor andando en otra terminal):

```
k6 run --summary-export=resultados/k6.json k6/carga.js
```

## Seguridad: qué está hecho y dónde

| Medida | Dónde |
|---|---|
| Consultas parametrizadas (sin concatenar texto en el SQL) | todo `src/servicios/` |
| Contraseñas con bcrypt; nunca se devuelven ni se guardan en la auditoría | `src/lib/claves.js` |
| Bloqueo de cuenta tras 5 intentos fallidos (15 min) y mismo mensaje en todos los fallos de ingreso | `src/servicios/auth.js` |
| Límite de intentos por IP en inicio de sesión y recuperación | `src/middleware/limites.js` |
| Sesión con vencimiento, renovación y cierre al cambiar la contraseña | `src/middleware/auth.js`, `src/lib/claves.js` |
| Permisos por rol comprobados en el servidor en cada ruta, y el Jefe limitado a su programa | `src/lib/permisos.js`, `src/middleware/auth.js` |
| Validación de todos los datos de entrada | `src/lib/validaciones.js` |
| Archivos: solo `.xlsx/.xlsm`, máximo 10 MB, revisión del ZIP (bombas, cifrado), macros sin ejecutar | `src/lib/planilla.js`, `src/lib/zip.js` |
| Cabeceras de seguridad (helmet), CORS restringido al frontend, sin caché en `/api` | `src/app.js` |
| Errores sin detalles técnicos | `src/middleware/errores.js` |
| Auditoría que no se puede modificar (ni por la API ni con el usuario de la base de datos) | `database/04_permisos.sql` |
| Exportación CSV protegida contra fórmulas | `src/lib/csv.js` |

Para revisar las dependencias: `npm run audit`.

## Pendientes conocidos

- Envío real de correos de recuperación: hoy el enlace aparece en la consola del servidor (`MODO_CORREO=consola`). Falta definir el servidor de correo del CESFAM.
- El campo "corte" de los reportes IAAPS es solo una etiqueta; todavía no filtra.
- La aplicación React (`frontend/`) está por armar a partir del prototipo.

## Subir el trabajo a GitHub (lo hace usted)

```
git init
git add .
git status          (compruebe que NO aparece .env ni node_modules)
git commit -m "Backend y base de datos del sistema CESFAM Santa Rosa"
git branch -M main
git remote add origin https://github.com/SU_USUARIO/SU_REPOSITORIO.git
git push -u origin main
```

El archivo `.gitignore` ya excluye `.env`, `node_modules/`, `resultados/` y `coverage/`. **Nunca** suba el `.env` (tiene las contraseñas) ni archivos REM reales.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| `password authentication failed for user "postgres"` | La contraseña en `DATABASE_ADMIN_URL` no es la de su PostgreSQL |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL no está andando (Servicios de Windows → postgresql-x64-17 → Iniciar) |
| `JWT_SECRET debe tener al menos 32 caracteres` | Genere uno con el comando del paso 2 |
| `Por seguridad, las pruebas solo corren contra una base ... "_test"` | `TEST_DATABASE_URL` no termina en `_test` |
| `La base ... ya tiene tablas y este comando las BORRA` | Es una protección; use `--forzar` solo si quiere empezar de cero |
| `429 Demasiados intentos` | Se superó el límite de intentos de ingreso; espere 15 minutos o reinicie el servidor |
| `npm : ... la ejecución de scripts está deshabilitada en este sistema` (PowerShell) | Abra la terminal de tipo *Command Prompt* (flecha junto al `+` de la terminal de VS Code) o ejecute una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `EADDRINUSE :::3001` | Ya hay un servidor andando en ese puerto; ciérrelo o cambie `PORT` en `.env` |
