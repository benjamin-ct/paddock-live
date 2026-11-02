// Tuiles vectorielles (Mapbox Vector Tile 2.1, protobuf) -> formes en latitude / longitude, sans dépendance. Sert aux
// alentours de la vue 3D (tuiles OpenFreeMap, schéma OpenMapTiles : analytics/surroundings.js)
import { clipRing, clipLine } from './surroundings.js';

// Lecteur protobuf : champs (numéro, type, valeur) d'un message ; nombres à varint jusqu'à 2^53 (les int64 négatifs,
// sur 10 octets, sont faux : aucun dans les valeurs lues ici ; les tuiles mettent les négatifs en sint)
function* fields(b, start = 0, end = b.length) {
  let o = start;
  const varint = () => {
    let v = 0, k = 1, c;
    do { c = b[o++]; v += (c & 127) * k; k *= 128; } while (c & 128);
    return v;
  };
  while (o < end) {
    const key = varint(), n = Math.floor(key / 8), t = key & 7;
    if (t === 0) yield [n, t, varint()];
    else if (t === 1) { yield [n, t, o]; o += 8; }
    else if (t === 2) { const len = varint(); yield [n, t, [o, o + len]]; o += len; }
    else if (t === 5) { yield [n, t, o]; o += 4; }
    else throw new Error('tuile vectorielle illisible');
  }
}
// Entiers à la suite (champ « packed ») : varints
function packedInts(b, s, e) {
  const out = [];
  for (let o = s; o < e;) {
    let v = 0, k = 1, c;
    do { c = b[o++]; v += (c & 127) * k; k *= 128; } while (c & 128);
    out.push(v);
  }
  return out;
}
const zigzag = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);
const utf8 = new TextDecoder();
const text = (b, [s, e]) => utf8.decode(b.subarray(s, e));

function value(b, dv, [s, e]) {
  for (const [n, , v] of fields(b, s, e)) {
    if (n === 1) return text(b, v);
    if (n === 2) return dv.getFloat32(v, true);
    if (n === 3) return dv.getFloat64(v, true);
    if (n === 4 || n === 5) return v;
    if (n === 6) return zigzag(v);
    if (n === 7) return !!v;
  }
  return null;
}

// Commandes de dessin -> anneaux ou lignes (coordonnées de la tuile)
function paths(cmds) {
  const out = [];
  let x = 0, y = 0, cur = null;
  for (let i = 0; i < cmds.length;) {
    const id = cmds[i] & 7, count = Math.floor(cmds[i++] / 8);
    if (id === 7) continue;   // ClosePath : anneau fermé (premier point non répété)
    for (let k = 0; k < count; k++) {
      x += zigzag(cmds[i++]);
      y += zigzag(cmds[i++]);
      if (id === 1) out.push((cur = []));
      cur.push([x, y]);
    }
  }
  return out;
}
const signedArea = (r) => r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2;

// Tuile { z, x, y } -> { couche : [{ type : 'point' | 'line' | 'polygon', props, geom }] }, seulement les couches
// demandées (toutes sans layers). geom : points [[lat, lon]…] ; lignes [[[lat, lon]…]…] ; polygones [[extérieur,
// trous…]…] (anneaux sans point répété). Formes découpées au carré de la tuile (sans la marge que les tuiles gardent
// autour) : une forme sur deux tuiles n'est pas lue deux fois
export function decodeMvt(bytes, { z, x, y }, layers = null) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = {};
  for (const [n, , range] of fields(b)) {
    if (n !== 3) continue;
    let name = '', extent = 4096;
    const keys = [], vals = [], feats = [];
    for (const [m, , v] of fields(b, ...range)) {
      if (m === 1) name = text(b, v);
      else if (m === 2) feats.push(v);
      else if (m === 3) keys.push(text(b, v));
      else if (m === 4) vals.push(v);
      else if (m === 5) extent = v;
    }
    if (layers && !layers.includes(name)) continue;
    const values = vals.map((v) => value(b, dv, v)), size = 2 ** z * extent;
    const geo = ([px, py]) => [(Math.atan(Math.sinh(Math.PI * (1 - (2 * (y * extent + py)) / size))) * 180) / Math.PI,
      ((x * extent + px) / size) * 360 - 180];
    const box = [0, 0, extent, extent];
    const list = (out[name] = []);
    for (const f of feats) {
      let type = 0, tags = [], cmds = [];
      for (const [m, , v] of fields(b, ...f)) {
        if (m === 2) tags = packedInts(b, ...v);
        else if (m === 3) type = v;
        else if (m === 4) cmds = packedInts(b, ...v);
      }
      const props = {};
      for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = values[tags[i + 1]];
      const parts = paths(cmds);
      if (type === 1) {
        const pts = parts.flat().filter(([px, py]) => px >= 0 && py >= 0 && px < extent && py < extent);
        if (pts.length) list.push({ type: 'point', props, geom: pts.map(geo) });
      } else if (type === 2) {
        const lines = parts.flatMap((l) => clipLine(l, box));
        if (lines.length) list.push({ type: 'line', props, geom: lines.map((l) => l.map(geo)) });
      } else if (type === 3) {
        // Anneau extérieur (aire positive, y vers le bas), puis ses trous
        const polys = [];
        for (const r of parts) {
          const a = signedArea(r);
          if (a > 0) polys.push([r]);
          else if (a < 0 && polys.length) polys.at(-1).push(r);
        }
        const geom = polys.map((p) => p.map((r) => clipRing(r, box)).filter((r) => r.length > 2)).filter((p) => p.length).map((p) => p.map((r) => r.map(geo)));
        if (geom.length) list.push({ type: 'polygon', props, geom });
      }
    }
  }
  return out;
}
