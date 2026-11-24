/* =====================================================================
   app.js · comportamiento compartido del prototipo CESFAM Santa Rosa

   Es un prototipo NO funcional: no hay servidor ni base de datos y todas
   las cifras son inventadas. Este archivo hace cuatro cosas:
     1. Define los roles, el menú de cada rol y qué rol puede abrir cada pantalla.
     2. Arma el menú lateral y la barra superior de las pantallas con menú.
     3. Entrega las validaciones y utilidades que usan todas las pantallas.
     4. Guarda los datos inventados que se muestran en los reportes.
   ===================================================================== */
(function () {
  'use strict';

  var NOMBRE_SISTEMA = 'CESFAM Santa Rosa';   // nombre del logo: se cambia solo aquí
  var NOMBRE_SUB = 'Metas sanitarias';         // línea pequeña bajo el nombre

  /* ---------------------------------------------------------------
     1. Roles, pantallas y permisos
     --------------------------------------------------------------- */
  var ROLES = {
    directora:    { nombre: 'Directora',             usuario: 'Directora Demo',     correo: 'directora@demo.cl',     inicio: '04_dashboard.html', menu: ['04', '05', '06', '08'] },
    subdireccion: { nombre: 'Subdirección',          usuario: 'Subdirección Demo',  correo: 'subdireccion@demo.cl',  inicio: '04_dashboard.html', menu: ['04', '05', '06', '08', '09', '11', '12'] },
    gestor:       { nombre: 'Gestor de Información', usuario: 'Gestor Demo',        correo: 'gestor@demo.cl',        inicio: '09_carga_rem.html', menu: ['09', '11', '12', '14', '16'] },
    jefe:         { nombre: 'Jefe de Programa',      usuario: 'Jefe Matronas Demo', correo: 'jefe.matronas@demo.cl', inicio: '05_reportes.html',  menu: ['05', '08'], programa: 'Matronas' }
  };
  var TODOS = ['directora', 'subdireccion', 'gestor', 'jefe'];

  // Pantallas del menú: código -> [texto, ícono]
  var MENU = {
    '04': ['Dashboard', 'dashboard'], '05': ['Reportes', 'reportes'], '06': ['Comparativo anual', 'comparativo'],
    '08': ['Exportar datos', 'exportar'], '09': ['Carga de REM', 'carga'], '11': ['Ingreso de población', 'poblacion'],
    '12': ['Indicadores', 'indicadores'], '14': ['Usuarios', 'usuarios'], '16': ['Auditoría de cambios', 'auditoria']
  };
  var ARCHIVOS = {
    '01': '01_inicio_sesion.html', '02': '02_olvide_contrasena.html', '03': '03_cambiar_contrasena.html', '04': '04_dashboard.html',
    '05': '05_reportes.html', '06': '06_comparativo_anual.html', '07': '07_detalle_indicador.html', '08': '08_exportar_datos.html',
    '09': '09_carga_rem.html', '10': '10_resultado_validacion.html', '11': '11_ingreso_poblacion.html', '12': '12_lista_indicadores.html',
    '13': '13_formulario_indicador.html', '14': '14_lista_usuarios.html', '15': '15_formulario_usuario.html', '16': '16_auditoria.html',
    '17': '17_acceso_denegado.html'
  };
  // Quién puede abrir cada pantalla (null = pública). Coincide con la matriz de la sección 6.2 del informe.
  var ACCESO = {
    '00': null, '01': null, '02': null, '03': TODOS,
    '04': ['directora', 'subdireccion'],
    '05': ['directora', 'subdireccion', 'jefe'],
    '06': ['directora', 'subdireccion'],
    '07': ['directora', 'subdireccion', 'jefe'],
    '08': ['directora', 'subdireccion', 'jefe'],
    '09': ['subdireccion', 'gestor'], '10': ['subdireccion', 'gestor'], '11': ['subdireccion', 'gestor'],
    '12': ['subdireccion', 'gestor'], '13': ['subdireccion', 'gestor'],
    '14': ['gestor'], '15': ['gestor'], '16': ['gestor'],
    '17': TODOS
  };
  // Pantalla que se marca en el menú cuando se abre una pantalla "hija"
  var PADRE = { '07': '05', '10': '09', '13': '12', '15': '14' };

  var ICONOS = {
    dashboard: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
    reportes: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    comparativo: '<path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4"/>',
    exportar: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    carga: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
    poblacion: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3 3 0 010 6M22 20c0-2.5-1.5-4.5-4-5.3"/>',
    indicadores: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    usuarios: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
    auditoria: '<path d="M12 8v5l3 2M21 12a9 9 0 11-3-6.7M21 4v5h-5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  function icono(nombre) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONOS[nombre] + '</svg>';
  }

  /* ---------------------------------------------------------------
     2. Sesión de demostración
        El rol viaja en la dirección (?u=...) para que el prototipo funcione
        al abrir los archivos con doble clic, sin servidor.
        En el sistema real, el servidor lo verifica con el token JWT.
     --------------------------------------------------------------- */
  function leerRol() {
    var p = new URLSearchParams(location.search).get('u');
    if (p && ROLES[p]) { return p; }
    try {
      var s = sessionStorage.getItem('ms_rol');
      if (s && ROLES[s]) { return s; }
    } catch (e) { /* almacenamiento no disponible: se usa solo la dirección */ }
    return null;
  }
  var rol = leerRol();

  function url(archivo, params) {
    var q = new URLSearchParams(params || {});
    if (rol && !q.has('u')) { q.set('u', rol); }
    var s = q.toString();
    return archivo + (s ? '?' + s : '');
  }
  function ir(archivo, params) { location.href = url(archivo, params); }
  function param(nombre) { return new URLSearchParams(location.search).get(nombre); }
  function guardarSesion(r, clave) {
    try { sessionStorage.setItem('ms_rol', r); sessionStorage.setItem('ms_ph', hashSimple(clave)); } catch (e) { /* sin almacenamiento */ }
  }
  function cerrarSesion() {
    try { sessionStorage.removeItem('ms_rol'); sessionStorage.removeItem('ms_ph'); } catch (e) { /* sin almacenamiento */ }
    location.href = '01_inicio_sesion.html';
  }
  // Huella simple SOLO para la demostración (compara la contraseña actual); el sistema real usa bcrypt o Argon2.
  function hashSimple(t) {
    var h = 5381;
    for (var i = 0; i < t.length; i++) { h = ((h << 5) + h + t.charCodeAt(i)) | 0; }
    return String(h >>> 0);
  }
  function claveActualCoincide(texto) {
    try {
      var guardada = sessionStorage.getItem('ms_ph');
      if (guardada) { return guardada === hashSimple(texto); }
    } catch (e) { /* sin almacenamiento */ }
    return true;   // si no se pudo guardar, se acepta cualquier contraseña válida
  }

  /* ---------------------------------------------------------------
     3. Utilidades de pantalla
     --------------------------------------------------------------- */
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === false || v === null || v === undefined) { return; }
        if (k === 'class') { e.className = v; }
        else if (k === 'texto') { e.textContent = v; }
        else if (k.slice(0, 2) === 'on') { e.addEventListener(k.slice(2), v); }
        else { e.setAttribute(k, v === true ? '' : v); }
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) { continue; }
      e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  function vaciar(nodo) { while (nodo.firstChild) { nodo.removeChild(nodo.firstChild); } }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }   // 1500 -> 1.500

  function logoHTML() {
    return '<svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#0B5C8E"/>' +
      '<path d="M17 9h6v8h8v6h-8v8h-6v-8H9v-6h8z" fill="#fff"/></svg><span class="logo-texto"><span class="logo-nombre">' + NOMBRE_SISTEMA + '</span><span class="logo-sub">' + NOMBRE_SUB + '</span></span>';
  }
  function pintarLogos() {
    var nodos = document.querySelectorAll('[data-logo]');
    for (var i = 0; i < nodos.length; i++) { nodos[i].innerHTML = logoHTML(); nodos[i].classList.add('logo'); }
  }

  // Muestra u oculta el mensaje de error bajo un campo
  function error(input, mensaje) {
    var caja = input.closest('.campo');
    var msg = caja && caja.querySelector('.campo-error');
    if (!msg) { return; }
    if (mensaje) {
      msg.textContent = mensaje;
      msg.classList.add('visible');
      if (!msg.id) { msg.id = 'err-' + (input.id || Math.random().toString(36).slice(2)); }
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', msg.id);
      input.classList.add('invalido');
    } else {
      msg.textContent = '';
      msg.classList.remove('visible');
      input.removeAttribute('aria-invalid');
      input.classList.remove('invalido');
    }
  }
  function limpiarErrores(form) {
    var campos = form.querySelectorAll('.invalido');
    for (var i = 0; i < campos.length; i++) { error(campos[i], ''); }
  }
  // Mensaje general de la pantalla: tipo = exito | error | info | alerta
  function aviso(tipo, texto, id) {
    var caja = document.getElementById(id || 'aviso');
    if (!caja) { return; }
    if (!tipo) { caja.hidden = true; caja.textContent = ''; return; }
    caja.className = 'aviso ' + tipo;
    caja.textContent = '';
    caja.appendChild(h('span', { class: 'aviso-texto', texto: texto }));
    caja.hidden = false;
  }
  // Enfoca el primer campo con error
  function enfocarError(form) {
    var primero = form.querySelector('.invalido');
    if (primero) { primero.focus(); }
  }

  /* Envío con un solo clic: el botón se deshabilita al primer clic y se
     vuelve a habilitar al terminar. Un doble clic (o Enter dos veces)
     ejecuta la acción una sola vez. */
  function formulario(form, opciones) {
    var boton = form.querySelector('button[type="submit"]');
    var textoOriginal = boton ? boton.textContent : '';
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (boton && (boton.disabled || boton.getAttribute('data-ocupado') === '1')) { return; }
      limpiarErrores(form);
      if (opciones.validar && !opciones.validar()) { enfocarError(form); return; }
      if (boton) {
        boton.setAttribute('data-ocupado', '1');
        boton.disabled = true;
        boton.textContent = opciones.textoOcupado || 'Procesando…';
      }
      setTimeout(function () {
        if (opciones.procesar) { opciones.procesar(); }
        if (boton && !opciones.mantenerDeshabilitado) {
          boton.disabled = false;
          boton.removeAttribute('data-ocupado');
          boton.textContent = textoOriginal;
        }
      }, opciones.demora === undefined ? 700 : opciones.demora);
    });
  }
  // Mismo comportamiento para un botón suelto (fuera de un formulario)
  function unClic(boton, accion, demora) {
    boton.addEventListener('click', function () {
      if (boton.disabled || boton.getAttribute('data-ocupado') === '1') { return; }
      var original = boton.textContent;
      boton.setAttribute('data-ocupado', '1');
      boton.disabled = true;
      boton.textContent = 'Procesando…';
      setTimeout(function () {
        accion();
        boton.disabled = false;
        boton.removeAttribute('data-ocupado');
        boton.textContent = original;
      }, demora === undefined ? 700 : demora);
    });
  }
  function verClave(input, boton) {
    boton.addEventListener('click', function () {
      var oculto = input.type === 'password';
      input.type = oculto ? 'text' : 'password';
      boton.textContent = oculto ? 'Ocultar' : 'Mostrar';
      boton.setAttribute('aria-pressed', oculto ? 'true' : 'false');
    });
  }
  function confirmar(titulo, texto, textoBoton, alConfirmar) {
    var anterior = document.activeElement;
    var cancelar = h('button', { type: 'button', class: 'btn btn-secundario', texto: 'Cancelar' });
    var aceptar = h('button', { type: 'button', class: 'btn btn-primario', texto: textoBoton || 'Confirmar' });
    var fondo = h('div', { class: 'modal-fondo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-titulo' },
      h('div', { class: 'modal' },
        h('h2', { id: 'modal-titulo', texto: titulo }),
        h('p', { texto: texto }),
        h('div', { class: 'acciones' }, cancelar, aceptar)));
    function cerrar() {
      if (!fondo.parentNode) { return; }
      document.body.removeChild(fondo);
      if (anterior && anterior.focus) { anterior.focus(); }
    }
    cancelar.addEventListener('click', cerrar);
    // Un solo clic: al aceptar se bloquean los dos botones y la ventana se cierra un instante después,
    // así un doble clic no alcanza a tocar lo que hay detrás.
    aceptar.addEventListener('click', function () {
      if (aceptar.disabled) { return; }
      aceptar.disabled = true; cancelar.disabled = true;
      alConfirmar();
      setTimeout(cerrar, 350);
    });
    fondo.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { cerrar(); } });
    document.body.appendChild(fondo);
    cancelar.focus();
  }

  /* ---------- Validaciones (las mismas reglas del plan de pruebas, sección 7.3) ---------- */
  var V = {
    // Correo de hasta 100 caracteres, sin espacios, con @ y dominio
    correo: function (t) { return t.length > 0 && t.length <= 100 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t); },
    // Contraseña de 8 a 64 caracteres
    clave: function (t) { return t.length >= 8 && t.length <= 64; },
    // Entero positivo escrito solo con dígitos: rechaza letras, puntos, comas, signos y 1e3
    entero: function (t, min, max) {
      if (!/^[0-9]+$/.test(t)) { return false; }
      var n = Number(t);
      return n >= min && n <= max;
    },
    // Decimal con coma o punto y hasta 2 decimales, sin signo
    decimal: function (t, min, max) {
      if (!/^[0-9]+([.,][0-9]{1,2})?$/.test(t)) { return false; }
      var n = Number(t.replace(',', '.'));
      return n >= min && n <= max;
    },
    periodo: function (t) { return /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(t); },     // AAAA-MM
    // Fecha DD-MM-AAAA que exista de verdad (31-02 no existe). Devuelve un Date o null.
    fecha: function (t) {
      var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
      if (!m) { return null; }
      var d = +m[1], mes = +m[2], a = +m[3];
      var f = new Date(a, mes - 1, d);
      return (f.getFullYear() === a && f.getMonth() === mes - 1 && f.getDate() === d) ? f : null;
    },
    celdaExcel: function (t) { return t.length <= 50 && /^[A-Za-z]{1,3}[1-9][0-9]{0,6}$/.test(t); },   // B12 sí; 12B y B-12 no
    // Largo del texto: al menos 'min' caracteres que no sean espacios y no más de 'max'
    largo: function (t, min, max) { return t.trim().length >= min && t.length <= max; }
  };

  /* ---------------------------------------------------------------
     4. Datos inventados (ninguna cifra es real)
     --------------------------------------------------------------- */
  var PROGRAMAS = ['Matronas', 'Salud Mental', 'Kinesiología', 'Dietistas'];
  var PERIODOS = ['2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'];
  var PERIODOS_CON_DATOS = ['2026-03', '2026-04', '2026-05', '2026-06'];
  var INDICADORES = [
    { id: 1, codigo: 'IND-01', nombre: 'Cobertura de examen preventivo en mujeres', programa: 'Matronas',     origen: 'REM',       celdaNum: 'B12', celdaDen: 'C12', seccion: 'Sección A', prestacion: 'PREV-01', referente: 'Referente Matronas',     meta: 80, peso: 10, activo: true, den: 2100 },
    { id: 2, codigo: 'IND-02', nombre: 'Ingreso precoz a control prenatal',         programa: 'Matronas',     origen: 'POBLACION', celdaNum: 'B20', celdaDen: '',    seccion: 'Sección A', prestacion: 'PREN-02', referente: 'Referente Matronas',     meta: 85, peso: 8,  activo: true, den: 420 },
    { id: 3, codigo: 'IND-03', nombre: 'Ingreso a control de salud mental',          programa: 'Salud Mental', origen: 'POBLACION', celdaNum: 'D8',  celdaDen: '',    seccion: 'Sección D', prestacion: 'MENT-03', referente: 'Referente Salud Mental', meta: 70, peso: 10, activo: true, den: 1500 },
    { id: 4, codigo: 'IND-04', nombre: 'Alta de rehabilitación kinésica',            programa: 'Kinesiología', origen: 'REM',       celdaNum: 'E10', celdaDen: 'E20', seccion: 'Sección E', prestacion: 'KINE-04', referente: 'Referente Kinesiología', meta: 60, peso: 5,  activo: true, den: 300 },
    { id: 5, codigo: 'IND-05', nombre: 'Evaluación nutricional del adulto mayor',    programa: 'Dietistas',    origen: 'POBLACION', celdaNum: 'F15', celdaDen: '',    seccion: 'Sección F', prestacion: 'NUTR-05', referente: 'Referente Dietistas',    meta: 75, peso: 7,  activo: true, den: 900 }
  ];
  // Porcentaje logrado por indicador y mes. El indicador 5 no tiene junio porque falta ingresar su población.
  var PCT = {
    1: { '2026-03': 71, '2026-04': 74, '2026-05': 78, '2026-06': 82 },
    2: { '2026-03': 70, '2026-04': 73, '2026-05': 76, '2026-06': 78 },
    3: { '2026-03': 61, '2026-04': 64, '2026-05': 68, '2026-06': 72 },
    4: { '2026-03': 30, '2026-04': 34, '2026-05': 38, '2026-06': 41 },
    5: { '2026-03': 55, '2026-04': 58, '2026-05': 60 }
  };
  var ANIOS_CON_DATOS = ['2026', '2025', '2024'];
  var ANIOS = ['2026', '2025', '2024', '2023'];
  var ANUAL = {
    '2026': { 1: 76, 2: 74, 3: 66, 4: 36, 5: 58 },
    '2025': { 1: 70, 2: 72, 3: 63, 4: 44, 5: 55 },
    '2024': { 1: 65, 2: 69, 3: 60, 4: 40, 5: 50 }
  };
  // Población ya ingresada: indicadores con origen POBLACION, un valor por indicador y mes
  var POBLACION = [];
  [[2, 420], [3, 1500], [5, 900]].forEach(function (par) {
    PERIODOS_CON_DATOS.forEach(function (p) {
      if (par[0] === 5 && p === '2026-06') { return; }       // falta ingresarla (la pantalla 11 permite hacerlo)
      POBLACION.push({ ind: par[0], periodo: p, valor: par[1], usuario: 'Subdirección Demo' });
    });
  });
  var USUARIOS = [
    { id: 1, nombre: 'Directora Demo',          correo: 'directora@demo.cl',        rol: 'Directora',             programa: '',             activo: true },
    { id: 2, nombre: 'Subdirección Demo',       correo: 'subdireccion@demo.cl',     rol: 'Subdirección',          programa: '',             activo: true },
    { id: 3, nombre: 'Gestor Demo',             correo: 'gestor@demo.cl',           rol: 'Gestor de Información', programa: '',             activo: true },
    { id: 4, nombre: 'Jefe Matronas Demo',      correo: 'jefe.matronas@demo.cl',    rol: 'Jefe de Programa',      programa: 'Matronas',     activo: true },
    { id: 5, nombre: 'Jefe Salud Mental Demo',  correo: 'jefe.saludmental@demo.cl', rol: 'Jefe de Programa',      programa: 'Salud Mental', activo: true },
    { id: 6, nombre: 'Jefe Kinesiología Demo',  correo: 'jefe.kine@demo.cl',        rol: 'Jefe de Programa',      programa: 'Kinesiología', activo: false }
  ];
  var ROLES_LISTA = ['Directora', 'Subdirección', 'Gestor de Información', 'Jefe de Programa'];
  var COMENTARIOS = {
    1: [
      { autor: 'Jefe Matronas Demo', fecha: '12-06-2026 10:20', periodo: '2026-06', texto: 'Según nuestros registros alcanzamos 84 %; conviene revisar el rango de edad que usa el REM.' },
      { autor: 'Jefe Matronas Demo', fecha: '05-05-2026 15:02', periodo: '2026-05', texto: 'Ejemplo de texto con código: <script>alert(1)</script> (se muestra como texto y no se ejecuta).' }
    ],
    2: [
      { autor: 'Jefe Matronas Demo', fecha: '08-06-2026 09:41', periodo: '2026-06', texto: 'Dos ingresos se registraron a fin de mes; el resultado debería subir en julio.' }
    ]
  };
  var AUDITORIA = [
    { fecha: '12-06-2026 10:14', usuario: 'Subdirección Demo', accion: 'INGRESO_POBLACION',   entidad: 'poblacion_denominador', entidadId: 11, detalle: { antes: null, despues: { indicador: 'IND-03', periodo: '2026-06', valor: 1500 } } },
    { fecha: '12-06-2026 09:40', usuario: 'Gestor Demo',        accion: 'CARGA_REM',           entidad: 'carga_rem',             entidadId: 5,  detalle: { antes: null, despues: { periodo: '2026-06', archivo: 'rem_demo_2026-06.xlsx', hojas_leidas: 3, errores: 0 } } },
    { fecha: '10-06-2026 16:02', usuario: 'Gestor Demo',        accion: 'ACTUALIZAR_INDICADOR', entidad: 'indicador',            entidadId: 4,  detalle: { antes: { meta_nacional: 55 }, despues: { meta_nacional: 60 } } },
    { fecha: '09-06-2026 11:30', usuario: 'Gestor Demo',        accion: 'CREAR_USUARIO',       entidad: 'usuario',               entidadId: 5,  detalle: { antes: null, despues: { nombre: 'Jefe Salud Mental Demo', rol: 'Jefe de Programa' } } },
    { fecha: '08-06-2026 17:45', usuario: 'Gestor Demo',        accion: 'DESACTIVAR_USUARIO',  entidad: 'usuario',               entidadId: 6,  detalle: { antes: { activo: true }, despues: { activo: false } } },
    { fecha: '05-06-2026 08:15', usuario: '',                   accion: 'LOGIN_FALLIDO',       entidad: 'usuario',               entidadId: null, detalle: { correo_intentado: 'inexistente@demo.cl', motivo: 'Correo no registrado' } }
  ];

  // Cargas de REM ya hechas. 'resumen' imita el campo resumen_validacion (JSONB): su estructura varía en cada carga.
  var CARGAS = [
    { id: 5, periodo: '2026-06', archivo: 'rem_demo_2026-06.xlsx', usuario: 'Gestor Demo', fecha: '12-06-2026 09:40', estado: 'Validada',
      resumen: { hojas_leidas: 3, hojas_esperadas: 3, celdas_leidas: 24, celdas_vacias: 0, errores: [] } },
    { id: 4, periodo: '2026-05', archivo: 'rem_demo_2026-05.xlsx', usuario: 'Gestor Demo', fecha: '09-05-2026 11:05', estado: 'Validada',
      resumen: { hojas_leidas: 3, hojas_esperadas: 3, celdas_leidas: 24, celdas_vacias: 1, errores: [] } },
    { id: 3, periodo: '2026-04', archivo: 'rem_demo_2026-04_corregido.xlsx', usuario: 'Gestor Demo', fecha: '08-04-2026 16:30', estado: 'Validada',
      resumen: { hojas_leidas: 3, hojas_esperadas: 3, celdas_leidas: 24, celdas_vacias: 0, errores: [] } },
    { id: 2, periodo: '2026-04', archivo: 'rem_demo_2026-04.xlsx', usuario: 'Gestor Demo', fecha: '07-04-2026 10:12', estado: 'Con errores',
      resumen: { hojas_leidas: 2, hojas_esperadas: 3, celdas_leidas: 16, celdas_vacias: 2,
        errores: [
          { hoja: 'Sección A', celda: 'B12', problema: 'La celda no contiene un número (dice "n/d")' },
          { hoja: 'Sección E', celda: '', problema: 'Falta la hoja obligatoria "Sección E"' }
        ] } },
    { id: 1, periodo: '2026-03', archivo: 'rem_demo_2026-03.xlsx', usuario: 'Gestor Demo', fecha: '06-03-2026 15:48', estado: 'Validada',
      resumen: { hojas_leidas: 3, hojas_esperadas: 3, celdas_leidas: 24, celdas_vacias: 0, errores: [] } }
  ];
  function cargaPorId(id) {
    for (var i = 0; i < CARGAS.length; i++) { if (CARGAS[i].id === Number(id)) { return CARGAS[i]; } }
    return null;
  }

  function indicadorPorId(id) {
    for (var i = 0; i < INDICADORES.length; i++) { if (INDICADORES[i].id === Number(id)) { return INDICADORES[i]; } }
    return null;
  }
  function estado(pct, meta) {     // regla de la demostración: cumple, en riesgo (desde el 90 % de la meta) o no cumple
    if (pct >= meta) { return 'cumple'; }
    if (pct >= meta * 0.9) { return 'riesgo'; }
    return 'nocumple';
  }
  function valorPoblacion(id, periodo) {
    for (var i = 0; i < POBLACION.length; i++) { if (POBLACION[i].ind === Number(id) && POBLACION[i].periodo === periodo) { return POBLACION[i].valor; } }
    return null;
  }
  // Resultado de un indicador en un mes: null = sin datos del mes; sinPoblacion = falta el denominador
  function resultado(id, periodo) {
    var ind = indicadorPorId(id);
    if (!ind || PERIODOS_CON_DATOS.indexOf(periodo) < 0) { return null; }
    var den = ind.origen === 'POBLACION' ? valorPoblacion(id, periodo) : ind.den;
    if (den === null) { return { ind: ind, sinPoblacion: true }; }
    var pct = PCT[id][periodo];
    return { ind: ind, pct: pct, den: den, num: Math.round(pct * den / 100), estado: estado(pct, ind.meta) };
  }
  function indicadoresVisibles(programa) {    // el Jefe de Programa solo ve los de su programa (en el sistema real lo filtra el servidor)
    var propio = rol && ROLES[rol].programa;
    return INDICADORES.filter(function (i) {
      return (!propio || i.programa === propio) && (!programa || programa === 'Todos' || i.programa === programa);
    });
  }
  var NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function nombrePeriodo(p) {            // '2026-06' -> 'junio 2026'
    var m = /^(\d{4})-(\d{2})$/.exec(p);
    return m ? NOMBRES_MES[Number(m[2]) - 1] + ' ' + m[1] : p;
  }
  var TEXTO_ESTADO = { cumple: 'Cumple', riesgo: 'En riesgo', nocumple: 'No cumple' };
  var SIMBOLO_ESTADO = { cumple: '✔', riesgo: '!', nocumple: '✖' };
  function chip(est) {
    return h('span', { class: 'chip ' + est }, h('span', { 'aria-hidden': 'true', texto: SIMBOLO_ESTADO[est] }), TEXTO_ESTADO[est]);
  }
  function opciones(select, lista, seleccionado, marcador) {     // llena una lista desplegable
    vaciar(select);
    if (marcador) { select.appendChild(h('option', { value: '', texto: marcador })); }
    lista.forEach(function (v) {
      var valor = typeof v === 'object' ? v.valor : v;
      var texto = typeof v === 'object' ? v.texto : v;
      select.appendChild(h('option', { value: valor, texto: texto, selected: valor === seleccionado }));
    });
  }
  // La pantalla 17 se muestra si una pantalla "hija" no corresponde al rol (por ejemplo, un Jefe abre otro programa)
  function denegar(desde) { location.replace(url(ARCHIVOS['17'], { desde: desde || '' })); }

  /* ---------------------------------------------------------------
     5. Armado de la pantalla: menú lateral, barra superior y protección
     --------------------------------------------------------------- */
  function construirShell(codigo) {
    var r = ROLES[rol];
    var activo = PADRE[codigo] || codigo;
    var contenido = document.getElementById('contenido');
    var lista = h('ul');
    r.menu.forEach(function (c) {
      var a = h('a', { href: ARCHIVOS[c] });
      a.innerHTML = icono(MENU[c][1]) + '<span></span>';
      a.querySelector('span').textContent = MENU[c][0];
      if (c === activo) { a.className = 'activo'; a.setAttribute('aria-current', 'page'); }
      lista.appendChild(h('li', null, a));
    });
    var logo = h('a', { class: 'logo', href: r.inicio, 'aria-label': NOMBRE_SISTEMA + ', ir al inicio' });
    logo.innerHTML = logoHTML();
    var lateral = h('aside', { class: 'sidebar', id: 'menu-lateral', 'aria-label': 'Menú principal' },
      h('div', { class: 'sidebar-logo' }, logo), h('nav', null, lista));

    var btnMenu = h('button', { type: 'button', class: 'btn-menu', 'aria-label': 'Abrir o cerrar el menú', 'aria-controls': 'menu-lateral', 'aria-expanded': 'false' });
    btnMenu.innerHTML = icono('menu');
    var btnUsuario = h('button', { type: 'button', class: 'btn-usuario', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
      h('span', { class: 'nombre', texto: r.usuario }), h('span', { 'aria-hidden': 'true', texto: '▾' }));
    var menuUsuario = h('div', { class: 'usuario-menu', hidden: true },
      h('a', { href: ARCHIVOS['03'] , texto: 'Cambiar contraseña' }),
      h('button', { type: 'button', id: 'cerrar-sesion', texto: 'Cerrar sesión' }));
    var topbar = h('header', { class: 'topbar' }, btnMenu,
      h('span', { class: 'topbar-rol', texto: r.nombre + (r.programa ? ' · ' + r.programa : '') }),
      h('div', { class: 'usuario' }, btnUsuario, menuUsuario));
    var velo = h('div', { class: 'velo', hidden: true });
    var principal = h('div', { class: 'principal' }, topbar, contenido);
    var shell = h('div', { class: 'shell' }, velo, lateral, principal);
    document.body.insertBefore(shell, document.body.firstChild);

    function abrirMenu(abierto) {
      shell.classList.toggle('menu-abierto', abierto);
      velo.hidden = !abierto;
      btnMenu.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    }
    btnMenu.addEventListener('click', function () { abrirMenu(!shell.classList.contains('menu-abierto')); });
    velo.addEventListener('click', function () { abrirMenu(false); });
    btnUsuario.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var abrir = menuUsuario.hidden;
      menuUsuario.hidden = !abrir;
      btnUsuario.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    });
    document.addEventListener('click', function () { menuUsuario.hidden = true; btnUsuario.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { abrirMenu(false); menuUsuario.hidden = true; btnUsuario.setAttribute('aria-expanded', 'false'); }
    });
    document.getElementById('cerrar-sesion').addEventListener('click', cerrarSesion);
  }

  // Agrega ?u=rol a los enlaces entre pantallas para conservar la sesión de demostración
  function reescribirEnlaces(raiz) {
    if (!rol) { return; }
    var enlaces = raiz.querySelectorAll('a[href]');
    for (var i = 0; i < enlaces.length; i++) {
      var href = enlaces[i].getAttribute('href');
      if (!/^\d\d_[a-z_]+\.html(\?.*)?$/.test(href) || /[?&]u=/.test(href)) { continue; }
      enlaces[i].setAttribute('href', href + (href.indexOf('?') < 0 ? '?' : '&') + 'u=' + rol);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var codigo = document.body.getAttribute('data-pagina') || '00';
    var viaEnlace = codigo === '03' && ['enlace', 'vencido'].indexOf(param('via')) >= 0;
    var permitidos = ACCESO[codigo];
    if (permitidos && !viaEnlace) {
      if (!rol) { location.replace('01_inicio_sesion.html'); return; }       // sin sesión: al inicio de sesión
      if (permitidos.indexOf(rol) < 0) { denegar(codigo); return; }         // rol sin permiso: pantalla 17
    }
    if (viaEnlace) { document.body.classList.add('acceso'); }
    pintarLogos();
    if (!document.body.classList.contains('acceso') && rol) { construirShell(codigo); }
    reescribirEnlaces(document);
    document.body.classList.add('listo');
  });

  /* ---------------------------------------------------------------
     6. Lo que usan las pantallas
     --------------------------------------------------------------- */
  window.MS = {
    NOMBRE_SISTEMA: NOMBRE_SISTEMA, ROLES: ROLES, ARCHIVOS: ARCHIVOS, ACCESO: ACCESO, rol: rol,
    url: url, ir: ir, param: param, guardarSesion: guardarSesion, cerrarSesion: cerrarSesion, claveActualCoincide: claveActualCoincide,
    h: h, vaciar: vaciar, fmt: fmt, error: error, aviso: aviso, formulario: formulario, unClic: unClic, verClave: verClave, confirmar: confirmar,
    reescribirEnlaces: reescribirEnlaces, denegar: denegar, chip: chip, opciones: opciones, V: V,
    datos: {
      PROGRAMAS: PROGRAMAS, PERIODOS: PERIODOS, PERIODOS_CON_DATOS: PERIODOS_CON_DATOS, INDICADORES: INDICADORES, PCT: PCT,
      ANIOS: ANIOS, ANIOS_CON_DATOS: ANIOS_CON_DATOS, ANUAL: ANUAL, POBLACION: POBLACION, USUARIOS: USUARIOS, ROLES_LISTA: ROLES_LISTA,
      COMENTARIOS: COMENTARIOS, AUDITORIA: AUDITORIA, CARGAS: CARGAS
    },
    nombrePeriodo: nombrePeriodo, indicadorPorId: indicadorPorId, cargaPorId: cargaPorId, resultado: resultado, estado: estado, indicadoresVisibles: indicadoresVisibles, valorPoblacion: valorPoblacion
  };
})();
