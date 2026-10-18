// Mini-classement : petite fenêtre toujours au premier plan (image dans l'image du navigateur ou
// fenêtre de l'appli de bureau), à poser par-dessus la vidéo de la course. Même délai TV que la
// fenêtre principale.
import { translatePage } from './i18n.js';
import { icon } from './icons.js';
import { store, versionOf, setDelay, on } from './store.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, currentStint, compoundInfo, storageGet, storageSet, fmtDelay } from './util.js';
import { prefs, isFav } from './prefs.js';
import { trackStatusInfo } from '/shared/f1.js';
import { connect } from './conn.js';
import { FLOAT, floatChrome } from './ui/floatwin.js';

translatePage();

// 'int' (intervalle) | 'gap' (écart au leader) ; overlay de streaming : ?mode=gap dans l'adresse
let mode = new URLSearchParams(location.search).get('mode') || storageGet('paddock.miniMode', 'int');
let lastKey = '';

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]));

function gap(v) {
  if (v === undefined || v === null || v === '') return '';
  return /^LAP/i.test(v) ? 'Leader' : String(v);
}

function render() {
  const key = `${versionOf(['TimingData', 'TimingAppData', 'DriverList', 'TrackStatus', 'LapCount', 'SessionInfo', '__reset'])}|${mode}|${store.focus}|${store.duel.a}|${store.duel.b}|${store.connected}|${prefs.favs.join()}|${document.documentElement.dataset.scheme}`;
  if (key === lastKey) return;
  lastKey = key;
  const s = store.state;
  const kind = sessionKind(s);
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const app = s.TimingAppData?.Lines || {};
  const part = Number(s.TimingData?.SessionPart) || 1;

  // En-tête : drapeau et tour (ou partie de la qualification)
  const ts = trackStatusInfo(s.TrackStatus?.Status || '1');
  const flag = $('#miniFlag');
  flag.className = `mini-flag f-${ts.color}`;
  flag.textContent = s.TrackStatus?.Status ? ts.short : '';
  const lc = s.LapCount;
  $('#miniLap').textContent = kind === 'race' && lc?.TotalLaps ? `Tour ${lc.CurrentLap || 0} / ${lc.TotalLaps}`
    : kind === 'quali' ? `Q${part}` : (s.SessionInfo?.Name || '—');
  $('#miniMode').hidden = kind !== 'race';
  $('#miniMode').textContent = mode === 'gap' ? 'ÉCART' : 'INT';
  const banner = $('#miniBanner');
  const special = ['4', '5', '6', '7'].includes(String(s.TrackStatus?.Status));
  banner.hidden = !special;
  if (special) { banner.className = `mini-banner f-${ts.color}`; banner.textContent = ts.label; }

  // Lignes : autant que la fenêtre en affiche (la hauteur décide)
  const rows = orderedNumbers(s).filter((n) => dl[n]).map((n) => {
    const d = dl[n], l = lines[n] || {};
    let val;
    if (kind === 'race') val = gap(mode === 'gap' ? l.GapToLeader : l.IntervalToPositionAhead?.Value);
    else if (kind === 'quali') val = list(l.Stats)[part - 1]?.TimeDiffToFastest || list(l.BestLapTimes)[part - 1]?.Value || '';
    else val = l.TimeDiffToFastest || l.BestLapTime?.Value || '';
    const st = currentStint(app[n]);
    const ci = st?.Compound ? compoundInfo(st.Compound) : null;
    const tag = l.Retired ? 'ABD' : l.InPit ? 'STAND' : l.PitOut ? 'SORTIE' : l.KnockedOut ? 'ÉLIM.' : '';
    const cls = [store.focus === n ? 'focus' : '', store.duel.a === n ? 'duel-a' : '', store.duel.b === n ? 'duel-b' : '', isFav(n) ? 'fav' : '', l.Retired || l.KnockedOut ? 'out' : ''].filter(Boolean).join(' ');
    return `<tr class="${cls}"><td class="m-pos">${esc(l.Position || '')}</td>
      <td class="m-drv"><i style="background:${teamColor(d)}"></i>${esc(d.Tla || n)}${isFav(n) ? icon('star-fill') : ''}</td>
      <td class="m-val">${tag ? `<span class="m-tag">${tag}</span>` : esc(val)}</td>
      <td class="m-tyre">${ci ? `<span class="tyre" style="--tc:${ci.color}">${ci.letter}</span>` : ''}</td></tr>`;
  });
  $('#miniRows').innerHTML = rows.join('') || '<tr><td class="m-empty" colspan="4">En attente des données de la séance…</td></tr>';
  $('#miniFoot').textContent = store.connected ? `Délai TV ${fmtDelay(store.delay)}` : 'Connexion…';
}

$('#miniMode').addEventListener('click', () => {
  mode = mode === 'gap' ? 'int' : 'gap';
  storageSet('paddock.miniMode', mode);
  render();
});

// Délai TV réglé dans une autre fenêtre : appliqué ici aussi
window.addEventListener('storage', (e) => {
  if (e.key !== 'paddock.delayMs' || e.newValue === null) return;
  const ms = Number(JSON.parse(e.newValue));
  if (Number.isFinite(ms) && ms !== store.delay) setDelay(ms);
});
// Réglages restaurés depuis une sauvegarde (autre fenêtre) : rechargement
window.addEventListener('storage', (e) => { if (e.key === 'paddock.restored' && e.newValue) location.reload(); });
on('connection', () => { lastKey = ''; });
on('scheme', () => { lastKey = ''; });

// Appli de bureau : fenêtre transparente, déplacée en la glissant (barre au survol)
if (FLOAT) floatChrome({ area: document.body, closeTitle: 'Fermer le mini-classement' });

connect();
setInterval(render, 250);
render();
