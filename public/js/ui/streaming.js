// Réglages → Streaming : overlays à ajouter comme source navigateur dans OBS Studio, Streamlabs ou
// Meld Studio (fond transparent, délai TV suivi), et adresses de commande pour le Stream Deck ou
// Bitfocus Companion (délai TV, replay). Adresses de cet ordinateur (127.0.0.1 et le port de l'appli).
import { $, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';
import { store, on } from '../store.js';
import { sendOverlayCfg } from '../conn.js';

const base = () => `http://127.0.0.1:${location.port || 80}`;
const MAP = '/?panel=map&float=1&overlay=1';
// [nom, adresse, taille conseillée, opacité du fond par défaut (%) ; null : pas de réglage du fond]
const OVERLAYS = [
  ['Classement', '/mini.html?overlay=1', '340 × 640', 80],
  ['Carte du circuit', MAP, '800 × 600', 0],
  ['Bandeaux (drapeau rouge, voiture de sécurité, VSC…)', '/overlay.html?w=banner', '800 × 80', null],
  ['Compteur de tours', '/overlay.html?w=laps', '300 × 150', 85],
  ['Compte à rebours (séance en cours ou prochaine séance)', '/overlay.html?w=countdown', '440 × 130', 85],
  ['Podium (trois premiers)', '/overlay.html?w=podium', '460 × 220', 85],
  ['Télémétrie du pilote suivi', '/overlay.html?w=telemetry', '320 × 350', 85],
];
// Calques de la carte sans effet dans l'overlay (fond texturé, bande « ordre sur la piste »)
const NO_LAYER = ['mapGrid', 'mapRibbon2'];
// Colonnes du classement (overlay) : [clé, libellé, cochée par défaut]
const COLS = [
  ['delta', 'Places gagnées ou perdues depuis le départ', true], ['int', 'Intervalle avec la voiture de devant', true],
  ['gap', 'Écart au leader', false], ['tyre', 'Pneu et nombre de tours', true], ['pits', 'Arrêts aux stands', false],
];
const COMMANDS = [
  ['Délai TV +1 s', '/api/remote?do=delay%2B&s=1'],
  ['Délai TV −1 s', '/api/remote?do=delay-&s=1'],
  ['Délai TV +0,1 s', '/api/remote?do=delay%2B&s=0.1'],
  ['Délai TV −0,1 s', '/api/remote?do=delay-&s=0.1'],
  ['Replay : lecture / pause', '/api/remote?do=toggle'],
  ['Replay : −10 s', '/api/remote?do=back&s=10'],
  ['Replay : +10 s', '/api/remote?do=forward&s=10'],
];
const line = (label, path, hint = '', extra = '') => `<div class="stream-row"><span class="small"><b>${esc(label)}</b>${hint ? ` <span class="muted">· ${esc(hint)}</span>` : ''}</span>
  <div class="row"><input readonly value="${esc(base() + path)}"><button class="btn small" data-copy="${esc(base() + path)}">${icon('doc')} Copier</button></div>${extra}</div>`;
const bgLabel = (v) => (Number(v) ? `${v} %` : 'sans fond');

// Clé d'un overlay dans ses réglages (gardés par le serveur, envoyés en direct aux overlays)
const keyOf = (path) => (path.startsWith('/mini.html') ? 'mini' : path === MAP ? 'map' : new URLSearchParams(path.split('?')[1]).get('w'));

// Réglages d'un overlay (fond, colonnes, calques) : appliqués tout de suite aux overlays ouverts dans
// OBS, sans changer leur adresse
function overlayLine([label, path, size, bg]) {
  const layers = path === MAP ? [...document.querySelectorAll('#mapLayers input[id^="map"]')].filter((i) => !NO_LAYER.includes(i.id)) : [];
  const cols = path.startsWith('/mini.html') ? COLS : [];
  const extra = (bg === null ? '' : `<label class="small stream-bg">Fond <input type="range" min="0" max="100" step="5" value="${bg}" data-bg> <span>${bgLabel(bg)}</span></label>`)
    + (layers.length ? `<details class="small"><summary>Calques de la carte</summary><div class="row">${layers.map((i) => `<label class="toggle small"><input type="checkbox" data-layer="${i.id.slice(3).toLowerCase()}" ${i.defaultChecked ? 'checked' : ''}> ${esc(i.parentElement.textContent.trim())}</label>`).join('')}</div></details>` : '')
    + (cols.length ? `<details class="small"><summary>Colonnes du classement</summary><div class="row">${cols.map(([k, l, on]) => `<label class="toggle small"><input type="checkbox" data-col="${k}" ${on ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <p class="muted">Hors course, un seul temps (écart au meilleur tour) ; ni places ni arrêts.</p></details>` : '');
  return line(label, path, size, extra).replace('<div class="stream-row">', `<div class="stream-row" data-key="${keyOf(path)}">`);
}

function render() {
  const ov = $('#streamOverlays');
  if (!ov) return;
  ov.innerHTML = `<h4>${icon('video')} Overlays pour votre stream</h4>
    <p class="small muted">Dans OBS Studio, Streamlabs ou Meld Studio, ajoutez une source « Navigateur » avec l'une de ces adresses et la taille indiquée. Fond transparent ; le délai TV suit celui réglé dans Paddock Live, qui doit rester ouvert sur cet ordinateur.</p>
    ${OVERLAYS.map(overlayLine).join('')}
    <details class="small"><summary>Où ajouter la source ?</summary><ul>
      <li>OBS Studio : Sources → + → Navigateur → collez l'adresse dans « URL », largeur et hauteur.</li>
      <li>Streamlabs Desktop : Sources → + → Source navigateur → collez l'adresse.</li>
      <li>Meld Studio : ajoutez une couche Navigateur (Browser) à la scène → collez l'adresse.</li>
      <li>La carte affiche le circuit pendant une séance ou un replay. Pour recharger une source : clic droit → Actualiser.</li>
      <li>Chaque overlay s'adapte à la taille de la source. Les bandeaux n'apparaissent que pendant un drapeau (et 30 s au drapeau à damier) : laissez la source affichée en permanence.</li>
      <li>La télémétrie montre le pilote suivi dans Paddock Live (clic sur son nom dans le classement), sinon le leader : changez de pilote dans l'appli, l'overlay suit.</li>
      <li>Fond, colonnes et calques : appliqués tout de suite aux overlays déjà ajoutés, l'adresse ne change pas.</li></ul></details>`;
  $('#streamDeck').innerHTML = `<h4>${icon('keyboard')} Stream Deck et télécommandes</h4>
    <p class="small muted">Adresses à appeler depuis cet ordinateur. Stream Deck : action Système → « Site web », collez l'adresse et cochez l'accès en arrière-plan (« GET request in background ») pour que rien ne s'ouvre. Fonctionne aussi avec Bitfocus Companion (requête HTTP GET). Le délai change dans l'appli, les overlays et les téléphones.</p>
    ${COMMANDS.map(([l, p]) => line(l, p)).join('')}`;
  show(store.overlayCfg);
  let tm = null;
  ov.addEventListener('input', (e) => {
    const r = e.target.closest('[data-bg]');
    if (r) r.nextElementSibling.textContent = bgLabel(r.value);
    clearTimeout(tm);
    tm = setTimeout(() => sendOverlayCfg(cfgOf(ov)), 250);
  });
  on('overlayCfg', (cfg) => { if (!ov.contains(document.activeElement)) show(cfg); });
}

// Réglages lus dans la page (par overlay : fond, colonnes cochées, calques cochés)
function cfgOf(ov) {
  const cfg = {};
  for (const row of ov.querySelectorAll('[data-key]')) {
    const r = row.querySelector('[data-bg]');
    const checked = (sel) => { const l = [...row.querySelectorAll(`[${sel}]`)]; return l.length ? l.filter((c) => c.checked).map((c) => c.getAttribute(sel)) : undefined; };
    cfg[row.dataset.key] = { bg: r ? Number(r.value) : undefined, cols: checked('data-col'), layers: checked('data-layer') };
  }
  return cfg;
}
// Réglages gardés par le serveur, affichés dans la page
function show(cfg) {
  for (const row of document.querySelectorAll('#streamOverlays [data-key]')) {
    const c = cfg?.[row.dataset.key];
    if (!c) continue;
    const r = row.querySelector('[data-bg]');
    if (r && c.bg != null) { r.value = c.bg; r.nextElementSibling.textContent = bgLabel(c.bg); }
    for (const [sel, list] of [['data-col', c.cols], ['data-layer', c.layers]]) if (list) for (const x of row.querySelectorAll(`[${sel}]`)) x.checked = list.includes(x.getAttribute(sel));
  }
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast('Adresse copiée', 2000, 'check'); } catch { b.previousElementSibling?.select(); }
});
render();
