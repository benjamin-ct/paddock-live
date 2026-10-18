// Réglages → Streaming : overlays à ajouter comme source navigateur dans OBS Studio, Streamlabs ou
// Meld Studio (fond transparent, délai TV suivi), et adresses de commande pour le Stream Deck ou
// Bitfocus Companion (délai TV, replay). Adresses de cet ordinateur (127.0.0.1 et le port de l'appli).
import { $, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';

const base = () => `http://127.0.0.1:${location.port || 80}`;
const MAP = '/?panel=map&float=1&overlay=1';
const OVERLAYS = [
  ['Classement (intervalles)', '/mini.html?overlay=1', '300 × 640'],
  ['Classement (écart au leader)', '/mini.html?overlay=1&mode=gap', '300 × 640'],
  ['Carte du circuit', MAP, '800 × 600'],
  ['Bandeaux (drapeau rouge, voiture de sécurité, VSC…)', '/overlay.html?w=banner', '800 × 80'],
  ['Compteur de tours', '/overlay.html?w=laps', '300 × 150'],
  ['Compte à rebours (séance en cours ou prochaine séance)', '/overlay.html?w=countdown', '440 × 130'],
  ['Podium (trois premiers)', '/overlay.html?w=podium', '460 × 220'],
  ['Télémétrie du pilote suivi', '/overlay.html?w=telemetry', '320 × 350'],
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
const line = (label, path, hint = '', id = '') => `<div class="stream-row"${id ? ` id="${id}"` : ''}><span class="small"><b>${esc(label)}</b>${hint ? ` <span class="muted">· ${esc(hint)}</span>` : ''}</span>
  <div class="row"><input readonly value="${esc(base() + path)}"><button class="btn small" data-copy="${esc(base() + path)}">${icon('doc')} Copier</button></div></div>`;

function render() {
  const ov = $('#streamOverlays');
  if (!ov) return;
  ov.innerHTML = `<h4>${icon('video')} Overlays pour votre stream</h4>
    <p class="small muted">Dans OBS Studio, Streamlabs ou Meld Studio, ajoutez une source « Navigateur » avec l'une de ces adresses et la taille indiquée. Fond transparent ; le délai TV suit celui réglé dans Paddock Live, qui doit rester ouvert sur cet ordinateur.</p>
    ${OVERLAYS.map(([l, p, size]) => (p === MAP ? `${line(l, p, size, 'streamMapRow')}<details class="small" id="streamMapLayers"></details>` : line(l, p, size))).join('')}
    <details class="small"><summary>Où ajouter la source ?</summary><ul>
      <li>OBS Studio : Sources → + → Navigateur → collez l'adresse dans « URL », largeur et hauteur.</li>
      <li>Streamlabs Desktop : Sources → + → Source navigateur → collez l'adresse.</li>
      <li>Meld Studio : ajoutez une couche Navigateur (Browser) à la scène → collez l'adresse.</li>
      <li>La carte affiche le circuit pendant une séance ou un replay. Pour recharger une source : clic droit → Actualiser.</li>
      <li>Chaque overlay s'adapte à la taille de la source. Les bandeaux n'apparaissent que pendant un drapeau (et 30 s au drapeau à damier) : laissez la source affichée en permanence.</li>
      <li>La télémétrie montre le pilote suivi dans Paddock Live (clic sur son nom dans le classement), sinon le leader : changez de pilote dans l'appli, l'overlay suit.</li></ul></details>`;
  $('#streamDeck').innerHTML = `<h4>${icon('keyboard')} Stream Deck et télécommandes</h4>
    <p class="small muted">Adresses à appeler depuis cet ordinateur. Stream Deck : action Système → « Site web », collez l'adresse et cochez l'accès en arrière-plan (« GET request in background ») pour que rien ne s'ouvre. Fonctionne aussi avec Bitfocus Companion (requête HTTP GET). Le délai change dans l'appli, les overlays et les téléphones.</p>
    ${COMMANDS.map(([l, p]) => line(l, p)).join('')}`;
  mapLayers();
}

// Carte : calques affichés dans l'overlay, choisis ici (mêmes cases que le menu « Calques » de la
// carte) et passés dans l'adresse : la source navigateur n'a pas les réglages de l'appli
function mapLayers() {
  const box = $('#streamMapLayers');
  const inputs = [...document.querySelectorAll('#mapLayers input[id^="map"]')];
  if (!box || !inputs.length) return;
  box.innerHTML = `<summary>Calques de la carte</summary><div class="row">${inputs.map((i) => `<label class="toggle small"><input type="checkbox" data-layer="${i.id.slice(3).toLowerCase()}" ${i.defaultChecked ? 'checked' : ''}> ${esc(i.parentElement.textContent.trim())}</label>`).join('')}</div>`;
  const update = () => {
    const url = `${base()}${MAP}&layers=${[...box.querySelectorAll('[data-layer]:checked')].map((c) => c.dataset.layer).join(',')}`;
    const row = $('#streamMapRow');
    row.querySelector('input').value = url;
    row.querySelector('[data-copy]').dataset.copy = url;
  };
  box.addEventListener('change', update);
  update();
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast('Adresse copiée', 2000, 'check'); } catch { b.previousElementSibling?.select(); }
});
render();
