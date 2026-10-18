// Réglages → Streaming : overlays à ajouter comme source navigateur dans OBS Studio, Streamlabs ou
// Meld Studio (fond transparent, délai TV suivi), et adresses de commande pour le Stream Deck ou
// Bitfocus Companion (délai TV, replay). Adresses de cet ordinateur (127.0.0.1 et le port de l'appli).
import { $, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';

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

// Réglages d'un overlay (fond, calques de la carte) : ajoutés à son adresse, car la source
// navigateur n'a pas les réglages de l'appli
function overlayLine([label, path, size, bg]) {
  const layers = path === MAP ? [...document.querySelectorAll('#mapLayers input[id^="map"]')].filter((i) => !NO_LAYER.includes(i.id)) : [];
  const cols = path.startsWith('/mini.html') ? COLS : [];
  const extra = (bg === null ? '' : `<label class="small stream-bg">Fond <input type="range" min="0" max="100" step="5" value="${bg}" data-bg="${bg}"> <span>${bgLabel(bg)}</span></label>`)
    + (layers.length ? `<details class="small"><summary>Calques de la carte</summary><div class="row">${layers.map((i) => `<label class="toggle small"><input type="checkbox" data-layer="${i.id.slice(3).toLowerCase()}" ${i.defaultChecked ? 'checked' : ''}> ${esc(i.parentElement.textContent.trim())}</label>`).join('')}</div></details>` : '')
    + (cols.length ? `<details class="small"><summary>Colonnes du classement</summary><div class="row">${cols.map(([k, l, on]) => `<label class="toggle small"><input type="checkbox" data-col="${k}" ${on ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <p class="muted">Hors course, un seul temps (écart au meilleur tour) ; ni places ni arrêts.</p></details>` : '');
  return line(label, path, size, extra).replace('<div class="stream-row">', `<div class="stream-row" data-path="${esc(path)}">`);
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
      <li>Fond et calques : l'adresse change avec vos choix ; recopiez-la dans la source après un changement.</li></ul></details>`;
  $('#streamDeck').innerHTML = `<h4>${icon('keyboard')} Stream Deck et télécommandes</h4>
    <p class="small muted">Adresses à appeler depuis cet ordinateur. Stream Deck : action Système → « Site web », collez l'adresse et cochez l'accès en arrière-plan (« GET request in background ») pour que rien ne s'ouvre. Fonctionne aussi avec Bitfocus Companion (requête HTTP GET). Le délai change dans l'appli, les overlays et les téléphones.</p>
    ${COMMANDS.map(([l, p]) => line(l, p)).join('')}`;
  for (const row of ov.querySelectorAll('[data-path]')) url(row);
  ov.addEventListener('input', (e) => { const row = e.target.closest('[data-path]'); if (row) url(row); });
}

// Adresse d'un overlay avec ses réglages (fond seulement s'il diffère du réglage par défaut)
function url(row) {
  const r = row.querySelector('[data-bg]');
  if (r) r.nextElementSibling.textContent = bgLabel(r.value);
  const pick = (sel, key) => { const l = [...row.querySelectorAll(`[${sel}]`)]; return l.length ? `&${key}=${l.filter((c) => c.checked).map((c) => c.getAttribute(sel)).join(',')}` : ''; };
  const u = base() + row.dataset.path
    + (r && r.value !== r.dataset.bg ? `&bg=${r.value}` : '')
    + pick('data-layer', 'layers') + pick('data-col', 'cols');
  row.querySelector('input[readonly]').value = u;
  row.querySelector('[data-copy]').dataset.copy = u;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast('Adresse copiée', 2000, 'check'); } catch { b.previousElementSibling?.select(); }
});
render();
