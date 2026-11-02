// Réglage du délai : boutons, saisie, préréglages, raccourcis clavier et synchro TV.
import { store, setDelay, serverNow, on } from '../store.js';
import { $, esc, fmtDelay, storageGet, storageSet, drivers } from '../util.js';
import { prefs, setPref } from '../prefs.js';
import { icon, arrows } from '../icons.js';
import { DEC, FR } from '../i18n.js';
import { rcmFr } from '/shared/rcm-fr.js';
import { MIN_DELAY_MS } from '/shared/f1.js';

// Valeurs de départ indicatives : chaque installation (box, satellite, appli, TNT...) a son
// propre retard. Utilisez la synchro TV puis enregistrez votre propre préréglage.
const DEFAULT_PRESETS = [
  { name: 'Temps réel (5 s)', ms: MIN_DELAY_MS, builtin: true },
  // Points de départ valables partout (le retard réel dépend de la chaîne et de l'équipement)
  { name: 'TV : antenne, satellite, câble ou box (≈ 10 s, à calibrer)', ms: 10000, builtin: true },
  { name: 'Streaming : appli ou site web (≈ 40 s, à calibrer)', ms: 40000, builtin: true },
];

function customPresets() {
  return storageGet('paddock.presets', []);
}

function allPresets() {
  return [...DEFAULT_PRESETS, ...customPresets()];
}

// ic : icône facultative devant le message (voir icons.js)
export function toast(msg, ms = 2500, ic = null) {
  const t = $('#toast');
  t.innerHTML = `${ic ? icon(ic) : ''}<span>${arrows(esc(msg))}</span>`;
  t.hidden = false;
  // Au premier plan, même au-dessus d'une fenêtre ouverte (dialog modale) : réaffiché en dernier
  if (t.showPopover) { try { if (t.matches(':popover-open')) t.hidePopover(); t.showPopover(); } catch { /* sans popover */ } }
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.hidden = true;
    try { t.hidePopover?.(); } catch { /* déjà masqué */ }
  }, ms);
}

function renderPresets() {
  const sel = $('#presetSelect');
  const presets = allPresets();
  const match = presets.findIndex((p) => p.ms === store.delay);
  sel.innerHTML = `<option value="">${match < 0 ? `Personnalisé (${fmtDelay(store.delay)})` : 'Préréglages…'}</option>` +
    presets.map((p, i) => `<option value="${i}" ${i === match ? 'selected' : ''}>${esc(p.name)}${p.builtin ? '' : ` — ${fmtDelay(p.ms)}`}</option>`).join('');

  const custom = customPresets();
  $('#presetManage').innerHTML = custom.length
    ? `<span class="muted small">Mes préréglages :</span>` + custom.map((p, i) => `<span class="chip">${esc(p.name)} · ${fmtDelay(p.ms)}<button data-del="${i}" title="Supprimer">${icon('close')}</button></span>`).join('')
    : '';
}

function renderValue() {
  const input = $('#delayInput');
  if (document.activeElement !== input) input.value = (store.delay / 1000).toFixed(1).replace('.', DEC);
  $('#syncCurrent').textContent = fmtDelay(store.delay);
  renderPresets();
  renderWarning();
}

function renderWarning() {
  const st = store.status;
  const warn = $('#delayWarn');
  if (!st || !st.bufferStart) { warn.hidden = true; return; }
  const available = serverNow() - st.bufferStart;
  if (store.delay > available + 1000) {
    warn.hidden = false;
    warn.title = `Seulement ${Math.floor(available / 1000)} s d'historique : affichage exact une fois le délai écoulé.`;
  } else warn.hidden = true;
}

function parseInput(v) {
  const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n * 1000 : null;
}

// ---- Synchro TV ----
const KIND_LABEL = { lap: 'Tour', track: 'Piste', rcm: 'Direction', session: 'Session', pit: 'Stands' };
const MASKED = {
  rcm: 'Message de la direction de course (masqué : pas encore à l\'écran)',
  pit: 'Un pilote entre aux stands (masqué)',
  track: 'Changement d\'état de la piste (masqué)',
};

function renderSyncList() {
  const modal = $('#syncModal');
  if (!modal.open) return;
  const st = store.status;
  const list = $('#syncList');
  const now = serverNow();
  const dl = drivers(store.state);
  const events = (st?.sync || []).slice().reverse().filter((e) => now - e.t <= (st?.maxDelayMs ?? 600000));
  if (!events.length) {
    list.innerHTML = '<li class="empty">Aucun événement récent.</li>';
  } else {
    const shownUntil = now - store.delay;
    list.innerHTML = events.map((e) => {
      const ago = (now - e.t) / 1000;
      // Anti-spoiler : un événement pas encore visible à l'écran (t > heure affichée) est masqué,
      // sauf les changements de tour qui ne révèlent rien.
      const hidden = !prefs.spoilers && e.t > shownUntil && e.kind !== 'lap' && e.kind !== 'session';
      const who = e.num && !hidden ? `${dl[e.num]?.Tla || '#' + e.num} ` : '';
      const text = hidden ? MASKED[e.kind] || 'Événement (masqué)' : (e.kind === 'rcm' && FR && rcmFr(e.text)) || e.text;
      return `<li class="${e.kind}">
        <div><div class="se-text"><span class="se-kind">${KIND_LABEL[e.kind] || e.kind}</span>${esc(who + text)}</div>
        <div class="se-meta">Il y a ${ago.toFixed(1).replace('.', DEC)} s en live${e.hint ? ' · ' + esc(e.hint) : ''}</div></div>
        <button class="btn btn-accent" data-t="${e.t}">Je le vois !</button></li>`;
    }).join('');
  }
  const buf = st?.bufferStart ? Math.floor((now - st.bufferStart) / 1000) : 0;
  $('#syncBuffer').textContent = `Historique disponible : ${buf >= 3600 ? Math.floor(buf / 60) + ' min' : buf + ' s'}`;
}

// Pause du direct (TV mise en pause) : l'affichage reste figé, le délai grandit tant que dure la
// pause et reste ensuite (comme la box TV, on reprend en différé)
let pause = null;
function togglePause() {
  const btn = $('#pauseBtn');
  if (pause) {
    clearInterval(pause.timer);
    pause = null;
    toast(`Reprise : délai ${fmtDelay(store.delay)}`, 2500, 'play');
  } else {
    const at = Date.now();
    const from = store.delay;
    pause = { timer: setInterval(() => {
      const want = from + Date.now() - at;
      setDelay(want);
      if (store.delay < want - 500) { toast(`Délai maximal atteint (${fmtDelay(store.delay)}) : fin de la pause`, 4000, 'warning'); togglePause(); }
    }, 500) };
    toast('Pause : touche P ou ⏸ pour reprendre', 2500, 'pause');
  }
  btn.innerHTML = icon(pause ? 'play' : 'pause');
  btn.classList.toggle('on', !!pause);
  btn.setAttribute('aria-pressed', String(!!pause));
}

export function initDelay() {
  renderValue();
  $('#pauseBtn').addEventListener('click', togglePause);

  $('#delayBox').addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (b) setDelay(store.delay + Number(b.dataset.step));
  });

  // Les boutons ±0,1 / ±1 / ±5 s sont rangés dans un petit menu sous le délai
  const box = $('#delayBox');
  const more = $('#delayMore');
  const setOpen = (open) => { box.classList.toggle('open', open); more.setAttribute('aria-expanded', String(open)); };
  more.addEventListener('click', () => setOpen(!box.classList.contains('open')));
  document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  const input = $('#delayInput');
  input.addEventListener('change', () => {
    const ms = parseInput(input.value);
    if (ms !== null) setDelay(ms);
    input.blur();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.blur(); renderValue(); }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => {
    const ms = parseInput(input.value);
    if (ms !== null && ms !== store.delay) setDelay(ms); else renderValue();
  });
  input.addEventListener('wheel', (e) => {
    e.preventDefault();
    setDelay(store.delay + (e.deltaY < 0 ? 100 : -100) * (e.shiftKey ? 10 : 1));
  }, { passive: false });

  $('#presetSelect').addEventListener('change', (e) => {
    const p = allPresets()[Number(e.target.value)];
    if (p) { setDelay(p.ms); toast(`Délai : ${fmtDelay(p.ms)} (${p.name})`); }
  });

  $('#syncBtn').addEventListener('click', openSync);
  // pointerdown (et non click) : réaction immédiate au moment où l'on appuie,
  // et la liste rafraîchie en continu ne peut pas "avaler" le clic.
  $('#syncList').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b || e.button !== 0) return;
    const ms = serverNow() - Number(b.dataset.t);
    setDelay(ms);
    toast(`Délai calé sur la TV : ${fmtDelay(store.delay)}`, 2500, 'check');
    renderSyncList();
  });

  $('#presetSave').addEventListener('click', () => {
    const name = $('#presetName').value.trim() || `Mon délai ${fmtDelay(store.delay)}`;
    const list = customPresets().filter((p) => p.name !== name);
    list.push({ name, ms: store.delay });
    storageSet('paddock.presets', list);
    $('#presetName').value = '';
    renderPresets();
    toast(`Préréglage « ${name} » enregistré`);
  });
  $('#presetManage').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const list = customPresets();
    list.splice(Number(b.dataset.del), 1);
    storageSet('paddock.presets', list);
    renderPresets();
  });

  // Raccourcis clavier
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const step = e.shiftKey ? 5000 : e.altKey ? 100 : 1000;
      setDelay(store.delay + (e.key === 'ArrowRight' ? step : -step));
      e.preventDefault();
    } else if (e.key === 's' || e.key === 'S') {
      openSync();
    } else if (e.key === 'p' || e.key === 'P') {
      togglePause();
    }
  });

  $('#syncSpoilers').checked = prefs.spoilers;
  $('#syncSpoilers').addEventListener('change', (e) => { setPref('spoilers', e.target.checked); renderSyncList(); });

  // Plusieurs fenêtres (mode deux écrans) : le délai reste identique partout.
  window.addEventListener('storage', (e) => {
    if (e.key === 'paddock.delayMs' && e.newValue !== null) {
      const ms = Number(JSON.parse(e.newValue));
      if (Number.isFinite(ms) && ms !== store.delay) setDelay(ms);
    }
  });

  on('delay', renderValue);
  on('status', () => { renderWarning(); renderSyncList(); });
  setInterval(renderSyncList, 500);
}

function openSync() {
  const m = $('#syncModal');
  if (!m.open) m.showModal();
  renderSyncList();
}
