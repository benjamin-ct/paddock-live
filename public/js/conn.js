// Connexion WebSocket au serveur local.
import { store, handleReset, handleBatch, emit, on, setDelay } from './store.js';
import { storageGet, fmtDelay } from './util.js';
import { toast } from './ui/delay.js';

let ws = null;
let pingTimer = null;
let pingId = 0;
const pending = new Map();

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // Overlay de streaming (?overlay=1) : suit le délai TV de l'appli
  ws = new WebSocket(`${proto}://${location.host}/ws${/[?&]overlay=1(&|$)/.test(location.search) ? '?follow=1' : ''}`);

  ws.onopen = () => {
    store.connected = true;
    emit('connection', true);
    send({ type: 'delay', ms: store.delay });
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
        store.isHost = msg.host;
        emit('role', msg.host);
        if (msg.hostDelay != null) followHost(msg.hostDelay);
        break;
      case 'hostDelay': followHost(msg.ms); break;
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

function ping() {
  const id = ++pingId;
  pending.set(id, Date.now());
  if (pending.size > 20) pending.delete(pending.keys().next().value);
  send({ type: 'ping', id });
}

on('delay', (ms) => send({ type: 'delay', ms }));
