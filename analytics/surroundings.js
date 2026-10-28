// Alentours des circuits pour la vue 3D (/live/api/surroundings) : relief du modèle numérique de terrain (tuiles
// Terrain Tiles, données ouvertes d'AWS) et ce qu'il y a autour d'après OpenStreetMap (licence ODbL), posés sur le
// tracé MultiViewer de la saison (calculs : shared/surroundings.js). Calculés à l'avance par la tâche planifiée, un
// couple circuit × saison à la fois : demandé, prochain Grand Prix, puis tout le catalogue des replays. Ce qui ne
// dépend que du lieu (OSM, tuiles) est lu une fois par circuit et gardé dans R2 pour toutes les saisons ; seul le
// calage sur le tracé change. Résultat (quelques centaines de ko) dans R2, état dans la base.
import { setRow, readJSON, rowsWithPrefix } from './alerts.js';
import { seasonRow, archiveToken } from './studio.js';
import { circuitData } from './race-stats.js';
import { seasonIndex } from './tyres.js';
import { wantedCircuits } from './zones.js';
import { CIRCUITS } from '../shared/circuits-info.js';
import { fitTrack, zone, buildSurroundings, overpassQuery, trimOsm, geoFrame, tilesFor, decodePng, terrarium, demSampler, MARGIN } from '../shared/surroundings.js';

// Serveur Overpass principal, puis un miroir
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/';
const JOLPICA = 'https://api.jolpi.ca/ergast/f1/';
const UA = 'Paddock-Live (https://paddocklive.app)';
const FIRST_YEAR = 2018;       // premiers replays proposés (ui/replays.js)
const RETRY = 6 * 3600e3;      // échec (réseau, serveur occupé, calage raté) : revu 6 h plus tard, comme les zones
const LOCK = 10 * 60e3;        // un seul calcul à la fois
const CATALOGUE = 7 * 86400e3; // catalogue des replays relu une fois par semaine
const MAX_ERR = 8;             // calage gardé si le tracé est en moyenne à moins de 8 m des pistes (ou rues) d'OSM
// Pauses (ms) : serveurs publics ménagés, une requête à la fois
const PAUSE = { overpass: 5000, tile: 300, jolpica: 1000 };
export const CREDITS = ['© contributeurs OpenStreetMap', 'Altitude : Terrain Tiles (Mapzen, AWS Open Data)'];

const rowKey = (key, year) => `surr:${key}:${year}`;
const fileKey = (key, year) => `surroundings/${key}-${year}.json`;
const wait = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : null);
const r6 = (v) => Math.round(v * 1e6) / 1e6;

// Requête Overpass : serveur principal, sinon le miroir ; une pause après chaque essai
async function overpass(query, fetchFn, pause) {
  let error = null;
  for (const url of OVERPASS) {
    try {
      const r = await fetchFn(url, { method: 'POST', headers: { 'User-Agent': UA }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(180e3) });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (/runtime error/.test(d.remark || '')) throw new Error(d.remark.slice(0, 120));
      return d.elements || [];
    } catch (err) {
      error = `Overpass ${new URL(url).host} : ${err.message}`;
    } finally {
      await wait(PAUSE.overpass * pause);
    }
  }
  throw new Error(error);
}

// Tuile d'altitude (PNG), gardée dans R2 : lue une seule fois
async function tile(env, { z, x, y }, fetchFn, pause) {
  const k = `surroundings/tiles/${z}/${x}/${y}.png`, kept = await env.MEDIA.get(k);
  if (kept) return new Uint8Array(await kept.arrayBuffer());
  const r = await fetchFn(`${TILES}${z}/${x}/${y}.png`, { headers: { 'User-Agent': UA } });
  if (r.status !== 200) throw new Error(`tuile d'altitude ${z}/${x}/${y} : HTTP ${r.status}`);
  const b = new Uint8Array(await r.arrayBuffer());
  await env.MEDIA.put(k, b, { httpMetadata: { contentType: 'image/png' } });
  await wait(PAUSE.tile * pause);
  return b;
}

// Catalogue des replays : couples [clé, année, lat, lon], un par circuit et par saison des archives de la F1 (2018 à
// aujourd'hui, comme la liste des replays de l'appli), les plus récents d'abord ; position d'après Jolpica (course du
// même jour). Relu une fois par semaine ; sans connexion F1 TV ou en cas d'échec, l'ancien reste (revu 6 h plus tard)
export async function catalogue(env, { now = Date.now(), fetchFn = fetch, pause = 1, token } = {}) {
  const kept = await readJSON(env, 'surrcat', null);
  if (kept && now - kept.at < CATALOGUE) return kept.list;
  const list = [], seen = new Set();
  try {
    token ??= await archiveToken(env, { now, fetchFn });
    if (!token) throw new Error('connexion F1 TV absente');
    for (let y = new Date(now).getUTCFullYear(); y >= FIRST_YEAR; y--) {
      const idx = await seasonIndex(y, token, fetchFn);
      const r = await fetchFn(`${JOLPICA}${y}/races.json?limit=100`, { headers: { 'User-Agent': UA } });
      if (r.status !== 200) throw new Error(`Jolpica ${y} : HTTP ${r.status}`);
      const races = (await r.json()).MRData?.RaceTable?.Races || [];
      for (const m of idx) {
        const s = m.sessions.find((x) => x.type === 'Race'), day = s && Date.parse(s.start.slice(0, 10));
        const gp = s && races.find((g) => Math.abs(Date.parse(g.date) - day) <= 86400e3);
        const lat = Number(gp?.Circuit?.Location?.lat), lon = Number(gp?.Circuit?.Location?.long);
        if (Number.isFinite(lat) && Number.isFinite(lon) && !seen.has(`${m.circuitKey}:${y}`)) {
          seen.add(`${m.circuitKey}:${y}`);
          list.push([m.circuitKey, y, lat, lon]);
        }
      }
      await wait(PAUSE.jolpica * pause);
    }
  } catch {
    await setRow(env, 'surrcat', JSON.stringify({ at: now - CATALOGUE + RETRY, list: kept?.list || [] }));
    return kept?.list || [];
  }
  await setRow(env, 'surrcat', JSON.stringify({ at: now, list }));
  return list;
}

// Position d'un circuit : celle du catalogue (toute saison), sinon celle du calendrier de l'année
async function place(env, key, now, fetchFn) {
  const known = (await readJSON(env, 'surrcat', null))?.list.find((c) => c[0] === key);
  if (known) return { lat: known[2], lon: known[3] };
  const id = Object.keys(CIRCUITS).find((k) => CIRCUITS[k].key === key);
  const race = (await seasonRow(env, new Date(now).getUTCFullYear(), { now, fetchFn, maxAge: 365 * 86400e3 }).catch(() => null))?.v.races.find((r) => r.circuitId === id);
  return Number.isFinite(race?.lat) && Number.isFinite(race?.lon) ? { lat: race.lat, lon: race.lon } : null;
}

const contains = (a, b) => a.s <= b.s && a.w <= b.w && a.n >= b.n && a.e >= b.e;

// Calcul d'un circuit pour une saison : { data } (données de /live/api/surroundings), sinon { error } ; fit : calage.
// at : position du circuit si déjà connue ; pause : 0 dans les tests
export async function computeSurroundings(env, key, year, { now = Date.now(), fetchFn = fetch, at, pause = 1 } = {}) {
  const raw = await circuitData(key, year, fetchFn);
  if (!raw) return { error: 'tracé introuvable' };
  const c = at || await place(env, key, now, fetchFn);
  if (!c) return { error: 'position du circuit inconnue' };
  const frame = geoFrame(c.lat, c.lon), track = raw.x.map((x, i) => [x / 10, raw.y[i] / 10]);
  // Ce qui ne dépend que du lieu : pistes et rues d'OSM, ce qu'il y a autour, tuiles du relief ; gardé par circuit
  const placeFile = `surroundings/place-${key}.json`;
  let loc = await (await env.MEDIA.get(placeFile))?.json().catch(() => null) ?? null;
  if (!loc || Math.hypot(...frame.toEN(loc.lat, loc.lon)) > 3000) loc = { lat: c.lat, lon: c.lon };
  let dirty = false;
  const lines = async (name, types, r) => {
    if (!loc[name]) {
      const q = `[out:json][timeout:90];way[highway~"^(${types})$"](around:${r},${loc.lat},${loc.lon});out geom qt;`;
      loc[name] = (await overpass(q, fetchFn, pause)).filter((e) => e.geometry).map((e) => e.geometry.flatMap((p) => [r6(p.lat), r6(p.lon)]));
      dirty = true;
    }
    return loc[name].map((l) => Array.from({ length: l.length / 2 }, (_, i) => frame.toEN(l[2 * i], l[2 * i + 1])));
  };
  try {
    // Calage sur les pistes d'OSM à 5 km à la ronde ; circuit en ville (Monaco, Bakou…), en partie sur des rues
    // ordinaires : calé aussi sur les rues à 3 km à la ronde
    const good = (x) => x && x.err <= MAX_ERR && x.near >= 0.85;
    let f = fitTrack(track, await lines('race', 'raceway', 5000));
    if (!good(f)) {
      const g = fitTrack(track, await lines('streets', 'raceway|motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service', 3000));
      if (g && (!f || g.err < f.err)) f = g;
    }
    const fit = f && { err: Math.round(f.err * 10) / 10, p90: Math.round(f.p90 * 10) / 10, near: Math.round(f.near * 100) / 100,
      deg: Math.round((f.a * 18000) / Math.PI) / 100, s: Math.round(f.s * 10000) / 10000 };
    if (!good(f)) return { error: f ? `calage raté (écart moyen ${fit.err} m)` : 'piste absente d\'OSM', fit };
    // Zone de la saison ; lue dans OSM avec 500 m de plus (un tracé un peu changé d'une saison à l'autre y tient)
    const z = zone(track, f, frame);
    if (!loc.zone || !contains(loc.zone, z)) {
      loc.zone = zone(track, f, frame, MARGIN + 500);
      loc.osm = trimOsm(await overpass(overpassQuery(loc.zone), fetchFn, pause));
      loc.z = tilesFor(loc.zone, 30)[0].z;
      dirty = true;
    }
    const heights = new Map();
    for (const t of tilesFor(z, Infinity, loc.z)) heights.set(`${t.x}/${t.y}`, terrarium(await decodePng(await tile(env, t, fetchFn, pause))));
    const data = buildSurroundings({ track, fit: f, frame, elements: loc.osm, dem: demSampler(loc.z, heights) });
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

// Tâche planifiée : un couple circuit × saison par passage, sans résultat ou dont l'échec date de plus de 6 h. Ordre :
// demandé dans l'heure, prochain Grand Prix, puis le catalogue des replays (parcouru au plus une fois par heure quand
// tout est fait)
export async function surroundingsTick(env, { now = Date.now(), fetchFn = fetch, pause = 1 } = {}) {
  if (!env.DB || !env.MEDIA || now - Number(await readJSON(env, 'surrlock', 0)) < LOCK) return null;
  const due = (row) => !row || (!row.ok && now > row.next);
  const { asked, next } = await wantedCircuits(env, 'surrwant:', now);
  let job = null;
  for (const j of next ? [...asked, next] : asked) if (due(await readJSON(env, rowKey(j[0], j[1]), null))) { job = j; break; }
  if (!job && now - Number(await readJSON(env, 'surridle', 0)) > 3600e3) {
    const rows = new Map((await rowsWithPrefix(env, 'surr:')).map((r) => [r.k, r.v]));
    const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };
    job = (await catalogue(env, { now, fetchFn, pause })).find(([k, y]) => due(parse(rows.get(rowKey(k, y)))));
    if (!job) await setRow(env, 'surridle', String(now));
  }
  if (!job) return null;
  const [key, y, lat, lon] = job;
  await setRow(env, 'surrlock', String(now));
  // Noté avant le calcul : s'il est interrompu (limite de temps du serveur), il n'est retenté que 6 heures plus tard
  await setRow(env, rowKey(key, y), JSON.stringify({ at: now, ok: false, next: now + RETRY, error: 'calcul interrompu' }));
  try {
    const at = lat != null ? { lat, lon } : undefined;
    const res = await computeSurroundings(env, key, y, { now, fetchFn, at, pause }).catch((err) => ({ error: err.message }));
    if (res.data) await env.MEDIA.put(fileKey(key, y), JSON.stringify(res.data), { httpMetadata: { contentType: 'application/json' } });
    await setRow(env, rowKey(key, y), JSON.stringify({ at: now, ok: !!res.data, next: now + RETRY, fit: res.fit || null, ...(res.data ? {} : { error: res.error }) }));
    return { key, year: y, ok: !!res.data, fit: res.fit || null, error: res.error };
  } finally {
    if (asked.some(([k, yy]) => k === key && yy === y)) await setRow(env, `surrwant:${key}:${y}`, '0');
    await setRow(env, 'surrlock', '0');
  }
}
