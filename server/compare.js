// Comparaison des tours de deux pilotes (Analyse → Comparaison) pour l'appli : GPS et télémétrie du hub décompressés
// ici, calcul commun avec la version web (shared/compare.js). Tout est calculé à la date demandée par le navigateur
// (son délai TV) : aucun spoiler.
import zlib from 'node:zlib';
import { applyEvent, createDerived } from '../shared/derive.js';
import { addPositions, addCarData, compareFrom, raceStartFrom } from '../shared/compare.js';
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
// État de la séance à `until` : repris là où le calcul précédent s'était arrêté quand l'heure avance (comparaison en
// direct recalculée chaque seconde), refait depuis le début sinon (retour en arrière, autre séance)
let past = { events: null, gen: -1, i: 0, until: -Infinity, state: null, derived: null };
function stateAt(hub, until) {
  if (past.events !== hub.events || past.gen !== hub.gen || until < past.until) past = { events: hub.events, gen: hub.gen, i: 0, until, state: {}, derived: createDerived() };
  const ev = hub.events;
  while (past.i < ev.length && ev[past.i].t <= until) { const e = ev[past.i++]; applyEvent(past.state, past.derived, e.topic, e.data, e.t); }
  past.until = until;
  return past;
}

export async function compareLaps(hub, { a, b, until, la = null, lb = null }) {
  const { state, derived } = stateAt(hub, until);
  const { cars, tel } = hub.hasPositions ? decoded(hub) : { cars: new Map(), tel: new Map() };
  return compareFrom({ state, derived, events: hub.events, cars, tel: hub.hasCarData ? tel : null, until, a, b, la, lb,
    load: (key, year) => Promise.all([circuit(key, year), loops(key, year).catch(() => null)]) });
}

// Départ de la course (Analyse → Tendances) : GPS du hub, rien après `until` (délai TV du navigateur)
export async function raceStart(hub, until) {
  const { cars } = hub.hasPositions ? decoded(hub) : { cars: new Map() };
  return raceStartFrom({ events: hub.events, cars, until, load: (key, year) => Promise.all([circuit(key, year)]) });
}
