// Relais du direct F1 pour la version web (app.paddocklive.app) : une connexion au
// flux officiel F1 Live Timing (SignalR Core), redistribuée aux navigateurs. Relais commun (« f1 ») : le flux
// public, sans GPS. Le GPS et la télémétrie (Position.z, CarData.z) demandent un abonnement F1 TV : un visiteur
// qui a le sien (donné à la page par l'extension Paddock Live Companion) a son propre relais (« u:<empreinte> »),
// relié à la F1 avec SA connexion, comme l'appli de bureau ; elle n'est gardée qu'en mémoire, jamais partagée.
// Le relais garde l'état d'il y a KEEP_MS (base) et les messages reçus depuis : chaque navigateur applique
// lui-même son délai TV (analytics/live-page/web-hub.js), comme le serveur local de l'appli.
import { LIVE_TOPICS, topicName } from '../shared/f1.js';
import { applyEvent, createDerived } from '../shared/derive.js';
import { seasonRow } from './studio.js';
import { cachedRadio, transcribeRadio, transcribeWindow, audioHash, MAX_AUDIO } from './transcribe.js';
import { cleanRequest, translateBatch } from './translate.js';
import { callerIp, ipQuota } from './quota.js';
import { pronosApi, GROUP_RE } from './pronos.js';
import { circuitData, seasonStatsWeb } from './race-stats.js';
import { seasonFiaWeb, fiaTranslations, fiaDocsWeb } from './fia-tech.js';
import { weekendTyres } from './tyres.js';
import { destructorsWeb } from './destructors.js';
import { circuitRecords } from './records.js';
import { zonesWeb } from './zones.js';
import { surroundingsWeb, surroundingsStatus } from './surroundings.js';
import { forecast } from '../shared/forecast.js';
import { validHeadshot } from '../shared/portraits.js';
import { buildIcs } from '../shared/ics.js';
import { WEB_HIST_MS } from '../shared/live-delay.js';
import { accountOf, relayId } from '../shared/f1tv-account.js';

const BASE = 'https://livetiming.formula1.com/signalrcore';
const UA = 'Mozilla/5.0 (Paddock-Live web relay)';
const RS = '\x1e';
export const KEEP_MS = 5 * 60e3;   // délai TV possible en ligne
export const HIST_MS = WEB_HIST_MS; // GPS et télémétrie d'avant le délai (traînées, vitesse des 30 dernières secondes)
const IDLE_MS = 60e3;              // plus personne : connexion à la F1 fermée au bout d'une minute
export const LIVE_IDLE_MS = 15 * 60e3;   // pendant une séance : au bout de 15 min (appli quittée, téléphone en veille)
const MAX_CLIENTS = 1000;
const MAX_PER_IP = 10;             // relais commun : un seul appelant ne peut pas prendre toutes les places
const MAX_PER_NET = 30;            // et en IPv6, un bloc /48 (donné gratuitement par certains fournisseurs) pas plus
const MAX_PRIVATE = 4;             // relais d'un abonné F1 TV : ses onglets et appareils
export const AUTH_MS = 15e3, PRIVATE_MS = 6 * 3600e3;   // relais d'un abonné : connexion F1 TV attendue, durée d'une connexion
const ORIGINS = ['https://app.paddocklive.app'];
const STREAM_EVERY = 2000;         // GPS plus ancien : une demande toutes les 2 s au plus par connexion
// Hors séance (calendrier de la saison, pas de chronos depuis 2 min) : relais au repos, F1 débranchée et connexions
// des navigateurs en veille (Durable Object en hibernation, plus facturé à la durée) ; réveillé LEAD_MS avant la
// séance suivante. Une séance dure au plus SPAN_MS après son heure de départ
export const LEAD_MS = 30 * 60e3, SPAN_MS = 4 * 3600e3, LIVE_MS = 2 * 60e3;

// Jeton d'abonnement F1 TV (JWT) encore valable, ou null. Signature non vérifiable ici : la F1 la vérifie ;
// ce contrôle écarte seulement ce qui ne peut pas en être un
export function f1tvToken(t) {
  const p = typeof t === 'string' && t.length < 8000 ? t.split('.') : [];
  if (p.length !== 3) return null;
  try {
    const pl = JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!pl.exp || pl.exp * 1000 < Date.now()) return null;
    return pl.SubscriptionStatus || pl.subscriptionStatus || pl.SubscribedProduct ? t : null;
  } catch { return null; }
}
const payload = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } };
export { accountOf, relayId };

export class LiveRelay {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.clients = new Set();
    this.ips = new Map();      // connexions par adresse (relais commun)
    this.name = 'f1';          // « f1 » (commun) ou « u:<empreinte du jeton> » (abonné F1 TV)
    this.userToken = null;     // relais d'un abonné : sa connexion F1 TV, en mémoire seulement
    this.up = null;
    this.timers = [];
    this.out = [];
    this.retry = 0;
    this.stream = [];
    this.outStream = [];
    this.status = { connected: false, error: null, session: null, authenticated: false };
    this.resetData(null);
    // Réveil après la veille : connexions des navigateurs retrouvées (adresse, appareil, nom du relais)
    for (const ws of ctx.getWebSockets?.() || []) this.track(ws, ws.deserializeAttachment?.() || {});
  }

  track(ws, { nets = [], ua, since = Date.now(), name, ok = false }) {
    if (name) this.name = name;
    this.clients.add(ws);
    ws.ok = ok;   // relais d'un abonné : cet appareil a présenté une connexion F1 TV de ce compte
    ws.nets = nets;
    ws.ua = ua;
    ws.since = since;
    for (const k of nets) this.ips.set(k, (this.ips.get(k) || 0) + 1);
  }

  resetData(key) {
    this.key = key;
    this.base = { t: 0, state: {}, derived: createDerived() };
    this.recent = [];
    this.stream = [];
  }

  // Requêtes venues du Worker seulement (liveSocket, liveApi) : X-Relay = nom de ce relais
  async fetch(req) {
    const url = new URL(req.url);
    this.name = req.headers.get('X-Relay') || this.name;
    if (url.pathname === '/session') return json(await this.session(url.searchParams.has('wake')));
    if (url.pathname === '/radio') return this.radio(url.searchParams.get('p') || '');
    if (url.pathname === '/pair') return this.pair(req, url);
    if (url.pathname === '/clients') return json(this.clientList());
    if (url.pathname === '/state') return json(await this.state(url.searchParams.get('path')));
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    // Page d'un autre site branchée sur le relais : refusée
    if (!ORIGINS.includes(req.headers.get('Origin'))) return new Response('Origine refusée', { status: 403 });
    const priv = this.name.startsWith('u:');
    if (this.clients.size >= (priv ? MAX_PRIVATE : MAX_CLIENTS)) return new Response('Trop de connexions', { status: 503 });
    const ip = callerIp(req) || '?';
    const net = ip.includes(':') ? `${ip.split(':').slice(0, 3).join(':')}::/48` : null;
    if (!priv && ((this.ips.get(ip) || 0) >= MAX_PER_IP || (net && (this.ips.get(net) || 0) >= MAX_PER_NET))) return new Response('Trop de connexions depuis cette adresse', { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    // Connexion qui peut rester ouverte pendant la veille du relais (messages reçus par webSocketMessage)
    const info = { nets: net ? [ip, net] : [ip], ua: shortUA(req.headers.get('User-Agent')), since: Date.now(), name: this.name };   // ua : liste des appareils du Studio
    if (this.ctx.acceptWebSocket) this.ctx.acceptWebSocket(server);
    else {
      server.accept();
      server.addEventListener('message', (ev) => this.webSocketMessage(server, ev.data));
      server.addEventListener('close', () => this.drop(server));
      server.addEventListener('error', () => this.drop(server));
    }
    server.serializeAttachment?.(info);
    this.track(server, info);
    const drop = () => this.drop(server);
    // Relais d'un abonné (facturé à la durée) : fermé sans connexion F1 TV valable au bout de AUTH_MS (la page repasse
    // alors au relais commun), et toute connexion au bout de PRIVATE_MS (la page se reconnecte d'elle-même)
    if (priv) {
      const end = (code, why) => { try { server.close(code, why); } catch { /* déjà fermée */ } drop(); };
      this.timers.push(setTimeout(() => { if (!server.ok) end(4001, 'Connexion F1 TV attendue'); }, AUTH_MS));
      this.timers.push(setTimeout(() => end(4000, 'Reconnexion'), PRIVATE_MS));
    }
    // Relais au repos, même après une veille complète (réveil programmé) : la page reçoit « Hors séance » et la F1
    // reste débranchée jusqu'au réveil
    if (!this.active && !this.resting) {
      const at = await this.ctx.storage?.getAlarm?.();
      if (at > Date.now()) { this.resting = true; Object.assign(this.status, { connected: false, rest: true, next: at + LEAD_MS }); }
    }
    // ?d= : délai TV du navigateur, pour ne lui envoyer que le GPS et la télémétrie utiles
    const d = Number(new URL(req.url).searchParams.get('d'));
    server.from = Date.now() - (Number.isFinite(d) ? Math.min(Math.max(d, 0), KEEP_MS) : KEEP_MS) - HIST_MS;
    // Relais d'un abonné : rien n'est envoyé avant que cet appareil présente sa propre connexion F1 TV du compte
    if (!priv) this.hello(server, server.from);
    if (this.resting) { clearTimeout(this.idle); this.idle = null; } else this.start();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, data) {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    const priv = this.name.startsWith('u:');
    // GPS et télémétrie plus anciens, demandés quand le délai TV s'allonge (une demande toutes les 2 s au plus)
    if (m?.type === 'stream' && Number.isFinite(m.from) && Number.isFinite(m.to)) {
      if (Date.now() - (ws.asked || 0) < STREAM_EVERY) return;
      ws.asked = Date.now();
      this.send(ws, JSON.stringify({ type: 'stream', items: this.streamBetween(m.from, m.to) }));
    }
    // Relais d'un abonné : sa connexion F1 TV (renvoyée par la page à chaque connexion et quand elle change)
    if (m?.type === 'auth' && priv) this.auth(m.token, ws);
    // GPS laissé à un autre appareil : repris ici à la demande de la page
    if (m?.type === 'here' && priv && ws.ok) this.here();
  }

  webSocketClose(ws) { this.drop(ws); }
  webSocketError(ws) { this.drop(ws); }

  // Réveil programmé avant une séance (relais au repos) : reconnexion à la F1 pour les navigateurs restés ouverts
  async alarm() {
    this.resting = false;
    if (this.clients.size) this.start();
  }

  // Séance en cours ou proche d'après le calendrier de la saison (gardé une heure), ou chronos reçus il y a peu ;
  // sinon heure de la prochaine séance (null : calendrier inconnu, le relais reste branché)
  async rest(now = Date.now()) {
    if (now - (this.lastTimingAt || 0) < LIVE_MS || !this.env.DB) return null;
    if (!this.sched || now - this.sched.at > 3600e3) {
      const y = new Date(now).getUTCFullYear();
      const rows = await Promise.all([y, y + 1].map((yr) => seasonRow(this.env, yr, { maxAge: Infinity }).catch(() => null)));
      const starts = rows.flatMap((r) => r?.v?.races || []).flatMap((r) => r.sessions || []).map((x) => Date.parse(x.t)).filter(Number.isFinite).sort((a, b) => a - b);
      this.sched = { at: now, starts };
    }
    const { starts } = this.sched;
    if (!starts.length || starts.some((t) => now >= t - LEAD_MS && now <= t + SPAN_MS)) return null;
    return starts.find((t) => t > now) ?? null;
  }

  // Hors séance : F1 débranchée, minuteries arrêtées (le Durable Object peut se mettre en veille avec les
  // navigateurs connectés) et réveil programmé avant la séance suivante
  async sleepUntilNext(now = Date.now()) {
    if (!this.active || this.resting) return;
    const next = await this.rest(now);
    if (!next || !this.active) return;
    this.resting = true;
    this.setStatus({ connected: false, rest: true, next, error: null });
    this.active = false;
    for (const t of this.timers) clearInterval(t), clearTimeout(t);
    this.timers = [];
    this.closeUp();
    await this.ctx.storage?.setAlarm?.(next - LEAD_MS);
  }

  // Appairage d'un téléphone (version web sans extension, ex. iPhone) : boîte de rendez-vous éphémère, en mémoire
  // seulement. Le téléphone publie sa clé publique et reçoit un code ; l'ordinateur lit la clé, chiffre la connexion
  // F1 TV pour ce téléphone (ECDH) et la dépose ; le téléphone la récupère une seule fois. Le serveur ne voit que
  // des clés publiques et un message chiffré : il ne peut pas lire la connexion, et rien n'est gardé.
  async pair(req, url) {
    const now = Date.now();
    this.pairs ||= new Map();
    for (const [k, v] of this.pairs) if (v.exp < now) this.pairs.delete(k);
    const code = url.searchParams.get('code');
    if (req.method === 'POST' && !code) {                              // téléphone : publie sa clé (et son type), reçoit un code
      const text = Number(req.headers.get('Content-Length') || 0) > 4096 ? '' : await req.text().catch(() => '');
      let body = null;
      try { body = text.length <= 4096 ? JSON.parse(text) : null; } catch { /* illisible */ }
      if (!pairKey(body?.pub)) return json({ error: 'Clé invalide' }, 400);
      // 300 codes en attente pour tout le monde, 5 par adresse : une seule ne bloque pas l'appairage des autres
      const ip = callerIp(req) || '?';
      if ([...this.pairs.values()].filter((v) => v.ip === ip).length >= 5) return json({ error: 'Trop de codes en attente, réessayez dans 3 minutes' }, 429);
      if (this.pairs.size >= 300) return json({ error: 'Réessayez dans un instant' }, 503);
      let c, n = 0;
      do { c = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0'); } while (this.pairs.has(c) && ++n < 30);
      this.pairs.set(c, { pub: body.pub, kind: body.kind === 'browser' ? 'browser' : 'phone', box: null, exp: now + 180e3, ip });
      return json({ code: c, ttl: 180 });
    }
    if (!/^\d{6}$/.test(code || '')) return json({ error: 'Code invalide' }, 400);
    const e = this.pairs.get(code);
    if (!e) return json({ error: 'Code expiré' }, 404);
    if (req.method === 'GET' && url.searchParams.has('claim')) {       // téléphone : récupère la connexion déposée
      if (!e.box) return new Response(null, { status: 204 });
      this.pairs.delete(code);
      return json(e.box);
    }
    if (req.method === 'GET') return json({ pub: e.pub, kind: e.kind }); // ordinateur : lit la clé (téléphone ou navigateur)
    if (req.method === 'PUT') {                                        // ordinateur : dépose la connexion chiffrée
      const body = await req.json().catch(() => null);
      if (!pairKey(body?.spub) || typeof body?.iv !== 'string' || body.iv.length > 32 || typeof body?.data !== 'string' || body.data.length > 16384) return json({ error: 'Données invalides' }, 400);
      e.box = { spub: body.spub, iv: body.iv, data: body.data };
      return json({ ok: true });
    }
    return json({ error: 'Méthode non permise' }, 405);
  }

  // Appareils actuellement reliés à ce relais (liste des appareils du Studio) : type d'appareil et depuis quand
  clientList() {
    const now = Date.now();
    return { count: this.clients.size, authenticated: !!this.userToken, devices: [...this.clients].map((c) => ({ ua: c.ua || 'Appareil', since: Math.max(0, Math.round((now - (c.since || now)) / 1000)) })).sort((a, b) => b.since - a.since) };
  }

  // Connexion F1 TV d'un appareil : acceptée seulement si elle est de ce compte (son empreinte est le nom du relais).
  // L'appareil reçoit alors le direct ; le relais garde la connexion qui expire le plus tard pour parler à la F1
  async auth(t, ws = null) {
    const token = f1tvToken(t);
    if (!token || `u:${await relayId(token)}` !== this.name) return;
    if (ws && !ws.ok) {
      ws.ok = true;
      try { ws.serializeAttachment?.({ ...(ws.deserializeAttachment?.() || {}), ok: true }); } catch { /* sans hibernation */ }
      this.hello(ws, ws.from || 0);
    }
    if (token === this.userToken || (this.userToken && payload(token).exp <= payload(this.userToken).exp)) return;
    const first = !this.userToken;
    this.userToken = token;
    if (first) this.connect();                                   // en attente de la connexion : on y va
    else if (!this.status.authenticated) { this.retry = 0; this.reconnectLater(); }   // nouvelle connexion (renouvelée)
  }

  // Son d'une radio de la séance de ce relais (archives F1) : accès libre, sinon avec la connexion F1 TV de
  // l'abonné ; une autre adresse est refusée sans rien demander à la F1
  async radio(rel) {
    const path = this.base.state.SessionInfo?.Path;
    if (!path || !rel.startsWith(path) || !/^\d{4}\/[\w\-./]+\.(mp3|m4a|aac)$/i.test(rel) || rel.includes('..')) return new Response(null, { status: 404 });
    let res = await fetch(ARCHIVE + rel, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (res && (res.status === 401 || res.status === 403) && this.userToken) res = await fetch(ARCHIVE + rel, { headers: { 'User-Agent': UA, Authorization: `Bearer ${this.userToken}`, ascendontoken: this.userToken } }).catch(() => null);
    return res?.status === 200 ? new Response(res.body) : new Response(null, { status: 404 });
  }

  // Séance en cours ou qui vient de finir (page du créateur : la F1 ne l'ajoute à l'index de la saison que bien
  // après le drapeau à damier). Relais à l'arrêt : une connexion courte, fermée une minute après
  // wake : relais à l'arrêt rallumé (Studio, avec le code créateur) ; sinon le dernier état connu, live = relais en marche
  async session(wake = false, wait = 10000) {
    if (!this.base.t && !wake) return null;
    if (!this.base.t) {
      this.start();
      if (!this.clients.size && !this.idle) this.idle = setTimeout(() => this.stop(), IDLE_MS);
      for (let n = 0; n < wait / 250 && !this.base.t; n++) await new Promise((r) => setTimeout(r, 250));
    }
    const info = this.base.state.SessionInfo;
    if (!info?.Path) return null;
    let status = this.base.state.SessionStatus?.Status || info.SessionStatus || null;
    for (const [topic, data] of this.recent) if (topic === 'SessionStatus' && data?.Status) status = data.Status;
    return { path: info.Path, name: info.Name, type: info.Type, gp: info.Meeting?.Name, country: info.Meeting?.Country?.Code, endDate: info.EndDate, gmtOffset: info.GmtOffset, status, live: !!this.active };
  }

  // État courant de la séance demandée (Studio : résultats d'une séance qui vient de finir, avant l'archive de la
  // F1). Le direct garde l'état final jusqu'à la séance suivante : relais rallumé s'il est à l'arrêt
  async state(path) {
    const s = await this.session(true);
    if (!path || s?.path !== path) return null;
    const state = structuredClone(this.base.state);
    const derived = structuredClone(this.base.derived);
    for (const [topic, data, t] of this.recent) applyEvent(state, derived, topic, data, t);
    return state;
  }

  send(ws, str) {
    if (!ws.ok && this.name.startsWith('u:')) return;   // appareil pas encore reconnu sur le relais d'un abonné
    try { ws.send(str); } catch { this.drop(ws); }
  }

  broadcast(str) {
    for (const ws of this.clients) this.send(ws, str);
  }

  // Arrivée d'un navigateur (ou nouvelle séance pour tous) : état de base, messages depuis et GPS depuis from. Sans les
  // messages pas encore envoyés à tous (out, outStream : la fin de recent et de stream) : le prochain envoi groupé les
  // lui apporte, sinon il les appliquerait deux fois (une fin de tour en double effaçait les secteurs 1 et 2 du tour)
  hello(ws, from = 0) {
    const events = this.recent.slice(0, this.recent.length - this.out.length);
    const stream = this.stream.slice(0, this.stream.length - this.outStream.length).filter((s) => s[2] >= from);
    const str = JSON.stringify({ type: 'hello', now: Date.now(), keep: KEEP_MS, status: this.status, base: this.base, events, stream });
    if (ws) this.send(ws, str); else this.broadcast(str);
  }

  streamBetween(from, to) {
    return this.stream.filter((s) => s[2] >= from && s[2] < to);
  }

  drop(ws) {
    if (this.clients.delete(ws)) {
      for (const k of ws.nets || []) {
        const n = (this.ips.get(k) || 1) - 1;
        if (n > 0) this.ips.set(k, n); else this.ips.delete(k);
      }
    }
    if (!this.clients.size && !this.idle) this.idle = setTimeout(() => this.stop(), this.idleMs());
  }

  // Plus personne : délai avant de fermer la connexion à la F1. Pendant une séance, un appareil qui revient
  // (appli quittée, téléphone en veille) retrouve l'historique au lieu d'attendre tout son délai TV ; sinon une minute
  idleMs() {
    let status = this.base?.state?.SessionStatus?.Status;
    for (const [topic, data] of this.recent) if (topic === 'SessionStatus' && data?.Status) status = data.Status;
    return this.base?.t && status && !['Ends', 'Finalised'].includes(status) ? LIVE_IDLE_MS : IDLE_MS;
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
    this.resting = false;
    this.status.rest = false;
    this.timers.push(setInterval(() => this.flush(), 250));
    this.timers.push(setInterval(() => { this.roll(); if (this.clients.size) this.sleepUntilNext().catch(() => {}); }, 10000));
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

  // utc : heure d'émission par la F1 (chronométrage), transmise aux navigateurs avec l'événement
  add(topic, data, t, utc) {
    const e = utc ? [topic, data, t, utc] : [topic, data, t];
    this.recent.push(e);
    this.out.push(e);
  }

  addStream(topic, raw, t) {
    if (typeof raw !== 'string') return;
    const s = [topic, raw, t];
    this.stream.push(s);
    this.outStream.push(s);
  }

  // La F1 n'envoie le direct avec GPS qu'à une connexion par compte F1 TV : la dernière ouverte (appli, autre
  // navigateur) coupe l'autre. Deux coupures en 5 min : le GPS reste à l'autre appareil et ce relais repasse sans
  // F1 TV (chronos, positions estimées) au lieu de le lui reprendre sans fin. here() le reprend ici
  lost(token, now = Date.now()) {
    if (!token) return;
    this.losses = [...(this.losses || []).filter((t) => now - t < 5 * 60e3), now];
    if (this.losses.length >= 2) { this.elsewhere = true; this.setStatus({ elsewhere: true }); }
  }

  here() {
    if (!this.elsewhere) return;
    this.elsewhere = false;
    this.losses = [];
    this.retry = 0;
    this.setStatus({ elsewhere: false });
    this.reconnectLater();
  }

  reconnectLater() {
    this.closeUp();
    if (!this.active) return;
    const wait = Math.min(30000, 1000 * 2 ** this.retry++);
    this.timers.push(setTimeout(() => this.connect(), wait));
  }

  async connect() {
    if (!this.active || this.up) return;
    // Relais d'un abonné : rien avant sa connexion F1 TV (message « auth » de sa page)
    if (this.name.startsWith('u:') && !this.userToken) return;
    try {
      const token = this.elsewhere ? null : this.userToken;
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
      this.status.f1tv = !!token;   // connexion F1 TV de l'abonné : GPS attendu dès que la séance roule
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
      ws.addEventListener('close', (ev) => {
        if (this.up !== ws) return;
        console.log(`[relais] direct F1 fermé (${ev.code}${ev.reason ? ` : ${ev.reason}` : ''})${token ? ', connexion F1 TV' : ''}`);
        this.setStatus({ connected: false, error: `Connexion fermée (${ev.code})` });
        this.lost(token);
        this.reconnectLater();
      });
      ws.addEventListener('error', () => { if (this.up === ws) { this.setStatus({ connected: false, error: 'Erreur de connexion' }); this.reconnectLater(); } });
      ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS);
      ws.send(JSON.stringify({ type: 1, invocationId: '1', target: 'Subscribe', arguments: [token ? LIVE_TOPICS : LIVE_TOPICS.filter((t) => !t.endsWith('.z'))] }) + RS);
      // Signe de vie toutes les 10 s ; plus rien depuis 60 s : nouvelle connexion
      clearInterval(this.beat);
      this.beat = setInterval(() => {
        if (Date.now() - last > 60000) { this.setStatus({ error: 'Plus de données depuis 60 s, reconnexion…' }); this.lost(token); this.reconnectLater(); return; }
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
      if (msg.error) { console.log(`[relais] abonnement refusé : ${msg.error}`); this.setStatus({ error: `Abonnement refusé par la F1 : ${msg.error}` }); return; }
      this.retry = 0;
      const result = msg.result || {};
      const key = result.SessionInfo?.Key ?? null;
      const snapshot = {};
      for (const [raw, value] of Object.entries(result)) if (!raw.endsWith('.z')) snapshot[topicName(raw)] = value;
      const authenticated = 'Position.z' in result || 'CarData.z' in result;
      // Diagnostic (infobulle du badge) : connexion F1 TV envoyée mais pas de GPS dans la réponse de la F1
      // (la F1 ne l'envoie qu'à une connexion par compte : le plus souvent un autre appareil avec une autre connexion)
      this.gpsWhy = this.token && !authenticated ? `La F1 n'envoie pas le GPS ici : votre compte F1 TV le reçoit sans doute sur un autre appareil (téléphone, autre navigateur, appli). Fermez-le, ou reliez-le à celui-ci avec « Connexion F1 TV » : avec la même connexion, les deux ont le GPS (${Object.keys(result).length} sujets reçus${this.gpsRetried === `${this.key}|${this.token}` ? ', déjà redemandé une fois' : ', nouvel essai une minute après la connexion'})` : null;
      // Nouvelle séance (ou première connexion) : on repart de cet état
      if (key !== this.key || !this.base.t) {
        this.resetData(key);
        this.base.t = now;
        applyEvent(this.base.state, this.base.derived, '__snapshot', snapshot, now);
        this.out = [];
        this.outStream = [];
        this.status = { connected: true, error: this.gpsWhy, session: label(result.SessionInfo), authenticated, f1tv: !!this.token, elsewhere: !!this.elsewhere };
        this.hello();
      } else {
        this.add('__snapshot', snapshot, now);
        this.setStatus({ connected: true, error: this.gpsWhy, authenticated });
      }
      for (const z of ['Position.z', 'CarData.z']) if (typeof result[z] === 'string') this.addStream(topicName(z), result[z], now);
    } else if (msg.type === 1 && msg.target === 'feed' && Array.isArray(msg.arguments)) {
      const [raw, data, utc] = msg.arguments;   // utc : heure d'émission par la F1
      if (typeof raw !== 'string') return;
      const topic = topicName(raw);
      if (raw.endsWith('.z')) {
        this.addStream(topic, data, now);
        if (!this.status.authenticated) { this.gpsWhy = null; this.setStatus({ authenticated: true, error: null }); }
        return;
      }
      if (topic === 'TimingData') this.lastTimingAt = now;
      // Nouvelle séance : GPS redemandé (l'autre appareil n'est peut-être plus là)
      if (topic === 'SessionInfo' && data?.Key && this.key && data.Key !== this.key) { this.elsewhere = false; this.losses = []; this.reconnectLater(); return; }
      this.add(topic, data, now, topic === 'TimingData' && typeof utc === 'string' ? utc : undefined);
    } else if (msg.type === 7) {
      console.log(`[relais] direct F1 fermé par la F1${msg.error ? ` : ${msg.error}` : ''}`);
      this.setStatus({ connected: false, error: msg.error ? `Fermé par la F1 : ${msg.error}` : 'Fermé par la F1' });
      this.lost(this.token);
      this.reconnectLater();
    }
  }
}

const label = (info) => (info ? [info.Meeting?.Name, info.Name].filter(Boolean).join(' — ') : null);

// Relais : le commun, ou celui d'un abonné F1 TV (?u= sur /live/ws, cookie « plu » pour ses radios)
const relay = (env, name) => env.LIVE.get(env.LIVE.idFromName(name));
const privateName = (id) => (/^[0-9a-f]{32}$/.test(id || '') ? `u:${id}` : null);
const cookieId = (req) => /(?:^|;\s*)plu=([0-9a-f]{32})(?:;|$)/.exec(req.headers.get('Cookie') || '')?.[1] || null;
const relaySeen = async (env, day, ip, name) => !!(await env.DB.prepare('SELECT n FROM ai_usage WHERE day = ?1').bind(`${day}|${ip}|live-${name}`).first());
const toRelay = (req, name, url = req.url) => { const r = new Request(url, req); r.headers.set('X-Relay', name); return r; };

// /live/ws : navigateur relié au relais commun, ou à son propre relais s'il a une connexion F1 TV. Relais
// d'abonné ouverts par une même adresse : 50 différents par jour au plus (chacun ouvre une connexion à la F1).
// Revenir sur un relais déjà ouvert dans la journée (coupure, mise à jour du serveur) n'est pas recompté
export async function liveSocket(req, env) {
  if (!env.LIVE) return new Response('Relais indisponible', { status: 503 });
  const name = privateName(new URL(req.url).searchParams.get('u'));
  if (name && env.DB) {
    const ip = callerIp(req), day = new Date().toISOString().slice(0, 10);
    if (ip && !(await relaySeen(env, day, ip, name).catch(() => true))) {
      if (!(await ipQuota(env, { key: 'live-relais', day, ip, limit: 50 }).catch(() => true))) return new Response('Trop de connexions aujourd\'hui', { status: 429 });
      await ipQuota(env, { key: `live-${name}`, day, ip, limit: 1 }).catch(() => null);
    }
  }
  return relay(env, name || 'f1').fetch(toRelay(req, name || 'f1'));
}

// Séance du relais commun (Studio, avec le code créateur : relais rallumé s'il est à l'arrêt)
export async function liveSession(env, wake = false) {
  if (!env.LIVE) return null;
  return (await relay(env, 'f1').fetch(new Request(`https://relay/session${wake ? '?wake=1' : ''}`, { headers: { 'X-Relay': 'f1' } }))).json();
}

// État final d'une séance qui vient de finir, d'après le direct (Studio, avant l'archive de la F1) ; null sinon
export async function liveState(env, path) {
  if (!env.LIVE) return null;
  return (await relay(env, 'f1').fetch(new Request(`https://relay/state?path=${encodeURIComponent(path || '')}`, { headers: { 'X-Relay': 'f1' } }))).json();
}

// Côté serveur (Studio, code créateur) : chiffre la connexion F1 TV du créateur (déjà dans son coffre) pour le
// téléphone qui a publié le code, et la dépose dans le même rendez-vous que la version web. Le Studio tient le
// rôle de l'ordinateur « émetteur ». Le rendez-vous ne voit que des clés publiques et un message chiffré.
export async function pairSend(env, code, token) {
  if (!env.LIVE || !/^\d{6}$/.test(code || '')) return { error: 'Code invalide' };
  if (!f1tvToken(token)) return { error: 'Connexion F1 TV absente ou expirée' };
  const box = relay(env, 'pair');
  const got = await box.fetch(new Request(`https://relay/pair?code=${code}`, { headers: { 'X-Relay': 'pair' } }));
  if (got.status !== 200) return { error: 'Code inconnu ou expiré' };
  const { pub } = await got.json();
  if (!pairKey(pub)) return { error: 'Code inconnu ou expiré' };
  const mine = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const theirs = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await crypto.subtle.deriveKey({ name: 'ECDH', public: theirs }, mine.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
  const data = b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  const j = await crypto.subtle.exportKey('jwk', mine.publicKey);
  const put = await box.fetch(new Request(`https://relay/pair?code=${code}`, { method: 'PUT', headers: { 'X-Relay': 'pair', 'Content-Type': 'application/json' }, body: JSON.stringify({ spub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y }, iv: b64(iv), data }) }));
  return put.status === 200 ? { ok: true } : { error: 'Échec de l\'envoi' };
}

// Son d'une radio d'équipe (chemin dans les archives F1), gardé un jour : demandé par le relais du visiteur
// (seulement une radio de la séance en cours ; avec sa connexion F1 TV s'il en a une). Octets, ou null
const ARCHIVE = 'https://livetiming.formula1.com/static/';
async function radioFile(env, req, rel) {
  if (!/^\d{4}\/[\w\-./]+\.(mp3|m4a|aac)$/i.test(rel) || rel.includes('..') || !env.LIVE) return null;
  const cache = caches.default;
  const ck = new Request(`https://live.cache/radio/${rel}`);
  const hit = await cache.match(ck);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const name = privateName(cookieId(req)) || 'f1';
  const res = await relay(env, name).fetch(new Request(`https://relay/radio?p=${encodeURIComponent(rel)}`, { headers: { 'X-Relay': name } })).catch(() => null);
  if (res?.status !== 200) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_AUDIO) return null;
  await cache.put(ck, new Response(bytes, { headers: { 'Cache-Control': 'public, max-age=86400' } }));
  return bytes;
}

// Partie demandée du son (Range : Safari lit l'audio par morceaux)
function audioResponse(req, bytes, rel) {
  const type = rel.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('Range') || '');
  if (!m || (!m[1] && !m[2])) return new Response(bytes, { headers });
  const n = bytes.length;
  let a = m[1] ? Number(m[1]) : Math.max(0, n - Number(m[2]));
  let b = m[1] && m[2] ? Math.min(Number(m[2]), n - 1) : n - 1;
  if (a >= n || a > b) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${n}` } });
  return new Response(bytes.slice(a, b + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${a}-${b}/${n}` } });
}

// /live/api/… : données de Paddock Live lues par la version web et par l'appli de bureau (son serveur local relaie
// /api/… ici) : saison, statistiques, pneus, records, météo, documents FIA, tracé du circuit (API MultiViewer,
// l'année demandée ou une des précédentes, gardé un jour), photos des pilotes ; son, texte et traduction des radios
// (transcription et traduction partagées du serveur, mêmes plafonds que l'appli) ; le reste n'existe pas en ligne
export async function liveApi(req, url, env = {}) {
  // Appairage d'un téléphone : relayé à l'instance « pair » du relais (boîte chiffrée, rien gardé ; voir pair())
  if (url.pathname === '/live/api/pair') {
    if (!env.LIVE) return json({ error: 'Indisponible' }, 503);
    const body = req.method === 'GET' ? undefined : await req.text();
    return relay(env, 'pair').fetch(new Request(`https://relay/pair${url.search}`, { method: req.method, headers: { 'X-Relay': 'pair', 'Content-Type': 'application/json' }, body }));
  }
  // Saison gardée par le serveur : servie telle quelle (la tâche planifiée la relit toutes les 30 min), la page n'attend
  // jamais Jolpica ; une saison finie n'est relue qu'une fois par semaine
  const kept = (year) => ({ maxAge: year < new Date().getUTCFullYear() ? 7 * 86400e3 : 6 * 3600e3 });
  // Calendrier (compte à rebours de la prochaine séance) : la saison gardée par le serveur, même forme que l'appli
  if (url.pathname === '/live/api/schedule' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year')), now = new Date().getUTCFullYear();
    if (!env.DB || ![now, now + 1].includes(year)) return json({ error: 'Année invalide' }, 400);
    const row = await seasonRow(env, year, kept(year)).catch(() => null);
    if (!row) return json({ error: 'Calendrier indisponible' }, 503);
    const races = row.v.races.map((r) => ({ round: r.round, name: r.name, locality: r.locality, country: r.country, circuitId: r.circuitId, lat: r.lat, lon: r.lon, sessions: r.sessions }));
    return json({ year, races }, 200, { 'Cache-Control': 'public, max-age=600' });
  }
  // Saison complète (résultats, classements) : écran « Pas de séance en direct » et espace Saison, même forme que
  // /api/season (avec l'année), depuis 2018 ; une saison finie n'est relue chez Jolpica qu'une fois par semaine
  // (année suivante aussi : calendrier publié avant la saison, lu par l'appli de bureau hors saison)
  if (url.pathname === '/live/api/season' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year')), now = new Date().getUTCFullYear();
    if (!env.DB || !Number.isInteger(year) || year < 2018 || year > now + 1) return json({ error: 'Année invalide' }, 400);
    const row = await seasonRow(env, year, kept(year)).catch((err) => ({ err }));
    return row.v ? json({ year, ...row.v }, 200, { 'Cache-Control': 'public, max-age=600' }) : json({ error: `Saison indisponible (${row.err?.message || row.err})` }, 503);
  }
  // Statistiques détaillées (archives des courses), calculées par le serveur : même forme que /api/season/stats
  if (url.pathname === '/live/api/season/stats' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year')), now = new Date().getUTCFullYear();
    if (!env.DB || !Number.isInteger(year) || year < 2018 || year > now) return json({ error: 'Année invalide' }, 400);
    return json(await seasonStatsWeb(env, year).catch((err) => ({ year, total: 0, done: 0, pending: false, races: [], error: err.message })));
  }
  // Évolutions techniques et éléments moteur (documents FIA), lus par le serveur : même forme que /api/season/fia
  if (url.pathname === '/live/api/season/fia' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year')), now = new Date().getUTCFullYear();
    if (!env.DB || !Number.isInteger(year) || year < 2018 || year > now) return json({ error: 'Année invalide' }, 400);
    return json(await seasonFiaWeb(env, year).catch((err) => ({ year, pending: false, done: 0, total: 0, events: [], error: err.message })));
  }
  // Championnat des casseurs : dégâts estimés de la saison (analytics/destructors.js) ; autre saison : liste vide
  if (url.pathname === '/live/api/season/destructors' && req.method === 'GET') {
    return json(await destructorsWeb(env, Number(url.searchParams.get('year'))), 200, { 'Cache-Control': 'public, max-age=600' });
  }
  // Évolutions techniques en français : traductions faites par le serveur en lisant les documents FIA
  if (url.pathname === '/live/api/translations' && req.method === 'GET') {
    return json(env.DB && url.searchParams.get('lang') === 'fr' ? await fiaTranslations(env).catch(() => ({})) : {}, 200, { 'Cache-Control': 'public, max-age=300' });
  }
  // Séances dans son agenda (bouton « Ajouter à mon agenda ») : fichier .ics d'un week-end ou de la saison, comme l'appli
  if (url.pathname === '/live/api/calendar.ics' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year')), now = new Date().getUTCFullYear(), round = Number(url.searchParams.get('round')) || null;
    if (!env.DB || !Number.isInteger(year) || year < 2018 || year > now) return json({ error: 'Année invalide' }, 400);
    const row = await seasonRow(env, year, kept(year)).catch(() => null);
    if (!row) return json({ error: 'Calendrier indisponible' }, 503);
    const alarm = Math.max(0, Math.min(120, Number(url.searchParams.get('alarm') ?? 15) || 0));
    return new Response(buildIcs(row.v.races, { year, round, alarmMin: alarm, lang: url.searchParams.get('lang') === 'en' ? 'en' : 'fr' }), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="f1-${year}${round ? `-manche-${round}` : ''}.ics"`, 'Cache-Control': 'no-store' },
    });
  }
  // Pronostics entre amis : la version web joue seulement dans un groupe en ligne (pages /p/), relayé comme par l'appli
  if (url.pathname === '/live/api/predictions' && req.method === 'GET') return json({ online: true });   // pas de pronostics gardés sur l'appareil
  if (url.pathname === '/live/api/predictions/online' && env.DB) {
    let g = url.searchParams.get('g') || '', body;
    if (req.method !== 'GET') { const { g: id, ...rest } = (await req.json().catch(() => null)) || {}; g = id || (req.method === 'POST' ? 'new' : ''); body = JSON.stringify(rest); }
    if (g !== 'new' && !GROUP_RE.test(g)) return json({ error: 'Groupe inconnu' }, 400);
    const p = new URL(`/p/api/${g}${req.method === 'GET' ? `?${new URLSearchParams({ year: url.searchParams.get('year') || '', tok: url.searchParams.get('tok') || '' })}` : ''}`, url);
    return pronosApi(new Request(p, { method: req.method, headers: { 'CF-Connecting-IP': req.headers.get('CF-Connecting-IP') || '' }, body }), env, p);
  }
  // Dernier état connu du relais commun, sans le rallumer (un appel public ne doit pas ouvrir de connexion à la F1)
  if (url.pathname === '/live/api/session' && req.method === 'GET') return json(await liveSession(env).catch(() => null));
  if (url.pathname === '/live/api/archive/file' && req.method === 'GET') {
    const rel = url.searchParams.get('p') || '';
    const bytes = await radioFile(env, req, rel);
    return bytes ? audioResponse(req, bytes, rel) : json({ error: 'Radio indisponible' }, 404);
  }
  if (url.pathname === '/live/api/radio-text' && req.method === 'GET') {
    if (!env.AI || !env.DB) return json({ error: 'Transcription indisponible' }, 503);
    const u = url.searchParams.get('u') || '';
    const bytes = u.startsWith(ARCHIVE) ? await radioFile(env, req, u.slice(ARCHIVE.length)) : null;
    if (!bytes) return json({ error: 'Radio invalide' }, 400);
    const hit = await cachedRadio(env, await audioHash(bytes));
    const r = hit || await transcribeRadio(env, bytes, undefined, callerIp(req));
    if (r.invalid) return json({ error: 'Fichier son invalide' }, 400);
    if (r.limited) return json({ error: 'Plafond du jour atteint' }, 503);
    return json({ text: r.text, d: r.d });
  }
  // Radios des caméras embarquées F1 TV (appli) : fenêtre de son retranscrite avec l'heure de chaque phrase
  if (url.pathname === '/live/api/radio-window' && req.method === 'POST') {
    if (!env.AI || !env.DB) return json({ error: 'Transcription indisponible' }, 503);
    if (Number(req.headers.get('Content-Length') || 0) > MAX_AUDIO) return json({ error: 'Trop volumineux' }, 413);
    const r = await transcribeWindow(env, new Uint8Array(await req.arrayBuffer()), undefined, callerIp(req));
    if (r.invalid) return json({ error: 'Fichier son invalide' }, 400);
    if (r.limited) return json({ error: 'Plafond du jour atteint' }, 429);
    return json(r);
  }
  if (url.pathname === '/live/api/translate' && req.method === 'POST') {
    if (!env.AI || !env.DB) return json({ error: 'Traduction indisponible' }, 503);
    const text = await req.text();
    if (text.length > 64 * 1024) return json({ error: 'Trop volumineux' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'JSON invalide' }, 400); }
    const r = cleanRequest(body);
    if (!r) return json({ error: 'Requête invalide' }, 400);
    const res = await translateBatch(env, r, undefined, callerIp(req));
    return json(res, res.limited ? 503 : 200);
  }
  // Document FIA (PDF) : fia.com l'envoie en téléchargement forcé ; relayé pour être affiché dans la page (visionneuse
  // de l'appli, pdf-view.js), gardé un jour. Seuls les fichiers de fia.com, comme /api/fia-pdf de l'appli
  if (url.pathname === '/live/api/fia-pdf' && req.method === 'GET') {
    let u = null;
    try { u = new URL(url.searchParams.get('url')); } catch { /* adresse invalide */ }
    if (u?.protocol !== 'https:' || u.hostname !== 'www.fia.com' || !u.pathname.startsWith('/system/files/') || !/\.pdf$/i.test(u.pathname)) return json({ error: 'Adresse de document FIA invalide' }, 400);
    const ck = new Request(`https://live.cache/fia${u.pathname}`);
    let res = await caches.default.match(ck);
    if (!res) {
      const r = await fetch(u.href, { headers: { 'User-Agent': 'Mozilla/5.0 (Paddock-Live web relay)' } }).catch(() => null);
      const bytes = r?.status === 200 ? new Uint8Array(await r.arrayBuffer()) : null;
      if (!bytes || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') return json({ error: 'Document FIA indisponible' }, 502);
      const name = decodeURIComponent(u.pathname.split('/').pop()).replace(/[^\w .-]/g, '_');
      res = new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'public, max-age=86400' } });
      await caches.default.put(ck, res.clone());
    }
    return res;
  }
  // Photos des pilotes : la F1 refuse les images appelées depuis l'appli ; relayées et gardées une semaine
  if (url.pathname === '/live/api/headshot') {
    const u = url.searchParams.get('u') || '';
    if (!validHeadshot(u)) return json({ error: 'Photo invalide' }, 400);
    const ck = new Request(`https://live.cache/headshot/${encodeURIComponent(u)}`);
    let res = await caches.default.match(ck);
    if (!res) {
      const r = await fetch(u, { headers: { 'User-Agent': UA } }).catch(() => null);
      const type = r?.headers.get('Content-Type') || '';
      if (r?.status !== 200 || !type.startsWith('image/')) return json({ error: 'Photo indisponible' }, 404);
      res = new Response(await r.arrayBuffer(), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' } });
      await caches.default.put(ck, res.clone());
    }
    return res;
  }
  // Pneus du week-end (onglet Pneus) : même forme que /api/tyres des anciennes applis
  if (url.pathname === '/live/api/tyres' && req.method === 'GET') {
    const p = url.searchParams.get('path') || '';
    if (!env.DB || !/^\d{4}\/[\w\-./]+\/$/.test(p)) return json({ error: 'Séance invalide' }, 400);
    const until = Number(url.searchParams.get('until')) || Date.now();
    const hint = Object.fromEntries(['name', 'location', 'country', 'session'].map((k) => [k, (url.searchParams.get(k) || '').slice(0, 80)]));
    return weekendTyres(env, p, until, hint).then((d) => json(d), (err) => json({ error: err.message }, /introuvable/i.test(err.message) ? 404 : 502));
  }
  // Pole et meilleur tour en course des éditions précédentes sur ce circuit (bandeau de l'Analyse)
  if (url.pathname === '/live/api/records' && req.method === 'GET') {
    const key = Number(url.searchParams.get('key')), year = Number(url.searchParams.get('year'));
    if (!env.DB || !circuitKey(key) || !Number.isInteger(year) || year < 2018 || year > new Date().getUTCFullYear() + 1) return json({ error: 'Paramètres invalides' }, 400);
    return json(await circuitRecords(env, key, year), 200, { 'Cache-Control': 'public, max-age=3600' });
  }
  // Météo prévue sur un circuit (accueil, onglet Météo), gardée 30 min par endroit (Open-Meteo limite les demandes)
  if (url.pathname === '/live/api/forecast' && req.method === 'GET') {
    const lat = url.searchParams.get('lat'), lon = url.searchParams.get('lon');
    const ck = new Request(`https://live.cache/forecast/${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`);
    const hit = await caches.default.match(ck);
    if (hit) return hit;
    let days;
    try { days = await forecast(lat, lon); } catch (err) { return json({ error: err.message }, /Coordonnées/.test(err.message) ? 400 : 502); }
    const res = json({ days, tz: days.tz, current: days.current, hours: days.hours || [] }, 200, { 'Cache-Control': 'public, max-age=1800' });
    await caches.default.put(ck, res.clone());
    return res;
  }
  // Documents officiels de la FIA d'un Grand Prix (documents des commissaires du direct)
  if (url.pathname === '/live/api/fia-docs' && req.method === 'GET') {
    const year = Number(url.searchParams.get('year')), name = url.searchParams.get('name');
    if (!Number.isInteger(year) || year < 2018 || !name) return json({ error: 'Paramètres year et name requis' }, 400);
    const meeting = { name, country: url.searchParams.get('country'), location: url.searchParams.get('location') };
    return fiaDocsWeb(year, meeting).then((d) => json(d), (err) => json({ error: err.message }, 502));
  }
  // Zones du mode dépassement, boucles de chronométrage (mini-secteurs) et profil d'altitude (carte 3D : z de chaque
  // point du tracé de /live/api/circuit, 1/10 m) du circuit, calculés par le serveur
  if (['/live/api/zones', '/live/api/loops', '/live/api/elevation'].includes(url.pathname) && req.method === 'GET') {
    const key = Number(url.searchParams.get('key')), year = Number(url.searchParams.get('year'));
    if (!env.DB || !circuitKey(key) || !Number.isInteger(year) || year < 2018 || year > new Date().getUTCFullYear() + 1) return json({ error: 'Paramètres invalides' }, 400);
    const d = await zonesWeb(env, url.pathname.slice(10), key, year);
    return d ? json(d, 200, { 'Cache-Control': 'public, max-age=3600' }) : json({ error: 'Pas encore calculé par le serveur', pending: true }, 404);
  }
  // Alentours du circuit (vue 3D : relief du terrain, bâtiments, bois, eau, routes d'OSM), calculés par le serveur
  if (url.pathname === '/live/api/surroundings' && req.method === 'GET') {
    const key = Number(url.searchParams.get('key')), year = Number(url.searchParams.get('year'));
    if (!env.DB || !env.MEDIA || !circuitKey(key) || !Number.isInteger(year) || year < 2018 || year > new Date().getUTCFullYear() + 1) return json({ error: 'Paramètres invalides' }, 400);
    const obj = await surroundingsWeb(env, key, year);
    return obj ? new Response(obj.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })
      : json({ error: 'Pas encore calculé par le serveur', pending: true, last: await surroundingsStatus(env, key, year) }, 404);
  }
  if (url.pathname === '/live/api/circuit') {
    const key = Number(url.searchParams.get('key')), year = Number(url.searchParams.get('year'));
    if (!Number.isInteger(key) || !Number.isInteger(year)) return json({ error: 'Paramètres invalides' }, 400);
    const d = await circuitData(key, year);
    return d ? json(d, 200, { 'Cache-Control': 'public, max-age=86400' }) : json({ error: 'Tracé introuvable' }, 404);
  }
  return json({ error: 'Pas disponible dans la version web' }, 404);
}

// Numéro de circuit de la F1 (10 Albert Park… 152 Las Vegas) : les numéros inventés au-delà sont refusés (chacun
// demanderait un calcul des zones ou une lecture des archives). Pas la seule liste du calendrier (shared/circuits-info.js) :
// les replays des saisons passées et les nouveaux circuits ont d'autres numéros
const circuitKey = (k) => Number.isInteger(k) && k > 0 && k <= 300;

const json = (d, status = 200, headers = {}) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// Clé publique ECDH (P-256) valable en apparence : le serveur ne s'en sert pas, il la relaie seulement
const pairKey = (k) => !!k && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string' && k.x.length <= 64 && k.y.length <= 64;

// Nom court d'un appareil d'après son User-Agent (liste des appareils du Studio)
function shortUA(ua = '') {
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const br = /Edg/.test(ua) ? 'Edge' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return br ? `${br} sur ${os}` : os;
}

// Appareils reliés au compte F1 TV du créateur (Studio) : connexions en cours sur son relais privé
export async function liveDevices(env, token) {
  const id = f1tvToken(token) ? await relayId(token) : null;
  if (!env.LIVE || !id) return { count: 0, devices: [] };
  const name = `u:${id}`;
  return (await relay(env, name).fetch(new Request('https://relay/clients', { headers: { 'X-Relay': name } }))).json();
}
