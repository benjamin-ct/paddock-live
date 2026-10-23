// Pronostics entre amis : enregistrés sur cet ordinateur (predictions.json), saisis depuis
// l'ordinateur ou les téléphones de l'accès réseau. Fermeture au début des qualifications (pole)
// et au départ de la course (podium) ; pronostics des autres cachés jusque-là.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, writeFileAtomic } from './config.js';
import { season } from './season.js';
import { request } from './net.js';
import { playerKey, predictView, checkPick } from '../shared/predict.js';

const FILE = path.join(DATA_DIR, 'predictions.json');
let data = null;

function load() {
  if (!data) {
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { data = {}; }
  }
  return data;
}
function save() {
  try { writeFileAtomic(FILE, JSON.stringify(data, null, 1)); } catch (err) { console.warn('[pronostics]', err.message); }
}

export async function predictionsView(year, me, now = Date.now()) {
  const meKey = playerKey(me);
  return { year, ...predictView(load()[year], await season(year), (key) => key === meKey, now) };
}

export async function savePrediction({ year, ...input }, now = Date.now()) {
  const s = await season(year);
  const d = load();
  d[year] ||= { rounds: {} };
  const { race, key, pick, poleOpen, podiumOpen } = checkPick(s, input, d[year].rounds[input.round]?.[playerKey(input.name)], now);
  d[year].rounds[race.round] ||= {};
  d[year].rounds[race.round][key] = pick;
  save();
  return { ok: true, poleOpen, podiumOpen };
}

// Groupe en ligne (pronostics partagés hors du réseau local, page paddocklive.app/p/<groupe>) : demandes
// relayées au serveur Paddock Live. path : 'new' (création) ou l'identifiant du groupe.
export const PRONOS_URL = process.env.PADDOCK_PRONOS_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev/p/api';
export async function pronosOnline(method, path, { query = '', body = null } = {}) {
  if (!/^(new|[a-z0-9]{10})$/.test(path)) return { status: 400, data: { error: 'Groupe inconnu' } };
  const data = body ? JSON.stringify(body) : undefined;
  const r = await request(`${PRONOS_URL}/${path}${query}`, { method, timeout: 30000, ...(data ? { body: data, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } } : {}) });
  let out;
  try { out = JSON.parse(r.body.toString('utf8')); } catch { out = { error: `Serveur Paddock Live indisponible (HTTP ${r.status})` }; }
  return { status: r.status, data: out };
}
