// Le "hub" conserve l'historique horodaté (heure locale de réception) de tous les messages
// du flux et les distribue à chaque navigateur avec SON délai : chaque client reçoit
// l'état tel qu'il était à (maintenant - délai), puis les événements au fil de l'eau.
// Augmenter le délai => l'état est reconstruit à partir de l'historique.
import zlib from 'node:zlib';
import { WebSocket } from 'ws';
import { applyEvent, createDerived, createSyncContext, extractSyncEvents } from '../shared/derive.js';

const TICK_MS = 100;
const LOOKAHEAD_MS = 6000;       // GPS/télémétrie envoyés en avance (ils arrivent ~2-3 s après les chronos)
const STREAM_HISTORY_MS = 150000; // historique GPS envoyé lors d'une reconstruction (calcul des écarts)

function inflate(raw) {
  try {
    return zlib.inflateRawSync(Buffer.from(raw, 'base64')).toString('utf8');
  } catch {
    return null;
  }
}

function lowerBound(arr, t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function upperBound(arr, t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// Réglages des overlays : par overlay, opacité du fond (0 à 100), colonnes du classement et calques
// de la carte (clés courtes)
const OVERLAY_KEYS = ['mini', 'map', 'laps', 'countdown', 'podium', 'telemetry'];
export function cleanOverlayCfg(v) {
  const out = {};
  for (const k of OVERLAY_KEYS) {
    const o = v?.[k];
    if (!o || typeof o !== 'object') continue;
    const x = {};
    if (o.bg !== undefined && Number.isFinite(Number(o.bg))) x.bg = Math.max(0, Math.min(100, Math.round(Number(o.bg))));
    for (const f of ['cols', 'layers']) if (Array.isArray(o[f])) x[f] = o[f].filter((n) => typeof n === 'string' && /^[a-z0-9]{1,20}$/.test(n)).slice(0, 30);
    out[k] = x;
  }
  return out;
}

export class Hub {
  constructor({ maxDelayMs }) {
    this.maxDelayMs = maxDelayMs;
    this.clients = new Set();
    this.gen = 0;
    this.reset({ mode: 'idle' });
    this.timers = [
      setInterval(() => this.tick(), TICK_MS),
      setInterval(() => this.broadcastStatus(), 1000),
    ];
  }

  close() {
    for (const t of this.timers) clearInterval(t);
  }

  reset(source) {
    this.gen++;
    this.events = [];
    this.stream = [];
    this.posArchive = [];   // GPS sorti de l'historique d'envoi (comparaison des meilleurs tours)
    this.streamOffset = 0;
    this.sync = [];
    this.syncCtx = createSyncContext();
    this.source = { ...source };
    this.pausedAt = null;
    this.hasPositions = false;
    this.hasCarData = false;
    this.sessionKey = null;
  }

  clock() {
    return this.pausedAt ?? Date.now();
  }

  // ---- Alimentation (live) ----
  addEvent(topic, data, t) {
    this.events.push({ t, topic, data });
    for (const e of extractSyncEvents(this.syncCtx, topic, data, t)) this.sync.push(e);
    if (this.sync.length > 400) this.sync.splice(0, this.sync.length - 400);
  }

  addStream(topic, raw, t) {
    if (typeof raw !== 'string') return;
    this.stream.push({ t, topic, raw });
    if (topic === 'Position') this.hasPositions = true;
    if (topic === 'CarData') this.hasCarData = true;
    this.trimStream();
  }

  trimStream() {
    const limit = this.clock() - this.maxDelayMs - STREAM_HISTORY_MS - 60000;
    if (this.stream.length > 2000 && this.stream[1000].t < limit) {
      const n = lowerBound(this.stream, limit);
      // Le GPS reste disponible toute la séance pour comparer les meilleurs tours
      for (const it of this.stream.splice(0, n)) if (it.topic === 'Position') this.posArchive.push(it);
      this.streamOffset += n;
    }
  }

  // ---- Alimentation (replay) : tout est chargé d'un coup, trié par temps ----
  load(events, stream) {
    this.events = events;
    this.stream = stream;
    this.streamOffset = 0;
    this.sync = [];
    this.syncCtx = createSyncContext();
    for (const e of events) {
      for (const s of extractSyncEvents(this.syncCtx, e.topic, e.data, e.t)) {
        if (e.off !== undefined) s.off = e.off;
        this.sync.push(s);
      }
    }
    this.hasPositions = stream.some((s) => s.topic === 'Position');
    this.hasCarData = stream.some((s) => s.topic === 'CarData');
    this.gen++;
  }

  // Historique rechargé depuis un enregistrement local (redémarrage pendant une session).
  preload(events, stream) {
    this.events = events.concat(this.events);
    this.stream = stream.concat(this.stream);
    this.streamOffset = 0;
    this.syncCtx = createSyncContext();
    this.sync = [];
    for (const e of this.events) {
      for (const s of extractSyncEvents(this.syncCtx, e.topic, e.data, e.t)) this.sync.push(s);
    }
    if (this.sync.length > 400) this.sync.splice(0, this.sync.length - 400);
    this.hasPositions = this.stream.some((s) => s.topic === 'Position');
    this.hasCarData = this.stream.some((s) => s.topic === 'CarData');
    this.trimStream();
    this.gen++;
  }

  // Recalcule les horodatages du replay : t = anchor + off / speed.
  retime(anchor, speed) {
    for (const arr of [this.events, this.stream, this.sync]) {
      for (const e of arr) if (e.off !== undefined) e.t = anchor + e.off / speed;
    }
    this.gen++;
  }

  // Décale tous les horodatages (pause / reprise / saut dans le replay).
  shift(delta, forceResync = false) {
    for (const e of this.events) e.t += delta;
    for (const s of this.stream) s.t += delta;
    for (const s of this.sync) s.t += delta;
    for (const c of this.clients) c.cutoff += delta;
    if (forceResync) this.gen++;
  }

  // ---- Clients ----
  // host : fenêtre ouverte sur l'ordinateur lui-même. Les téléphones et tablettes du réseau
  // local reçoivent son délai TV pour pouvoir s'y caler (« hostDelay »).
  addClient(ws, { host = true } = {}) {
    const c = { ws, host, delay: 0, gen: -1, ei: 0, si: 0, cutoff: -Infinity };
    this.clients.add(c);
    ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (msg.type === 'delay') {
        const ms = Number(msg.ms);
        if (Number.isFinite(ms)) c.delay = Math.max(0, Math.min(this.maxDelayMs, ms));
        if (host && Number.isFinite(ms) && c.delay !== this.hostDelay) {
          this.hostDelay = c.delay;
          const str = JSON.stringify({ type: 'hostDelay', ms: c.delay });
          for (const o of this.clients) if (!o.host) this.send(o, str);
        }
      } else if (msg.type === 'focus' && host) {
        // Pilote suivi dans l'appli : repris par les overlays (télémétrie)
        this.hostFocus = msg.num == null ? null : String(msg.num).slice(0, 3);
        const str = JSON.stringify({ type: 'hostFocus', num: this.hostFocus });
        for (const o of this.clients) if (!o.host) this.send(o, str);
      } else if (msg.type === 'overlays' && host) {
        // Réglages des overlays (Réglages → Streaming) : gardés sur l'ordinateur et appliqués tout de
        // suite aux overlays ouverts, sans changer leur adresse
        this.overlayCfg = cleanOverlayCfg(msg.cfg);
        this.onOverlayCfg?.(this.overlayCfg);
        const str = JSON.stringify({ type: 'overlayCfg', cfg: this.overlayCfg });
        for (const o of this.clients) if (o !== c) this.send(o, str);
      } else if (msg.type === 'ping') {
        this.send(c, JSON.stringify({ type: 'pong', id: msg.id, serverNow: Date.now() }));
      }
    });
    ws.on('close', () => this.clients.delete(c));
    ws.on('error', () => this.clients.delete(c));
    this.send(c, JSON.stringify(this.statusPayload()));
    this.send(c, JSON.stringify({ type: 'role', host, hostDelay: this.hostDelay ?? null, hostFocus: this.hostFocus ?? null, overlayCfg: this.overlayCfg ?? null, boot: this.boot ?? null }));
    return c;
  }

  send(c, str) {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(str);
  }

  // Délai TV changé à distance (Stream Deck…) : appliqué par les fenêtres de l'ordinateur, suivi par
  // les overlays et les téléphones. Renvoie le nouveau délai (ms).
  setHostDelay(ms) {
    this.hostDelay = Math.round(Math.max(0, Math.min(this.maxDelayMs, ms)) / 100) * 100;
    for (const o of this.clients) this.send(o, JSON.stringify(o.host ? { type: 'setDelay', ms: this.hostDelay } : { type: 'hostDelay', ms: this.hostDelay }));
    return this.hostDelay;
  }

  tick() {
    for (const c of this.clients) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      if (c.ws.bufferedAmount > 8e6) continue;
      const cutoff = this.clock() - c.delay;
      if (c.gen !== this.gen || cutoff < c.cutoff - 200) this.resync(c, cutoff);
      else this.advance(c, cutoff);
    }
  }

  streamItem(s) {
    const json = inflate(s.raw);
    return json ? `[${JSON.stringify(s.topic)},${json},${s.t}]` : null;
  }

  resync(c, cutoff) {
    const state = {};
    const derived = createDerived();
    const ev = this.events;
    let i = 0;
    for (; i < ev.length && ev[i].t <= cutoff; i++) applyEvent(state, derived, ev[i].topic, ev[i].data, ev[i].t);
    c.ei = i;

    const s0 = lowerBound(this.stream, cutoff - STREAM_HISTORY_MS);
    const s1 = upperBound(this.stream, cutoff + LOOKAHEAD_MS);
    const items = [];
    for (let k = s0; k < s1; k++) {
      const it = this.streamItem(this.stream[k]);
      if (it) items.push(it);
    }
    c.si = this.streamOffset + s1;
    c.gen = this.gen;
    c.cutoff = cutoff;

    this.send(c, `{"type":"reset","gen":${this.gen},"cutoff":${cutoff},"state":${JSON.stringify(state)},"derived":${JSON.stringify(derived)},"stream":[${items.join(',')}]}`);
  }

  advance(c, cutoff) {
    const ev = this.events;
    const out = [];
    while (c.ei < ev.length && ev[c.ei].t <= cutoff) {
      const e = ev[c.ei++];
      out.push([e.topic, e.data, e.t]);
    }
    const items = [];
    let li = Math.max(0, c.si - this.streamOffset);
    const limit = cutoff + LOOKAHEAD_MS;
    while (li < this.stream.length && this.stream[li].t <= limit) {
      const it = this.streamItem(this.stream[li++]);
      if (it) items.push(it);
    }
    c.si = this.streamOffset + li;
    c.cutoff = cutoff;
    if (out.length || items.length) {
      this.send(c, `{"type":"batch","cutoff":${cutoff},"events":${JSON.stringify(out)},"stream":[${items.join(',')}]}`);
    }
  }

  // Radios d'équipe publiées (heure du flux F1, pas de délai) pour la synchro TV par le son :
  // jamais affichées, elles servent seulement de repères sonores.
  radioCaptures() {
    const clock = this.clock();
    let path = null;
    const radios = [];
    const seen = new Set();
    const add = (caps) => {
      for (const c of Array.isArray(caps) ? caps : Object.values(caps || {})) {
        if (!c?.Utc || !c.Path || seen.has(c.Path)) continue;
        seen.add(c.Path);
        radios.push({ utc: c.Utc, num: String(c.RacingNumber || ''), path: c.Path });
      }
    };
    for (const e of this.events) {
      if (e.t > clock) break;
      const snap = e.topic === '__snapshot' ? e.data : null;
      const info = snap ? snap.SessionInfo : e.topic === 'SessionInfo' ? e.data : null;
      if (info?.Path) path = info.Path;
      if (snap) add(snap.TeamRadio?.Captures);
      else if (e.topic === 'TeamRadio') add(e.data?.Captures);
    }
    return { base: path ? `https://livetiming.formula1.com/static/${path}` : null, radios };
  }

  statusPayload() {
    const clock = this.clock();
    const firstT = this.events.length ? this.events[0].t : null;
    let lastSync = this.sync.length;
    while (lastSync > 0 && this.sync[lastSync - 1].t > clock) lastSync--;
    return {
      type: 'status',
      serverNow: Date.now(),
      clock,
      paused: this.pausedAt !== null,
      source: this.source,
      bufferStart: firstT,
      hasPositions: this.hasPositions,
      hasCarData: this.hasCarData,
      maxDelayMs: this.maxDelayMs,
      sync: this.sync.slice(Math.max(0, lastSync - 40), lastSync),
    };
  }

  broadcastStatus() {
    if (!this.clients.size) return;
    const str = JSON.stringify(this.statusPayload());
    for (const c of this.clients) this.send(c, str);
  }
}
