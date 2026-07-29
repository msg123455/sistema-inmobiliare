/**
 * Minimal EXIF GPS extractor for JPEG files.
 * No external dependencies — reads binary EXIF data directly from the file.
 */

export async function extractGPSFromPhoto(file) {
  if (!file || !file.type.match(/jpe?g/i)) return null;
  try {
    const buffer = await file.arrayBuffer();
    return parseJPEGExifGPS(buffer);
  } catch {
    return null;
  }
}

function parseJPEGExifGPS(buffer) {
  const view = new DataView(buffer);
  // Must start with JPEG SOI marker FF D8
  if (view.getUint16(0, false) !== 0xFFD8) return null;

  let pos = 2;
  while (pos < view.byteLength - 4) {
    if (view.getUint8(pos) !== 0xFF) break;
    const marker = view.getUint8(pos + 1);
    const segLen = view.getUint16(pos + 2, false); // big-endian per JPEG spec

    if (marker === 0xE1) {
      // APP1 — check for Exif signature "Exif\0\0"
      if (pos + 10 < view.byteLength) {
        const sig = String.fromCharCode(
          view.getUint8(pos + 4), view.getUint8(pos + 5),
          view.getUint8(pos + 6), view.getUint8(pos + 7)
        );
        if (sig === 'Exif') {
          return parseTIFFGPS(buffer, view, pos + 10);
        }
      }
    }
    pos += 2 + segLen;
  }
  return null;
}

function parseTIFFGPS(buffer, view, tiffBase) {
  // Byte order mark: 0x4949 = little-endian, 0x4D4D = big-endian
  const byteOrder = view.getUint16(tiffBase, false);
  const le = byteOrder === 0x4949;

  const r16 = (off) => view.getUint16(tiffBase + off, le);
  const r32 = (off) => view.getUint32(tiffBase + off, le);

  // IFD0 starts at offset stored at bytes 4-7 of TIFF header
  const ifd0Off = r32(4);
  const ifd0Count = r16(ifd0Off);

  // Walk IFD0 looking for GPS sub-IFD pointer (tag 0x8825)
  let gpsIFDOff = null;
  for (let i = 0; i < ifd0Count; i++) {
    const e = ifd0Off + 2 + i * 12;
    if (e + 12 > view.byteLength - tiffBase) break;
    if (r16(e) === 0x8825) {
      gpsIFDOff = r32(e + 8);
      break;
    }
  }
  if (gpsIFDOff === null) return null;

  const gpsCount = r16(gpsIFDOff);
  let latRef = 'N', lonRef = 'E', lat = null, lon = null;

  for (let i = 0; i < gpsCount; i++) {
    const e = gpsIFDOff + 2 + i * 12;
    if (e + 12 > view.byteLength - tiffBase) break;
    const tag = r16(e);

    if (tag === 0x0001) { // GPSLatitudeRef
      latRef = String.fromCharCode(view.getUint8(tiffBase + e + 8)) || 'N';
    } else if (tag === 0x0002) { // GPSLatitude — 3 rationals
      const valOff = r32(e + 8);
      lat = readRationals(view, tiffBase + valOff, 3, le);
    } else if (tag === 0x0003) { // GPSLongitudeRef
      lonRef = String.fromCharCode(view.getUint8(tiffBase + e + 8)) || 'E';
    } else if (tag === 0x0004) { // GPSLongitude — 3 rationals
      const valOff = r32(e + 8);
      lon = readRationals(view, tiffBase + valOff, 3, le);
    }
  }

  if (!lat || !lon) return null;

  const latitude  = dms2dec(lat)  * (latRef === 'S' ? -1 : 1);
  const longitude = dms2dec(lon)  * (lonRef === 'W' ? -1 : 1);

  if (isNaN(latitude) || isNaN(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null; // Probably no actual GPS fix

  return { lat: latitude, lng: longitude };
}

function readRationals(view, absOffset, count, le) {
  return Array.from({ length: count }, (_, i) => {
    const base = absOffset + i * 8;
    const num = view.getUint32(base, le);
    const den = view.getUint32(base + 4, le);
    return den ? num / den : 0;
  });
}

function dms2dec([d, m, s]) {
  return d + m / 60 + s / 3600;
}
