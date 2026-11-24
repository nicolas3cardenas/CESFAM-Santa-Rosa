-- =====================================================================
-- 03_verificar_tablas.sql
-- Comprobaciones para mostrar al profesor. Ejecutar cada bloque por separado
-- en la herramienta de consultas de pgAdmin (Query Tool).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. ¿Existen las 10 tablas? (CAPTURA 1 del informe)
-- ---------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ---------------------------------------------------------------------
-- B. "select * from <tabla>" de cada tabla
--    Justo después de 01_crear_tablas.sql devuelven 0 registros (CAPTURA 2);
--    después de 02_datos_prueba.sql devuelven los datos inventados (CAPTURA 3).
-- ---------------------------------------------------------------------
SELECT * FROM rol;
SELECT * FROM programa;
SELECT * FROM usuario;
SELECT * FROM token_recuperacion;
SELECT * FROM indicador;
SELECT * FROM carga_rem;
SELECT * FROM poblacion_denominador;
SELECT * FROM resultado_indicador;
SELECT * FROM comentario_indicador;
SELECT * FROM log_auditoria;

-- ---------------------------------------------------------------------
-- C. Claves primarias y foráneas (CAPTURA 4: 22 filas)
-- ---------------------------------------------------------------------
SELECT conrelid::regclass   AS tabla,
       conname              AS restriccion,
       CASE contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY' END AS tipo,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE contype IN ('p', 'f')
  AND connamespace = 'public'::regnamespace
ORDER BY tipo DESC, tabla, restriccion;

-- ---------------------------------------------------------------------
-- D. Dato no estructurado: consultas sobre columnas JSONB (CAPTURA 5)
-- ---------------------------------------------------------------------
-- Valor nuevo registrado en la auditoría
SELECT id, accion, detalle -> 'despues' ->> 'valor' AS valor_nuevo
FROM log_auditoria
WHERE detalle @> '{"despues": {"periodo": "2026-06"}}';

-- Cargas cuyo resumen de validación informa celdas vacías
SELECT id, periodo, jsonb_array_length(resumen_validacion -> 'celdas_vacias') AS celdas_vacias
FROM carga_rem
WHERE resumen_validacion ? 'celdas_vacias';

-- ---------------------------------------------------------------------
-- E. Pruebas de integridad: cada intento inválido debe ser RECHAZADO.
--    Requiere haber ejecutado 02_datos_prueba.sql. No deja datos nuevos.
--    Los resultados salen en la pestaña "Messages" de pgAdmin (CAPTURA 6).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    -- 1. Población negativa
    BEGIN
        INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id)
        VALUES (1, '2026-07', -5, 2);
        RAISE EXCEPTION 'ACEPTADO';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'ACEPTADO' THEN RAISE NOTICE 'FALLO: aceptó población negativa';
        ELSE RAISE NOTICE 'OK (rechazado): población negativa -> %', SQLERRM;
        END IF;
    END;

    -- 2. Misma población dos veces para el mismo indicador y período
    BEGIN
        INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id)
        VALUES (1, '2026-06', 1600, 2);
        RAISE EXCEPTION 'ACEPTADO';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'ACEPTADO' THEN RAISE NOTICE 'FALLO: aceptó población duplicada';
        ELSE RAISE NOTICE 'OK (rechazado): población duplicada -> %', SQLERRM;
        END IF;
    END;

    -- 3. Período con formato inválido
    BEGIN
        INSERT INTO carga_rem (periodo, archivo_nombre, usuario_id)
        VALUES ('2026-13', 'x.xlsx', 3);
        RAISE EXCEPTION 'ACEPTADO';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'ACEPTADO' THEN RAISE NOTICE 'FALLO: aceptó período 2026-13';
        ELSE RAISE NOTICE 'OK (rechazado): período 2026-13 -> %', SQLERRM;
        END IF;
    END;

    -- 4. Correo repetido
    BEGIN
        INSERT INTO usuario (nombre, email, password_hash, rol_id)
        VALUES ('Otro', 'gestor@ejemplo.cl', 'HASH_DE_EJEMPLO_NO_REAL', 3);
        RAISE EXCEPTION 'ACEPTADO';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'ACEPTADO' THEN RAISE NOTICE 'FALLO: aceptó correo repetido';
        ELSE RAISE NOTICE 'OK (rechazado): correo repetido -> %', SQLERRM;
        END IF;
    END;

    -- 5. Jefe de Programa sin programa
    BEGIN
        INSERT INTO usuario (nombre, email, password_hash, rol_id)
        VALUES ('Jefe sin programa', 'jefe.x@ejemplo.cl', 'HASH_DE_EJEMPLO_NO_REAL', 4);
        RAISE EXCEPTION 'ACEPTADO';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'ACEPTADO' THEN RAISE NOTICE 'FALLO: aceptó Jefe sin programa';
        ELSE RAISE NOTICE 'OK (rechazado): Jefe sin programa -> %', SQLERRM;
        END IF;
    END;

    -- 6. Indicador con denominador del REM pero sin celda
    BEGIN
        INSERT INTO indicador (nombre, programa_id, rem_codigo, celda_numerador,
                               origen_denominador, celda_denominador, meta_nacional)
        VALUES ('Prueba', 1, 'REM-X', 'A1', 'REM', NULL, 50);
        RAISE EXCEPTION 'ACEPTADO';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'ACEPTADO' THEN RAISE NOTICE 'FALLO: aceptó indicador REM sin celda';
        ELSE RAISE NOTICE 'OK (rechazado): indicador REM sin celda -> %', SQLERRM;
        END IF;
    END;

    -- 7. Comentario vacío
    BEGIN
        INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto)
        VALUES (1, 4, '2026-06', '   ');
        RAISE EXCEPTION 'ACEPTADO';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'ACEPTADO' THEN RAISE NOTICE 'FALLO: aceptó comentario vacío';
        ELSE RAISE NOTICE 'OK (rechazado): comentario vacío -> %', SQLERRM;
        END IF;
    END;

    -- 8. Comentario sobre un indicador que no existe
    BEGIN
        INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto)
        VALUES (9999, 4, '2026-06', 'Hola');
        RAISE EXCEPTION 'ACEPTADO';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'ACEPTADO' THEN RAISE NOTICE 'FALLO: aceptó indicador inexistente';
        ELSE RAISE NOTICE 'OK (rechazado): indicador inexistente -> %', SQLERRM;
        END IF;
    END;
END;
$$;
