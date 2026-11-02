// Alentours des circuits pour la vue 3D (/live/api/surroundings) : relief du modèle numérique de terrain (tuiles
// Terrain Tiles, données ouvertes d'AWS) et ce qu'il y a autour d'après OpenStreetMap (licence ODbL), lu dans les
// tuiles vectorielles OpenFreeMap (schéma OpenMapTiles, gratuites, sans clé ; Overpass ne répondait presque jamais),
// posés sur le tracé MultiViewer de la saison (calculs : shared/surroundings.js). Calculés à l'avance par la tâche
// planifiée, un couple circuit × saison à la fois : demandé, prochain Grand Prix, puis tout le catalogue des replays.
// Ce qui ne dépend que du lieu (OSM, tuiles) est lu une fois par circuit et gardé dans R2 pour toutes les saisons ;
// seul le calage sur le tracé change. Résultat (quelques centaines de ko) dans R2, état dans la base. Ensuite, un
// enrichissement facultatif (parkings, tribunes, arbres isolés, murs, graviers : extraTick) refait le fichier quand il arrive.
import { setRow, readJSON, rowsWithPrefix } from './alerts.js';
import { archiveToken } from './studio.js';
import { circuitData } from './race-stats.js';
import { seasonIndex } from './tyres.js';
import { wantedCircuits } from './zones.js';
import { CIRCUITS } from '../shared/circuits-info.js';
import { decodeMvt } from '../shared/mvt.js';
import { fitTrack, zone, buildSurroundings, omtElements, OMT_LAYERS, SHORTBREAD, extraQueries, overpassElements, resample, perimeter, toEN, geoFrame, tilesFor, decodePng, terrarium,
  demSampler, MARGIN } from '../shared/surroundings.js';

// TileJSON d'OpenFreeMap : adresse des tuiles du moment (nouvelle version de la carte chaque semaine)
const OFM = 'https://tiles.openfreemap.org/planet';
const TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/';
// Tuiles vectorielles de la fondation OpenStreetMap (schéma Shortbread, ODbL) ; serveurs Overpass, l'un après l'autre
const SB = 'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const JOLPICA = 'https://api.jolpi.ca/ergast/f1/';
const UA = 'Paddock-Live (https://paddocklive.app)';
const FIRST_YEAR = 2018;       // premiers replays proposés (ui/replays.js)
const RETRY = 6 * 3600e3;      // échec (calage raté, piste absente…) : revu 6 h plus tard, comme les zones
const SOON = 20 * 60e3;        // source occupée ou injoignable : revu 20 min plus tard, puis 40 min… jusqu'à 6 h
const LOCK = 10 * 60e3;        // un seul calcul à la fois
const CATALOGUE = 7 * 86400e3; // catalogue des replays relu une fois par semaine
const NEAR = 700;              // bâtiments lus jusqu'à 700 m du tracé
const VERSION = 4;             // version des fichiers : un fichier plus ancien est refait (il reste servi en attendant)
const EXTRA = 3600e3;          // enrichissement raté : revu 1 h plus tard, puis 2 h, 4 h… jusqu'à 24 h
const MAX_ERR = 8;             // calage gardé si le tracé est en moyenne à moins de 8 m des pistes (ou rues) d'OSM
// Pauses (ms) : serveurs publics ménagés, une requête à la fois
const PAUSE = { vtile: 100, tile: 300, jolpica: 1000, again: 2000, overpass: 5000 };
// Rues du calage des circuits en ville (classes OpenMapTiles ; minor : rues ordinaires)
const STREETS = ['raceway', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
export const CREDITS = ['OpenFreeMap © OpenMapTiles © contributeurs OpenStreetMap', 'Altitude : Terrain Tiles (Mapzen, AWS Open Data)'];

const rowKey = (key, year) => `surr:${key}:${year}`;
const fileKey = (key, year) => `surroundings/${key}-${year}.json`;
const placeKey = (key) => `surroundings/place-${key}.json`;
const extraKey = (key) => `surroundings/extra-${key}.json`;
const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };
const wait = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : null);
const r6 = (v) => Math.round(v * 1e6) / 1e6;

// Fichier d'une source (octets) : deux essais si elle est occupée (429, 5xx), trop lente ou injoignable. Erreur
// qui nomme la source ; passing : erreur passagère (nouvel essai bientôt)
async function get(url, what, fetchFn, pause) {
  let why = '';
  for (let k = 0; k < 2; k++) {
    if (k) await wait(PAUSE.again * pause);
    try {
      const r = await fetchFn(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) });
      if (r.status === 200) return new Uint8Array(await r.arrayBuffer());
      if (r.status !== 429 && r.status < 500) throw Object.assign(new Error(`${what} : HTTP ${r.status}`), { final: true });
      why = `HTTP ${r.status}`;
    } catch (err) {
      if (err.final) throw err;
      why = err.name === 'TimeoutError' ? 'délai dépassé' : err.message;
    }
  }
  throw Object.assign(new Error(`${what} : ${why} (2 essais)`), { passing: true });
}
const getJSON = async (...a) => JSON.parse(new TextDecoder().decode(await get(...a)));

// Tuile d'altitude (PNG), gardée dans R2 : lue une seule fois
async function tile(env, { z, x, y }, fetchFn, pause) {
  const k = `surroundings/tiles/${z}/${x}/${y}.png`, kept = await env.MEDIA.get(k);
  if (kept) return new Uint8Array(await kept.arrayBuffer());
  const b = await get(`${TILES}${z}/${x}/${y}.png`, `Terrain Tiles ${z}/${x}/${y}`, fetchFn, pause);
  await env.MEDIA.put(k, b, { httpMetadata: { contentType: 'image/png' } });
  await wait(PAUSE.tile * pause);
  return b;
}

// Tuiles vectorielles (zoom 14, le plus fin) qui couvrent la zone { s, w, n, e }, décodées (couches demandées) ;
// src : { name, url } (modèle d'adresse des tuiles ; OpenFreeMap : lu une fois par calcul dans son TileJSON)
async function vectorTiles(box, layers, src, fetchFn, pause) {
  src.url ??= (await getJSON(OFM, src.name, fetchFn, pause)).tiles?.[0];
  if (!src.url) throw new Error(`${src.name} : adresse des tuiles absente`);
  const out = [];
  for (const t of tilesFor(box, Infinity, 14)) {
    const url = src.url.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
    out.push(decodeMvt(await get(url, `${src.name} ${t.z}/${t.x}/${t.y}`, fetchFn, pause), t, layers));
    await wait(PAUSE.vtile * pause);
  }
  return out;
}

// Catalogue des replays : couples [clé, année, lat, lon], un par circuit et par saison (2018 à aujourd'hui, comme la
// liste des replays de l'appli), les plus récents d'abord ; courses et positions d'après Jolpica, clé du circuit
// d'après l'index des archives de la F1 (course du même jour), sinon d'après les autres saisons ou les circuits
// connus si l'index est illisible (2022 répond HTTP 403 ; sans connexion F1 TV) : une année illisible ne vide pas le
// catalogue. Relu une fois par semaine ; en cas d'échec (raisons gardées dans errors), revu 6 h plus tard
export async function catalogue(env, { now = Date.now(), fetchFn = fetch, pause = 1, token } = {}) {
  const kept = await readJSON(env, 'surrcat', null);
  if (kept && now - kept.at < CATALOGUE) return kept.list;
  const errors = [], races = [], keys = {};
  token ??= await archiveToken(env, { now, fetchFn }).catch(() => null);
  if (!token) errors.push('connexion F1 TV absente');
  for (let y = new Date(now).getUTCFullYear(); y >= FIRST_YEAR; y--) {
    const idx = token ? await seasonIndex(y, token, fetchFn).catch((err) => { errors.push(`archives ${y} : ${err.message}`); return []; }) : [];
    const list = await getJSON(`${JOLPICA}${y}/races.json?limit=100`, `Jolpica ${y}`, fetchFn, pause)
      .then((d) => d.MRData?.RaceTable?.Races || []).catch((err) => { errors.push(err.message); return []; });
    for (const gp of list) {
      const day = Date.parse(gp.date), id = gp.Circuit?.circuitId;
      const m = idx.find((x) => x.sessions.some((s) => s.type === 'Race' && Math.abs(Date.parse(s.start?.slice(0, 10)) - day) <= 86400e3));
      if (m?.circuitKey) keys[id] = m.circuitKey;
      races.push({ y, id, key: m?.circuitKey, lat: Number(gp.Circuit?.Location?.lat), lon: Number(gp.Circuit?.Location?.long) });
    }
    await wait(PAUSE.jolpica * pause);
  }
  const list = [], seen = new Set();
  for (const r of races) {
    const key = r.key ?? keys[r.id] ?? CIRCUITS[r.id]?.key;
    if (key && Number.isFinite(r.lat) && Number.isFinite(r.lon) && !seen.has(`${key}:${r.y}`)) {
      seen.add(`${key}:${r.y}`);
      list.push([key, r.y, r.lat, r.lon]);
    }
  }
  // En cas d'échec, ce que l'ancien catalogue avait de plus reste
  const out = errors.length && kept ? [...list, ...kept.list.filter(([k, y]) => !seen.has(`${k}:${y}`))].sort((a, b) => b[1] - a[1]) : list;
  await setRow(env, 'surrcat', JSON.stringify({ at: errors.length ? now - CATALOGUE + RETRY : now, list: out, ...(errors.length ? { errors } : {}) }));
  return out;
}

// Position d'un circuit : celle du catalogue (toute saison), sinon celle des circuits du calendrier
async function place(env, key) {
  const known = (await readJSON(env, 'surrcat', null))?.list.find((c) => c[0] === key);
  if (known) return { lat: known[2], lon: known[3] };
  const c = Object.values(CIRCUITS).find((x) => x.key === key);
  return Number.isFinite(c?.lat) && Number.isFinite(c?.lon) ? { lat: c.lat, lon: c.lon } : null;
}

const contains = (a, b) => a.s <= b.s && a.w <= b.w && a.n >= b.n && a.e >= b.e;

// Calcul d'un circuit pour une saison : { data } (données de /live/api/surroundings), sinon { error } ; fit : calage.
// at : position du circuit si déjà connue ; pause : 0 dans les tests. Source injoignable : exception (passing)
export async function computeSurroundings(env, key, year, { now = Date.now(), fetchFn = fetch, at, pause = 1 } = {}) {
  const raw = await circuitData(key, year, fetchFn, env);
  if (!raw) return { error: 'tracé introuvable' };
  const c = at || await place(env, key);
  if (!c) return { error: 'position du circuit inconnue' };
  const frame = geoFrame(c.lat, c.lon), track = raw.x.map((x, i) => [x / 10, raw.y[i] / 10]);
  // Ce qui ne dépend que du lieu : pistes et rues d'OSM, ce qu'il y a autour, tuiles du relief ; gardé par circuit
  // (src : tuiles OpenFreeMap ; un ancien fichier d'après Overpass est refait)
  const placeFile = placeKey(key);
  let loc = await (await env.MEDIA.get(placeFile))?.json().catch(() => null) ?? null;
  if (loc?.src !== 'ofm' || Math.hypot(...frame.toEN(loc.lat, loc.lon)) > 3000) loc = { src: 'ofm', lat: c.lat, lon: c.lon };
  let dirty = false;
  const ofm = { name: 'OpenFreeMap' };
  // Lignes des classes demandées à r mètres à la ronde (tuiles entières) : [lat, lon, lat, lon…]
  const lines = async (name, classes, r) => {
    if (!loc[name]) {
      const f = geoFrame(loc.lat, loc.lon), [s, w] = f.toGeo(-r, -r), [n, e] = f.toGeo(r, r);
      loc[name] = (await vectorTiles({ s, w, n, e }, ['transportation'], ofm, fetchFn, pause)).flatMap((t) => t.transportation || [])
        .filter((x) => x.type === 'line' && classes.includes(x.props.class)).flatMap((x) => x.geom).map((l) => l.flatMap(([la, lo]) => [r6(la), r6(lo)]));
      dirty = true;
    }
    return loc[name].map((l) => Array.from({ length: l.length / 2 }, (_, i) => frame.toEN(l[2 * i], l[2 * i + 1])));
  };
  try {
    // Calage sur les pistes d'OSM à 5 km à la ronde ; circuit en ville (Monaco, Bakou…), en partie sur des rues
    // ordinaires : calé aussi sur les rues à 3 km à la ronde
    const good = (x) => x && x.err <= MAX_ERR && x.near >= 0.85;
    let f = fitTrack(track, await lines('race', ['raceway'], 5000));
    if (!good(f)) {
      const g = fitTrack(track, await lines('streets', STREETS, 3000));
      if (g && (!f || g.err < f.err)) f = g;
    }
    const fit = f && { err: Math.round(f.err * 10) / 10, p90: Math.round(f.p90 * 10) / 10, near: Math.round(f.near * 100) / 100,
      deg: Math.round((f.a * 18000) / Math.PI) / 100, s: Math.round(f.s * 10000) / 10000 };
    if (!good(f)) return { error: f ? `calage raté (écart moyen ${fit.err} m)` : 'piste absente d\'OSM', fit };
    // Zone de la saison ; lue dans OSM avec 500 m de plus (un tracé un peu changé d'une saison à l'autre y tient)
    const z = zone(track, f, frame);
    if (!loc.zone || !contains(loc.zone, z)) {
      loc.zone = zone(track, f, frame, MARGIN + 500);
      loc.osm = omtElements(await vectorTiles(loc.zone, OMT_LAYERS, ofm, fetchFn, pause), zone(track, f, frame, NEAR));
      loc.z = tilesFor(loc.zone, 30)[0].z;
      dirty = true;
    }
    // Pour l'enrichissement : 700 m autour du tracé, et le tracé (un point tous les 40 m environ)
    if (!loc.path) {
      loc.near = zone(track, f, frame, NEAR);
      loc.path = resample(track, Math.max(20, Math.round(perimeter(track) / 40))).flatMap(([x, y]) => frame.toGeo(...toEN(f, x, y)).map((v) => Math.round(v * 1e5) / 1e5));
      dirty = true;
    }
    // Enrichissement déjà lu pour ce lieu
    const extra = await (await env.MEDIA.get(extraKey(key)))?.json().catch(() => null);
    const more = extra?.lat === loc.lat && extra?.lon === loc.lon ? Object.values(extra.parts).flat() : [];
    const heights = new Map();
    for (const t of tilesFor(z, Infinity, loc.z)) heights.set(`${t.x}/${t.y}`, terrarium(await decodePng(await tile(env, t, fetchFn, pause))));
    const data = buildSurroundings({ track, fit: f, frame, elements: [...loc.osm, ...more], dem: demSampler(loc.z, heights) });
    if (!data) return { error: 'relief incomplet', fit };
    return { data: { ...data, credits: CREDITS, fit, at: now }, fit };
  } finally {
    if (dirty) await env.MEDIA.put(placeFile, JSON.stringify(loc), { httpMetadata: { contentType: 'application/json' } });
  }
}

// /live/api/surroundings : fichier gardé (objet R2), sinon null et calcul demandé à la tâche planifiée
export async function surroundingsWeb(env, key, year, now = Date.now()) {
  const row = await readJSON(env, rowKey(key, year), null);
  if ((!row || (!row.ok && now > row.next)) && now - Number(await readJSON(env, `surrwant:${key}:${year}`, 0)) > LOCK) {
    await setRow(env, `surrwant:${key}:${year}`, String(now));
  }
  return row?.ok ? env.MEDIA.get(fileKey(key, year)) : null;
}

// Dernier essai de calcul (réponse « pas encore calculé ») : quand, pourquoi il a échoué, prochain essai ; null si jamais essayé
export async function surroundingsStatus(env, key, year) {
  const row = await readJSON(env, rowKey(key, year), null);
  const iso = (t) => (Number.isFinite(t) ? new Date(t).toISOString() : null);
  return row && !row.ok ? { tried: iso(row.at), error: row.error || null, next: iso(row.next) } : null;
}

// Tâche planifiée : un couple circuit × saison par passage, sans résultat, dont l'échec est à revoir ou dont le fichier
// est à refaire (plus ancien que VERSION, ou enrichissement arrivé depuis : il reste servi en attendant, et s'il
// n'est pas refait). Ordre : demandé dans l'heure, prochain Grand Prix, puis le catalogue des replays (parcouru au
// plus une fois par heure quand tout est fait) ; rien à calculer : un pas d'enrichissement (extraTick)
export async function surroundingsTick(env, { now = Date.now(), fetchFn = fetch, pause = 1 } = {}) {
  if (!env.DB || !env.MEDIA || now - Number(await readJSON(env, 'surrlock', 0)) < LOCK) return null;
  const due = (row) => !row || (now > row.next && (!row.ok || row.stale || (row.v || 1) < VERSION));
  const { asked, next } = await wantedCircuits(env, 'surrwant:', now);
  let job = null;
  for (const j of next ? [...asked, next] : asked) if (due(await readJSON(env, rowKey(j[0], j[1]), null))) { job = j; break; }
  if (!job && now - Number(await readJSON(env, 'surridle', 0)) > 3600e3) {
    const rows = new Map((await rowsWithPrefix(env, 'surr:')).map((r) => [r.k, r.v]));
    job = (await catalogue(env, { now, fetchFn, pause })).find(([k, y]) => due(parse(rows.get(rowKey(k, y)))));
    if (!job) await setRow(env, 'surridle', String(now));
  }
  if (!job) return extraTick(env, { now, fetchFn, pause, first: [...asked, next].filter(Boolean).map((j) => j[0]) });
  const [key, y, lat, lon] = job;
  await setRow(env, 'surrlock', String(now));
  const old = await readJSON(env, rowKey(key, y), null);
  // Noté avant le calcul : s'il est interrompu (limite de temps du serveur), il n'est retenté que 6 heures plus tard
  await setRow(env, rowKey(key, y), JSON.stringify({ ...old, at: now, ok: !!old?.ok, next: now + RETRY, error: 'calcul interrompu' }));
  try {
    const at = lat != null ? { lat, lon } : undefined;
    const res = await computeSurroundings(env, key, y, { now, fetchFn, at, pause }).catch((err) => ({ error: err.message, passing: !!err.passing }));
    if (res.data) await env.MEDIA.put(fileKey(key, y), JSON.stringify(res.data), { httpMetadata: { contentType: 'application/json' } });
    // Source occupée ou injoignable : revu 20 min plus tard, puis 40 min, 80 min… (6 h au plus) ; autre échec : 6 h
    const tries = res.passing ? (old?.tries || 0) + 1 : 0;
    const next = now + (tries ? Math.min(RETRY, SOON * 2 ** (tries - 1)) : RETRY);
    const row = { at: now, ok: !!(res.data || old?.ok), next, fit: res.fit || null };
    if (res.data) row.v = VERSION;
    // Fichier à refaire qui échoue : l'ancien reste servi ; revu plus tard seulement si la source était injoignable
    else Object.assign(row, { error: res.error }, tries ? { tries } : {}, old?.ok ? (tries ? { v: old.v, stale: old.stale } : { v: VERSION }) : {});
    await setRow(env, rowKey(key, y), JSON.stringify(row));
    return { key, year: y, ok: !!res.data, fit: res.fit || null, error: res.error };
  } finally {
    if (asked.some(([k, yy]) => k === key && yy === y)) await setRow(env, `surrwant:${key}:${y}`, '0');
    await setRow(env, 'surrlock', '0');
  }
}

// Requête Overpass : chaque serveur à son tour (une pause entre deux) ; tous en échec : erreur qui dit pourquoi
async function overpass(query, { fetchFn, pause }) {
  const why = [];
  for (const url of OVERPASS) {
    if (why.length) await wait(PAUSE.overpass * pause);
    try {
      const r = await fetchFn(url, { method: 'POST', headers: { 'User-Agent': UA }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(60e3) });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (/error|timed out/i.test(d.remark || '')) throw new Error(d.remark.slice(0, 80));
      return overpassElements(d);
    } catch (err) {
      why.push(`${new URL(url).host} ${err.name === 'TimeoutError' ? 'délai dépassé' : err.message}`);
    }
  }
  throw new Error(`Overpass : ${why.join(', ')}`);
}

// Enrichissement facultatif, après le calcul de base (servi tout de suite, et jamais retiré) : ce que les tuiles
// OpenFreeMap n'ont pas, lu une fois par circuit et gardé dans R2 avec le lieu, pour toutes les saisons
// (surroundings/extra-<clé>.json : { lat, lon, parts : { partie : éléments } }). Parkings : tuiles Shortbread de la
// fondation OpenStreetMap ; tribunes, arbres isolés, murs et graviers le long de la piste : Overpass (souvent
// injoignable : petites requêtes, plusieurs serveurs). État dans la base (surrx:<clé> : { have, tries, next }) : une partie qui
// manque est réessayée 1 h, 2 h, 4 h… plus tard (24 h au plus) ; une partie lue fait refaire les fichiers du circuit.
// Un circuit par passage, demandé ou du prochain Grand Prix d'abord ; rien à faire : revu une heure plus tard
const viaOverpass = (name) => (loc, o) => overpass(extraQueries(loc.near, loc.path)[name], o);
const PARTS = {
  parking: (loc, { fetchFn, pause }) => vectorTiles(loc.zone, ['sites'], { name: 'Shortbread', url: SB }, fetchFn, pause).then((t) => omtElements(t, loc.zone, SHORTBREAD)),
  stands: viaOverpass('stands'),
  trees: viaOverpass('trees'),
  walls: viaOverpass('walls'),
  ground: viaOverpass('ground'),
};
async function extraTick(env, { now, fetchFn, pause, first }) {
  if (now - Number(await readJSON(env, 'surrxidle', 0)) < 3600e3) return null;
  const base = await rowsWithPrefix(env, 'surr:'), state = new Map((await rowsWithPrefix(env, 'surrx:')).map((r) => [Number(r.k.slice(6)), parse(r.v)]));
  const done = new Set(base.filter((r) => parse(r.v)?.ok).map((r) => Number(r.k.split(':')[1])));
  const names = Object.keys(PARTS);
  const key = [...first, ...done].find((k) => {
    const x = state.get(k);
    return done.has(k) && (!x || (now > x.next && names.some((p) => !x.have.includes(p))));
  });
  if (key === undefined) { await setRow(env, 'surrxidle', String(now)); return null; }
  await setRow(env, 'surrlock', String(now));
  try {
    const loc = await (await env.MEDIA.get(placeKey(key)))?.json().catch(() => null);
    // Lieu d'avant l'enrichissement (sans le tracé) : refait au prochain calcul de base (VERSION)
    if (!loc?.path) {
      await setRow(env, `surrx:${key}`, JSON.stringify({ at: now, have: [], next: now + EXTRA, error: 'lieu à refaire' }));
      return { key, extra: [] };
    }
    let file = await (await env.MEDIA.get(extraKey(key)))?.json().catch(() => null);
    if (file?.lat !== loc.lat || file?.lon !== loc.lon) file = { lat: loc.lat, lon: loc.lon, parts: {} };
    const fresh = [], errors = [];
    for (const p of names.filter((n) => !file.parts[n])) {
      try {
        file.parts[p] = await PARTS[p](loc, { fetchFn, pause });
        fresh.push(p);
      } catch (err) {
        errors.push(err.message);
      }
    }
    if (fresh.length) {
      await env.MEDIA.put(extraKey(key), JSON.stringify(file), { httpMetadata: { contentType: 'application/json' } });
      for (const r of base.filter((x) => x.k.startsWith(`surr:${key}:`))) {
        const v = parse(r.v);
        if (v?.ok) await setRow(env, r.k, JSON.stringify({ ...v, stale: true, next: 0 }));
      }
    }
    const tries = errors.length ? (state.get(key)?.tries || 0) + 1 : 0;
    await setRow(env, `surrx:${key}`, JSON.stringify({ at: now, have: Object.keys(file.parts), next: tries ? now + Math.min(24 * EXTRA, EXTRA * 2 ** (tries - 1)) : 0,
      ...(tries ? { tries, errors } : {}) }));
    return { key, extra: fresh, errors };
  } finally {
    await setRow(env, 'surrlock', '0');
  }
}
