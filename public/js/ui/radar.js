// Radar des précipitations autour du circuit (onglet Météo) : les deux dernières heures, image par
// image (toutes les 10 min), pour voir la pluie arriver. Images radar : RainViewer (gratuit, sans
// compte) ; fond de carte : OpenStreetMap (relayé et mis en cache par le serveur). Chargé seulement quand l'onglet est affiché.
import { store } from '../store.js';
import { $, esc, api } from '../util.js';
import { icon } from '../icons.js';
import { LOCALE } from '../i18n.js';
import { upcoming } from './home.js';

const BASE_Z = 8;      // zoom du fond de carte
const RAIN_Z = 7;      // zoom maximal des images radar gratuites (agrandies × 2)
const H = 260;

let frames = [];       // [{ time, path }]
let host = '';
let framesAt = 0;
let place = null;      // { name, lat, lon }
let placeKey = '';
let idx = -1;
let playing = true;
let built = '';
let timer = null;

const lon2x = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z; };

async function loadFrames() {
  if (Date.now() - framesAt < 5 * 60e3 && frames.length) return;
  framesAt = Date.now();
  try {
    const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const d = await r.json();
    host = d.host;
    frames = (d.radar?.past || []).concat(d.radar?.nowcast || []);
    built = '';
  } catch { frames = []; }
}

// Circuit de la séance affichée : d'après le nom du Grand Prix, sinon la date ; entre deux
// séances, celui du prochain Grand Prix (comme la barre du haut)
async function loadPlace() {
  const nx = upcoming();
  if (nx?.lat) {
    const key = `next|${nx.race}`;
    if (key !== placeKey) { placeKey = key; place = { name: nx.locality || nx.race, lat: nx.lat, lon: nx.lon }; built = ''; }
    return;
  }
  const info = store.state.SessionInfo;
  const key = `${info?.Meeting?.Name}|${info?.StartDate}`;
  if (!info || key === placeKey) return;
  placeKey = key;
  try {
    const year = Number(String(info.StartDate || '').slice(0, 4)) || new Date().getFullYear();
    const d = await api(`/api/schedule?year=${year}`);
    const t = Date.parse(info.StartDate || '') || Date.now();
    const race = d.races.find((r) => r.name === info.Meeting?.Name)
      || d.races.slice().sort((a, b) => Math.abs(Date.parse(a.sessions.at(-1)?.t) - t) - Math.abs(Date.parse(b.sessions.at(-1)?.t) - t))[0];
    place = race && Number.isFinite(race.lat) ? { name: race.locality || race.name, lat: race.lat, lon: race.lon } : null;
    built = '';
  } catch { place = null; }
}

// Tuiles couvrant la zone affichée pour un zoom donné (f : agrandissement à l'écran)
function tiles(W, z, cx, cy) {
  const f = 2 ** (BASE_Z - z);
  const T = 256 * f;
  const left = cx - W / 2, top = cy - H / 2;
  const out = [];
  for (let tx = Math.floor(left / T); tx * T < left + W; tx++) {
    for (let ty = Math.floor(top / T); ty * T < top + H; ty++) {
      const n = 2 ** z;
      out.push({ x: ((tx % n) + n) % n, y: ty, left: tx * T - left, top: ty * T - top, size: T });
    }
  }
  return out;
}

function build(el) {
  const W = el.clientWidth || 400;
  const dark = document.documentElement.dataset.scheme !== 'light';
  const key = `${W}|${dark}|${place?.lat},${place?.lon}|${frames.map((f) => f.time).join()}`;
  if (key === built) return;
  built = key;
  const cx = lon2x(place.lon, BASE_Z), cy = lat2y(place.lat, BASE_Z);
  const base = tiles(W, BASE_Z, cx, cy).map((t) => `<img src="/api/tile?z=${BASE_Z}&x=${t.x}&y=${t.y}" style="left:${t.left}px;top:${t.top}px;width:${t.size}px;height:${t.size}px" alt="" loading="lazy">`).join('');
  const rainTiles = tiles(W, RAIN_Z, cx, cy);
  const layers = frames.map((f, i) => `<div class="rd-frame" data-i="${i}">${rainTiles.map((t) => `<img src="${host}${f.path}/256/${RAIN_Z}/${t.x}/${t.y}/2/1_1.png" style="left:${t.left}px;top:${t.top}px;width:${t.size}px;height:${t.size}px" alt="" referrerpolicy="no-referrer">`).join('')}</div>`).join('');
  // Repère : 25 km autour du circuit
  const kmPx = 1000 / (156543.03 * Math.cos((place.lat * Math.PI) / 180) / 2 ** BASE_Z);
  el.innerHTML = `<div class="rd-head"><b>${icon('rain')} Radar des précipitations</b><span class="muted small">autour de ${esc(place.name)}</span></div>
    <div class="rd-map" style="height:${H}px"><div class="rd-base${dark ? ' dark' : ''}">${base}</div>${layers}
      <i class="rd-ring" style="width:${2 * 25 * kmPx}px;height:${2 * 25 * kmPx}px"></i><i class="rd-dot" title="${esc(place.name)}"></i></div>
    <div class="rd-ctl"><button class="icon-btn" data-rd-play title="Lecture / pause">${icon(playing ? 'pause' : 'play')}</button>
      <input type="range" min="0" max="${Math.max(0, frames.length - 1)}" value="${Math.max(0, frames.length - 1)}" data-rd-range aria-label="Heure de l'image radar">
      <span class="rd-time" data-rd-time></span></div>
    <p class="muted small rd-note">Pluie détectée par les radars météo (2 dernières heures, une image toutes les 10 min) ; cercle : 25 km autour du circuit. Données : RainViewer · carte © les contributeurs d'OpenStreetMap.</p>`;
  idx = frames.length - 1;
  show(el);
}

function show(el) {
  for (const f of el.querySelectorAll('.rd-frame')) f.classList.toggle('on', Number(f.dataset.i) === idx);
  const f = frames[idx];
  if (!f) return;
  const ago = Math.round((Date.now() / 1000 - f.time) / 60);
  el.querySelector('[data-rd-time]').textContent = `${new Date(f.time * 1000).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}${ago > 5 ? ` (il y a ${ago} min)` : ' (dernière image)'}`;
  el.querySelector('[data-rd-range]').value = String(idx);
}

let pauseUntil = 0;
async function tick() {
  const el = $('#wxRadar');
  if (!el || !el.offsetParent) return;   // onglet Météo masqué : rien à faire
  await Promise.all([loadFrames(), loadPlace()]);
  if (!place) { el.innerHTML = '<p class="muted small">Radar indisponible : circuit de la séance inconnu.</p>'; built = ''; return; }
  if (!frames.length) { el.innerHTML = '<p class="muted small">Radar des précipitations indisponible (connexion internet nécessaire).</p>'; built = ''; return; }
  build(el);
  if (playing && Date.now() > pauseUntil) {
    idx = (idx + 1) % frames.length;
    if (idx === frames.length - 1) pauseUntil = Date.now() + 1800;   // pause sur la dernière image
    show(el);
  }
}

export function initRadar() {
  document.addEventListener('click', (e) => {
    const el = $('#wxRadar');
    if (!el || !el.contains(e.target)) return;
    if (e.target.closest('[data-rd-play]')) {
      playing = !playing;
      e.target.closest('[data-rd-play]').innerHTML = icon(playing ? 'pause' : 'play');
    }
  });
  document.addEventListener('input', (e) => {
    if (!e.target.matches?.('[data-rd-range]')) return;
    playing = false;
    idx = Number(e.target.value);
    const el = $('#wxRadar');
    el.querySelector('[data-rd-play]').innerHTML = icon('play');
    show(el);
  });
  clearInterval(timer);
  timer = setInterval(tick, 600);
}
