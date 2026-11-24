-- =====================================================================
-- 01_crear_tablas.sql
-- Sistema de Gestión de Indicadores y Metas Sanitarias - CESFAM Santa Rosa
-- Motor: PostgreSQL 14 o superior (probado en 16; no usa nada propio de una versión)
--
-- ADVERTENCIA: este script BORRA y vuelve a crear todas las tablas.
-- Úsalo solo en desarrollo. Se puede ejecutar varias veces seguidas.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Limpieza (orden inverso a las dependencias)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS
    log_auditoria,
    token_recuperacion,
    comentario_indicador,
    poblacion_denominador,
    resultado_indicador,
    carga_rem,
    indicador,
    usuario,
    programa,
    rol
CASCADE;

-- ---------------------------------------------------------------------
-- 1. Roles y programas
-- ---------------------------------------------------------------------
CREATE TABLE rol (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre             varchar(50) NOT NULL UNIQUE,
    -- true solo para el Jefe de Programa: obliga a tener un programa asignado
    requiere_programa  boolean NOT NULL DEFAULT false
);

CREATE TABLE programa (
    id      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  varchar(100) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- 2. Usuarios (programa_id es opcional: solo lo usa el Jefe de Programa)
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre             varchar(100) NOT NULL,
    email              varchar(100) NOT NULL UNIQUE,
    password_hash      varchar(255) NOT NULL,
    rol_id             integer NOT NULL REFERENCES rol (id) ON DELETE RESTRICT,
    programa_id        integer REFERENCES programa (id) ON DELETE RESTRICT,
    activo             boolean NOT NULL DEFAULT true,
    intentos_fallidos  smallint NOT NULL DEFAULT 0
                       CHECK (intentos_fallidos BETWEEN 0 AND 5),
    bloqueado_hasta    timestamptz,
    creado_en          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usuario_email_formato
        CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- Regla de negocio: el Jefe de Programa debe tener programa; los demás roles no.
CREATE OR REPLACE FUNCTION validar_programa_usuario()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_requiere boolean;
BEGIN
    SELECT requiere_programa INTO v_requiere FROM rol WHERE id = NEW.rol_id;

    IF v_requiere AND NEW.programa_id IS NULL THEN
        RAISE EXCEPTION 'Un usuario con este rol debe tener un programa asignado';
    ELSIF NOT v_requiere AND NEW.programa_id IS NOT NULL THEN
        RAISE EXCEPTION 'Solo el rol Jefe de Programa puede tener programa asignado';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuario_programa
    BEFORE INSERT OR UPDATE OF rol_id, programa_id ON usuario
    FOR EACH ROW EXECUTE FUNCTION validar_programa_usuario();

-- ---------------------------------------------------------------------
-- 3. Recuperación de contraseña (enlace de un solo uso con vencimiento)
-- ---------------------------------------------------------------------
CREATE TABLE token_recuperacion (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id  integer NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    token_hash  char(64) NOT NULL UNIQUE,   -- se guarda el hash, nunca el token
    creado_en   timestamptz NOT NULL DEFAULT now(),
    expira_en   timestamptz NOT NULL,
    usado_en    timestamptz,
    CONSTRAINT token_vigencia CHECK (expira_en > creado_en)
);

-- ---------------------------------------------------------------------
-- 4. Indicadores
--    origen_denominador = 'POBLACION' -> se ingresa a mano (poblacion_denominador)
--    origen_denominador = 'REM'       -> sale de una celda del REM
-- ---------------------------------------------------------------------
CREATE TABLE indicador (
    id                     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                 varchar(200) NOT NULL,
    programa_id            integer NOT NULL REFERENCES programa (id) ON DELETE RESTRICT,
    rem_codigo             varchar(20) NOT NULL,
    seccion                varchar(50),
    celda_numerador        varchar(50) NOT NULL,
    origen_denominador     varchar(10) NOT NULL
                           CHECK (origen_denominador IN ('REM', 'POBLACION')),
    celda_denominador      varchar(50),
    codigo_prestacion      varchar(50),
    meta_nacional          numeric(7,2) NOT NULL CHECK (meta_nacional >= 0),
    peso_relativo          numeric(5,2) NOT NULL DEFAULT 0
                           CHECK (peso_relativo BETWEEN 0 AND 100),
    referente_responsable  varchar(100),
    activo                 boolean NOT NULL DEFAULT true,
    CONSTRAINT indicador_origen_denominador CHECK (
        (origen_denominador = 'REM'       AND celda_denominador IS NOT NULL) OR
        (origen_denominador = 'POBLACION' AND celda_denominador IS NULL)
    )
);

-- ---------------------------------------------------------------------
-- 5. Cargas de REM (resumen_validacion es dato no estructurado: JSONB)
-- ---------------------------------------------------------------------
CREATE TABLE carga_rem (
    id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    periodo             char(7) NOT NULL
                        CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- AAAA-MM
    archivo_nombre      varchar(255) NOT NULL,
    usuario_id          integer NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
    fecha_carga         timestamptz NOT NULL DEFAULT now(),
    resumen_validacion  jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------
-- 6. Población (denominador) ingresada a mano
--    Un valor por indicador y período.
--    Rango 1 a 1.000.000; si se necesita aceptar 0, cambiar el CHECK.
-- ---------------------------------------------------------------------
CREATE TABLE poblacion_denominador (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    indicador_id   integer NOT NULL REFERENCES indicador (id) ON DELETE RESTRICT,
    periodo        char(7) NOT NULL
                   CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    valor          integer NOT NULL CHECK (valor BETWEEN 1 AND 1000000),
    usuario_id     integer NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
    fecha_ingreso  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT poblacion_unica_por_periodo UNIQUE (indicador_id, periodo)
);

-- ---------------------------------------------------------------------
-- 7. Resultados calculados
--    valor_denominador es una copia del valor usado al calcular (historial).
--    valor_resultado queda NULL si el denominador es cero.
-- ---------------------------------------------------------------------
CREATE TABLE resultado_indicador (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    indicador_id       integer NOT NULL REFERENCES indicador (id) ON DELETE RESTRICT,
    carga_rem_id       integer NOT NULL REFERENCES carga_rem (id) ON DELETE CASCADE,
    valor_numerador    numeric(12,2) NOT NULL CHECK (valor_numerador >= 0),
    valor_denominador  numeric(12,2) NOT NULL CHECK (valor_denominador >= 0),
    valor_resultado    numeric(9,2) CHECK (valor_resultado >= 0),
    CONSTRAINT resultado_unico_por_carga UNIQUE (indicador_id, carga_rem_id),
    CONSTRAINT resultado_denominador_cero
        CHECK (valor_denominador > 0 OR valor_resultado IS NULL)
);

-- ---------------------------------------------------------------------
-- 8. Comentarios breves del Jefe de Programa por indicador
-- ---------------------------------------------------------------------
CREATE TABLE comentario_indicador (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    indicador_id  integer NOT NULL REFERENCES indicador (id) ON DELETE RESTRICT,
    usuario_id    integer NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
    periodo       char(7) NOT NULL
                  CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    texto         varchar(500) NOT NULL CHECK (length(btrim(texto)) > 0),
    fecha         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 9. Auditoría (detalle es dato no estructurado: JSONB con antes/después)
--    usuario_id puede ser NULL (por ejemplo, intento de inicio de sesión
--    con un correo que no existe) y se conserva si se borra el usuario.
-- ---------------------------------------------------------------------
CREATE TABLE log_auditoria (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id  integer REFERENCES usuario (id) ON DELETE SET NULL,
    accion      varchar(50) NOT NULL,
    entidad     varchar(50) NOT NULL,
    entidad_id  integer,
    fecha_hora  timestamptz NOT NULL DEFAULT now(),
    detalle     jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------
-- 10. Índices (las claves únicas ya crean los suyos)
-- ---------------------------------------------------------------------
CREATE INDEX idx_usuario_rol            ON usuario (rol_id);
CREATE INDEX idx_usuario_programa       ON usuario (programa_id);
CREATE INDEX idx_indicador_programa     ON indicador (programa_id);
CREATE INDEX idx_carga_rem_periodo      ON carga_rem (periodo);
CREATE INDEX idx_resultado_carga        ON resultado_indicador (carga_rem_id);
CREATE INDEX idx_comentario_indicador   ON comentario_indicador (indicador_id, periodo);
CREATE INDEX idx_log_usuario_fecha      ON log_auditoria (usuario_id, fecha_hora);
CREATE INDEX idx_log_detalle            ON log_auditoria USING gin (detalle jsonb_path_ops);

COMMIT;
