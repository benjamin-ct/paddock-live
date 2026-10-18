// Réglages → Streaming : overlays à ajouter comme source navigateur dans OBS Studio, Streamlabs ou
// Meld Studio (fond transparent, délai TV suivi), et adresses de commande pour le Stream Deck ou
// Bitfocus Companion (délai TV, replay). Adresses de cet ordinateur (127.0.0.1 et le port de l'appli).
import { $, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';

const base = () => `http://127.0.0.1:${location.port || 80}`;
const OVERLAYS = [
  ['Classement (intervalles)', '/mini.html?overlay=1', '300 × 640'],
  ['Classement (écart au leader)', '/mini.html?overlay=1&mode=gap', '300 × 640'],
  ['Carte du circuit', '/?panel=map&float=1&overlay=1', '800 × 600'],
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
const line = (label, path, hint = '') => `<div class="stream-row"><span class="small"><b>${esc(label)}</b>${hint ? ` <span class="muted">· ${esc(hint)}</span>` : ''}</span>
  <div class="row"><input readonly value="${esc(base() + path)}"><button class="btn small" data-copy="${esc(base() + path)}">${icon('doc')} Copier</button></div></div>`;

function render() {
  const ov = $('#streamOverlays');
  if (!ov) return;
  ov.innerHTML = `<h4>${icon('video')} Overlays pour votre stream</h4>
    <p class="small muted">Dans OBS Studio, Streamlabs ou Meld Studio, ajoutez une source « Navigateur » avec l'une de ces adresses et la taille indiquée. Fond transparent ; le délai TV suit celui réglé dans Paddock Live, qui doit rester ouvert sur cet ordinateur.</p>
    ${OVERLAYS.map(([l, p, size]) => line(l, p, size)).join('')}
    <details class="small"><summary>Où ajouter la source ?</summary><ul>
      <li>OBS Studio : Sources → + → Navigateur → collez l'adresse dans « URL », largeur et hauteur.</li>
      <li>Streamlabs Desktop : Sources → + → Source navigateur → collez l'adresse.</li>
      <li>Meld Studio : ajoutez une couche Navigateur (Browser) à la scène → collez l'adresse.</li>
      <li>La carte affiche le circuit pendant une séance ou un replay. Pour recharger une source : clic droit → Actualiser.</li></ul></details>`;
  $('#streamDeck').innerHTML = `<h4>${icon('keyboard')} Stream Deck et télécommandes</h4>
    <p class="small muted">Adresses à appeler depuis cet ordinateur. Stream Deck : action Système → « Site web », collez l'adresse et cochez l'accès en arrière-plan (« GET request in background ») pour que rien ne s'ouvre. Fonctionne aussi avec Bitfocus Companion (requête HTTP GET). Le délai change dans l'appli, les overlays et les téléphones.</p>
    ${COMMANDS.map(([l, p]) => line(l, p)).join('')}`;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast('Adresse copiée', 2000, 'check'); } catch { b.previousElementSibling?.select(); }
});
render();
