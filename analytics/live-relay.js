// Relais du direct F1 pour la version web (app.paddocklive.app, aussi paddocklive.app/live/) : une seule connexion
// au flux officiel F1 Live Timing (SignalR Core), redistribuée à tous les navigateurs. Avec la connexion F1 TV
// envoyée par l'appli du créateur (liveF1tv), aussi le GPS et la télémétrie (Position.z, CarData.z), relayés
// compressés tels quels. Le relais garde l'état d'il y a KEEP_MS (base) et les messages reçus depuis : chaque
// navigateur applique lui-même son délai TV (analytics/live-page/web-hub.js), comme le serveur local de l'appli.
import { LIVE_TOPICS, topicName } from '../shared/f1.js';
import { applyEvent, createDerived } from '../shared/derive.js';
import { liveF1tv } from './studio.js';

const BASE = 'https://livetiming.formula1.com/signalrcore';
const UA = 'Mozilla/5.0 (Paddock-Live web relay)';
const RS = '\x1e';
export const KEEP_MS = 5 * 60e3;   // délai TV possible en ligne
export const HIST_MS = 60e3;       // GPS et télémétrie d'avant le délai (traînées, vitesse des 30 dernières secondes)
const IDLE_MS = 60e3;              // plus personne : connexion à la F1 fermée au bout d'une minute
const MAX_CLIENTS = 1000;

export class LiveRelay {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.clients = new Set();
    this.up = null;
    this.timers = [];
    this.out = [];
    this.retry = 0;
    this.stream = [];
    this.outStream = [];
    this.status = { connected: false, error: null, session: null, authenticated: false };
    this.resetData(null);
  }

  resetData(key) {
    this.key = key;
    this.base = { t: 0, state: {}, derived: createDerived() };
    this.recent = [];
    this.stream = [];
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    if (this.clients.size >= MAX_CLIENTS) return new Response('Trop de connexions', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.clients.add(server);
    const drop = () => this.drop(server);
    server.addEventListener('close', drop);
    server.addEventListener('error', drop);
    // GPS et télémétrie plus anciens, demandés quand le délai TV s'allonge
    server.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m?.type === 'stream' && Number.isFinite(m.from) && Number.isFinite(m.to)) this.send(server, JSON.stringify({ type: 'stream', items: this.streamBetween(m.from, m.to) }));
    });
    // ?d= : délai TV du navigateur, pour ne lui envoyer que le GPS et la télémétrie utiles
    const d = Number(new URL(req.url).searchParams.get('d'));
    this.hello(server, Date.now() - (Number.isFinite(d) ? Math.min(Math.max(d, 0), KEEP_MS) : KEEP_MS) - HIST_MS);
    this.start();
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, str) {
    try { ws.send(str); } catch { this.drop(ws); }
  }

  broadcast(str) {
    for (const ws of this.clients) this.send(ws, str);
  }

  // Arrivée d'un navigateur (ou nouvelle séance pour tous) : état de base, messages depuis et GPS depuis from
  hello(ws, from = 0) {
    const str = JSON.stringify({ type: 'hello', now: Date.now(), keep: KEEP_MS, status: this.status, base: this.base, events: this.recent, stream: this.streamBetween(from, Infinity) });
    if (ws) this.send(ws, str); else this.broadcast(str);
  }

  streamBetween(from, to) {
    return this.stream.filter((s) => s[2] >= from && s[2] < to);
  }

  drop(ws) {
    this.clients.delete(ws);
    if (!this.clients.size && !this.idle) this.idle = setTimeout(() => this.stop(), IDLE_MS);
  }

  setStatus(patch) {
    Object.assign(this.status, patch);
    this.broadcast(JSON.stringify({ type: 'up', now: Date.now(), status: this.status }));
  }

  start() {
    clearTimeout(this.idle);
    this.idle = null;
    if (this.active) return;
    this.active = true;
    this.timers.push(setInterval(() => this.flush(), 250));
    this.timers.push(setInterval(() => this.roll(), 10000));
    this.timers.push(setInterval(() => this.broadcast(JSON.stringify({ type: 'up', now: Date.now(), status: this.status })), 5000));
    this.connect();
  }

  stop() {
    this.idle = null;
    if (this.clients.size) return;
    this.active = false;
    for (const t of this.timers) clearInterval(t), clearTimeout(t);
    this.timers = [];
    this.closeUp();
  }

  closeUp() {
    clearInterval(this.beat);
    try { this.up?.close(); } catch { /* déjà fermée */ }
    this.up = null;
    this.status.connected = false;
  }

  // Messages reçus depuis le dernier envoi : un seul envoi groupé aux navigateurs
  flush() {
    if (!this.out.length && !this.outStream.length) return;
    const str = `{"type":"evs","events":${JSON.stringify(this.out)},"stream":${JSON.stringify(this.outStream)}}`;
    this.out = [];
    this.outStream = [];
    this.broadcast(str);
  }

  // Messages plus vieux que KEEP_MS : intégrés à l'état de base (mémoire bornée)
  roll(now = Date.now()) {
    let n = 0;
    while (n < this.recent.length && this.recent[n][2] < now - KEEP_MS) {
      const [topic, data, t] = this.recent[n++];
      applyEvent(this.base.state, this.base.derived, topic, data, t);
      this.base.t = t;
    }
    if (n) this.recent.splice(0, n);
    let k = 0;
    while (k < this.stream.length && this.stream[k][2] < now - KEEP_MS - HIST_MS) k++;
    if (k) this.stream.splice(0, k);
  }

  add(topic, data, t) {
    const e = [topic, data, t];
    this.recent.push(e);
    this.out.push(e);
  }

  addStream(topic, raw, t) {
    if (typeof raw !== 'string') return;
    const s = [topic, raw, t];
    this.stream.push(s);
    this.outStream.push(s);
  }

  reconnectLater() {
    this.closeUp();
    if (!this.active) return;
    const wait = Math.min(30000, 1000 * 2 ** this.retry++);
    this.timers.push(setTimeout(() => this.connect(), wait));
  }

  async connect() {
    if (!this.active || this.up) return;
    try {
      const token = await liveF1tv(this.env).catch(() => null);
      const auth = token ? { Authorization: `Bearer ${token}` } : {};
      const neg = await fetch(`${BASE}/negotiate?negotiateVersion=1`, { method: 'POST', headers: { 'User-Agent': UA, ...auth } });
      if (!neg.ok) throw new Error(`Négociation SignalR : HTTP ${neg.status}`);
      const { connectionToken, connectionId } = await neg.json();
      const cookie = (neg.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
      const res = await fetch(`${BASE}?id=${encodeURIComponent(connectionToken || connectionId)}`, { headers: { Upgrade: 'websocket', 'User-Agent': UA, ...auth, ...(cookie ? { Cookie: cookie } : {}) } });
      const ws = res.webSocket;
      if (!ws) throw new Error(`Connexion refusée (HTTP ${res.status})`);
      ws.accept();
      this.up = ws;
      this.token = token;
      this.connectedAt = Date.now();
      let buffer = '';
      let last = Date.now();
      ws.addEventListener('message', (ev) => {
        last = Date.now();
        buffer += typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
        let i;
        while ((i = buffer.indexOf(RS)) >= 0) {
          const frame = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          if (frame) this.onFrame(frame);
        }
      });
      ws.addEventListener('close', (ev) => { if (this.up === ws) { this.setStatus({ connected: false, error: `Connexion fermée (${ev.code})` }); this.reconnectLater(); } });
      ws.addEventListener('error', () => { if (this.up === ws) { this.setStatus({ connected: false, error: 'Erreur de connexion' }); this.reconnectLater(); } });
      ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS);
      ws.send(JSON.stringify({ type: 1, invocationId: '1', target: 'Subscribe', arguments: [token ? LIVE_TOPICS : LIVE_TOPICS.filter((t) => !t.endsWith('.z'))] }) + RS);
      // Signe de vie toutes les 10 s ; plus rien depuis 60 s : nouvelle connexion
      clearInterval(this.beat);
      this.beat = setInterval(() => {
        if (Date.now() - last > 60000) { this.setStatus({ error: 'Plus de données depuis 60 s, reconnexion…' }); this.reconnectLater(); return; }
        if (this.gpsRetry()) { this.retry = 0; this.reconnectLater(); return; }
        try { ws.send(JSON.stringify({ type: 6 }) + RS); } catch { /* fermée : géré par close */ }
      }, 10000);
    } catch (err) {
      this.setStatus({ connected: false, error: String(err?.message || err).slice(0, 200) });
      this.reconnectLater();
    }
  }

  // Séance en cours avec la connexion F1 TV mais sans GPS une minute après la connexion : la F1 ne l'envoie pas
  // à une connexion ouverte avant le début de la séance. Nouvelle connexion, une fois par séance et par jeton
  gpsRetry(now = Date.now()) {
    if (!this.token || this.status.authenticated || !this.connectedAt || now - this.connectedAt < 60000 || now - (this.lastTimingAt || 0) > 30000) return false;
    const key = `${this.key}|${this.token}`;
    if (this.gpsRetried === key) return false;
    this.gpsRetried = key;
    return true;
  }

  onFrame(frame, now = Date.now()) {
    let msg;
    try { msg = JSON.parse(frame); } catch { return; }
    if (msg.type === 3 && msg.invocationId === '1') {
      if (msg.error) { this.setStatus({ error: `Abonnement refusé : ${msg.error}` }); return; }
      this.retry = 0;
      const result = msg.result || {};
      const key = result.SessionInfo?.Key ?? null;
      const snapshot = {};
      for (const [raw, value] of Object.entries(result)) if (!raw.endsWith('.z')) snapshot[topicName(raw)] = value;
      const authenticated = 'Position.z' in result || 'CarData.z' in result;
      // Nouvelle séance (ou première connexion) : on repart de cet état
      if (key !== this.key || !this.base.t) {
        this.resetData(key);
        this.base.t = now;
        applyEvent(this.base.state, this.base.derived, '__snapshot', snapshot, now);
        this.out = [];
        this.outStream = [];
        this.status = { connected: true, error: null, session: label(result.SessionInfo), authenticated };
        this.hello();
      } else {
        this.add('__snapshot', snapshot, now);
        this.setStatus({ connected: true, error: null, authenticated });
      }
      for (const z of ['Position.z', 'CarData.z']) if (typeof result[z] === 'string') this.addStream(topicName(z), result[z], now);
    } else if (msg.type === 1 && msg.target === 'feed' && Array.isArray(msg.arguments)) {
      const [raw, data] = msg.arguments;
      if (typeof raw !== 'string') return;
      const topic = topicName(raw);
      if (raw.endsWith('.z')) {
        this.addStream(topic, data, now);
        if (!this.status.authenticated) this.setStatus({ authenticated: true });
        return;
      }
      if (topic === 'TimingData') this.lastTimingAt = now;
      if (topic === 'SessionInfo' && data?.Key && this.key && data.Key !== this.key) { this.reconnectLater(); return; }
      this.add(topic, data, now);
    } else if (msg.type === 7) {
      this.setStatus({ connected: false, error: msg.error ? `Fermé par la F1 : ${msg.error}` : 'Fermé par la F1' });
      this.reconnectLater();
    }
  }
}

const label = (info) => (info ? [info.Meeting?.Name, info.Name].filter(Boolean).join(' — ') : null);

// /live/ws : navigateur relié au relais (une seule instance pour tout le monde)
export function liveSocket(req, env) {
  if (!env.LIVE) return new Response('Relais indisponible', { status: 503 });
  return env.LIVE.get(env.LIVE.idFromName('f1')).fetch(req);
}

// /live/api/… : ce dont la version web a besoin du serveur local de l'appli. Tracé du circuit (API MultiViewer,
// l'année demandée ou une des précédentes), gardé un jour ; photos des pilotes : le navigateur les prend
// directement sur le site de la F1 ; le reste n'existe pas en ligne
export async function liveApi(req, url) {
  if (url.pathname === '/live/api/headshot') {
    let u = null;
    try { u = new URL(url.searchParams.get('u')); } catch { /* adresse invalide */ }
    if (u?.protocol !== 'https:' || !['media.formula1.com', 'www.formula1.com'].includes(u.hostname)) return json({ error: 'Photo invalide' }, 400);
    return Response.redirect(u.href, 302);
  }
  if (url.pathname === '/live/api/circuit') {
    const key = Number(url.searchParams.get('key')), year = Number(url.searchParams.get('year'));
    if (!Number.isInteger(key) || !Number.isInteger(year)) return json({ error: 'Paramètres invalides' }, 400);
    const cache = caches.default;
    const ck = new Request(`https://live.cache/circuit/${key}/${year}`);
    const hit = await cache.match(ck);
    if (hit) return hit;
    for (let y = year; y >= year - 6; y--) {
      const r = await fetch(`https://api.multiviewer.app/api/v1/circuits/${key}/${y}`, { headers: { 'User-Agent': UA } }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => null) : null;
      if (Array.isArray(d?.x) && d.x.length) {
        const out = json(d, 200, { 'Cache-Control': 'public, max-age=86400' });
        await cache.put(ck, out.clone());
        return out;
      }
    }
    return json({ error: 'Tracé introuvable' }, 404);
  }
  return json({ error: 'Pas disponible dans la version web' }, 404);
}

const json = (d, status = 200, headers = {}) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...headers } });
