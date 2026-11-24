-- =====================================================================
-- 04_permisos.sql
-- Privilegio mínimo para el usuario de base de datos que usa la aplicación.
--
-- La aplicación NO se conecta como "postgres" (administrador): se conecta como
-- "cesfam_api", que solo puede hacer lo que el sistema necesita. Así, aunque
-- alguien lograra una inyección SQL, no podría borrar tablas ni alterar la
-- auditoría (informe, sección 6: usuario de base de datos con privilegio mínimo).
--
-- Antes de ejecutar este script debe existir el rol (lo crea `npm run db:crear`;
-- a mano sería: CREATE ROLE cesfam_api LOGIN PASSWORD 'una-clave-larga';).
-- Se puede ejecutar varias veces.
-- =====================================================================

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM cesfam_api;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM cesfam_api;
GRANT USAGE ON SCHEMA public TO cesfam_api;

-- Datos de referencia: solo lectura
GRANT SELECT ON rol, programa TO cesfam_api;

-- Usuarios: se crean y se modifican, pero NUNCA se borran (se desactivan)
GRANT SELECT, INSERT, UPDATE ON usuario TO cesfam_api;

-- Enlaces de recuperación de contraseña: se crean y se marcan como usados
GRANT SELECT, INSERT, UPDATE ON token_recuperacion TO cesfam_api;

-- Indicadores: se crean y se modifican, no se borran (se desactivan)
GRANT SELECT, INSERT, UPDATE ON indicador TO cesfam_api;

-- Cargas de REM: solo se agregan (cada carga queda como historial)
GRANT SELECT, INSERT ON carga_rem TO cesfam_api;

-- Población: solo se agrega; un valor ingresado no se sobrescribe ni se borra
GRANT SELECT, INSERT ON poblacion_denominador TO cesfam_api;

-- Resultados: se agregan al cargar el REM y se recalculan si faltaba la población
GRANT SELECT, INSERT, UPDATE ON resultado_indicador TO cesfam_api;

-- Comentarios: solo se agregan
GRANT SELECT, INSERT ON comentario_indicador TO cesfam_api;

-- Auditoría: solo se lee y se agrega; no se puede modificar ni borrar
GRANT SELECT, INSERT ON log_auditoria TO cesfam_api;

-- Las claves automáticas (identity) necesitan permiso sobre su secuencia
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO cesfam_api;
