// Fond de carte du radar météo : tuiles OpenStreetMap relayées et gardées sur le disque (30 jours),
// avec une identification propre de l'application, comme le demande la politique d'usage d'OSM.
import fs from 'node:fs';
import path from 'node:path';
import { request } from './net.js';
import { CACHE_DIR } from './circuits.js';

const DIR = path.join(CACHE_DIR, 'tiles');
const KEEP_MS = 30 * 24 * 3600e3;
const UA = 'PaddockLive/1.25 (tableau de bord F1 personnel ; +https://github.com/benjamin-ct/paddock-live)';

// Coordonnées de tuile valides (zoom jusqu'à 16 : le radar peut montrer le circuit de près)
export function validTile(z, x, y) {
  return Number.isInteger(z) && z >= 0 && z <= 16 && [x, y].every((v) => Number.isInteger(v) && v >= 0 && v < 2 ** z);
}

export async function osmTile(z, x, y) {
  if (!validTile(z, x, y)) throw new Error('Tuile invalide');
  const file = path.join(DIR, String(z), String(x), `${y}.png`);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < KEEP_MS) return fs.readFileSync(file);
  } catch { /* pas encore en cache */ }
  const r = await request(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: { 'User-Agent': UA }, timeout: 15000 });
  if (r.status !== 200) throw new Error(`Tuile indisponible (HTTP ${r.status})`);
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, r.body); } catch { /* cache facultatif */ }
  return r.body;
}
