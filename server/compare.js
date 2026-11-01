// Comparaison des tours de deux pilotes (Analyse → Comparaison) pour l'appli : GPS et télémétrie du hub décompressés
// ici, calcul commun avec la version web (shared/compare.js). Tout est calculé à la date demandée par le navigateur
// (son délai TV) : aucun spoiler.
import zlib from 'node:zlib';
import { applyEvent, createDerived } from '../shared/derive.js';
import { addPositions, addCarData, compareFrom } from '../shared/compare.js';
import { circuit, loops } from './circuits.js';

export { miniSectors } from '../shared/compare.js';

// GPS et télémétrie décodés par pilote (cache par génération du hub)
let cache = { gen: -1, seen: new WeakSet(), cars: new Map(), tel: new Map() };

function decoded(hub) {
  if (cache.gen !== hub.gen) cache = { gen: hub.gen, seen: new WeakSet(), cars: new Map(), tel: new Map() };
  for (const s of [...(hub.posArchive || []), ...hub.stream]) {
    if ((s.topic !== 'Position' && s.topic !== 'CarData') || cache.seen.has(s)) continue;
    cache.seen.add(s);
    let msg;
    try { msg = JSON.parse(zlib.inflateRawSync(Buffer.from(s.raw, 'base64')).toString('utf8')); } catch { continue; }
    if (s.topic === 'Position') addPositions(cache.cars, msg); else addCarData(cache.tel, msg);
  }
  return cache;
}

/**
 * @param hub  Hub (événements et flux GPS horodatés)
 * @param a, b numéros des pilotes
 * @param until heure locale : rien après (délai TV du navigateur)
 */
export async function compareLaps(hub, { a, b, until, la = null, lb = null }) {
  const state = {};
  const derived = createDerived();
  for (const e of hub.events) {
    if (e.t > until) break;
    applyEvent(state, derived, e.topic, e.data, e.t);
  }
  const { cars, tel } = hub.hasPositions ? decoded(hub) : { cars: new Map(), tel: new Map() };
  return compareFrom({ state, derived, events: hub.events, cars, tel: hub.hasCarData ? tel : null, until, a, b, la, lb,
    load: (key, year) => Promise.all([circuit(key, year), loops(key, year).catch(() => null)]) });
}
