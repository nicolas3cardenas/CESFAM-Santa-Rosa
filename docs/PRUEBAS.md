# Guía de pruebas

Cómo se prueba el sistema, cómo se ejecuta el protocolo y cómo queda el registro de lo esperado frente a lo obtenido (criterios de la Evaluación 3: cobertura del plan, ejecución del protocolo, validación de resultados y comparación obtenido vs esperado).

## 1. Qué tipos de pruebas hay

| Tipo | Con qué | Dónde | Qué comprueba |
|---|---|---|---|
| Unitarias | Jest | `backend/test/unit/` | Reglas de negocio puras: validaciones, cálculo del porcentaje y del estado, permisos, CSV, lectura de planillas |
| Integración | Jest + Supertest + PostgreSQL | `backend/test/integracion/` | La API completa contra una base real: sesión, bloqueo, recuperación, consultas, carga de REM, población, indicadores, usuarios, auditoría, permisos por rol |
| Seguridad | Jest + Supertest | `backend/test/integracion/seguridad.test.js` | Inyección SQL y scripts en todos los campos, cabeceras, CORS, solicitudes mal formadas, errores sin detalles técnicos, privilegios de la base |
| Base de datos | Jest + PostgreSQL | `backend/test/integracion/bd.test.js` | Restricciones del modelo y el bloque de verificación (T-10) de `database/03_verificar_tablas.sql` |
| Concurrencia | Jest + Supertest | `backend/test/integracion/concurrencia.test.js` | Doble clic, cargas simultáneas, 50 consultas a la vez y tiempos bajo 3 s |
| Carga | k6 | `backend/k6/carga.js` | 10 usuarios simultáneos durante 1 minuto, cada respuesta bajo 3 s (T-11, RNF-03) |
| Recorrido completo | Playwright | `frontend/` (Benjamín) | Las pantallas reales de punta a punta |
| Manual | Persona | Ver sección 4 | Lo que no se automatiza: ver el resultado en pantalla, pgAdmin, textos |

Cada prueba automática lleva en su nombre el **código del plan** (por ejemplo `P5-1` o `T-6`). Así el informe puede relacionar cada caso del plan con lo que realmente se ejecutó.

## 2. Ejecutar

Desde la carpeta `backend` (el README principal explica cómo dejar listo el `.env` y la base de pruebas):

```
npm run db:crear:test        (una sola vez)
npm run test:cobertura       deja resultados/jest.json y resultados/cobertura/
```

Las pruebas se pueden repetir las veces que haga falta: cada archivo recrea la base de pruebas con sus datos antes de empezar. **Nunca** apuntan a la base de desarrollo (se niegan si el nombre no termina en `_test`).

Para ver solo una parte:

```
npx jest test/integracion/cargas.test.js
npx jest -t "P11-"            (solo las pruebas cuyo nombre contiene P11-)
```

## 3. El informe de esperado frente a obtenido

```
npm run informe
```

Lee `resultados/jest.json` (y, si existen, `resultados/cobertura/`, `resultados/k6.json` y `resultados/manual.json`) y escribe:

- `docs/resultados_pruebas.md`: resumen, cobertura del código, cobertura del plan por tipo, **tabla de los 88 casos (esperado, obtenido y estado)**, pruebas con falla y pruebas adicionales.
- `docs/resultados_pruebas.csv`: la misma tabla para abrir en Excel o pegar en el informe final.

Estados de cada caso:

| Estado | Significa |
|---|---|
| Cumple | Todas sus pruebas pasaron (y la parte manual, Playwright o k6 está registrada y también pasó) |
| Parcial | La parte automática pasó, pero falta registrar la ejecución manual, Playwright o k6 |
| Pendiente | Solo se prueba a mano, con Playwright o con k6 y todavía no hay registro |
| Sin cubrir | El plan pide una prueba automática y ninguna lleva ese código |
| No cumple | Alguna prueba falló: el informe lo dice y termina con código de error |

La lista de casos del plan está en `backend/test/casos_plan.json`. Si el plan cambia, se cambia ahí.

## 4. Registrar lo probado a mano o con Playwright

Cree el archivo `backend/resultados/manual.json` con un registro por caso:

```json
{
  "P1-5": { "estado": "Cumple", "obtenido": "El mensaje de bloqueo coincide con el prototipo", "fecha": "2026-11-20", "responsable": "Nicolás" },
  "P1-4": { "estado": "Cumple", "obtenido": "Playwright: 6 de 6 pasos", "fecha": "2026-11-21", "responsable": "Benjamín" },
  "P9-4": { "estado": "No cumple", "obtenido": "El botón no se deshabilita al hacer clic", "fecha": "2026-11-21", "responsable": "Benjamín" }
}
```

- `estado`: `Cumple` o `No cumple` (cualquier otro texto cuenta como no cumple).
- `obtenido`: lo que realmente pasó, con palabras simples.
- Para los casos T-11 y P5-6 no hace falta escribir nada si se ejecuta k6 con `--summary-export=resultados/k6.json`: el informe lo lee solo.

El protocolo para una prueba manual: abrir la pantalla, hacer lo que dice la columna "Qué se prueba" con un dato válido y uno inválido, comparar con "Resultado esperado" y "Si el dato no es válido", y anotar el resultado en `manual.json` con la fecha.

## 5. Datos de prueba

- Base de desarrollo y pruebas: los datos de demostración de `database/06_datos_demo.sql` (6 usuarios, 5 indicadores, 6 períodos, 7 cargas, comentarios y auditoría). Son inventados.
- Planillas REM de práctica: `npm run rem:demo` (ver README).
- **No** se usan datos reales de pacientes ni el REM real del CESFAM en pruebas, capturas ni demostraciones con herramientas externas.

## 6. Demostración de la base de datos (T-10)

Para mostrarla en pgAdmin, en una base vacía de práctica: ejecutar `database/01_crear_tablas.sql`, luego `02_datos_prueba.sql` y por último `03_verificar_tablas.sql`. El bloque E del script intenta 8 datos inválidos y la base los rechaza todos (`OK (rechazado): ...`). La misma comprobación está automatizada en `bd.test.js`.
