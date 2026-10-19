// Radar des précipitations du circuit (onglet Météo) : les deux dernières heures et la prévision à
// court terme, image par image (toutes les 10 min), pour voir la pluie arriver. Trois cadrages :
// le circuit de près (tracé dessiné par-dessus), les alentours, la région ; et la carte animée Windy
// (pluie, vent, nuages). Images radar : RainViewer (gratuit, sans compte) ; fond de carte :
// OpenStreetMap (relayé et mis en cache par le serveur) ; tracés : f1-circuits (MIT, data/).
// Chargé seulement quand l'onglet est affiché.
import { store } from '../store.js';
import { $, esc, api, storageGet, storageSet } from '../util.js';
import { icon } from '../icons.js';
import { LOCALE, t } from '../i18n.js';
import { upcoming } from './home.js';

const RAIN_Z = 7;      // zoom maximal des images radar gratuites (agrandies au-delà)
const H = 300;
const VIEWS = [['circuit', 'Circuit'], ['area', 'Alentours'], ['region', 'Région'], ['windy', 'Windy']];

let frames = [];       // [{ time, path }]
let host = '';
let framesAt = 0;
let place = null;      // { name, lat, lon }
let placeKey = '';
let shapes = null;     // tracés des circuits (chargés une fois)
let idx = -1;
let playing = true;
let built = '';
let timer = null;
let view = storageGet('paddock.radarView', 'circuit');

const lon2x = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z; };

// Circuit de la séance (ou du prochain Grand Prix) : utilisé aussi par l'onglet Météo
export const placeNow = () => place;

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

async function loadShapes() {
  if (shapes) return;
  shapes = [];
  try { shapes = (await (await fetch('/data/f1-circuits.json')).json()).circuits || []; built = ''; } catch { /* sans tracé */ }
}

// Tracé du circuit le plus proche (moins de 15 km)
function shapeOf(p) {
  let best = null, bd = 15;
  for (const c of shapes || []) {
    const [lon, lat] = c.line[0];
    const d = Math.hypot((lon - p.lon) * 111 * Math.cos((p.lat * Math.PI) / 180), (lat - p.lat) * 111);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
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
    const t0 = Date.parse(info.StartDate || '') || Date.now();
    const race = d.races.find((r) => r.name === info.Meeting?.Name)
      || d.races.slice().sort((a, b) => Math.abs(Date.parse(a.sessions.at(-1)?.t) - t0) - Math.abs(Date.parse(b.sessions.at(-1)?.t) - t0))[0];
    place = race && Number.isFinite(race.lat) ? { name: race.locality || race.name, lat: race.lat, lon: race.lon } : null;
    built = '';
  } catch { place = null; }
}

// Tuiles de zoom tz couvrant la carte affichée au zoom z, centrée sur (cx, cy) (pixels au zoom z)
function tiles(W, z, tz, cx, cy) {
  const T = 256 * 2 ** (z - tz);
  const left = cx - W / 2, top = cy - H / 2;
  const out = [];
  const n = 2 ** tz;
  for (let tx = Math.floor(left / T); tx * T < left + W; tx++) {
    for (let ty = Math.max(0, Math.floor(top / T)); ty * T < top + H && ty < n; ty++) {
      out.push({ x: ((tx % n) + n) % n, y: ty, left: tx * T - left, top: ty * T - top, size: T });
    }
  }
  return out;
}

// Cadrage : zoom et centre (pixels au zoom z) ; « circuit » : le tracé occupe l'essentiel de la carte
function frame(W, shape) {
  const c = shape?.line;
  if (view === 'circuit' && c) {
    const xs = c.map(([lon]) => lon2x(lon, 0)), ys = c.map(([, lat]) => lat2y(lat, 0));
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const z = Math.max(12, Math.min(16, Math.floor(Math.log2(Math.min((W * 0.8) / (x1 - x0), (H * 0.8) / (y1 - y0))))));
    return { z, cx: ((x0 + x1) / 2) * 2 ** z, cy: ((y0 + y1) / 2) * 2 ** z };
  }
  const z = view === 'circuit' ? 14 : view === 'area' ? 11 : 8;
  return { z, cx: lon2x(place.lon, z), cy: lat2y(place.lat, z) };
}

// Échelle : la plus grande distance ronde qui tient dans un quart de la carte
function scaleBar(W, z) {
  const mPx = (156543.03 * Math.cos((place.lat * Math.PI) / 180)) / 2 ** z;
  const km = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].filter((k) => (k * 1000) / mPx <= W / 4).pop() || 0.2;
  return `<span class="wxr-scale"><i style="width:${(km * 1000) / mPx}px"></i>${String(km).replace('.', ',')} km</span>`;
}

function build(el) {
  const W = el.clientWidth || 400;
  const dark = document.documentElement.dataset.scheme !== 'light';
  const shape = shapeOf(place);
  const key = `${W}|${dark}|${view}|${place.lat},${place.lon}|${shape?.id}|${frames.map((f) => f.time).join()}`;
  if (key === built) return;
  built = key;
  const tabs = `<div class="tbp-seg wxr-views">${VIEWS.map(([k, l]) => `<button data-wxr-view="${k}" class="${k === view ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const head = `<div class="wxr-head"><b>${icon('rain')} Radar de pluie</b><span class="muted small">${esc(place.name)}</span>${tabs}</div>`;
  if (view === 'windy') {
    const q = new URLSearchParams({ lat: place.lat.toFixed(3), lon: place.lon.toFixed(3), detailLat: place.lat.toFixed(3), detailLon: place.lon.toFixed(3), zoom: '8', level: 'surface', overlay: 'radar', product: 'radar', menu: '', message: 'true', marker: 'true', calendar: 'now', type: 'map', location: 'coordinates', detail: '', metricWind: 'km/h', metricTemp: '°C', metricRain: 'mm', radarRange: '-1' });
    el.innerHTML = `${head}<iframe class="wxr-windy" src="https://embed.windy.com/embed.html?${q}" title="Windy" loading="lazy" referrerpolicy="no-referrer"></iframe>
      <p class="muted small wxr-note">Carte animée Windy : pluie, vent, nuages et prévisions (changer de calque en bas à droite).</p>`;
    return;
  }
  const { z, cx, cy } = frame(W, shape);
  const left = cx - W / 2, top = cy - H / 2;
  const base = tiles(W, z, Math.min(z, 16), cx, cy).map((tl) => `<img src="/api/tile?z=${Math.min(z, 16)}&x=${tl.x}&y=${tl.y}" style="left:${tl.left}px;top:${tl.top}px;width:${tl.size}px;height:${tl.size}px" alt="" loading="lazy">`).join('');
  const rainTiles = tiles(W, z, Math.min(z, RAIN_Z), cx, cy);
  const rz = Math.min(z, RAIN_Z);
  const layers = frames.map((f, i) => `<div class="wxr-frame" data-i="${i}">${rainTiles.map((tl) => `<img src="${host}${f.path}/256/${rz}/${tl.x}/${tl.y}/2/1_1.png" style="left:${tl.left}px;top:${tl.top}px;width:${tl.size}px;height:${tl.size}px" alt="" referrerpolicy="no-referrer">`).join('')}</div>`).join('');
  // Tracé du circuit par-dessus (trop petit en vue régionale : un point)
  const pts = shape ? shape.line.map(([lon, lat]) => `${(lon2x(lon, z) - left).toFixed(1)},${(lat2y(lat, z) - top).toFixed(1)}`).join(' ') : '';
  const track = pts && view !== 'region' ? `<svg class="wxr-track" width="${W}" height="${H}" aria-hidden="true"><polygon points="${pts}" class="o"/><polygon points="${pts}" class="i"/></svg>`
    : `<i class="wxr-dot" style="left:${lon2x(place.lon, z) - left}px;top:${lat2y(place.lat, z) - top}px" title="${esc(place.name)}"></i>`;
  el.innerHTML = `${head}
    <div class="wxr-map" style="height:${H}px"><div class="wxr-base${dark ? ' dark' : ''}">${base}</div>${layers}${track}${scaleBar(W, z)}
      <span class="wxr-legend" title="Intensité de la pluie"><i></i>faible · forte</span></div>
    <div class="wxr-ctl"><button class="icon-btn" data-rd-play title="Lecture / pause">${icon(playing ? 'pause' : 'play')}</button>
      <input type="range" min="0" max="${Math.max(0, frames.length - 1)}" value="${Math.max(0, frames.length - 1)}" data-rd-range aria-label="Heure de l'image radar">
      <span class="wxr-time" data-rd-time></span></div>
    <p class="muted small wxr-note">Pluie des 2 dernières heures et prévision à 30 min · RainViewer · © OpenStreetMap</p>`;
  idx = frames.findLastIndex((f) => f.time * 1000 <= Date.now());
  if (idx < 0) idx = frames.length - 1;
  show(el);
}

function show(el) {
  for (const f of el.querySelectorAll('.wxr-frame')) f.classList.toggle('on', Number(f.dataset.i) === idx);
  const f = frames[idx];
  const tm = el.querySelector('[data-rd-time]');
  if (!f || !tm) return;
  const ago = Math.round((Date.now() / 1000 - f.time) / 60);
  const hh = new Date(f.time * 1000).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  tm.textContent = ago < -2 ? t('{} (prévision)', hh) : ago > 5 ? t('{} (il y a {} min)', hh, ago) : t('{} (maintenant)', hh);
  tm.classList.toggle('future', ago < -2);
  el.querySelector('[data-rd-range]').value = String(idx);
}

let pauseUntil = 0;
async function tick() {
  const el = $('#wxRadar');
  if (!el || !el.offsetParent) return;   // onglet Météo masqué : rien à faire
  await Promise.all([loadFrames(), loadPlace(), loadShapes()]);
  if (!place) { el.innerHTML = '<p class="muted small">Radar indisponible : circuit de la séance inconnu.</p>'; built = ''; return; }
  if (!frames.length && view !== 'windy') { el.innerHTML = '<p class="muted small">Radar des précipitations indisponible (connexion internet nécessaire).</p>'; built = ''; return; }
  build(el);
  if (view !== 'windy' && playing && Date.now() > pauseUntil) {
    idx = (idx + 1) % frames.length;
    if (idx === frames.length - 1) pauseUntil = Date.now() + 1800;   // pause sur la dernière image
    show(el);
  }
}

export function initRadar() {
  document.addEventListener('click', (e) => {
    const el = $('#wxRadar');
    if (!el || !el.contains(e.target)) return;
    const v = e.target.closest('[data-wxr-view]')?.dataset.wxrView;
    if (v) { view = v; storageSet('paddock.radarView', v); built = ''; build(el); return; }
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
