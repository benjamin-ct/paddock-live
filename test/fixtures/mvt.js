// Tuiles vectorielles (Mapbox Vector Tile 2.1) fabriquées pour les tests des alentours
const varint = (v) => { const out = []; do { out.push((v % 128) + (v >= 128 ? 128 : 0)); v = Math.floor(v / 128); } while (v > 0); return out; };
const zz = (v) => (v < 0 ? -2 * v - 1 : 2 * v);
const field = (n, type) => varint(n * 8 + type);
const bytes = (n, b) => [...field(n, 2), ...varint(b.length), ...b];
const str = (n, s) => bytes(n, [...new TextEncoder().encode(s)]);
const packed = (n, list) => bytes(n, list.flatMap(varint));

function value(v) {
  if (typeof v === 'string') return str(1, v);
  if (typeof v === 'boolean') return [...field(7, 0), v ? 1 : 0];
  if (Number.isInteger(v)) return v >= 0 ? [...field(5, 0), ...varint(v)] : [...field(6, 0), ...varint(zz(v))];
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return [...field(3, 1), ...b];
}

// layers : [{ name, extent, features: [{ type: 1 | 2 | 3, props, geom: [[[x, y]…]…] }] }] (coordonnées de la tuile,
// anneaux sans point répété, dans le sens voulu) -> octets de la tuile
export function mvt(layers) {
  const out = [];
  for (const { name, extent = 4096, features } of layers) {
    const keys = [], vals = [], body = [...str(1, name)];
    for (const f of features) {
      const tags = [];
      for (const [k, v] of Object.entries(f.props || {})) {
        if (!keys.includes(k)) keys.push(k);
        if (!vals.some((x) => x === v)) vals.push(v);
        tags.push(keys.indexOf(k), vals.indexOf(v));
      }
      const cmds = [];
      let x = 0, y = 0;
      for (const part of f.geom) {
        part.forEach(([px, py], i) => {
          if (i === 0) cmds.push(1 + 8 * (f.type === 1 ? part.length : 1));
          else if (i === 1 && f.type !== 1) cmds.push(2 + 8 * (part.length - 1));
          cmds.push(zz(px - x), zz(py - y));
          x = px;
          y = py;
        });
        if (f.type === 3) cmds.push(7 + 8);
      }
      body.push(...bytes(2, [...packed(2, tags), ...field(3, 0), f.type, ...packed(4, cmds)]));
    }
    for (const k of keys) body.push(...str(3, k));
    for (const v of vals) body.push(...bytes(4, value(v)));
    body.push(...field(5, 0), ...varint(extent), ...field(15, 0), 2);
    out.push(...bytes(3, body));
  }
  return new Uint8Array(out);
}

// Latitude / longitude -> coordonnées de la tuile { z, x, y } (extent 4096)
export function toTile([lat, lon], { z, x, y }, extent = 4096) {
  const r = (lat * Math.PI) / 180, n = 2 ** z;
  return [Math.round(((lon + 180) / 360 * n - x) * extent), Math.round(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - y) * extent)];
}
