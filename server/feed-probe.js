// Flux cachés testés en direct (diagnostic des données F1, mode créateur) : en plus des flux de l'appli,
// le direct demande des flux connus des archives mais pas lus en direct, et des noms possibles pour
// l'énergie 2026 (batterie, Boost, mode dépassement), que la F1 ne publie nulle part dans ses archives.
// Ceux qui répondent sont notés (nombre de messages, exemple), sans entrer dans l'appli.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

export const PROBE_TOPICS = [
  // Flux des archives que le direct de l'appli ne demande pas
  'DriverRaceInfo', 'OvertakeSeries', 'TimingDataF1', 'DriverTracker', 'LapSeries', 'CurrentTyres', 'TlaRcm',
  'WeatherDataSeries', 'AudioStreams', 'ContentStreams', 'RcmSeries', 'DriverScore', 'SPFeed', 'ArchiveStatus',
  // Noms possibles (devinés) pour l'énergie 2026
  'CarData2.z', 'CarDataF1.z', 'CarStatus', 'CarStatus.z', 'CarEnergy', 'CarEnergy.z', 'EnergyData', 'EnergyData.z',
  'EnergyStore', 'ERS', 'ERSData', 'ERSData.z', 'Battery', 'BatteryData', 'BatteryData.z', 'StateOfCharge',
  'PowerUnit', 'PowerUnitData', 'Boost', 'BoostData', 'BoostMode', 'OvertakeMode', 'OvertakeModeData',
  'ManualOverride', 'ActiveAero', 'AeroMode', 'DriverEnergy', 'DriverEnergy.z',
];
const PROBE = new Set(PROBE_TOPICS);
const FILE = () => path.join(DATA_DIR, 'feed-probe.json');

let state = null;
function load() {
  if (!state) {
    try { state = JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { state = { at: null, session: null, error: null, found: {} }; }
  }
  return state;
}
function save() {
  try { fs.writeFileSync(FILE(), JSON.stringify(state)); } catch { /* disque plein, lecture seule : en mémoire seulement */ }
}
function note(topic, data) {
  const f = (load().found[topic] ||= { n: 0, first: Date.now() });
  f.n++;
  f.last = Date.now();
  f.sample = JSON.stringify(data ?? null).slice(0, 300);
}

export const isProbe = (topic) => PROBE.has(topic);
export const probeState = () => ({ asked: PROBE_TOPICS, ...load() });

// Réponse à l'abonnement : état actuel de chaque flux qui existe
export function probeAnswer(result, error, session) {
  load();
  Object.assign(state, { at: Date.now(), session: session || null, error: error || null });
  for (const [topic, data] of Object.entries(result || {})) note(topic, data);
  save();
}

// Message d'un flux testé (enregistré sur le disque à la première réception)
export function probeFeed(topic, data) {
  const first = !load().found[topic];
  note(topic, data);
  if (first) save();
}
