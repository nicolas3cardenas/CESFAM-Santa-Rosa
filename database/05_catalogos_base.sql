-- =====================================================================
-- 05_catalogos_base.sql
-- Datos de referencia que la aplicación necesita para funcionar: los 4 roles
-- y los 4 programas. No contiene datos de personas ni cifras.
-- Ejecutar DESPUÉS de 01_crear_tablas.sql (y NO junto con 02_datos_prueba.sql,
-- que inserta sus propios roles de ejemplo).
-- =====================================================================

BEGIN;

INSERT INTO rol (nombre, requiere_programa) VALUES
    ('Directora',             false),
    ('Subdirección',          false),
    ('Gestor de Información', false),
    ('Jefe de Programa',      true);

INSERT INTO programa (nombre) VALUES
    ('Matronas'),
    ('Salud Mental'),
    ('Kinesiología'),
    ('Dietistas');

COMMIT;
