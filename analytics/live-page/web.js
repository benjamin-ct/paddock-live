// Point d'entrée de la version web (app.paddocklive.app) : classement, carte, télémétrie, direction de course et
// radios de l'appli, reliés au relais du Worker au lieu du serveur local. Copié dans /live/js/ par scripts/build-studio.mjs.
import { translatePage, DEC, LANG, LOCALE, t } from './i18n.js';
import './icons.js';
import './ranges.js';
import { store, emit, on, handleReset, handleBatch, setDelay, serverNow } from './store.js';
import { applyEvent } from '/shared/derive.js';
import { gpShort } from '/shared/gp-names.js';
import { $$, esc } from './util.js';
import { WebHub } from './web-hub.js';
import { renderHeader, renderSource, initGpsBadge, initSourceTap } from './ui/header.js';
import { initTower, renderTower } from './ui/tower.js';
import { initMap } from './ui/map.js';
import { renderRcm, initRcmFilters, initStewards, renderStewards } from './ui/feed.js';
import { renderRadios, initRadios } from './ui/radios.js';
import { renderTelemetry } from './ui/extra.js';
import { initNoLive } from './ui/home.js';
import { initSeason, closeSeason, openSeason, seasonUrls } from './ui/season.js';
import { parseSeasonPath } from '/shared/season-urls.js';
import './ui/calendar-menu.js';   // « Ajouter à mon agenda » (Saison)
import { initSelects } from './ui/select.js';

translatePage();
initSelects();   // listes déroulantes aux couleurs de l'appli (sur ordinateur ; le téléphone garde la sienne)
// Rien n'est traduit dans le navigateur (pas de moteur local) : documents FIA traduits par le serveur, relus plus tard
store.isHost = false;
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

// Connexion F1 TV du visiteur, donnée par l'extension Paddock Live Companion (formula1.com) : GPS et télémétrie
// par son propre relais, relié à la F1 avec son abonnement. Gardée en mémoire seulement ; le cookie « plu »
// (empreinte, pas le jeton) désigne ce relais pour les radios réservées aux abonnés
let f1tv = null, relayId = '';
const F1TV_KEY = 'paddock.f1tv';
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
// JWT F1 TV encore valable (contrôle d'expiration côté navigateur ; la F1 fait la vraie vérification)
const tokenExp = (tok) => { try { return (JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0) * 1000; } catch { return 0; } };
// Connexion F1 TV reçue (extension, ou appairage d'un téléphone) : gardée en mémoire et sur cet appareil (son
// propre navigateur) pour ne pas refaire l'appairage à chaque ouverture ; son relais rejoint
async function useToken(token) {
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token || '') || token === f1tv) return false;
  const id = await sha(token);
  f1tv = token;
  try { localStorage.setItem(F1TV_KEY, token); } catch { /* stockage indisponible */ }
  updatePairUI();
  if (id === relayId) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'auth', token })); return true; }   // renouvelée
  relayId = id;
  document.cookie = `plu=${id}; path=/; max-age=604800; secure; samesite=strict`;
  ws?.close();   // reconnexion à son relais
  return true;
}
addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin || e.data?.source !== 'paddock-live-companion' || e.data.type !== 'f1tv') return;
  if (typeof e.data.token === 'string') useToken(e.data.token);
});
postMessage({ source: 'paddock-live-web', type: 'f1tv?' }, location.origin);

// Appairage d'un téléphone : partager sa connexion F1 TV avec la version web sur un appareil sans extension
// (iPhone). Chiffré de bout en bout (ECDH P-256 + AES-GCM), le serveur ne fait que relayer (voir pair() du relais).
// L'appareil qui a déjà la connexion affiche « F1 TV connecté » (relier un autre appareil) ; l'autre « Connexion F1 TV ».
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const genKeys = () => crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
async function pubJwk(keys) { const j = await crypto.subtle.exportKey('jwk', keys.publicKey); return { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; }
async function sharedKey(priv, jwk) {
  const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const pairBtn = document.querySelector('#pairBtn');
const pairDlg = document.querySelector('#pairDlg');
const pairBody = document.querySelector('#pairBody');
let pairTimer = null;
const stopPair = () => { clearInterval(pairTimer); pairTimer = null; };
// Bouton de la barre du haut : « F1 TV connecté » (pastille verte) une fois la connexion reçue
function updatePairUI() {
  if (!pairBtn) return;
  pairBtn.hidden = false;
  pairBtn.classList.toggle('on', !!f1tv);
  pairBtn.textContent = f1tv ? t('F1 TV connecté') : t('Connexion F1 TV');
}
function pairNote(text, err = false) { pairBody.innerHTML = `<p class="pair-note${err ? ' err' : ''}">${esc(text)}</p>`; }

pairBtn?.addEventListener('click', () => { stopPair(); pairDlg.showModal(); if (f1tv) pairSend(); else pairReceive(); });
pairDlg?.addEventListener('close', stopPair);

// Appareil sans connexion (téléphone) : affiche un code, attend la connexion déposée par l'ordinateur
async function pairReceive() {
  pairNote(t('Préparation…'));
  const keys = await genKeys();
  // Type d'appareil, pour le message de l'ordinateur qui envoie la connexion (« Téléphone relié » / « Navigateur relié »)
  const kind = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches ? 'phone' : 'browser';
  const r = await fetch('/live/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pub: await pubJwk(keys), kind }) }).then((x) => x.json()).catch(() => null);
  if (!r?.code) return pairNote(t('Connexion impossible pour le moment. Réessayez.'), true);
  pairBody.innerHTML = `<p class="pair-h">${esc(t('Sur un appareil déjà connecté à F1 TV, ouvrez Paddock Live, touchez « F1 TV connecté » et tapez ce code :'))}</p><div class="pair-code">${r.code}</div><p class="pair-note">${esc(t('En attente de l\'ordinateur…'))}</p>`;
  const until = Date.now() + (r.ttl || 180) * 1000;
  pairTimer = setInterval(async () => {
    if (Date.now() > until) { stopPair(); return pairNote(t('Code expiré. Fermez et réessayez.'), true); }
    const box = await fetch(`/live/api/pair?code=${r.code}&claim=1`).then((x) => (x.status === 200 ? x.json() : null)).catch(() => null);
    if (!box) return;
    stopPair();
    try {
      const key = await sharedKey(keys.privateKey, box.spub);
      const token = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data)));
      if (await useToken(token)) { pairNote(t('Connexion reçue. GPS et télémétrie activés.')); setTimeout(() => pairDlg.close(), 1800); }
      else pairNote(t('Connexion F1 TV invalide ou expirée côté ordinateur.'), true);
    } catch { pairNote(t('Connexion illisible. Réessayez.'), true); }
  }, 2000);
}

// Appareil connecté (extension) : saisir le code du téléphone, lui envoyer la connexion chiffrée
// Appareil connecté : état de la connexion, relier un autre appareil, ou se déconnecter
function pairSend() {
  const exp = tokenExp(f1tv);
  const until = new Date(exp).toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  pairBody.innerHTML = `<p class="pair-ok">${esc(t('Connecté à F1 TV sur cet appareil : GPS et télémétrie en direct.'))}${exp ? `<br><small>${esc(t('Connexion valable jusqu\'au {}.', until))}</small>` : ''}</p>`
    + `<p class="pair-h">${esc(t('Sur le téléphone ou l\'autre navigateur, ouvrez Paddock Live et touchez « Connexion F1 TV » pour afficher un code, puis tapez-le ici :'))}</p>`
    + `<form id="pairForm"><input id="pairInput" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="------" aria-label="${esc(t('Code à 6 chiffres'))}"><button class="btn btn-accent" type="submit">${esc(t('Relier'))}</button></form>`
    + '<p class="pair-note" id="pairSendMsg"></p>'
    + `<button class="btn pair-out" id="pairOut">${esc(t('Se déconnecter de F1 TV sur cet appareil'))}</button>`;
  const form = pairBody.querySelector('#pairForm');
  const input = pairBody.querySelector('#pairInput');
  if (matchMedia('(pointer: fine)').matches) input.focus();   // pas de clavier qui s'ouvre tout seul sur téléphone
  pairBody.querySelector('#pairOut').addEventListener('click', () => {
    f1tv = null;
    relayId = '';
    try { localStorage.removeItem(F1TV_KEY); } catch { /* stockage indisponible */ }
    document.cookie = 'plu=; path=/; max-age=0; secure; samesite=strict';
    updatePairUI();
    pairDlg.close();
    ws?.close();   // reconnexion au relais commun
  });
  const msg = pairBody.querySelector('#pairSendMsg');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const code = (input.value.match(/\d/g) || []).join('').slice(0, 6);
    if (code.length !== 6) { msg.textContent = t('Entrez le code à 6 chiffres.'); return; }
    if (!f1tv) { msg.textContent = t('Aucune connexion F1 TV sur cet appareil.'); return; }
    msg.textContent = t('Envoi…');
    const pr = await fetch(`/live/api/pair?code=${code}`).then((x) => (x.status === 200 ? x.json() : null)).catch(() => null);
    if (!pr?.pub) { msg.textContent = t('Code inconnu ou expiré.'); return; }
    try {
      const keys = await genKeys();
      const key = await sharedKey(keys.privateKey, pr.pub);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(f1tv)));
      const ok = await fetch(`/live/api/pair?code=${code}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spub: await pubJwk(keys), iv: b64(iv), data }) }).then((x) => x.ok).catch(() => false);
      const done = pr.kind === 'browser' ? t('Navigateur relié. La connexion apparaît dans le navigateur.') : t('Téléphone relié. La connexion apparaît sur le téléphone.');
      pairNote(ok ? done : t('Échec de l\'envoi. Réessayez.'), !ok);
    } catch { pairNote(t('Échec de l\'envoi. Réessayez.'), true); }
  });
}

updatePairUI();

function status(now) {
  store.skew = store.skew === 0 ? now - Date.now() : store.skew * 0.8 + (now - Date.now()) * 0.2;
  store.status = {
    type: 'status', serverNow: now, clock: now, paused: false,
    source: { mode: 'live', label: 'Live', ...relay, authenticated: !!relay.authenticated },
    bufferStart: hub.start(), hasPositions: !!relay.authenticated, hasCarData: !!relay.authenticated, maxDelayMs: hub.keep, sync: [],
  };
  emit('status', store.status);
}

// GPS laissé à un autre appareil du même compte F1 TV : repris par le relais (badge « GPS ailleurs »)
store.takeGps = () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'here' })); };

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live/ws?d=${store.delay}${relayId ? `&u=${relayId}` : ''}`);
  ws.onopen = () => {
    store.connected = true;
    emit('connection', true);
    if (f1tv) ws.send(JSON.stringify({ type: 'auth', token: f1tv }));
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'hello') { relay = msg.status || {}; hub.hello(msg); status(msg.now); setDelay(store.delay); }
    else if (msg.type === 'evs') { hub.push(msg.events); hub.pushStream(msg.stream || []); }
    else if (msg.type === 'stream') hub.pushStream(msg.items || [], true);
    else if (msg.type === 'up') { relay = msg.status || {}; status(msg.now); }
  };
  ws.onclose = (ev) => {
    store.connected = false;
    emit('connection', false);
    if (ev.code === 4001) relayId = '';   // connexion F1 TV refusée par son relais (expirée) : relais commun, sans GPS
    setTimeout(connect, 3000);
  };
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
  box.innerHTML = `<div class="web-res-grid">${last ? resCard(`${gpShort(last.race, LANG)} · ${last.label}`, last.rows.slice(0, 10)) : ''}
    ${resCard('Championnat pilotes', (d.drivers || []).slice(0, 10).map((x) => [x.pos, x.name, `${x.points} pts`]))}
    ${resCard('Championnat constructeurs', (d.constructors || []).map((x) => [x.pos, x.name, `${x.points} pts`]))}</div>`;
});

const safe = (fn) => { try { fn(); } catch (err) { console.error(err); } };
// Relais qui vient de redémarrer : rien n'est montré avant que le délai TV l'ait rattrapé (pas de spoiler)
const waitBar = document.querySelector('#webWait');
function showWait() {
  const s = Math.ceil(hub.wait / 1000);
  waitBar.hidden = !s;
  if (s) waitBar.textContent = `Mise en mémoire : affichage calé sur votre TV dans ${s} s`;
}
function loop() {
  safe(() => hub.tick(serverNow() - store.delay));
  safe(showWait);
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
// Espace Saison de l'appli (calendrier, classements, résultats…), d'après la saison gardée par le serveur
safe(initSeason);
// Adresse d'une rubrique de la Saison (app.paddocklive.app/saison/2026/pilotes/lando-norris/) : ouverte directement ;
// l'adresse suit ensuite la rubrique affichée
seasonUrls();
const askedSeason = parseSeasonPath(location.pathname);
if (askedSeason) safe(() => openSeason(askedSeason.section, askedSeason.year || undefined, askedSeason.item));
// Téléphone : réglages du direct derrière l'engrenage. Hauteur de la barre changée (réglages ouverts, police
// chargée) : écran « Pas de séance en direct » replacé dessous
const topbar = document.querySelector('.topbar');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--web-top', `${topbar.offsetHeight}px`);   // place laissée à la barre fixée
  dispatchEvent(new Event('resize'));
}).observe(topbar);
const webMenu = (open) => {
  topbar.classList.toggle('menu-open', open);
  document.querySelector('#webMenuBtn').setAttribute('aria-expanded', String(open));
};
document.querySelector('#webMenuBtn').addEventListener('click', () => webMenu(!topbar.classList.contains('menu-open')));
document.querySelector('#seasonBtn').addEventListener('click', () => webMenu(false));
// Saison ouverte : toucher la séance en haut revient au direct
document.querySelector('.topbar .session').addEventListener('click', () => { if (!document.querySelector('#seasonView').hidden) closeSeason(); });
// Panneau Analyse : seulement la télémétrie du pilote suivi
document.querySelector('.p-analysis [data-tab="telemetry"]')?.click();
on('status', renderSource);
on('connection', renderSource);
initGpsBadge();
initSourceTap();
on('focus', () => renderTower(true));
on('duel', () => renderTower(true));
// Connexion F1 TV gardée d'une ouverture à l'autre sur cet appareil : reprise avant la connexion, pour rejoindre
// directement son relais (sinon il faudrait refaire l'appairage à chaque fois) ; effacée une fois expirée
try {
  const saved = localStorage.getItem(F1TV_KEY);
  if (saved && tokenExp(saved) > Date.now()) { f1tv = saved; relayId = await sha(saved); updatePairUI(); }
  else if (saved) localStorage.removeItem(F1TV_KEY);
} catch { /* stockage indisponible */ }
connect();
loop();

// Version web installée sur l'écran d'accueil : le téléphone la garde en mémoire et la reprend telle quelle au retour
// dans l'appli ; rechargée quand une nouvelle version est en ligne (empreinte mise dans la page par build-studio.mjs)
const VERSION = document.querySelector('meta[name="pl-version"]')?.content;
document.addEventListener('visibilitychange', async () => {
  if (!VERSION || document.visibilityState !== 'visible') return;
  try {
    const v = /<meta name="pl-version" content="(\w+)"/.exec(await (await fetch('/live/', { cache: 'no-store' })).text())?.[1];
    if (v && v !== VERSION && !document.querySelector('dialog[open]')) location.reload();
  } catch { /* hors ligne */ }
});
