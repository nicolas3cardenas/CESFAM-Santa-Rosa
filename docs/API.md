# Guía de la API (contrato entre backend y frontend)

Sistema de metas sanitarias del CESFAM Santa Rosa. Esta guía es para quien arma las pantallas en React: qué se pide, qué se recibe y qué errores esperar. Todo lo que dice aquí lo comprueban las pruebas automáticas del backend (`backend/test/`).

- Dirección base en desarrollo: `http://localhost:3001/api`
- Formato: JSON en ambos sentidos (`Content-Type: application/json`), salvo la carga de archivos (`multipart/form-data`) y las exportaciones.
- Fechas y horas: texto ISO 8601 en UTC (por ejemplo `2026-06-12T14:20:00+00:00`). El frontend las muestra en hora de Chile (`America/Santiago`).
- Períodos: texto `AAAA-MM` (por ejemplo `2026-06`). Fechas de rango: `AAAA-MM-DD`.
- Las rutas de `/api` no se guardan en caché (`Cache-Control: no-store`).

## 1. Sesión

Todas las rutas, salvo las de la sección 2, exigen la cabecera:

```
Authorization: Bearer <token>
```

El token se obtiene al iniciar sesión y se guarda **en memoria de la aplicación** (no en `localStorage`; así un script malicioso no lo puede leer). Si la persona recarga la página, vuelve a iniciar sesión.

| Situación | Qué hace el servidor | Qué hace el frontend |
|---|---|---|
| Token vencido, manipulado o de una cuenta desactivada | `401` `{ "error": "La sesión venció o no es válida. Inicie sesión nuevamente." }` (sin la cabecera: `"Debe iniciar sesión"`) | Llevar a la pantalla de inicio de sesión |
| Contraseña cambiada desde otra sesión | `401` (el token anterior deja de servir) | Igual que arriba |
| Sesión con actividad | El servidor puede responder con la cabecera **`X-Token-Renovado: <token nuevo>`** | Si llega esa cabecera, **reemplazar el token guardado por el nuevo** en todas las llamadas siguientes |
| Inactividad | La sesión dura 30 minutos desde la última renovación y, en total, 8 horas | Avisar y volver al inicio de sesión |

Los permisos (qué puede hacer cada rol) **siempre se vuelven a comprobar en el servidor**. El frontend usa `permisos` solo para decidir qué botones y menús mostrar.

## 2. Autenticación (`/api/auth`)

Estas rutas tienen límite de intentos por dirección IP (`429` con "Demasiados intentos...").

### `POST /api/auth/login`
Cuerpo: `{ "correo": "directora@demo.cl", "clave": "ClaveDemo2026" }`

Respuesta `200`:
```json
{
  "token": "eyJ...",
  "expiraEnMinutos": 30,
  "usuario": { "id": 1, "nombre": "Directora Demo", "correo": "directora@demo.cl", "rolId": 1, "rol": "Directora", "programaId": null, "programa": null },
  "permisos": { "dashboard": true, "comparativo": true, "reportes": true, "detalleIndicador": true, "exportar": true, "verComentarios": true,
                "comentar": false, "cargarRem": false, "ingresarPoblacion": false, "parametrizarIndicadores": false, "gestionarUsuarios": false, "verAuditoria": false }
}
```
Errores: `400` si el correo o la clave no tienen formato válido (`campos` dice cuál); `401` `{ "error": "Correo o contraseña incorrectos" }` para **cualquier** otro problema (correo que no existe, clave mala, cuenta bloqueada o desactivada). Es el mismo mensaje a propósito: la pantalla no debe decir cuál de las cosas pasó.
Tras 5 intentos fallidos la cuenta se bloquea 15 minutos (el servidor sigue respondiendo el mismo mensaje).

### `POST /api/auth/olvide`
Cuerpo: `{ "correo": "..." }`. Respuesta `200` siempre igual: `{ "mensaje": "Si el correo está registrado, recibirá un enlace" }`.
En desarrollo el enlace no se envía por correo: aparece en la **consola del servidor** (`MODO_CORREO=consola`).

### `GET /api/auth/restablecer/:token`
Revisa si el enlace sirve. `200` `{ "valido": true }` o `400` `{ "error": "Enlace no válido" }` (vencido, ya usado o inexistente; el mismo mensaje en los tres casos).

### `POST /api/auth/restablecer/:token`
Cuerpo: `{ "clave": "...", "confirmacion": "..." }`. `200` `{ "mensaje": "Contraseña actualizada. Ya puede iniciar sesión." }`. El enlace sirve una sola vez y dura 30 minutos.

### `POST /api/auth/cambiar-clave` (con sesión)
Cuerpo: `{ "claveActual": "...", "claveNueva": "...", "confirmacion": "..." }`.
`200` `{ "mensaje": "Contraseña actualizada", "token": "<token nuevo>" }`: **guardar el token nuevo** (el anterior queda sin validez).

### `GET /api/auth/yo` (con sesión)
Devuelve `{ usuario, permisos }` como en el login. Sirve para armar el menú al abrir la aplicación.

### `POST /api/auth/salir` (con sesión)
`204` sin cuerpo. El frontend descarta el token.

Regla de contraseñas: de 8 a 64 caracteres.

## 3. Roles y permisos

| Permiso | Directora | Subdirección | Gestor de Información | Jefe de Programa |
|---|---|---|---|---|
| `dashboard`, `comparativo` | Sí | Sí | No | No |
| `reportes`, `detalleIndicador`, `exportar`, `verComentarios` | Sí | Sí | No | Sí (solo su programa) |
| `comentar` | No | No | No | Sí (solo su programa) |
| `cargarRem`, `ingresarPoblacion`, `parametrizarIndicadores` | No | Sí | Sí | No |
| `gestionarUsuarios`, `verAuditoria` | No | No | Sí | No |

Un rol sin permiso recibe `403` `{ "error": "No tiene permiso para realizar esta acción" }` y **ningún dato**. La pantalla 17 ("Acceso denegado") se muestra ante ese `403`.
El **Jefe de Programa** queda siempre limitado a su programa: sus consultas se filtran solas, y pedir otro programa (o un indicador de otro programa) da `403`.

## 4. Formato de los errores

```json
{ "error": "Revise los datos ingresados", "campos": { "correo": "Ingrese un correo válido", "clave": "La contraseña debe tener entre 8 y 64 caracteres" } }
```
`campos` solo viene en los errores de validación; trae un mensaje por cada campo con problema (se muestra al lado del campo).

| Código | Cuándo |
|---|---|
| `400` | Datos inválidos (con `campos`) o enlace no válido |
| `401` | Sin sesión, sesión vencida o credenciales incorrectas |
| `403` | El rol no puede hacer eso |
| `404` | No existe (indicador, usuario, carga, ruta) |
| `405` | Se intentó modificar la auditoría (solo se puede leer) |
| `409` | Duplicado (correo repetido, población ya ingresada) |
| `413` | Archivo de más de 10 MB, o cuerpo JSON de más de 100 KB |
| `429` | Demasiados intentos de inicio de sesión |
| `500` | `{ "error": "Ocurrió un error inesperado. Intente nuevamente más tarde." }` (sin detalles técnicos) |

## 5. Catálogos

### `GET /api/catalogos`
Todo lo que las listas desplegables necesitan:
```json
{
  "programas": [{ "id": 1, "nombre": "Matronas" }],
  "roles": [{ "id": 4, "nombre": "Jefe de Programa", "requierePrograma": true }],
  "periodos": ["2026-06", "2026-05"],
  "anios": ["2026", "2025"],
  "cortes": ["Todos los cortes", "Corte 1", "Corte 2", "Corte 3"],
  "formatos": ["CSV", "XLSX"],
  "origenesDenominador": ["REM", "POBLACION"]
}
```
`periodos` y `anios` son solo los que **tienen datos** (del más nuevo al más antiguo). Para un Jefe, `programas` trae solo el suyo.

## 6. Consultas de resultados

Cada resultado tiene `estado`: `cumple` (igual o sobre la meta), `riesgo` (desde el 90 % de la meta), `nocumple`, `sin_poblacion` (falta ingresar la población del mes; `resultado` viene `null`) o `sin_datos`.
`resultado` es un porcentaje con hasta 2 decimales.

### `GET /api/dashboard?periodo=AAAA-MM&programaId=`
Sin `periodo` usa el último mes con datos. Para un mes sin datos responde `200` con `"sinDatos": true`, `"mensaje": "Sin datos para el período"` y `indicadores: []`.
```json
{ "periodo": "2026-06", "programaId": null, "sinDatos": false,
  "resumen": { "cumple": 2, "riesgo": 1, "nocumple": 1, "sinPoblacion": 1, "sinDatos": 0 }, "faltaPoblacion": 1,
  "indicadores": [ { "indicadorId": 1, "codigo": "IND-01", "nombre": "...", "programaId": 1, "programa": "Matronas", "origenDenominador": "REM",
                     "meta": 80, "pesoRelativo": 10, "periodo": "2026-06", "numerador": 1722, "denominador": 2100, "resultado": 82, "estado": "cumple" } ] }
```

### `GET /api/reportes?mes=AAAA-MM` o `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`
Opcionales: `corte` (hoy solo es una etiqueta) y `programaId`. Si se envía el rango, se usa en lugar de `mes`. Para el rango deben venir **ambas** fechas, `hasta` no puede ser anterior a `desde`.
```json
{ "modo": "mes", "titulo": "2026-06", "periodos": ["2026-06"], "corte": "Todos los cortes", "programaId": null, "sinDatos": false,
  "filas": [ { "indicadorId": 1, "codigo": "IND-01", "nombre": "...", "programaId": 1, "programa": "Matronas", "meta": 80,
               "valores": [ { "periodo": "2026-06", "numerador": 1722, "denominador": 2100, "resultado": 82, "estado": "cumple" } ] } ] }
```
Un rango sin datos responde `200` con `sinDatos: true` y `"mensaje": "Sin datos para el rango elegido"`. Un `mes` que no esté en la lista de períodos da `400`.

### `GET /api/comparativo?anioActual=2026&anioComparar=2025&programaId=`
Compara el promedio de los resultados mensuales de cada año. Los dos años deben estar en `anios` y ser distintos (`400` si no).
```json
{ "anioActual": "2026", "anioComparar": "2025", "programaId": null,
  "indicadores": [ { "indicadorId": 1, "codigo": "IND-01", "nombre": "...", "programaId": 1, "programa": "Matronas", "meta": 80,
                     "actual": { "resultado": 76.25, "meses": 4, "estado": "riesgo" }, "comparado": { "resultado": 70, "meses": 1, "estado": "nocumple" }, "diferencia": 6.25 } ] }
```
`meses` es la cantidad de meses con dato que entran en el promedio.

### `GET /api/indicadores/:id/detalle?periodo=AAAA-MM`
Ficha del indicador con su historial. Sin `periodo`: `periodo` y `resultado` vienen `null` y se entrega el historial completo.
```json
{ "indicador": { "id": 1, "nombre": "...", "programaId": 1, "programa": "Matronas", "remCodigo": "IND-01", "seccion": "Sección A", "celdaNumerador": "B12",
                 "origenDenominador": "REM", "celdaDenominador": "C12", "codigoPrestacion": "PREV-01", "metaNacional": 80, "pesoRelativo": 10,
                 "referenteResponsable": "...", "activo": true },
  "periodo": null, "resultado": null,
  "historial": [ { "periodo": "2026-06", "numerador": 1722, "denominador": 2100, "resultado": 82, "estado": "cumple" } ] }
```

### Comentarios
- `GET /api/indicadores/:id/comentarios?periodo=` → `{ "comentarios": [ { "id", "indicadorId", "autor", "periodo", "texto", "fecha" } ] }` (más nuevos primero).
- `POST /api/indicadores/:id/comentarios` (solo Jefe de su programa) cuerpo `{ "periodo": "2026-06", "texto": "..." }` → `201` con el comentario. El texto va de 1 a 500 caracteres.

**Importante para React:** los textos (comentarios, nombres) llegan tal como se escribieron, incluso con `<script>`. Mostrarlos siempre como texto (`{comentario.texto}`), nunca con `dangerouslySetInnerHTML`.

### `GET /api/exportar?formato=CSV|XLSX&periodo=AAAA-MM&programaId=`
Devuelve un archivo, no JSON. `Content-Disposition: attachment; filename="metas_2026-06.csv"` (o `.xlsx`). Columnas: Código, Indicador, Programa, Meta (%), Numerador, Denominador, Resultado (%), Estado.
El CSV usa `;` como separador, coma decimal y BOM (se abre bien en Excel en español). En React: `fetch` con el token, `response.blob()` y descargar con un enlace temporal.

## 7. Carga de REM y población

### `POST /api/cargas` (Subdirección y Gestor)
`multipart/form-data` con el campo `archivo` (planilla `.xlsx` o `.xlsm`, hasta 10 MB) y el campo `periodo` (`AAAA-MM`). No se debe fijar `Content-Type` a mano: el navegador lo arma con `FormData`.
```json
{ "id": 8, "periodo": "2026-07", "archivo": "rem.xlsx", "usuario": "Gestor Demo", "fecha": "2026-07-03T13:00:00+00:00",
  "estado": "Validada",
  "resumen": { "hojas_esperadas": 4, "hojas_leidas": 4, "celdas_leidas": 7, "celdas_vacias": [ { "hoja": "Sección D", "celda": "D8", "indicador": "IND-03" } ],
               "errores": [], "advertencias": [ "..." ] },
  "totales": { "errores": 0, "celdasVacias": 1, "advertencias": 1 }, "resultadosCreados": 5 }
```
- `estado`: `Validada` o `Con errores`. Con errores **no se crea ningún resultado** (`resultadosCreados: 0`) y `resumen.errores` dice qué hoja o celda falló: `{ "hoja", "celda", "problema" }`. Esta respuesta alimenta la pantalla 10 (resultado de la validación); termina en `201` en ambos casos.
- Una celda en blanco cuenta como 0 y se informa en `celdas_vacias`.
- Si falta la población de un indicador, su resultado queda `sin_poblacion` hasta que se ingrese (el cálculo se completa solo).
- Archivo que no es Excel, de otro tipo, vacío o dañado: `400`. Más de 10 MB: `413`.
- Se usa la **última carga** de cada mes como la vigente.

### `GET /api/cargas?pagina=1&tamano=20`
`{ "total", "pagina", "tamano", "cargas": [ ...mismo formato... ] }`, de la más nueva a la más antigua. `tamano` va de 1 a 100.

### `GET /api/cargas/:id`
Una carga, mismo formato.

### `GET /api/poblacion?periodo=AAAA-MM` (Subdirección y Gestor)
Indicadores cuyo denominador es la población (no el REM) con su valor del mes:
`{ "periodo": "2026-06", "indicadores": [ { "indicadorId", "codigo", "nombre", "programa", "valor": 420, "fechaIngreso": "...", "pendiente": false } ] }`. `pendiente: true` cuando falta ingresarla.

### `POST /api/poblacion`
Cuerpo `{ "indicadorId": 5, "periodo": "2026-06", "valor": 900 }` (entero de 1 a 1.000.000).
`201` `{ "id", "indicadorId", "periodo", "valor", "resultadosActualizados": 1 }`. Si ya existía: `409` `{ "error": "Ya existe población para ese período" }` (no se puede cambiar un valor ya ingresado). Un indicador desactivado o cuyo denominador viene del REM da `400`.

## 8. Indicadores (parametrización; Subdirección y Gestor)

- `GET /api/indicadores?q=&programaId=` → `{ "indicadores": [ {...} ] }` (mismo objeto de la ficha). `q` busca en nombre y código.
- `GET /api/indicadores/:id` → un indicador.
- `POST /api/indicadores` → `201`. `PUT /api/indicadores/:id` → `200`. Cuerpo (el mismo para ambos):

| Campo | Regla |
|---|---|
| `nombre` | 1 a 200 caracteres |
| `programaId` | uno de `catalogos.programas` |
| `remCodigo` | 1 a 20 caracteres |
| `seccion` | opcional, hasta 50 |
| `celdaNumerador` | celda de Excel (`B12`, `AA5`) |
| `origenDenominador` | `REM` o `POBLACION` |
| `celdaDenominador` | **obligatoria** si el origen es `REM` y **no se admite** si es `POBLACION` |
| `codigoPrestacion` | opcional, hasta 50 |
| `metaNacional` | número de 0 a 99.999,99 con hasta 2 decimales |
| `pesoRelativo` | número de 0 a 100 con hasta 2 decimales |
| `referenteResponsable` | opcional, hasta 100 |
| `activo` | `true` o `false` (por defecto `true`) |

No existe borrar: un indicador se desactiva (`activo: false`) y su historial se conserva.

## 9. Usuarios (solo Gestor de Información)

- `GET /api/usuarios?q=&rolId=` → `{ "usuarios": [ { "id", "nombre", "correo", "activo", "rolId", "rol", "programaId", "programa", "creadoEn" } ] }`
- `GET /api/usuarios/:id`
- `POST /api/usuarios` → `201`. Cuerpo `{ "nombre", "correo", "rolId", "programaId", "clave" }`. `programaId` es **obligatorio solo para el rol Jefe de Programa** (`requierePrograma: true`) y no se admite para los demás. Correo repetido: `409`.
- `PUT /api/usuarios/:id` → mismo cuerpo, sin `clave`.
- `PATCH /api/usuarios/:id/estado` → cuerpo `{ "activo": false }`. La cuenta desactivada no puede entrar y sus sesiones abiertas dejan de servir.

Nunca se devuelve la contraseña ni su hash.

## 10. Auditoría (solo Gestor de Información, solo lectura)

`GET /api/auditoria?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&usuarioId=&entidad=&pagina=1&tamano=20`
- `desde` y `hasta` van juntas (o ninguna). Se incluye el día completo de `hasta`, en hora de Chile.
- `entidad`: `usuario`, `indicador`, `carga_rem`, `poblacion_denominador`, `comentario_indicador`.
- Respuesta: `{ "total", "pagina", "tamano", "registros": [ { "id", "fecha", "usuario": { "id", "nombre" } | null, "accion", "entidad", "entidadId", "detalle": { "antes": {...}, "despues": {...} } } ] }`, del más nuevo al más antiguo.
- `usuario` es `null` cuando el hecho no tiene usuario (por ejemplo, un intento de ingreso con un correo que no existe).
- Acciones: `LOGIN_FALLIDO`, `CUENTA_BLOQUEADA`, `CAMBIO_CLAVE`, `RESTABLECER_CLAVE`, `SOLICITUD_RECUPERACION`, `LOGOUT`, `CARGA_REM`, `INGRESO_POBLACION`, `CREAR_INDICADOR`, `ACTUALIZAR_INDICADOR`, `CREAR_USUARIO`, `ACTUALIZAR_USUARIO`, `ACTIVAR_USUARIO`, `DESACTIVAR_USUARIO`, `COMENTAR_INDICADOR`.
- Los registros no traen contraseñas, hashes ni el texto de los comentarios.
- `POST`, `PUT`, `PATCH` y `DELETE` responden `405` con `Allow: GET`.

## 11. Salud del servidor

`GET /api/salud` (sin sesión) → `200` `{ "ok": true }`. Sirve para comprobar que el servidor está arriba.

## 12. Cómo conectar el frontend en desarrollo

1. Backend en `http://localhost:3001` (`npm run dev` dentro de `backend`).
2. React con Vite en `http://localhost:5173` (la dirección ya está autorizada en `FRONTEND_URL` y `CORS_ORIGIN` del `.env`). Si usa otro puerto, hay que cambiar esas dos variables.
3. Variable del frontend: `VITE_API_URL=http://localhost:3001/api`.
4. Cuentas de demostración (contraseña `ClaveDemo2026`): `directora@demo.cl`, `subdireccion@demo.cl`, `gestor@demo.cl`, `jefe.matronas@demo.cl`, `jefe.saludmental@demo.cl`. La cuenta `jefe.kine@demo.cl` está desactivada a propósito (para probar ese caso).
