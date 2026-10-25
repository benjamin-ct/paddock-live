// Point d'entrée de la version web (app.paddocklive.app) : classement, carte, télémétrie, direction de course et
// radios de l'appli, reliés au relais du Worker au lieu du serveur local. Copié dans /live/js/ par scripts/build-studio.mjs.
import { translatePage, DEC, EN } from './i18n.js';
import './icons.js';
import { store, emit, on, handleReset, handleBatch, setDelay, serverNow } from './store.js';
import { applyEvent } from '/shared/derive.js';
import { gpShort } from '/shared/gp-names.js';
import { $$, esc } from './util.js';
import { WebHub } from './web-hub.js';
import { renderHeader, renderSource } from './ui/header.js';
import { initTower, renderTower } from './ui/tower.js';
import { initMap } from './ui/map.js';
import { renderRcm, initRcmFilters, initStewards, renderStewards } from './ui/feed.js';
import { renderRadios, initRadios } from './ui/radios.js';
import { renderTelemetry } from './ui/extra.js';
import { initNoLive } from './ui/home.js';

translatePage();
// GPS et télémétrie : texte compressé (deflate brut, base64) du flux F1
async function inflate(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
}
let ws = null;
const hub = new WebHub({
  apply: applyEvent, reset: handleReset, batch: handleBatch, inflate,
  ask: (from, to) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stream', from, to })); },
});
let relay = {};

function status(now) {
  store.skew = store.skew === 0 ? now - Date.now() : store.skew * 0.8 + (now - Date.now()) * 0.2;
  store.status = {
    type: 'status', serverNow: now, clock: now, paused: false,
    source: { mode: 'live', label: 'Live', ...relay, authenticated: !!relay.authenticated },
    bufferStart: hub.start(), hasPositions: !!relay.authenticated, hasCarData: !!relay.authenticated, maxDelayMs: hub.keep, sync: [],
  };
  emit('status', store.status);
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live/ws?d=${store.delay}`);
  ws.onopen = () => { store.connected = true; emit('connection', true); };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'hello') { relay = msg.status || {}; hub.hello(msg); status(msg.now); setDelay(store.delay); }
    else if (msg.type === 'evs') { hub.push(msg.events); hub.pushStream(msg.stream || []); }
    else if (msg.type === 'stream') hub.pushStream(msg.items || [], true);
    else if (msg.type === 'up') { relay = msg.status || {}; status(msg.now); }
  };
  ws.onclose = () => { store.connected = false; emit('connection', false); setTimeout(connect, 3000); };
  ws.onerror = () => ws.close();
}

// Délai TV : champ en secondes et boutons ±1 / ±5 s
const input = document.querySelector('#delayInput');
const showDelay = () => { input.value = String(Math.round(store.delay / 100) / 10).replace('.', DEC); };
input.addEventListener('change', () => {
  const s = Number(input.value.replace(',', '.'));
  if (Number.isFinite(s)) setDelay(s * 1000);
  showDelay();
});
for (const b of $$('.web-delay [data-step]')) b.addEventListener('click', () => setDelay(store.delay + Number(b.dataset.step)));
on('delay', showDelay);
showDelay();

for (const head of $$('[data-tabs]')) {
  const panel = head.closest('.panel');
  head.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    for (const t of head.querySelectorAll('[data-tab]')) t.classList.toggle('active', t === b);
    for (const p of panel.querySelectorAll('[data-pane]')) p.classList.toggle('active', p.dataset.pane === b.dataset.tab);
  });
}

// Pas de séance en direct : résultats de la dernière séance et classements du championnat, sur demande (pas
// de spoiler), d'après la saison gardée par le serveur
const lapTxt = (s) => (s ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : '');
function lastSession(races) {
  const out = [];
  for (const r of races) {
    const at = (label) => Date.parse(r.sessions?.find((s) => s.label === label)?.t || '') || 0;
    const row = (x) => [x.pos, x.name, x.time || x.status || ''];
    out.push({ race: r.name, label: 'Course', t: at('Course'), rows: (r.results || []).map(row) });
    out.push({ race: r.name, label: 'Sprint', t: at('Sprint'), rows: (r.sprintResults || []).map(row) });
    out.push({ race: r.name, label: 'Qualifications', t: at('Qualifications'), rows: (r.quali || []).map((x) => [x.pos, x.name, lapTxt(x.q?.filter(Boolean).at(-1))]) });
  }
  return out.filter((s) => s.rows.length && s.t < Date.now()).sort((a, b) => b.t - a.t)[0] || null;
}
const resCard = (title, rows) => `<div class="web-res-card"><h3>${esc(title)}</h3><ol>${rows.map(([p, n, v]) => `<li><b>${esc(p ?? '')}</b><span>${esc(n)}</span><small>${esc(v ?? '')}</small></li>`).join('')}</ol></div>`;
document.querySelector('#webResultsBtn')?.addEventListener('click', async (e) => {
  const box = document.querySelector('#webResults');
  e.currentTarget.disabled = true;
  let d = null;
  for (const y of [new Date().getFullYear(), new Date().getFullYear() - 1]) {
    d = await fetch(`/live/api/season?year=${y}`).then((r) => r.json()).catch(() => null);
    if (d?.races?.some((r) => r.results?.length)) break;
  }
  if (!d?.races) { box.innerHTML = '<p class="muted">Résultats indisponibles pour le moment.</p>'; return; }
  const last = lastSession(d.races);
  box.innerHTML = `<div class="web-res-grid">${last ? resCard(`${gpShort(last.race, EN)} · ${last.label}`, last.rows.slice(0, 10)) : ''}
    ${resCard('Championnat pilotes', (d.drivers || []).slice(0, 10).map((x) => [x.pos, x.name, `${x.points} pts`]))}
    ${resCard('Championnat constructeurs', (d.constructors || []).map((x) => [x.pos, x.name, `${x.points} pts`]))}</div>`;
});

const safe = (fn) => { try { fn(); } catch (err) { console.error(err); } };
function loop() {
  safe(() => hub.tick(serverNow() - store.delay));
  safe(renderHeader);
  safe(renderTower);
  safe(renderRcm);
  safe(renderStewards);
  safe(renderRadios);
  safe(renderTelemetry);
  setTimeout(() => (document.visibilityState === 'visible' ? requestAnimationFrame(loop) : loop()), 100);
}
setInterval(() => hub.roll(serverNow()), 10000);

safe(initTower);
safe(initMap);
safe(initRcmFilters);
safe(initStewards);
safe(initRadios);
// Pas de séance en direct : prochaine séance et compte à rebours, comme l'appli
safe(initNoLive);
// Panneau Analyse : seulement la télémétrie du pilote suivi
document.querySelector('.p-analysis [data-tab="telemetry"]')?.click();
on('status', renderSource);
on('connection', renderSource);
on('focus', () => renderTower(true));
on('duel', () => renderTower(true));
connect();
loop();
