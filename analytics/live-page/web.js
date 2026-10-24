// Point d'entrée de la version web (paddocklive.app/live/) : classement, carte, direction de course et radios de
// l'appli, reliés au relais du Worker au lieu du serveur local. Copié dans /live/js/ par scripts/build-studio.mjs.
import { translatePage, DEC } from './i18n.js';
import './icons.js';
import { store, emit, on, handleReset, handleBatch, setDelay, serverNow } from './store.js';
import { applyEvent } from '/shared/derive.js';
import { $$ } from './util.js';
import { WebHub } from './web-hub.js';
import { renderHeader, renderSource } from './ui/header.js';
import { initTower, renderTower } from './ui/tower.js';
import { initMap } from './ui/map.js';
import { renderRcm, initRcmFilters, initStewards, renderStewards } from './ui/feed.js';
import { renderRadios, initRadios } from './ui/radios.js';

translatePage();
const hub = new WebHub({ apply: applyEvent, reset: handleReset, batch: handleBatch });
let relay = {};

function status(now) {
  store.skew = store.skew === 0 ? now - Date.now() : store.skew * 0.8 + (now - Date.now()) * 0.2;
  store.status = {
    type: 'status', serverNow: now, clock: now, paused: false,
    source: { mode: 'live', label: 'Live', ...relay, authenticated: false },
    bufferStart: hub.start(), hasPositions: false, hasCarData: false, maxDelayMs: hub.keep, sync: [],
  };
  emit('status', store.status);
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live/ws`);
  ws.onopen = () => { store.connected = true; emit('connection', true); };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'hello') { relay = msg.status || {}; hub.hello(msg); status(msg.now); setDelay(store.delay); }
    else if (msg.type === 'evs') hub.push(msg.events);
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

const safe = (fn) => { try { fn(); } catch (err) { console.error(err); } };
function loop() {
  safe(() => hub.tick(serverNow() - store.delay));
  safe(renderHeader);
  safe(renderTower);
  safe(renderRcm);
  safe(renderStewards);
  safe(renderRadios);
  setTimeout(() => (document.visibilityState === 'visible' ? requestAnimationFrame(loop) : loop()), 100);
}
setInterval(() => hub.roll(serverNow()), 10000);

safe(initTower);
safe(initMap);
safe(initRcmFilters);
safe(initStewards);
safe(initRadios);
on('status', renderSource);
on('connection', renderSource);
on('focus', () => renderTower(true));
on('duel', () => renderTower(true));
connect();
loop();
