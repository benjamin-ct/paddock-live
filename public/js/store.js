// État côté navigateur : état F1 fusionné (retardé), données dérivées, positions et horloge.
import { applyEvent, createDerived } from '/shared/derive.js';
import { Positions } from './positions.js';
import { storageGet, storageSet } from './util.js';

export const store = {
  state: {},
  derived: createDerived(),
  ver: { __any: 0 },
  status: null,
  skew: 0,
  delay: storageGet('paddock.delayMs', 0),
  connected: false,
  positions: new Positions((utc) => utcToLocal(utc), () => replaySpeed()),
  duel: storageGet('paddock.duel', { a: null, b: null }),
  focus: storageGet('paddock.focus', null),
  overlayCfg: null,       // réglages des overlays de streaming (Réglages → Streaming), gardés par le serveur
};

const listeners = new Map();

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
}

export function emit(evt, payload) {
  for (const fn of listeners.get(evt) || []) fn(payload);
}

export function serverNow() {
  if (store.status?.paused) return store.status.clock;
  return Date.now() + store.skew;
}

// Heure (locale) correspondant à ce qui est affiché : maintenant - délai.
export function displayNow() {
  return serverNow() - store.delay;
}

export function replaySpeed() {
  return store.status?.source?.mode === 'replay' ? store.status.source.speed || 1 : 1;
}

// Heure F1 (UTC) -> heure locale de réception, d'après le Heartbeat de référence.
export function utcToLocal(utc) {
  const ref = store.derived.clockRef;
  if (!ref) return store.derived.clockOffset === null || store.derived.clockOffset === undefined ? null : utc + store.derived.clockOffset;
  return ref.t + (utc - ref.utc) / replaySpeed();
}

// Heure F1 (UTC) correspondant à l'affichage.
export function f1Now() {
  const ref = store.derived.clockRef;
  if (!ref) return displayNow() - (store.derived.clockOffset ?? 0);
  return ref.utc + (displayNow() - ref.t) * replaySpeed();
}

function bump(topic) {
  store.ver[topic] = (store.ver[topic] || 0) + 1;
  store.ver.__any++;
}

// Force le rafraîchissement des panneaux qui dépendent d'un sujet (ex. couleurs des pilotes).
export function touch(topic) {
  bump(topic);
}

export function versionOf(topics) {
  let v = 0;
  for (const t of topics) v += store.ver[t] || 0;
  return v;
}

function ingestStream(items) {
  for (const [topic, data, t] of items) {
    if (topic === 'Position') store.positions.ingestPosition(data, t);
    else if (topic === 'CarData') store.positions.ingestCarData(data, t);
  }
  if (items.length) { bump('Position'); bump('CarData'); }
}

export function handleReset(msg) {
  store.state = msg.state || {};
  store.derived = msg.derived || createDerived();
  store.positions.reset();
  ingestStream(msg.stream || []);
  for (const k of Object.keys(store.state)) bump(k);
  bump('__reset');
  emit('reset');
}

export function handleBatch(msg) {
  const topics = new Set();
  for (const [topic, data, t] of msg.events) {
    applyEvent(store.state, store.derived, topic, data, t);
    if (topic === 'TimingData') store.positions.onTiming(store.state, data, t);
    if (topic === '__snapshot') Object.keys(data).forEach((k) => topics.add(k));
    else topics.add(topic);
  }
  for (const t of topics) bump(t);
  ingestStream(msg.stream || []);
  if (msg.events.length) emit('events', msg.events);
}

export function setDelay(ms) {
  const max = store.status?.maxDelayMs ?? 600000;
  store.delay = Math.round(Math.max(0, Math.min(max, ms)) / 100) * 100;
  storageSet('paddock.delayMs', store.delay);
  emit('delay', store.delay);
}

export function setDuel(slot, num) {
  // Un choix manuel du pilote B désactive le duel automatique devant/derrière.
  store.duel = { ...store.duel, [slot]: num, ...(slot === 'b' ? { auto: null } : {}) };
  if (slot === 'a' && store.duel.b === num) store.duel.b = null;
  if (slot === 'b' && store.duel.a === num) store.duel.a = null;
  storageSet('paddock.duel', store.duel);
  emit('duel', store.duel);
}

export function setFocus(num) {
  store.focus = num;
  storageSet('paddock.focus', num);
  emit('focus', num);
}

// Plusieurs fenêtres (mode deux écrans) : le pilote suivi et le duel choisis dans une fenêtre
// s'appliquent aussi aux autres (télémétrie, carte, duel…).
window.addEventListener('storage', (e) => {
  if (e.newValue === null) return;
  let v;
  try { v = JSON.parse(e.newValue); } catch { return; }
  if (e.key === 'paddock.focus' && v !== store.focus) {
    store.focus = v;
    emit('focus', v);
  } else if (e.key === 'paddock.duel' && JSON.stringify(v) !== JSON.stringify(store.duel)) {
    store.duel = v;
    emit('duel', v);
  }
});
