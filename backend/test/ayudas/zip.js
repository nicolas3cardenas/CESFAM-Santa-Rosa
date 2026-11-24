'use strict';
// Arma un ZIP mínimo en memoria (entradas sin comprimir) para probar la inspección de archivos
// sin depender de ninguna librería. Con 'tamanoDeclarado' se puede mentir sobre el tamaño descomprimido
// (así se simula una "bomba ZIP").
const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) { c = TABLA[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); } return (c ^ 0xFFFFFFFF) >>> 0; }

// entradas: { 'ruta/archivo.xml': 'contenido' | { contenido, tamanoDeclarado, cifrado } }
function crearZip(entradas) {
  const locales = []; const centrales = []; let offset = 0;
  Object.keys(entradas).forEach((nombre) => {
    const e = typeof entradas[nombre] === 'object' && !Buffer.isBuffer(entradas[nombre]) ? entradas[nombre] : { contenido: entradas[nombre] };
    const datos = Buffer.isBuffer(e.contenido) ? e.contenido : Buffer.from(e.contenido, 'utf8');
    const nom = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const flags = e.cifrado ? 1 : 0;
    const declarado = e.tamanoDeclarado !== undefined ? e.tamanoDeclarado : datos.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(datos.length, 18); lh.writeUInt32LE(declarado, 22); lh.writeUInt16LE(nom.length, 26);
    locales.push(lh, nom, datos);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(datos.length, 20); ch.writeUInt32LE(declarado, 24); ch.writeUInt16LE(nom.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrales.push(ch, nom);
    offset += 30 + nom.length + datos.length;
  });
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(entradas).length, 8); fin.writeUInt16LE(Object.keys(entradas).length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}

// Un "xlsx" mínimo para las pruebas de validación de archivo (tiene las partes obligatorias, no hojas reales)
function xlsxFalso(extra) {
  return crearZip(Object.assign({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>' }, extra || {}));
}

module.exports = { crearZip, xlsxFalso, crc32 };
