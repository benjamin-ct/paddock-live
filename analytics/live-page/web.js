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
import { renderRcm, renderPits, initRcmFilters, initStewards, renderStewards } from './ui/feed.js';
import { renderRadios, initRadios } from './ui/radios.js';
import { renderTelemetry, renderStrategy, renderChampionship, renderWeather } from './ui/extra.js';
import { initTopInfo } from './ui/topinfo.js';
import { initRadar } from './ui/radar.js';
import { renderPitSim, renderBattles, initRaceTools } from './ui/race-tools.js';
import { initAnalysis, renderAnalysis } from './ui/analysis.js';
import { renderDuelBand, renderDuel, initDuel } from './ui/duel.js';
import { initNoLive, initHome, openHome, closeHome, homeTouched } from './ui/home.js';
import { initSeason, closeSeason, openSeason, seasonUrls } from './ui/season-lazy.js';   // Saison chargée à sa première ouverture
import { parseSeasonPath } from '/shared/season-urls.js';
import { addPositions, addCarData, compareFrom, raceStartFrom } from '/shared/compare.js';
import './ui/calendar-menu.js';   // « Ajouter à mon agenda » (Saison)
import { initSelects } from './ui/select.js';
import { changelogHtml } from './ui/changelog.js';
import { prefs, setPref } from './prefs.js';

translatePage();
// Réglages gardés d'une ancienne visite : le classement passe au code du pilote seul, comme l'appli 1.30 (nom complet :
// menu « Colonnes ») ; une fois seulement (layoutV, que l'appli tient dans ui/layout.js, pas chargé ici)
if ((prefs.layoutV || 0) < 4) {
  setPref('hiddenCols', [...new Set([...(prefs.hiddenCols || []), 'name'])]);
  setPref('layoutV', 4);
}
initSelects();   // listes déroulantes aux couleurs de l'appli (sur ordinateur ; le téléphone garde la sienne)
// Rien n'est traduit dans le navigateur (pas de moteur local) : documents FIA traduits par le serveur, relus plus tard
store.isHost = false;
store.web = true;   // version web : accueil sans replays ni Actu (ui/home.js)
// GPS et télémétrie : texte compressé (deflate brut, base64) du flux F1
async function inflate(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
}
let ws = null;
// Comparaison (fenêtres Analyse et Comparaison) : GPS et télémétrie gardés depuis l'ouverture de la page (le relais
// n'en garde que quelques minutes), calculés ici comme le fait le serveur de l'appli (shared/compare.js)
const gps = new Map(), tel = new Map();
let gpsSession;   // séance de ce GPS (Path du relais)
const keepTel = /[?&]only=(analysis|compare)\b/.test(location.search);
const hub = new WebHub({
  apply: applyEvent, reset: handleReset, batch: handleBatch, inflate,
  ask: (from, to) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stream', from, to })); },
  tap: keepTel ? (topic, data) => { if (topic === 'Position') addPositions(gps, data); else if (topic === 'CarData') addCarData(tel, data); } : null,
});
const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
store.compareFetch = async ({ a, b, until, la, lb }) => {
  const out = await compareFrom({ state: store.state, derived: store.derived, events: hub.events.map(([topic, data, t]) => ({ topic, data, t })),
    cars: gps, tel: tel.size ? tel : null, until, a, b, la, lb,
    load: (key, year) => Promise.all([getJSON(`/live/api/circuit?key=${key}&year=${year}`), getJSON(`/live/api/loops?key=${key}&year=${year}`)]) });
  // Tour d'avant l'ouverture de la page : pas de GPS gardé pour lui
  if (/introuvable dans le GPS|GPS incomplet/.test(out.reason || '')) out.reason += ' La version web garde le GPS depuis l\'ouverture de cette fenêtre : comparez un tour fait depuis.';
  return out;
};
// Départ de la course (Analyse → Tendances) : GPS gardé depuis l'ouverture de la page (rien si elle a été ouverte après)
store.startFetch = ({ until }) => raceStartFrom({ events: hub.events.map(([topic, data, t]) => ({ topic, data, t })), cars: gps, until,
  load: (key, year) => Promise.all([getJSON(`/live/api/circuit?key=${key}&year=${year}`)]) });
let relay = {};

// Connexion F1 TV du visiteur, donnée par l'extension Paddock Live Companion (formula1.com) : GPS et télémétrie
// par son propre relais, relié à la F1 avec son abonnement. Gardée en mémoire seulement ; le cookie « plu »
// (empreinte, pas le jeton) désigne ce relais pour les radios réservées aux abonnés
let f1tv = null, relayId = '';
const F1TV_KEY = 'paddock.f1tv';
// Empreinte du relais : celle du compte F1 TV (identifiant d'abonné du jeton), la même sur tous ses appareils
const account = (t) => { try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return String(p.SubscriberId || p.hashedSubscriberId || t); } catch { return t; } };
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(account(t))))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
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
  pairBody.innerHTML = `<p class="pair-h">${esc(t('Sur un appareil déjà connecté à F1 TV, ouvrez Paddock Live, touchez « F1 TV connecté » et tapez ce code :'))}</p><div class="pair-code selectable">${r.code}</div><button class="btn pair-copy" type="button">${esc(t('Copier le code'))}</button><p class="pair-note">${esc(t('En attente de l\'ordinateur…'))}</p>`;
  // Copier le code (il se tape sur un autre appareil ; sans presse-papiers : le code est sélectionné)
  const copy = pairBody.querySelector('.pair-copy');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(String(r.code)); copy.textContent = t('Code copié'); }
    catch { getSelection()?.selectAllChildren(pairBody.querySelector('.pair-code')); }
  };
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
    + `<form id="pairForm"><input id="pairInput" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]{6}([0-9]{2})?" placeholder="--------" aria-label="${esc(t('Code à 8 chiffres'))}"><button class="btn btn-accent" type="submit">${esc(t('Relier'))}</button></form>`
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
    const code = (input.value.match(/\d/g) || []).join('').slice(0, 8);
    if (code.length !== 8 && code.length !== 6) { msg.textContent = t('Entrez le code à 8 chiffres.'); return; }   // 6 : code d'avant la mise à jour
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

// Horloge du relais : chaque message donne « heure du serveur − heure du téléphone », moins le temps de trajet. Un
// message retardé par le réseau du téléphone faisait reculer l'heure affichée d'un coup (voitures qui sautent sur la
// carte, tout rechargé au-delà de 200 ms) : écart le plus grand des 30 dernières secondes (trajet le plus court),
// rattrapé en douceur dans loop (3 % au plus) ; recalé d'un coup seulement au début ou après un écart de 2 s
const skews = [];
let skewGoal = null, skewAt = 0;
function status(now) {
  skews.push(now - Date.now());
  if (skews.length > 6) skews.shift();
  skewGoal = Math.max(...skews);
  if (store.skew === 0 || Math.abs(skewGoal - store.skew) > 2000) store.skew = skewGoal;
  store.status = {
    type: 'status', serverNow: now, clock: now, paused: false,
    source: { mode: 'live', label: 'Live', ...relay, authenticated: !!relay.authenticated },
    bufferStart: hub.start(), hasPositions: !!relay.authenticated, hasCarData: !!relay.authenticated, maxDelayMs: hub.keep, sync: [],
  };
  emit('status', store.status);
}

// GPS laissé à un autre appareil du même compte F1 TV : repris par le relais (badge « GPS ailleurs »)
store.takeGps = () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'here' })); };

let fails = 0;   // tentatives d'affilée sans connexion
// Nouvel essai : 3 s, puis doublé à chaque échec jusqu'à 60 s, avec une part au hasard (des visiteurs refusés ensemble
// ne reviennent pas ensemble) ; 3 s de nouveau après une connexion réussie
let wait = 3000;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live/ws?d=${store.delay}${relayId ? `&u=${relayId}` : ''}`);
  ws.onopen = () => {
    fails = 0;
    wait = 3000;
    store.connected = true;
    emit('connection', true);
    if (f1tv) ws.send(JSON.stringify({ type: 'auth', token: f1tv }));
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'hello') {
      // Nouvelle séance : GPS et télémétrie de la précédente oubliés (sinon gardés tout le week-end)
      const ses = msg.base?.state?.SessionInfo?.Path ?? null;
      if (ses !== gpsSession) { gpsSession = ses; gps.clear(); tel.clear(); }
      relay = msg.status || {}; hub.hello(msg); status(msg.now); setDelay(store.delay);
    }
    else if (msg.type === 'evs') { hub.push(msg.events); hub.pushStream(msg.stream || []); }
    else if (msg.type === 'stream') hub.pushStream(msg.items || [], true);
    else if (msg.type === 'up') { relay = msg.status || {}; status(msg.now); }
  };
  ws.onclose = (ev) => {
    const opened = store.connected;
    store.connected = false;
    emit('connection', false);
    if (ev.code === 4001) relayId = '';   // connexion F1 TV refusée par son relais (expirée) : relais commun, sans GPS
    // Son relais injoignable trois fois de suite (refusé, plafond du jour) : relais commun, sans GPS, plutôt que
    // « Serveur déconnecté » jusqu'au lendemain
    else if (!opened && relayId && ++fails >= 3) relayId = '';
    setTimeout(connect, Math.min(60e3, wait * (1 + Math.random() / 3)));
    wait = Math.min(60e3, wait * 2);
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
// Délai changé dans une autre fenêtre de la version web (fenêtre du circuit, autre onglet) : le même partout
addEventListener('storage', (e) => {
  const ms = Number(e.newValue);
  if (e.key === 'paddock.delayMs' && Number.isFinite(ms) && ms !== store.delay) setDelay(ms);
});
// Circuit, Analyse et Duel dans une fenêtre à part, comme dans l'appli : la page, réduite à ce panneau, reliée au même relais
const openWin = (w) => open(`/live/?only=${w}`, `pl-${w}`, 'popup,width=1000,height=720')?.focus();
for (const b of $$('.win-btn')) b.addEventListener('click', () => openWin(b.dataset.win));
on('openWindow', (id) => { if (id === 'compare') openWin('compare'); });   // bouton ↗ de l'onglet Comparaison (compare.js)

// Fenêtre « Circuit », « Analyse », « Duel » ou « Comparaison » (?only=map, analysis, duel, compare) : un seul panneau,
// le reste de la page caché (Comparaison : le panneau Analyse réduit à cet onglet)
const ONLY = /[?&]only=(map|analysis|duel|compare)\b/.exec(location.search)?.[1] || '';
// Fenêtre « Analyse » : les onglets de course de l'appli (arrêts, stratégie, simulateur, bagarres, championnat) rejoignent
// ceux de l'analyse, comme dans la fenêtre Analyse de l'appli ; sans les jeux de pneus (calculés par le serveur de l'appli)
const extra = document.querySelector('.p-extra');
if (ONLY === 'analysis' && extra) {
  const ana = document.querySelector('.p-analysis');
  for (const b of extra.querySelectorAll('.panel-head [data-tab]:not([data-tab="tyres"])')) { b.classList.remove('active'); ana.querySelector('.panel-head [data-tab="telemetry"]').before(b); }
  for (const p of extra.querySelectorAll('[data-pane]:not([data-pane="tyres"])')) { p.classList.remove('active'); ana.querySelector('[data-pane="telemetry"]').before(p); }
}
extra?.remove();
if (ONLY !== 'duel') document.querySelector('.p-duel')?.remove();   // Duel : seulement dans sa fenêtre (bandeau sur le classement ailleurs)

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
// Serveur injoignable : bouton Réessayer, et nouvel essai tout seul au bout de 30 s
let resRetry = null;
async function loadResults() {
  clearTimeout(resRetry);
  const box = document.querySelector('#webResults');
  let d = null;
  for (const y of [new Date().getFullYear(), new Date().getFullYear() - 1]) {
    d = await fetch(`/live/api/season?year=${y}`).then((r) => r.json()).catch(() => null);
    if (d?.races?.some((r) => r.results?.length)) break;
  }
  if (!d?.races) {
    box.innerHTML = `<p class="muted">${esc(t('Résultats indisponibles pour le moment.'))} <button class="btn small" id="webResRetry">${esc(t('Réessayer'))}</button></p>`;
    box.querySelector('#webResRetry').addEventListener('click', loadResults);
    resRetry = setTimeout(loadResults, 30e3);
    return;
  }
  const last = lastSession(d.races);
  box.innerHTML = `<div class="web-res-grid">${last ? resCard(`${gpShort(last.race, LANG)} · ${last.label}`, last.rows.slice(0, 10)) : ''}
    ${resCard('Championnat pilotes', (d.drivers || []).slice(0, 10).map((x) => [x.pos, x.name, `${x.points} pts`]))}
    ${resCard('Championnat constructeurs', (d.constructors || []).map((x) => [x.pos, x.name, `${x.points} pts`]))}</div>`;
}
document.querySelector('#webResultsBtn')?.addEventListener('click', (e) => { e.currentTarget.disabled = true; loadResults(); });

// Nouveautés : les 3 dernières sections du journal (fichier écrit à la construction), la plus récente ouverte.
// Point rouge sur le bouton tant que la plus récente n'a pas été lue (mémorisée dans ce navigateur)
const clBtn = document.querySelector('#clBtn');
const clSeen = () => { try { return localStorage.getItem('pl.changelog') || ''; } catch { return ''; } };
let clList = null;
const clKey = (v) => `${v.version}:${v.body.length}`;
fetch('/live/changelog.json').then((r) => r.json()).then((list) => {
  clList = Array.isArray(list) ? list : [];
  if (clList[0] && clSeen() !== clKey(clList[0])) clBtn?.classList.add('fresh');
}).catch(() => {});
clBtn?.addEventListener('click', () => {
  const dlg = document.querySelector('#clDlg');
  const when = (v) => (v.date ? new Date(`${v.date}T12:00:00Z`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : t('en préparation'));
  document.querySelector('#clBody').innerHTML = clList?.length
    ? clList.map((v, i) => `<details${i ? '' : ' open'}><summary>v${esc(v.version)} · ${esc(when(v))}</summary>${changelogHtml(v.body)}</details>`).join('')
    : `<p class="muted">${t('Journal indisponible.')}</p>`;
  dlg.showModal();
  if (clList?.[0]) { try { localStorage.setItem('pl.changelog', clKey(clList[0])); } catch { /* sans stockage */ } clBtn.classList.remove('fresh'); }
});

// Alertes sur cet appareil (bouton « Alertes », derrière l'engrenage sur téléphone ; tuile de l'Accueil ; raccourci
// /?alertes de l'icône) : mêmes abonnements que la page paddocklive.app/alertes/ (/a/key, /a/sub, /a/off, /a/test,
// analytics/push-public.js), reçus par le service worker de la version web (/live/sw.js, notifications seulement). Un
// appareil déjà abonné sur /alertes/ a là-bas un autre abonnement (autre origine) : il recevrait tout deux fois, d'où
// le lien pour le désactiver. Sur iPhone et iPad : seulement dans la version web ajoutée à l'écran d'accueil
const alertBtn = document.querySelector('#alertBtn');
const alertBody = document.querySelector('#alertBody');
const ALERTS_KEY = 'pl.alerts';   // { topics, tz, lang } envoyés au serveur depuis cet appareil
const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
let tz = '';
try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* moteur sans fuseau */ }
const alertsSaved = () => { try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || 'null'); } catch { return null; } };
const pushApi = async (path, body) => {
  const r = await fetch(`/a/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
};
const urlKey = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
let alertReg = null, alertSub = null;
async function alertsInit() {
  if (!pushOk || alertReg) return;
  alertReg = await navigator.serviceWorker.register('/live/sw.js', { scope: '/' });
  alertSub = await alertReg.pushManager.getSubscription();
  alertBtn?.classList.toggle('on', !!alertSub);
}
const ALERT_TOPICS = [
  ['sessions', 'Avant chaque séance', '30 minutes avant les essais, les qualifs, le sprint et la course, et la veille à 21 h quand une séance tombe en pleine nuit chez vous.'],
  ['results', 'Résultats', 'Vainqueur et pole dès leur publication.', 'Dévoile la course si vous la regardez plus tard.'],
  ['news', 'Grosses news', 'Transferts, pénalités, annonces officielles : quelques fois par semaine au plus. La nuit (23 h à 7 h), regroupées dans un seul message à 7 h.'],
];
function alertsRender(msg = '', ok = false) {
  if (pushOk && !(ios && !installed)) {
    const on = alertsSaved()?.topics || ['sessions', 'news'];
    alertBody.innerHTML = `<p class="pair-h">${esc(t('Un rappel avant chaque séance, les résultats si vous le voulez et les grosses news, même l\'appli fermée.'))}</p>
      <div class="al-topics">${ALERT_TOPICS.map(([k, title, sub, warn]) => `<label class="al-topic"><input type="checkbox" name="alt" value="${k}"${on.includes(k) ? ' checked' : ''}><span><b>${esc(t(title))}</b><small>${esc(t(sub))}${warn ? ` <em>${esc(t(warn))}</em>` : ''}</small></span></label>`).join('')}</div>
      <div class="al-acts">${alertSub
    ? `<button type="button" class="btn" data-al="save">${esc(t('Enregistrer'))}</button><button type="button" class="btn" data-al="test">${esc(t('Envoyer un essai'))}</button><button type="button" class="btn" data-al="off">${esc(t('Tout désactiver'))}</button>`
    : `<button type="button" class="btn btn-accent" data-al="on">${esc(t('Activer les alertes'))}</button>`}</div>
      <p class="pair-note al-state${ok ? ' ok' : msg ? ' err' : ''}" role="status">${esc(msg || (alertSub ? t('Alertes actives sur cet appareil.') : ''))}</p>
      ${!installed && !ios && matchMedia('(pointer: coarse)').matches ? `<p class="pair-note">${esc(t('Pour tout avoir sous une seule icône : menu du navigateur, puis « Installer l\'appli » ou « Ajouter à l\'écran d\'accueil ».'))}</p>` : ''}
      <div class="al-fine"><p>${esc(t('Déjà abonné sur la page des alertes du site ? Désactivez-les là-bas, sinon chaque alerte arrive deux fois :'))} <a href="https://paddocklive.app/alertes/" target="_blank" rel="noopener">paddocklive.app/alertes</a></p>
      <p>${esc(t('Gardés sur notre serveur : l\'adresse de notification et les clés de cet appareil, vos sujets, votre langue et votre fuseau horaire. Rien d\'autre, sans compte. Effacés quand vous désactivez les alertes.'))} <a href="https://paddocklive.app/legal/privacy#alertes" target="_blank" rel="noopener">${esc(t('Confidentialité'))}</a></p></div>`;
    return;
  }
  // iPhone et iPad dans Safari : notifications seulement depuis l'écran d'accueil (iOS 16.4 et plus récents)
  alertBody.innerHTML = ios
    ? `<p class="al-kicker">${esc(t('iPhone et iPad'))}</p><p class="pair-h">${esc(t('Les alertes arrivent dans Paddock Live ajouté à l\'écran d\'accueil (iOS 16.4 ou plus récent) :'))}</p>
      <ol class="al-steps"><li>${esc(t('Dans Safari, touchez Partager (sous « ··· » depuis iOS 26).'))}</li><li>${esc(t('Choisissez « Sur l\'écran d\'accueil », puis « Ajouter ».'))}</li><li>${esc(t('Ouvrez Paddock Live depuis sa nouvelle icône, puis Alertes.'))}</li></ol>`
    : `<p class="pair-h">${esc(t('Ce navigateur ne peut pas recevoir de notifications. Essayez Chrome, Firefox, Edge ou Safari.'))}</p>`;
}
const alertTopics = () => [...alertBody.querySelectorAll('input[name=alt]:checked')].map((x) => x.value);
async function alertsSave(topics = alertTopics()) {
  if (!topics.length) return alertsOff();
  await pushApi('sub', { subscription: alertSub.toJSON(), topics, lang: LANG, tz });
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify({ topics, tz, lang: LANG })); } catch { /* sans stockage */ }
  alertBtn?.classList.add('on');
}
async function alertsOff() {
  if (alertSub) {
    await pushApi('off', { endpoint: alertSub.endpoint }).catch(() => {});
    await alertSub.unsubscribe().catch(() => {});
  }
  alertSub = null;
  try { localStorage.removeItem(ALERTS_KEY); } catch { /* sans stockage */ }
  alertBtn?.classList.remove('on');
}
const ALERT_ACTS = {
  // Permission demandée d'abord, dans le geste du doigt (exigé par Safari sur iPhone)
  on: async () => {
    const topics = alertTopics();
    if (!topics.length) throw new Error(t('Choisissez au moins un sujet.'));
    if (await Notification.requestPermission() !== 'granted') throw new Error(t('Notifications refusées : autorisez-les dans les réglages du navigateur ou de l\'appareil.'));
    await alertsInit();
    const { key } = await pushApi('key');
    alertSub = await alertReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(key) });
    await alertsSave(topics);
    return t('Alertes actives sur cet appareil.');
  },
  save: async () => { await alertsSave(); return alertSub ? t('Alertes actives sur cet appareil.') : t('Alertes désactivées.'); },
  test: async () => { await pushApi('test', { endpoint: alertSub.endpoint }); return t('Essai envoyé : il arrive dans quelques secondes.'); },
  off: async () => { await alertsOff(); return t('Alertes désactivées.'); },
};
alertBody?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-al]');
  if (!b) return;
  b.disabled = true;
  try { alertsRender(await ALERT_ACTS[b.dataset.al](), true); } catch (err) { alertsRender(err.message); }
});
alertBtn?.addEventListener('click', async () => {
  webMenu(false);
  alertsRender();
  document.querySelector('#alertDlg').showModal();
  try { await alertsInit(); alertsRender(); } catch (err) { alertsRender(err.message); }
});
// Abonné depuis cet appareil : fuseau ou langue changés depuis, renvoyés au serveur (rappel de la veille à 21 h chez soi)
if (pushOk && alertsSaved()) {
  alertsInit().then(() => {
    const s = alertsSaved();
    if (!alertSub) { try { localStorage.removeItem(ALERTS_KEY); } catch { /* sans stockage */ } return; }
    if (s.tz !== tz || s.lang !== LANG) alertsSave(s.topics).catch(() => {});
  }).catch(() => {});
}

const safe = (fn) => { try { fn(); } catch (err) { console.error(err); } };
// Relais qui vient de redémarrer : rien n'est montré avant que le délai TV l'ait rattrapé (pas de spoiler)
const waitBar = document.querySelector('#webWait');
function showWait() {
  const s = Math.ceil(hub.wait / 1000);
  waitBar.hidden = !s;
  if (s) waitBar.textContent = `Mise en mémoire : affichage calé sur votre TV dans ${s} s`;
}
function loop() {
  const dt = Math.min(1000, performance.now() - skewAt);
  skewAt = performance.now();
  if (skewGoal !== null) store.skew += Math.max(-0.03 * dt, Math.min(0.03 * dt, skewGoal - store.skew));
  safe(() => hub.tick(serverNow() - store.delay));
  safe(showWait);
  safe(renderHeader);
  safe(renderTower);
  safe(ONLY === 'duel' ? renderDuel : renderDuelBand);   // bandeau du duel sur le classement (deux pilotes cliqués)
  safe(renderRcm);
  safe(renderStewards);
  safe(renderRadios);
  safe(renderTelemetry);
  safe(renderWeather);
  if (ONLY === 'analysis') for (const fn of [renderAnalysis, renderPits, renderStrategy, renderPitSim, renderBattles, renderChampionship]) safe(fn);
  if (ONLY === 'compare') safe(renderAnalysis);
  setTimeout(() => (document.visibilityState === 'visible' ? requestAnimationFrame(loop) : loop()), 100);
}
setInterval(() => hub.roll(serverNow()), 10000);

safe(initTower);
safe(initMap);
safe(initRcmFilters);
safe(initStewards);
safe(initRadios);
// Outils de la barre du haut, comme l'appli : documents FIA, vitesses, meilleurs secteurs, météo et radar de pluie
safe(initTopInfo);
safe(initRadar);
// Pas de séance en direct : prochaine séance et compte à rebours, comme l'appli
safe(initNoLive);
// Espace Saison de l'appli (calendrier, classements, résultats…), d'après la saison gardée par le serveur
safe(initSeason);
// Adresse d'une rubrique de la Saison (app.paddocklive.app/saison/2026/pilotes/lando-norris/) : ouverte directement ;
// l'adresse suit ensuite la rubrique affichée
// Page anglaise de la Saison (/en/season/…, écrite par le serveur) : la rubrique est donnée par la page (data-sz-*,
// noms français) ; l'appli en anglais tient ensuite les adresses anglaises (ui/season.js), en français les françaises
const enSeason = document.querySelector('#szContent')?.dataset;
const askedEn = enSeason?.szYear ? { year: Number(enSeason.szYear), section: enSeason.szSection, item: enSeason.szItem || null } : null;
seasonUrls();
const askedSeason = parseSeasonPath(location.pathname) || askedEn;
if (askedSeason) { document.querySelector('#homeView').hidden = true; safe(() => openSeason(askedSeason.section, askedSeason.year || undefined, askedSeason.item)); }
// Accueil au lancement (pas de séance en cours, pas de page de la Saison demandée, pas de fenêtre à un panneau)
else if (!ONLY) safe(initHome);
// Fenêtre à un panneau : pas d'accueil (affiché par défaut dans la page)
if (ONLY) document.querySelector('#homeView').hidden = true;

// Menu : Accueil, Direct, Saison (barre du haut sur ordinateur, barre du bas sur téléphone, comme l'appli ; boutons
// écrits dans la page, affichés avant le chargement du code)
// Version web ajoutée à l'écran d'accueil de l'iPhone (iOS 26) : la zone visible se décale de la page (bug de WebKit)
// et la barre du bas fixée « marche » avec le défilement, jusqu'au milieu de l'écran. Barre et menus du bas recalés
// sur le bas de la zone visible (--vv-dy, index.html) ; sans le bug l'écart est nul et rien ne bouge
if (installed && ios && window.visualViewport) {
  const vv = window.visualViewport, root = document.documentElement;
  let frame = 0;
  const fit = () => {
    frame = 0;
    const dy = Math.round(vv.offsetTop + vv.height - innerHeight);
    root.style.setProperty('--vv-dy', `${Math.abs(dy) > 1 ? dy : 0}px`);
  };
  const ask = () => { if (!frame) frame = requestAnimationFrame(fit); };
  for (const ev of ['resize', 'scroll']) vv.addEventListener(ev, ask);
  addEventListener('scroll', ask, { passive: true });
  addEventListener('pageshow', ask);
  document.addEventListener('visibilitychange', ask);
  fit();
}
const navs = [document.querySelector('#webNavTop'), document.querySelector('#webNav')].filter(Boolean);
for (const nav of navs) {
  nav.addEventListener('click', (e) => {
    const k = e.target.closest('[data-nav]')?.dataset.nav;
    if (!k) return;
    webMenu(false);
    homeTouched();
    if (k === 'home') openHome();
    else if (k === 'season') openSeason();
    else { closeHome(); closeSeason(); }
    syncNav();
    scrollTo(0, 0);
  });
}
const syncNav = () => {
  const open = (id) => !document.querySelector(id)?.hidden;
  const cur = open('#homeView') ? 'home' : open('#seasonView') ? 'season' : 'live';
  for (const b of document.querySelectorAll('[data-nav]')) { b.classList.toggle('active', b.dataset.nav === cur); b.setAttribute('aria-current', b.dataset.nav === cur ? 'page' : 'false'); }
};
// Vues ouvertes ou fermées ailleurs (raccourcis de l'accueil, séance qui commence, retour de la Saison) : menu à jour
const navWatch = new MutationObserver(syncNav);
for (const id of ['#homeView', '#seasonView']) { const el = document.querySelector(id); if (el) navWatch.observe(el, { attributes: true, attributeFilter: ['hidden'] }); }
syncNav();
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
// Raccourcis de l'icône (Android, manifest.webmanifest) : /?direct ouvre le Direct, /?alertes les alertes ; adresse nettoyée
const shortcut = /^\?(direct|alertes)$/.exec(location.search)?.[1];
if (shortcut) {
  history.replaceState(null, '', location.pathname);
  if (shortcut === 'direct') document.querySelector('#webNav [data-nav="live"]')?.click();
  else alertBtn?.click();
}
// Saison ouverte : toucher la séance en haut revient au direct
document.querySelector('.topbar .session').addEventListener('click', () => { if (!document.querySelector('#seasonView').hidden) closeSeason(); });
// Panneau Analyse : la télémétrie du pilote suivi dans l'écran principal, les autres onglets dans la fenêtre « Analyse »
if (ONLY === 'analysis' || ONLY === 'compare') safe(initAnalysis);
safe(initRaceTools);   // aussi la pastille « duel » du classement (bataille de plus de 3 tours) : le duel des deux pilotes
if (ONLY === 'duel') safe(initDuel);
else document.querySelector(`.p-analysis [data-tab="${ONLY === 'compare' ? 'compare' : 'telemetry'}"]`)?.click();
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
