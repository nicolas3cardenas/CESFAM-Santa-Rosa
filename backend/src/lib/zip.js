'use strict';
// Inspección del contenido de un archivo .xlsx/.xlsm SIN descomprimirlo.
// Un .xlsx es un ZIP. Antes de entregárselo a la librería que lo lee, se revisa su "directorio central"
// (la lista de entradas con su tamaño) para rechazar:
//   - archivos que no son ZIP (un .exe renombrado a .xlsx)
//   - "bombas ZIP": archivos pequeños que al descomprimirse ocupan gigas
//   - archivos cifrados
// No ejecuta nada ni lee el contenido de las entradas.

const SIG_EOCD = 0x06054b50;
const SIG_DIR = 0x02014b50;
const MAX_ENTRADAS = 5000;
const MAX_TOTAL_DESCOMPRIMIDO = 150 * 1024 * 1024;   // 150 MB

function inspeccionarZip(buf, opciones) {
  const maxTotal = (opciones && opciones.maxTotal) || MAX_TOTAL_DESCOMPRIMIDO;
  const maxEntradas = (opciones && opciones.maxEntradas) || MAX_ENTRADAS;
  const falla = (motivo) => ({ ok: false, motivo });

  if (!Buffer.isBuffer(buf) || buf.length < 22) { return falla('no es un ZIP'); }
  if (buf.readUInt32LE(0) !== 0x04034b50) { return falla('no empieza como un ZIP'); }

  // El registro final (EOCD) está al final del archivo; puede tener un comentario de hasta 65535 bytes.
  let pos = -1;
  const limite = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= limite; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { pos = i; break; }
  }
  if (pos < 0) { return falla('falta el registro final del ZIP'); }

  const total = buf.readUInt16LE(pos + 10);
  const tamDir = buf.readUInt32LE(pos + 12);
  const offDir = buf.readUInt32LE(pos + 16);
  if (total === 0xFFFF || tamDir === 0xFFFFFFFF || offDir === 0xFFFFFFFF) { return falla('ZIP64 no soportado'); }
  if (total > maxEntradas) { return falla('demasiadas entradas'); }
  if (offDir + tamDir > buf.length) { return falla('directorio central fuera del archivo'); }

  const entradas = [];
  let p = offDir;
  let sumaDescomprimida = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_DIR) { return falla('directorio central dañado'); }
    const flags = buf.readUInt16LE(p + 8);
    const comprimido = buf.readUInt32LE(p + 20);
    const descomprimido = buf.readUInt32LE(p + 24);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    if (p + 46 + largoNombre > buf.length) { return falla('directorio central dañado'); }
    if (flags & 0x1) { return falla('archivo cifrado'); }
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre);
    sumaDescomprimida += descomprimido;
    if (sumaDescomprimida > maxTotal) { return falla('el contenido descomprimido es demasiado grande'); }
    entradas.push({ nombre, comprimido, descomprimido });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return { ok: true, entradas, totalDescomprimido: sumaDescomprimida };
}

module.exports = { inspeccionarZip, MAX_TOTAL_DESCOMPRIMIDO };
