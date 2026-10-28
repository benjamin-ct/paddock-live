// Calendrier de la Saison sur un globe (comme Formula 1 Dashboard) : un point par Grand Prix (prochain, à venir,
// couru) et, en bas, une carte par Grand Prix à faire glisser. La carte choisie, ou un point touché, fait voler le
// globe jusqu'au circuit, son tracé dessiné sur le plan des rues. MapLibre GL (BSD-3, vendor/maplibre), chargé à
// l'ouverture du Calendrier ; fonds OpenFreeMap (gratuits, sans clé ni compte ; © OpenMapTiles © contributeurs
// OpenStreetMap) ; tracés f1-circuits (MIT, data/). Sans WebGL, ou fonds injoignables : fail(), la Saison remet la
// carte plate.
import { on } from '../store.js';
import { resolvedScheme } from '../prefs.js';
import { esc } from '../util.js';
import { t, LANG } from '../i18n.js';
import { icon } from '../icons.js';
import { nearestShape, shapeOutline } from '/shared/circuit-shapes.js';

const STYLES = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' };
const NEAR = 9;          // zoom à partir duquel le tracé remplace les points
const STATE = { done: 'Couru', next: 'Prochain', future: 'À venir' };

let box = null;          // bloc gardé d'un affichage à l'autre (la Saison redessine toute la rubrique)
let map = null;
let shapes = null;       // promesse des tracés
let items = [];          // Grands Prix : { round, lat, lon, state, sprint, name, place, dates, flag, href, shape }
let key = '';
let sel = null;          // manche choisie (carte au centre du carrousel)
let markers = [];
let fail = () => {};

const still = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e10600';

// Fond de carte de l'apparence, en globe ; noms (pays, villes, rues) et mention des données dans la langue de l'appli
async function styleOf(scheme) {
  const s = await (await fetch(STYLES[scheme])).json();
  s.projection = { type: 'globe' };
  for (const l of s.layers) if (JSON.stringify(l.layout?.['text-field'] || '').includes('name:latin')) l.layout['text-field'] = ['coalesce', ['get', `name:${LANG}`], ['get', 'name:latin'], ['get', 'name']];
  s.sources.openmaptiles.attribution = `<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© ${esc(t('contributeurs OpenStreetMap'))}</a>`;
  return s;
}

// Zoom où le globe entier tient dans la carte, au-dessus du carrousel (diamètre : 512 × 2^zoom / π pixels)
function worldZoom() {
  const c = map.getContainer();
  return Math.log2((Math.min(c.clientWidth, c.clientHeight - cardsH()) * 0.95 * Math.PI) / 512);
}
const cardsH = () => (box.querySelector('.cg-cards')?.offsetHeight || 0) + 12;

function cards() {
  box.querySelector('.cg-cards').innerHTML = items.map((g) => `<article class="cg-card ${g.state}" data-cg="${g.round}" tabindex="0">
      <div class="cg-c-txt">
        <div class="cg-c-top"><b>R${g.round}</b><span class="sz-tag ${g.state}">${STATE[g.state]}</span>${g.sprint ? '<span class="sz-tag sprint">Sprint</span>' : ''}</div>
        <div class="cg-c-name">${g.flag}<span>${esc(g.name)}</span></div>
        <div class="cg-c-sub">${esc(g.place)}</div>
        <div class="cg-c-sub">${esc(g.dates)}</div>
        <a class="cg-c-go" href="${g.href}" data-szgp="${g.round}">${g.state === 'done' ? 'Résultats' : 'Fiche du Grand Prix'} ${icon('arrow-right', 'ic-s')}</a>
      </div>
      ${g.shape ? `<svg class="cg-c-track" viewBox="0 0 100 100" aria-hidden="true"><polygon points="${shapeOutline(g.shape.line)}"/></svg>` : ''}
    </article>`).join('');
  center(sel, true);
}

// Carte d'une manche au centre du carrousel
function center(round, instant = false) {
  const strip = box.querySelector('.cg-cards'), card = strip.querySelector(`[data-cg="${round}"]`);
  if (!card) return;
  strip.scrollTo({ left: card.offsetLeft - (strip.clientWidth - card.offsetWidth) / 2, behavior: instant || still() ? 'auto' : 'smooth' });
  for (const c of strip.children) c.classList.toggle('on', c === card);
}

// Points et tracés sur la carte
function pins() {
  for (const m of markers) m.remove();
  markers = items.map((g) => {
    const el = document.createElement('button');
    el.className = `cg-pin ${g.state}${g.round === sel ? ' on' : ''}`;
    el.dataset.cg = g.round;
    el.textContent = g.round;
    el.setAttribute('aria-label', `R${g.round} · ${g.name}`);
    return new globalThis.maplibregl.Marker({ element: el, opacityWhenCovered: '0' }).setLngLat([g.lon, g.lat]).addTo(map);
  });
}
const tracks = () => ({ type: 'FeatureCollection', features: items.filter((g) => g.shape).map((g) => ({ type: 'Feature', properties: { round: g.round }, geometry: { type: 'LineString', coordinates: g.shape.line } })) });
function layers() {
  map.addSource('cg-tracks', { type: 'geojson', data: tracks() });
  const w = (a, b) => ['interpolate', ['exponential', 1.6], ['zoom'], NEAR - 1, a, 17, b];
  map.addLayer({ id: 'cg-track-case', type: 'line', source: 'cg-tracks', minzoom: NEAR - 1, layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': resolvedScheme() === 'light' ? '#ffffff' : '#000000', 'line-width': w(3, 20), 'line-opacity': 0.9 } });
  map.addLayer({ id: 'cg-track', type: 'line', source: 'cg-tracks', minzoom: NEAR - 1, layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': accent(), 'line-width': w(1.5, 11) } });
}

// Grand Prix choisi : sa carte au centre, la carte vole jusqu'au circuit (tracé entier visible)
function select(round) {
  sel = round;
  for (const m of markers) m.getElement().classList.toggle('on', Number(m.getElement().dataset.cg) === round);
  center(round);
  const g = items.find((x) => x.round === round);
  if (!g || !map) return;
  map.resize();   // bloc remis dans la page : taille reprise avant de déplacer la carte
  const opts = { padding: { top: 50, bottom: 30, left: 30, right: 30 }, maxZoom: 15.5, speed: 1.1, curve: 1.6, animate: !still() };
  if (g.shape) {
    const b = new globalThis.maplibregl.LngLatBounds();
    for (const p of g.shape.line) b.extend(p);
    map.fitBounds(b, opts);
  } else map.flyTo({ ...opts, center: [g.lon, g.lat], zoom: 13.5 });
}
function world() {
  map.resize();
  const g = items.find((x) => x.round === sel);
  map.flyTo({ center: [g?.lon ?? 10, Math.max(-30, Math.min(40, g?.lat ?? 20))], zoom: worldZoom(), pitch: 0, bearing: 0, padding: { top: 0, bottom: cardsH(), left: 0, right: 0 }, speed: 1.4, animate: !still() });
}

function build() {
  box = document.createElement('section');
  box.className = 'sz-box cal-globe';
  box.innerHTML = `<div class="cg-map"></div>
    <div class="cal-map-key small cg-key"><span class="cal-pin-key next"></span>Prochain <span class="cal-pin-key future"></span>À venir <span class="cal-pin-key done"></span>Couru</div>
    <button class="btn small cg-world" type="button" title="Revenir au globe">${icon('globe')} Monde</button>
    <div class="cg-cards"></div>`;
  shapes = fetch('/data/f1-circuits.json').then((r) => r.json()).then((d) => d.circuits || []).catch(() => []);
  // Carrousel : la carte arrêtée au centre devient le Grand Prix choisi ; une carte touchée aussi
  const strip = box.querySelector('.cg-cards');
  let tm = 0;
  strip.addEventListener('scroll', () => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      if (!box?.isConnected) return;   // bloc hors de la page (autre rubrique)
      const mid = strip.scrollLeft + strip.clientWidth / 2;
      const c = [...strip.children].sort((a, b) => Math.abs(a.offsetLeft + a.offsetWidth / 2 - mid) - Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid))[0];
      if (c && Number(c.dataset.cg) !== sel) select(Number(c.dataset.cg));
    }, 140);
  }, { passive: true });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-szgp]')) return;   // lien vers la fiche : ouvert par la Saison
    const c = e.target.closest('[data-cg]');
    if (c) select(Number(c.dataset.cg));
    else if (e.target.closest('.cg-world') && map) world();
  });
  box.addEventListener('keydown', (e) => { const c = e.key === 'Enter' && e.target.closest('.cg-card'); if (c) select(Number(c.dataset.cg)); });
  start().catch(() => {
    map?.remove();
    map = null; box = null; key = '';
    fail();
  });
}

async function start() {
  const gl = document.createElement('canvas');
  if (!(gl.getContext('webgl2') || gl.getContext('webgl')) || navigator.onLine === false) throw new Error('webgl');
  if (!document.querySelector('link[href$="maplibre-gl.css"]')) document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/vendor/maplibre/maplibre-gl.css">');
  const [style] = await Promise.all([styleOf(resolvedScheme()), import('/vendor/maplibre/maplibre-gl.js')]);
  const g = items.find((x) => x.round === sel);
  map = new globalThis.maplibregl.Map({
    container: box.querySelector('.cg-map'), style, center: [g?.lon ?? 10, Math.max(-30, Math.min(40, g?.lat ?? 20))], zoom: 1,
    attributionControl: { compact: false }, cooperativeGestures: true, maxPitch: 60, fadeDuration: still() ? 0 : 300,
    locale: {
      'CooperativeGesturesHandler.WindowsHelpText': t('Ctrl + molette pour zoomer sur la carte'),
      'CooperativeGesturesHandler.MacHelpText': t('⌘ + molette pour zoomer sur la carte'),
      'CooperativeGesturesHandler.MobileHelpText': t('Deux doigts pour déplacer la carte'),
      'NavigationControl.ZoomIn': t('Zoomer'), 'NavigationControl.ZoomOut': t('Dézoomer'), 'NavigationControl.ResetBearing': t('Remettre le nord en haut'),
      'AttributionControl.ToggleAttribution': t('Sources de la carte'),
    },
  });
  map.addControl(new globalThis.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.on('style.load', layers);
  map.on('zoom', () => box?.classList.toggle('cg-near', map.getZoom() >= NEAR));
  // Saut sans animation du plan des rues au globe : points replacés une fois le globe redessiné (sinon à leur place
  // sur la carte à plat, hors du globe)
  map.on('idle', () => { for (const m of markers) m.setLngLat(m.getLngLat()); });
  // Fond injoignable (ou WebGL refusé) avant le premier affichage : carte plate
  await new Promise((ok, ko) => {
    const tm = setTimeout(() => ko(new Error('timeout')), 15000);
    map.once('load', () => { clearTimeout(tm); ok(); });
    map.once('error', (e) => { clearTimeout(tm); ko(e.error); });
  });
  map.jumpTo({ zoom: worldZoom(), padding: { top: 0, bottom: cardsH(), left: 0, right: 0 } });
  pins();
  // Apparence changée : fond clair ou sombre (points et tracés remis par style.load)
  on('scheme', (v) => styleOf(v).then((s) => map?.setStyle(s, { diff: false })).catch(() => {}));
}

// Bloc du globe à la place de slot (élément vide posé par la Saison) ; list : les Grands Prix de la saison affichée.
// onFail : globe impossible (WebGL, fonds de carte), la Saison remet la carte plate
export async function mountGlobe(slot, list, onFail) {
  fail = onFail;
  if (!box) build();
  slot.replaceWith(box);
  const k = JSON.stringify(list);
  if (k === key) { center(sel, true); return; }   // remis dans la page : carrousel revenu au début, recentré
  key = k;
  const all = await shapes;
  const was = items.find((g) => g.round === sel)?.href;
  items = list.map((g) => ({ ...g, shape: nearestShape(all, g.lat, g.lon) }));
  // Autre saison : son prochain Grand Prix (sinon le dernier couru), vu sur le globe
  const other = !items.some((g) => g.round === sel && g.href === was);
  if (other) sel = (items.find((g) => g.state === 'next') || items.filter((g) => g.state === 'done').at(-1) || items[0])?.round ?? null;
  if (!box) return;
  cards();
  if (map?.loaded() || map?.isStyleLoaded()) { pins(); map.getSource('cg-tracks')?.setData(tracks()); if (other) world(); }
}
