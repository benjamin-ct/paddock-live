// Connexion WebSocket au serveur local.
import { store, handleReset, handleBatch, emit, on, setDelay } from './store.js';
import { storageGet, fmtDelay } from './util.js';
import { toast } from './ui/delay.js';

const OVERLAY = /[?&]overlay=1(&|$)/.test(location.search) || location.pathname === '/overlay.html';
// Overlay affiché : sa clé dans les réglages des overlays (Réglages → Streaming)
const OVERLAY_KEY = !OVERLAY ? null : location.pathname === '/overlay.html' ? new URLSearchParams(location.search).get('w') || 'laps'
  : location.pathname === '/mini.html' ? 'mini' : 'map';
let ws = null;
let boot = null;   // démarrage du serveur vu à la première connexion
let pingTimer = null;
let pingId = 0;
const pending = new Map();

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // Overlay de streaming (?overlay=1) : suit le délai TV de l'appli
  ws = new WebSocket(`${proto}://${location.host}/ws${OVERLAY ? '?follow=1' : ''}`);

  ws.onopen = () => {
    store.connected = true;
    emit('connection', true);
    send({ type: 'delay', ms: store.delay });
    if (!OVERLAY) send({ type: 'focus', num: store.focus });
    ping();
    clearInterval(pingTimer);
    pingTimer = setInterval(ping, 5000);
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.type) {
      case 'reset': handleReset(msg); break;
      case 'batch': handleBatch(msg); break;
      case 'status':
        store.status = msg;
        emit('status', msg);
        break;
      // Téléphone ou tablette : on reprend le délai TV réglé sur l'ordinateur
      case 'role':
        // Overlay (OBS garde la page ouverte) : appli redémarrée, peut-être mise à jour, on recharge la page
        if (OVERLAY && boot && msg.boot && msg.boot !== boot) { location.reload(); return; }
        boot = msg.boot;
        store.isHost = msg.host;
        emit('role', msg.host);
        if (msg.hostDelay != null) followHost(msg.hostDelay);
        hostFocus(msg.hostFocus);
        overlayCfg(msg.overlayCfg);
        break;
      case 'hostDelay': followHost(msg.ms); break;
      case 'hostFocus': hostFocus(msg.num); break;
      case 'overlayCfg': overlayCfg(msg.cfg); break;
      // Délai changé à distance (Stream Deck)
      case 'setDelay':
        if (store.isHost && msg.ms !== store.delay) { setDelay(msg.ms); toast(`Délai TV : ${fmtDelay(store.delay)}`, 2500); }
        break;
      case 'news': emit('news', msg.items); break;
      case 'pong': {
        const sent = pending.get(msg.id);
        pending.delete(msg.id);
        if (sent) {
          const now = Date.now();
          const skew = msg.serverNow - (sent + now) / 2;
          // Lissage léger de l'écart d'horloge navigateur/serveur.
          store.skew = store.skew === 0 ? skew : store.skew * 0.8 + skew * 0.2;
        }
        break;
      }
    }
  };

  ws.onclose = () => {
    store.connected = false;
    emit('connection', false);
    clearInterval(pingTimer);
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

function followHost(ms) {
  if (store.isHost || !storageGet('paddock.followHost', true) || ms === store.delay) return;
  setDelay(ms);
  toast(`Délai calé sur l'ordinateur : ${fmtDelay(store.delay)}`, 3500);
}

// Overlay : pilote suivi dans l'appli de l'ordinateur (télémétrie)
function hostFocus(num) {
  if (!OVERLAY || num === undefined || num === store.focus) return;
  store.focus = num;
  emit('focus', num);
}

// Réglages des overlays changés dans l'appli : appliqués tout de suite, sans changer d'adresse (fond
// ici, colonnes du classement et calques de la carte dans mini.js et map.js)
function overlayCfg(cfg) {
  if (cfg === undefined) return;
  store.overlayCfg = cfg;
  const bg = cfg?.[OVERLAY_KEY]?.bg;
  if (OVERLAY_KEY && bg != null) document.documentElement.style.setProperty('--ov-bg', `${bg}%`);
  emit('overlayCfg', cfg);
}
export function sendOverlayCfg(cfg) {
  store.overlayCfg = cfg;
  send({ type: 'overlays', cfg });
}

function ping() {
  const id = ++pingId;
  pending.set(id, Date.now());
  if (pending.size > 20) pending.delete(pending.keys().next().value);
  send({ type: 'ping', id });
}

on('delay', (ms) => send({ type: 'delay', ms }));
on('focus', (num) => { if (!OVERLAY) send({ type: 'focus', num }); });
