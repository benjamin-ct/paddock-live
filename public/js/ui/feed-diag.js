// Diagnostic des données F1 (Réglages → Application, mode créateur) : flux publiés pour la séance
// chargée (Index.json de l'archive officielle, connexion F1 TV) et canaux de télémétrie reçus, pour
// repérer une donnée nouvelle (énergie de la batterie, mode Boost…). Les nouveautés sont signalées.
import { store } from '../store.js';
import { $, esc } from '../util.js';
import { carChannels } from '../positions.js';

// Flux et canaux déjà connus (saisons précédentes)
const KNOWN_FEEDS = new Set(['SessionInfo', 'ArchiveStatus', 'TrackStatus', 'SessionData', 'ContentStreams', 'AudioStreams', 'ExtrapolatedClock',
  'DriverList', 'TimingDataF1', 'TimingData', 'LapSeries', 'TopThree', 'TimingAppData', 'TimingStats', 'SessionStatus', 'TyreStintSeries', 'Heartbeat',
  'Position.z', 'WeatherData', 'WeatherDataSeries', 'CarData.z', 'TeamRadio', 'TlaRcm', 'RaceControlMessages', 'PitLaneTimeCollection', 'CurrentTyres',
  'DriverRaceInfo', 'ChampionshipPrediction', 'OvertakeSeries', 'DriverScore', 'SPFeed', 'PitStopSeries', 'PitStop', 'LapCount', 'DriverTracker']);
const KNOWN_CHANNELS = { 0: 'régime', 2: 'vitesse', 3: 'rapport', 4: 'accélérateur', 5: 'frein', 45: 'DRS' };

async function feeds() {
  const path = store.state.SessionInfo?.Path;
  if (!path) return '<p class="small muted">Aucune séance chargée : lancez un replay ou attendez une séance.</p>';
  try {
    const r = await fetch(`/api/archive/file?p=${encodeURIComponent(`${path}Index.json`)}`);
    if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
    const list = Object.keys((await r.json()).Feeds || {}).sort();
    const fresh = list.filter((f) => !KNOWN_FEEDS.has(f));
    return `<p class="small"><b>Flux publiés</b> (${esc(path)}) : ${list.map((f) => (KNOWN_FEEDS.has(f) ? esc(f) : `<b class="diag-new">${esc(f)} (nouveau)</b>`)).join(', ')}</p>
      <p class="small ${fresh.length ? 'diag-new' : 'muted'}">${fresh.length ? `${fresh.length} flux nouveau(x) par rapport aux saisons précédentes.` : 'Aucun flux nouveau.'}</p>`;
  } catch (err) { return `<p class="small muted">Liste des flux indisponible : ${esc(String(err.message || err).slice(0, 160))}</p>`; }
}

function channels() {
  if (!carChannels.size) return '<p class="small muted">Aucune télémétrie reçue pour l\'instant (connexion F1 TV et séance ou replay en cours).</p>';
  const rows = [...carChannels].sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, c]) => {
    const name = KNOWN_CHANNELS[k];
    const range = Number.isFinite(c.min) ? `${c.min} à ${c.max}` : '—';
    return `<li>${name ? `Canal ${esc(k)} (${name})` : `<b class="diag-new">Canal ${esc(k)} (nouveau)</b>`} : ${range} · ${[...c.vals].slice(0, 8).map((v) => esc(String(v))).join(', ')}</li>`;
  });
  return `<p class="small"><b>Canaux de télémétrie reçus</b></p><ul class="small diag-list">${rows.join('')}</ul>`;
}

export function initFeedDiag() {
  $('#feedDiagBtn')?.addEventListener('click', async (e) => {
    const out = $('#feedDiagOut'), btn = e.currentTarget;
    btn.disabled = true;
    out.innerHTML = '<p class="small muted">Analyse…</p>';
    out.innerHTML = `${await feeds()}${channels()}`;
    btn.disabled = false;
  });
}
