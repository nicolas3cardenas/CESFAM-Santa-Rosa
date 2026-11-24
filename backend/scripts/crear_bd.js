'use strict';
// Crea la base de datos del sistema paso a paso:
//   1. el usuario "cesfam_api" (privilegio mínimo) y la base de datos
//   2. las tablas (01), los permisos (04), roles y programas (05) y los datos de demostración (06)
//
//   npm run db:crear                 base de desarrollo (pide --forzar si ya tiene tablas, porque las BORRA)
//   npm run db:crear -- --forzar     la recrea igual
//   npm run db:crear -- --sin-demo   sin los datos de demostración
//   npm run db:crear:test            base de pruebas automáticas (nombre terminado en _test)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const lib = require('./lib_bd');

async function crearBase(opciones) {
  const o = opciones || {};
  const adminUrl = process.env[o.test ? 'TEST_DATABASE_ADMIN_URL' : 'DATABASE_ADMIN_URL'];
  if (!adminUrl) { throw new Error(`Falta ${o.test ? 'TEST_DATABASE_ADMIN_URL' : 'DATABASE_ADMIN_URL'} en el archivo .env (vea .env.example).`); }
  const nombre = lib.nombreBase(adminUrl);
  if (o.test && !/_test$/.test(nombre)) { throw new Error('La base de pruebas debe tener un nombre terminado en "_test".'); }

  await lib.asegurarBaseYRol(adminUrl, process.env.API_DB_PASSWORD);
  if (!o.test && !o.forzar && (await lib.hayTablas(adminUrl))) {
    throw new Error(`La base "${nombre}" ya tiene tablas y este comando las BORRA. Si de verdad quiere recrearla, ejecute: npm run db:crear -- --forzar`);
  }
  await lib.aplicarScripts(adminUrl, { demo: o.demo !== false });
  return nombre;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  crearBase({ test: args.includes('--test'), forzar: args.includes('--forzar'), demo: !args.includes('--sin-demo') })
    .then((nombre) => {
      console.log(`Listo: base "${nombre}" creada con tablas, permisos y datos.`);
      console.log('Cuentas de demostración (clave: ClaveDemo2026): directora@demo.cl, subdireccion@demo.cl, gestor@demo.cl, jefe.matronas@demo.cl');
    })
    .catch((err) => { console.error('No se pudo crear la base de datos:', err.message); process.exit(1); });
}

module.exports = { crearBase };
