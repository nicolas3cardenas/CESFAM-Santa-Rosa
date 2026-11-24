-- =====================================================================
-- 06_datos_demo.sql
-- Datos de DEMOSTRACIÓN de la aplicación. Todo es inventado: ningún dato real
-- del CESFAM (nombres, correos, cifras). Replica los datos del prototipo.
-- Ejecutar DESPUÉS de 01_crear_tablas.sql y 05_catalogos_base.sql.
--
-- Clave de TODAS las cuentas de demostración: ClaveDemo2026
-- (el hash de abajo es bcrypt, igual que usará la aplicación).
-- NO usar este script ni estas cuentas con datos reales.
-- =====================================================================

BEGIN;

-- Usuarios (rol_id y programa_id se buscan por nombre)
INSERT INTO usuario (nombre, email, password_hash, rol_id, programa_id, activo)
SELECT v.nombre, v.email, '$2a$10$W93JNV/BUWsUDmkuFRhtiufyKRCBwMAgpEmq3IDM8B6exBanIhN2m', r.id, p.id, v.activo
FROM (VALUES
    (1, 'Directora Demo',          'directora@demo.cl',        'Directora',             NULL::text,   true),
    (2, 'Subdirección Demo',       'subdireccion@demo.cl',     'Subdirección',          NULL,         true),
    (3, 'Gestor Demo',             'gestor@demo.cl',           'Gestor de Información', NULL,         true),
    (4, 'Jefe Matronas Demo',      'jefe.matronas@demo.cl',    'Jefe de Programa',      'Matronas',     true),
    (5, 'Jefe Salud Mental Demo',  'jefe.saludmental@demo.cl', 'Jefe de Programa',      'Salud Mental', true),
    (6, 'Jefe Kinesiología Demo',  'jefe.kine@demo.cl',        'Jefe de Programa',      'Kinesiología', false)
) AS v(ord, nombre, email, rol, programa, activo)
JOIN rol r ON r.nombre = v.rol
LEFT JOIN programa p ON p.nombre = v.programa
ORDER BY v.ord;   -- el orden fija los identificadores: 1 Directora, 2 Subdirección, 3 Gestor, 4 Jefe Matronas...


-- Indicadores
INSERT INTO indicador
    (nombre, programa_id, rem_codigo, seccion, celda_numerador, origen_denominador,
     celda_denominador, codigo_prestacion, meta_nacional, peso_relativo, referente_responsable)
SELECT v.nombre, p.id, v.cod, v.seccion, v.num, v.origen, v.den, v.prest, v.meta, v.peso, v.ref
FROM (VALUES
    ('Cobertura de examen preventivo en mujeres', 'Matronas',     'IND-01', 'Sección A', 'B12', 'REM',       'C12',      'PREV-01', 80, 10, 'Referente Matronas'),
    ('Ingreso precoz a control prenatal',         'Matronas',     'IND-02', 'Sección A', 'B20', 'POBLACION', NULL::text, 'PREN-02', 85,  8, 'Referente Matronas'),
    ('Ingreso a control de salud mental',         'Salud Mental', 'IND-03', 'Sección D', 'D8',  'POBLACION', NULL,      'MENT-03', 70, 10, 'Referente Salud Mental'),
    ('Alta de rehabilitación kinésica',           'Kinesiología', 'IND-04', 'Sección E', 'E10', 'REM',       'E20',      'KINE-04', 60,  5, 'Referente Kinesiología'),
    ('Evaluación nutricional del adulto mayor',   'Dietistas',    'IND-05', 'Sección F', 'F15', 'POBLACION', NULL,      'NUTR-05', 75,  7, 'Referente Dietistas')
) AS v(nombre, programa, cod, seccion, num, origen, den, prest, meta, peso, ref)
JOIN programa p ON p.nombre = v.programa
ORDER BY v.cod;   -- IND-01 = id 1, IND-02 = id 2...


-- Cargas de REM (la del 2026-04 con errores no genera resultados; la corregida sí)

INSERT INTO carga_rem (periodo, archivo_nombre, usuario_id, fecha_carga, resumen_validacion)
SELECT v.periodo, v.archivo, u.id, v.fecha::timestamptz, v.resumen::jsonb
FROM (VALUES
    (1, '2026-03', 'rem_demo_2026-03.xlsx', '2026-03-06 15:48-03', '{"hojas_leidas": 4, "hojas_esperadas": 4, "celdas_leidas": 7, "celdas_vacias": [], "errores": [], "advertencias": []}'),
    (2, '2026-04', 'rem_demo_2026-04.xlsx', '2026-04-07 10:12-04', '{"hojas_leidas": 3, "hojas_esperadas": 4, "celdas_leidas": 5, "celdas_vacias": [], "errores": [{"hoja": "Sección A", "celda": "B12", "problema": "La celda no contiene un número (dice \"n/d\")"}, {"hoja": "Sección E", "celda": "", "problema": "Falta la hoja obligatoria \"Sección E\""}], "advertencias": []}'),
    (3, '2026-04', 'rem_demo_2026-04_corregido.xlsx', '2026-04-08 16:30-04', '{"hojas_leidas": 4, "hojas_esperadas": 4, "celdas_leidas": 7, "celdas_vacias": [], "errores": [], "advertencias": []}'),
    (4, '2026-05', 'rem_demo_2026-05.xlsx', '2026-05-09 11:05-04', '{"hojas_leidas": 4, "hojas_esperadas": 4, "celdas_leidas": 6, "celdas_vacias": [{"hoja": "Sección D", "celda": "D8", "indicador": "IND-03"}], "errores": [], "advertencias": []}'),
    (5, '2026-06', 'rem_demo_2026-06.xlsx', '2026-06-12 09:40-04', '{"hojas_leidas": 4, "hojas_esperadas": 4, "celdas_leidas": 7, "celdas_vacias": [], "errores": [], "advertencias": []}'),
    (6, '2025-12', 'rem_demo_2025-12.xlsx', '2026-01-09 12:10-03', '{"hojas_leidas": 4, "hojas_esperadas": 4, "celdas_leidas": 7, "celdas_vacias": [], "errores": [], "advertencias": []}'),
    (7, '2024-12', 'rem_demo_2024-12.xlsx', '2025-01-10 12:30-03', '{"hojas_leidas": 4, "hojas_esperadas": 4, "celdas_leidas": 7, "celdas_vacias": [], "errores": [], "advertencias": []}')
) AS v(ord, periodo, archivo, fecha, resumen)
CROSS JOIN (SELECT id FROM usuario WHERE email = 'gestor@demo.cl') u
ORDER BY v.ord;   -- carga 1 = 2026-03 ... carga 5 = 2026-06, 6 = 2025-12, 7 = 2024-12


-- Población ingresada a mano (indicadores con origen POBLACION). Falta IND-05 de 2026-06 a propósito:
-- así se ve el aviso "Falta ingresar la población" y se puede probar la pantalla 11.

INSERT INTO poblacion_denominador (indicador_id, periodo, valor, usuario_id, fecha_ingreso)
SELECT i.id, v.periodo, v.valor, u.id, (v.periodo || '-01 09:00-04')::timestamptz
  FROM (VALUES
    ('IND-02', '2024-12', 420),
    ('IND-02', '2025-12', 420),
    ('IND-02', '2026-03', 420),
    ('IND-02', '2026-04', 420),
    ('IND-02', '2026-05', 420),
    ('IND-02', '2026-06', 420),
    ('IND-03', '2024-12', 1500),
    ('IND-03', '2025-12', 1500),
    ('IND-03', '2026-03', 1500),
    ('IND-03', '2026-04', 1500),
    ('IND-03', '2026-05', 1500),
    ('IND-03', '2026-06', 1500),
    ('IND-05', '2024-12', 900),
    ('IND-05', '2025-12', 900),
    ('IND-05', '2026-03', 900),
    ('IND-05', '2026-04', 900),
    ('IND-05', '2026-05', 900)
) AS v(cod, periodo, valor)
JOIN indicador i ON i.rem_codigo = v.cod
CROSS JOIN (SELECT id FROM usuario WHERE email = 'subdireccion@demo.cl') u;



-- Resultados calculados (numerador = redondeo de % * denominador; resultado = numerador / denominador)

INSERT INTO resultado_indicador (indicador_id, carga_rem_id, valor_numerador, valor_denominador, valor_resultado)
SELECT i.id, c.id, x.num, x.den,
       CASE WHEN x.den > 0 THEN round(x.num * 100.0 / x.den, 2) END
  FROM (VALUES
    ('IND-01', 'rem_demo_2026-03.xlsx', 1491, 2100),
    ('IND-02', 'rem_demo_2026-03.xlsx', 294, 420),
    ('IND-03', 'rem_demo_2026-03.xlsx', 915, 1500),
    ('IND-04', 'rem_demo_2026-03.xlsx', 90, 300),
    ('IND-05', 'rem_demo_2026-03.xlsx', 495, 900),
    ('IND-01', 'rem_demo_2026-04_corregido.xlsx', 1554, 2100),
    ('IND-02', 'rem_demo_2026-04_corregido.xlsx', 307, 420),
    ('IND-03', 'rem_demo_2026-04_corregido.xlsx', 960, 1500),
    ('IND-04', 'rem_demo_2026-04_corregido.xlsx', 102, 300),
    ('IND-05', 'rem_demo_2026-04_corregido.xlsx', 522, 900),
    ('IND-01', 'rem_demo_2026-05.xlsx', 1638, 2100),
    ('IND-02', 'rem_demo_2026-05.xlsx', 319, 420),
    ('IND-03', 'rem_demo_2026-05.xlsx', 1020, 1500),
    ('IND-04', 'rem_demo_2026-05.xlsx', 114, 300),
    ('IND-05', 'rem_demo_2026-05.xlsx', 540, 900),
    ('IND-01', 'rem_demo_2026-06.xlsx', 1722, 2100),
    ('IND-02', 'rem_demo_2026-06.xlsx', 328, 420),
    ('IND-03', 'rem_demo_2026-06.xlsx', 1080, 1500),
    ('IND-04', 'rem_demo_2026-06.xlsx', 123, 300),
    ('IND-05', 'rem_demo_2026-06.xlsx', 558, 0),
    ('IND-01', 'rem_demo_2025-12.xlsx', 1470, 2100),
    ('IND-02', 'rem_demo_2025-12.xlsx', 302, 420),
    ('IND-03', 'rem_demo_2025-12.xlsx', 945, 1500),
    ('IND-04', 'rem_demo_2025-12.xlsx', 132, 300),
    ('IND-05', 'rem_demo_2025-12.xlsx', 495, 900),
    ('IND-01', 'rem_demo_2024-12.xlsx', 1365, 2100),
    ('IND-02', 'rem_demo_2024-12.xlsx', 290, 420),
    ('IND-03', 'rem_demo_2024-12.xlsx', 900, 1500),
    ('IND-04', 'rem_demo_2024-12.xlsx', 120, 300),
    ('IND-05', 'rem_demo_2024-12.xlsx', 450, 900)
) AS x(cod, archivo, num, den)
JOIN indicador i ON i.rem_codigo = x.cod
JOIN carga_rem c ON c.archivo_nombre = x.archivo;


-- Comentarios de Jefes de Programa (el segundo trae HTML a propósito: se guarda y se muestra como texto)
INSERT INTO comentario_indicador (indicador_id, usuario_id, periodo, texto, fecha)
SELECT i.id, u.id, v.periodo, v.texto, v.fecha::timestamptz
FROM (VALUES
    ('IND-01', 'jefe.matronas@demo.cl', '2026-06', 'Según nuestros registros alcanzamos 84 %; conviene revisar el rango de edad que usa el REM.', '2026-06-12 10:20-04'),
    ('IND-01', 'jefe.matronas@demo.cl', '2026-05', 'Ejemplo de texto con código: <script>alert(1)</script> (se muestra como texto y no se ejecuta).', '2026-05-05 15:02-04'),
    ('IND-02', 'jefe.matronas@demo.cl', '2026-06', 'Dos ingresos se registraron a fin de mes; el resultado debería subir en julio.', '2026-06-08 09:41-04')
) AS v(cod, correo, periodo, texto, fecha)
JOIN indicador i ON i.rem_codigo = v.cod
JOIN usuario u   ON u.email = v.correo;


-- Auditoría de ejemplo (detalle en JSONB con valor antes y después)
INSERT INTO log_auditoria (usuario_id, accion, entidad, entidad_id, fecha_hora, detalle)
SELECT (SELECT id FROM usuario WHERE email = v.correo), v.accion, v.entidad, v.entidad_id, v.fecha::timestamptz, v.detalle::jsonb
FROM (VALUES
    ('subdireccion@demo.cl', 'INGRESO_POBLACION',    'poblacion_denominador', 11,   '2026-06-12 10:14-04', '{"antes": null, "despues": {"indicador": "IND-03", "periodo": "2026-06", "valor": 1500}}'),
    ('gestor@demo.cl',       'CARGA_REM',            'carga_rem',             5,    '2026-06-12 09:40-04', '{"antes": null, "despues": {"periodo": "2026-06", "archivo": "rem_demo_2026-06.xlsx", "hojas_leidas": 4, "errores": 0}}'),
    ('gestor@demo.cl',       'ACTUALIZAR_INDICADOR', 'indicador',             4,    '2026-06-10 16:02-04', '{"antes": {"meta_nacional": 55}, "despues": {"meta_nacional": 60}}'),
    ('gestor@demo.cl',       'CREAR_USUARIO',        'usuario',               5,    '2026-06-09 11:30-04', '{"antes": null, "despues": {"nombre": "Jefe Salud Mental Demo", "rol": "Jefe de Programa"}}'),
    ('gestor@demo.cl',       'DESACTIVAR_USUARIO',   'usuario',               6,    '2026-06-08 17:45-04', '{"antes": {"activo": true}, "despues": {"activo": false}}'),
    (NULL,                   'LOGIN_FALLIDO',        'usuario',               NULL, '2026-06-05 08:15-04', '{"correo_intentado": "inexistente@demo.cl", "motivo": "Correo no registrado"}')
) AS v(correo, accion, entidad, entidad_id, fecha, detalle);

COMMIT;
