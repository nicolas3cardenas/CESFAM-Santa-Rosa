-- =====================================================================
-- 02_datos_prueba.sql
-- Datos INVENTADOS para mostrar la base funcionando.
-- Ningún dato real del CESFAM: nombres, correos, códigos y cifras son de ejemplo.
-- Ejecutar DESPUÉS de 01_crear_tablas.sql.
-- =====================================================================

BEGIN;

INSERT INTO rol (nombre, requiere_programa) VALUES
    ('Directora',             false),
    ('Subdirección',          false),
    ('Gestor de Información', false),
    ('Jefe de Programa',      true);

INSERT INTO programa (nombre) VALUES
    ('Programa de ejemplo A'),
    ('Programa de ejemplo B');

-- password_hash NO es un hash real: la aplicación lo generará con bcrypt o argon2.
INSERT INTO usuario (nombre, email, password_hash, rol_id, programa_id) VALUES
    ('Directora Ejemplo',
     'directora@ejemplo.cl', 'HASH_DE_EJEMPLO_NO_REAL',
     (SELECT id FROM rol WHERE nombre = 'Directora'), NULL),
    ('Subdirección Ejemplo',
     'subdireccion@ejemplo.cl', 'HASH_DE_EJEMPLO_NO_REAL',
     (SELECT id FROM rol WHERE nombre = 'Subdirección'), NULL),
    ('Gestor Ejemplo',
     'gestor@ejemplo.cl', 'HASH_DE_EJEMPLO_NO_REAL',
     (SELECT id FROM rol WHERE nombre = 'Gestor de Información'), NULL),
    ('Jefe Ejemplo A',
     'jefe.a@ejemplo.cl', 'HASH_DE_EJEMPLO_NO_REAL',
     (SELECT id FROM rol WHERE nombre = 'Jefe de Programa'),
     (SELECT id FROM programa WHERE nombre = 'Programa de ejemplo A'));

INSERT INTO indicador
    (nombre, programa_id, rem_codigo, seccion, celda_numerador,
     origen_denominador, celda_denominador, meta_nacional, peso_relativo)
VALUES
    ('Indicador de ejemplo 1 (denominador: población)',
     (SELECT id FROM programa WHERE nombre = 'Programa de ejemplo A'),
     'REM-EJ-01', 'Sección A', 'B12', 'POBLACION', NULL, 80.00, 10.00),
    ('Indicador de ejemplo 2 (denominador: celda del REM)',
     (SELECT id FROM programa WHERE nombre = 'Programa de ejemplo B'),
     'REM-EJ-02', 'Sección B', 'C10', 'REM', 'C20', 60.00, 5.00);

-- Dato no estructurado 1: resumen de validación de una carga (JSONB)
INSERT INTO carga_rem (periodo, archivo_nombre, usuario_id, resumen_validacion) VALUES
    ('2026-06', 'rem_ejemplo.xlsx',
     (SELECT id FROM usuario WHERE email = 'gestor@ejemplo.cl'),
     '{"hojas_leidas": 3, "celdas_vacias": [{"hoja": "A", "celda": "B12"}], "errores": []}'::jsonb);

INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id) VALUES
    ((SELECT id FROM indicador WHERE rem_codigo = 'REM-EJ-01'), '2026-06', 1500,
     (SELECT id FROM usuario WHERE email = 'subdireccion@ejemplo.cl'));

INSERT INTO resultado_indicador
    (indicador_id, carga_rem_id, valor_numerador, valor_denominador, valor_resultado)
VALUES
    ((SELECT id FROM indicador WHERE rem_codigo = 'REM-EJ-01'),
     (SELECT id FROM carga_rem WHERE periodo = '2026-06'),
     900, 1500, 60.00);

INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto) VALUES
    ((SELECT id FROM indicador WHERE rem_codigo = 'REM-EJ-01'),
     (SELECT id FROM usuario WHERE email = 'jefe.a@ejemplo.cl'),
     '2026-06',
     'Según mis registros alcanzamos la meta; conviene revisar la población usada.');

-- Dato no estructurado 2: detalle de auditoría con valor antes y después (JSONB)
INSERT INTO log_auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES
    ((SELECT id FROM usuario WHERE email = 'subdireccion@ejemplo.cl'),
     'INGRESO_POBLACION', 'poblacion_denominador', 1,
     '{"antes": null, "despues": {"indicador": "REM-EJ-01", "periodo": "2026-06", "valor": 1500}}'::jsonb);

COMMIT;
