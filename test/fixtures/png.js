// Images PNG fabriquées pour les tests des alentours (tuiles d'altitude terrarium)
import zlib from 'node:zlib';

// PNG RVB : chaque ligne avec son filtre (0 à 4, tour à tour), données coupées en deux blocs IDAT
export function png(w, h, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);   // CRC non vérifié
  };
  const s = w * 3, rows = [];
  for (let y = 0; y < h; y++) {
    const f = y % 5, row = Buffer.alloc(s + 1);
    row[0] = f;
    for (let x = 0; x < s; x++) {
      const a = x >= 3 ? rgb[y * s + x - 3] : 0, b = y ? rgb[(y - 1) * s + x] : 0, c = x >= 3 && y ? rgb[(y - 1) * s + x - 3] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const p = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      row[1 + x] = (rgb[y * s + x] - p) & 255;
    }
    rows.push(row);
  }
  const z = zlib.deflateSync(Buffer.concat(rows)), half = z.length >> 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', z.subarray(0, half)),
    chunk('IDAT', z.subarray(half)), chunk('IEND', Buffer.alloc(0))]);
}
// Tuile terrarium de 256 × 256 : altitude height(x, y) (m) au pixel x, y
export function terrariumTile(height) {
  const rgb = new Uint8Array(256 * 256 * 3);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const v = height(x, y) + 32768, k = (y * 256 + x) * 3;
      rgb[k] = Math.floor(v / 256); rgb[k + 1] = Math.floor(v) % 256; rgb[k + 2] = Math.round((v - Math.floor(v)) * 256) & 255;
    }
  }
  return png(256, 256, rgb);
}
