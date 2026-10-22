// Mini-classement : petite fenêtre toujours au premier plan (image dans l'image du navigateur ou
// fenêtre de l'appli de bureau), à poser par-dessus la vidéo de la course. Même délai TV que la
// fenêtre principale.
import { translatePage } from './i18n.js';
import { icon } from './icons.js';
import { store, versionOf, setDelay, on } from './store.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, currentStint, compoundInfo, tyreBadge, storageGet, storageSet, fmtDelay } from './util.js';
import { realStopCount } from '/shared/pits.js';
import { prefs, isFav } from './prefs.js';
import { trackStatusInfo } from '/shared/f1.js';
import { connect } from './conn.js';
import { FLOAT, floatChrome } from './ui/floatwin.js';

translatePage();

// 'int' (intervalle) | 'gap' (écart au leader) ; overlay de streaming : ?mode=gap dans l'adresse
let mode = new URLSearchParams(location.search).get('mode') || storageGet('paddock.miniMode', 'int');
// Overlay de streaming : colonnes choisies (Réglages → Streaming) : delta (places gagnées depuis le
// départ), int (intervalle), gap (écart au leader), tyre (pneu et tours), pits (arrêts). Réglages de
// l'appli, sinon colonnes de l'adresse (anciens liens), sinon celles cochées par défaut
const URL_COLS = new URLSearchParams(location.search).get('cols')?.split(',') || null;
const IS_OVERLAY = document.documentElement.classList.contains('overlay');
// Mini-classement : colonnes choisies dans son menu (⋮), sinon temps et pneu
let COLS = URL_COLS || (IS_OVERLAY ? ['delta', 'int', 'tyre'] : storageGet('paddock.miniCols', null));
const COL_LABELS = [['delta', 'Places gagnées depuis le départ'], ['int', 'Intervalle'], ['gap', 'Écart au leader'], ['tyre', 'Pneu et tours'], ['pits', 'Arrêts']];
let lastKey = '';
on('overlayCfg', (cfg) => { if (IS_OVERLAY && cfg?.mini?.cols) { COLS = cfg.mini.cols; lastKey = ''; } });

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
  // Qualifs (Q1, Q2) : ligne d'élimination sous la dernière place qualifiée
  const no = list(s.TimingData?.NoEntries);
  const cutoff = kind === 'quali' && part < 3 ? Number(no[part]) || null : null;

  // En-tête : drapeau et tour (ou partie de la qualification)
  const ts = trackStatusInfo(s.TrackStatus?.Status || '1');
  const flag = $('#miniFlag');
  flag.className = `mini-flag f-${ts.color}`;
  flag.textContent = s.TrackStatus?.Status ? ts.short : '';
  const lc = s.LapCount;
  $('#miniLap').textContent = kind === 'race' && lc?.TotalLaps ? `Tour ${lc.CurrentLap || 0} / ${lc.TotalLaps}`
    : kind === 'quali' ? `Q${part}` : (s.SessionInfo?.Name || '—');
  $('#miniMode').hidden = kind !== 'race' || !!COLS;
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
    const cls = [store.focus === n ? 'focus' : '', store.duel.a === n ? 'duel-a' : '', store.duel.b === n ? 'duel-b' : '', isFav(n) ? 'fav' : '', l.Retired || l.KnockedOut ? 'out' : '',
      cutoff && Number(l.Position) === cutoff ? 'cut' : '', cutoff && Number(l.Position) > cutoff && !l.KnockedOut ? 'danger' : ''].filter(Boolean).join(' ');
    const head = `<tr class="${cls}"><td class="m-pos">${esc(l.Position || '')}</td>
      <td class="m-drv"><i style="background:${teamColor(d)}"></i>${esc(d.Tla || n)}${isFav(n) ? icon('star-fill') : ''}</td>`;
    if (COLS) return `${head}${columns(n, l, app[n], kind, val, tag, st)}</tr>`;
    return `${head}
      <td class="m-val">${tag ? `<span class="m-tag">${tag}</span>` : esc(val)}</td>
      <td class="m-tyre">${ci ? `<span class="tyre" style="--tc:${ci.color}">${ci.letter}</span>` : ''}</td></tr>`;
  });
  $('#miniRows').innerHTML = rows.join('') || '<tr><td class="m-empty" colspan="4">En attente des données de la séance…</td></tr>';
  $('#miniFoot').textContent = store.connected ? `Délai TV ${fmtDelay(store.delay)}` : 'Connexion…';
  fitOverlay();
}

// Colonnes de l'overlay (COLS). Hors course : un seul temps (écart au meilleur), ni places ni arrêts
function columns(n, l, a, kind, val, tag, st) {
  const race = kind === 'race';
  const main = COLS.includes('int') || !COLS.includes('gap') ? 'int' : 'gap';
  return COLS.map((c) => {
    if (c === 'delta') {
      const dl = race && a?.GridPos && l.Position ? Number(a.GridPos) - Number(l.Position) : 0;
      return race ? `<td class="m-dl ${dl > 0 ? 'up' : dl < 0 ? 'down' : ''}">${dl ? `${dl > 0 ? '▲' : '▼'}${Math.abs(dl)}` : ''}</td>` : '';
    }
    if (c === main) return `<td class="m-val">${tag ? `<span class="m-tag">${tag}</span>` : esc(race ? gap(c === 'gap' ? l.GapToLeader : l.IntervalToPositionAhead?.Value) : val)}</td>`;
    if (c === 'gap') return race ? `<td class="m-val m-sub">${tag || /^LAP/i.test(l.GapToLeader || '') ? '' : esc(gap(l.GapToLeader))}</td>` : '';
    if (c === 'tyre') return `<td class="m-tyre m-age">${st?.Compound ? tyreBadge(st.Compound, st.TotalLaps, st.New) : ''}</td>`;
    if (c === 'pits') return race ? `<td class="m-pits" title="Arrêts aux stands">${realStopCount(a, l) || ''}</td>` : '';
    return '';
  }).join('');
}

// Tout le classement dans la fenêtre : overlay de streaming (dessiné pour 340 px, agrandi à la
// largeur de la source, net dans OBS même en grand) et fenêtre flottante (300 px, suit la taille
// qu'on lui donne) ; réduit si le classement dépasse en hauteur
const OVERLAY = document.documentElement.classList.contains('overlay');
function fitOverlay() {
  const html = document.documentElement;
  // Hauteur mesurée sans zoom (le Chrome d'OBS, plus ancien, mesure mal les pages zoomées) : bas du
  // contenu, pied fixe à part (place réservée par la marge du bas), plus 4 px
  html.style.zoom = '';
  const body = document.body;
  const h = Math.max(...[...body.children].filter((e) => getComputedStyle(e).position !== 'fixed').map((e) => e.getBoundingClientRect().bottom))
    + parseFloat(getComputedStyle(body).paddingBottom) + 4;
  html.style.zoom = String(Math.floor(Math.min(innerWidth / (OVERLAY ? 340 : 300), innerHeight / h) * 1000) / 1000);
}
window.addEventListener('resize', fitOverlay);
document.fonts?.addEventListener('loadingdone', fitOverlay);

// Menu des colonnes (pas dans l'overlay de streaming : réglé dans Réglages → Streaming)
const colsBtn = $('#miniCols');
colsBtn.hidden = IS_OVERLAY || !!URL_COLS;
colsBtn.addEventListener('click', () => {
  let menu = $('#miniColsMenu');
  if (menu) { menu.remove(); return; }
  menu = document.createElement('div');
  menu.id = 'miniColsMenu';
  menu.className = 'mini-menu';
  const cur = COLS || ['int', 'tyre'];
  menu.innerHTML = COL_LABELS.map(([k, l]) => `<label class="toggle small"><input type="checkbox" data-col="${k}" ${cur.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('');
  menu.addEventListener('change', () => {
    COLS = [...menu.querySelectorAll('[data-col]:checked')].map((i) => i.dataset.col);
    storageSet('paddock.miniCols', COLS);
    lastKey = '';
    render();
  });
  $('#miniHead').after(menu);
});

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
