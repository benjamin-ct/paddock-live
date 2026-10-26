// Client du flux officiel F1 Live Timing (SignalR Core, protocole JSON).
// Sans jeton F1 TV : chronos, drapeaux, météo, direction de course, radios...
// Avec un jeton F1 TV : en plus les positions GPS (Position.z) et la télémétrie (CarData.z).
import { WebSocket } from 'ws';
import { agent, request, USER_AGENT } from './net.js';
import { LIVE_TOPICS, topicName } from '../shared/f1.js';
import { readRecording } from './recorder.js';
import { PROBE_TOPICS, isProbe, probeAnswer, probeFeed } from './feed-probe.js';

const BASE = 'https://livetiming.formula1.com/signalrcore';
const WS_URL = 'wss://livetiming.formula1.com/signalrcore';
const RS = '\x1e';

export class LiveSource {
  constructor(hub, getToken, recorder = null) {
    this.hub = hub;
    this.getToken = getToken;
    this.recorder = recorder;
    this.pending = null; // messages reçus pendant la relecture de l'enregistrement
    this.ws = null;
    this.active = false;
    this.retry = 0;
    this.timers = [];
    this.lastMessageAt = 0;
    this.status = { connected: false, error: null, authenticated: false };
    this.losses = [];        // connexions avec F1 TV coupées (5 dernières minutes)
    this.elsewhere = false;  // GPS laissé à un autre appareil du même compte F1 TV
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.hub.reset({ mode: 'live', label: 'Live', ...this.status });
    this.connect();
  }

  stop() {
    this.active = false;
    this.cleanup();
    this.recorder?.close();
  }

  restart() {
    this.cleanup();
    if (this.active) this.connect();
  }

  cleanup() {
    for (const t of this.timers) clearInterval(t), clearTimeout(t);
    this.timers = [];
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.on('error', () => {});
      try { this.ws.terminate(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.connectedAt = 0;
    this.setStatus({ connected: false });
  }

  setStatus(patch) {
    Object.assign(this.status, patch);
    if (this.hub.source.mode === 'live') Object.assign(this.hub.source, this.status);
  }

  // La F1 n'envoie le direct avec GPS qu'à une connexion par compte F1 TV : la dernière ouverte (version web, autre
  // ordinateur) coupe l'autre. Deux coupures en 5 min : le GPS reste à l'autre appareil et celle-ci repasse sans
  // F1 TV (chronos, positions estimées) au lieu de le lui reprendre sans fin. here() le reprend ici
  lost(token, now = Date.now()) {
    if (!token) return;
    this.losses = [...this.losses.filter((t) => now - t < 5 * 60e3), now];
    if (this.losses.length >= 2) { this.elsewhere = true; this.setStatus({ elsewhere: true }); }
  }

  here() {
    this.elsewhere = false;
    this.losses = [];
    this.retry = 0;
    this.setStatus({ elsewhere: false });
    this.restart();
  }

  // Séance en cours (chronos reçus), jeton F1 TV présent, mais pas de GPS une minute après la connexion :
  // nouvelle connexion, une fois par séance et par jeton. La F1 n'envoie pas le GPS à une connexion ouverte
  // avant le début de la séance, ni à une connexion faite sans jeton (expiré au lancement, renouvelé ensuite)
  gpsRetry(now = Date.now()) {
    const token = this.getToken();
    if (this.elsewhere || !token || this.status.authenticated || !this.connectedAt || now - this.connectedAt < 60000 || now - (this.lastTimingAt || 0) > 30000) return false;
    const key = `${this.hub.sessionKey}|${token}`;
    if (this.gpsRetried === key) return false;
    this.gpsRetried = key;
    return true;
  }

  scheduleReconnect() {
    if (!this.active) return;
    this.cleanup();
    const wait = Math.min(30000, 1000 * 2 ** this.retry++);
    this.timers.push(setTimeout(() => this.connect(), wait));
  }

  async connect() {
    if (!this.active) return;
    const token = this.elsewhere ? null : this.getToken();
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const res = await request(`${BASE}/negotiate?negotiateVersion=1`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Length': '0' },
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(token ? 'Jeton F1 TV refusé (expiré ?)' : `Accès refusé (${res.status})`);
      }
      if (res.status !== 200) throw new Error(`Négociation SignalR : HTTP ${res.status}`);
      const neg = JSON.parse(res.body.toString('utf8'));
      const cookies = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
      const id = neg.connectionToken || neg.connectionId;
      if (!this.active) return;

      const ws = new WebSocket(`${WS_URL}?id=${encodeURIComponent(id)}`, {
        agent,
        headers: { 'User-Agent': USER_AGENT, ...(cookies ? { Cookie: cookies } : {}), ...authHeaders },
        handshakeTimeout: 15000,   // connexion bloquée (Wi-Fi d'hôtel, sortie de veille) : erreur, donc nouvel essai
      });
      this.ws = ws;
      this.token = token;   // jeton de cette connexion (aucun : sans F1 TV)
      let buffer = '';

      ws.on('open', () => {
        ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS);
        ws.send(JSON.stringify({ type: 1, invocationId: '1', target: 'Subscribe', arguments: [LIVE_TOPICS] }) + RS);
        this.lastMessageAt = Date.now();
        this.setStatus({ stale: false });
        this.timers.push(setInterval(() => {
          if (this.gpsRetry()) { this.restart(); return; }
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 6 }) + RS);
          // Données figées depuis 25 s : signalé (badge « LIVE » en orange) avant la reconnexion des 60 s
          if (Date.now() - this.lastMessageAt > 25000 && !this.status.stale) this.setStatus({ stale: true });
          if (Date.now() - this.lastMessageAt > 60000) {
            this.setStatus({ error: 'Plus de données depuis 60 s, reconnexion…' });
            this.lost(token);
            this.scheduleReconnect();
          }
        }, 10000));
      });

      ws.on('message', (data) => {
        this.lastMessageAt = Date.now();
        if (this.status.stale) this.setStatus({ stale: false });
        buffer += data.toString();
        let idx;
        while ((idx = buffer.indexOf(RS)) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (frame) this.onFrame(frame);
        }
      });

      ws.on('close', (code) => {
        this.setStatus({ connected: false, error: `Connexion fermée (${code}), reconnexion…` });
        this.lost(token);
        this.scheduleReconnect();
      });
      ws.on('error', (err) => {
        this.setStatus({ connected: false, error: err.message });
        this.scheduleReconnect();
      });
    } catch (err) {
      this.setStatus({ connected: false, error: err.message });
      this.scheduleReconnect();
    }
  }

  onFrame(frame) {
    let msg;
    try { msg = JSON.parse(frame); } catch { return; }
    const now = Date.now();
    if (msg.type === 3 && msg.invocationId === '1') {
      if (msg.error) {
        this.setStatus({ error: `Abonnement refusé : ${msg.error}` });
        return;
      }
      this.retry = 0;
      this.session = sessionLabel(msg.result?.SessionInfo);
      this.onSnapshot(msg.result || {}, now);
      // À part, une fois la séance connue : flux cachés testés (diagnostic des données F1)
      this.ws?.send(JSON.stringify({ type: 1, invocationId: '2', target: 'Subscribe', arguments: [PROBE_TOPICS] }) + RS);
    } else if (msg.type === 3 && msg.invocationId === '2') {
      probeAnswer(msg.result, msg.error, this.session);
    } else if (msg.type === 1 && msg.target === 'feed' && Array.isArray(msg.arguments)) {
      const [rawTopic, data, utc] = msg.arguments;   // utc : heure d'émission par la F1
      this.onFeed(rawTopic, data, now, utc);
    } else if (msg.type === 7) {
      this.setStatus({ error: msg.error ? `Fermé par le serveur : ${msg.error}` : 'Fermé par le serveur' });
      this.lost(this.token);
      this.scheduleReconnect();
    }
  }

  onSnapshot(result, now) {
    const key = result.SessionInfo?.Key ?? null;
    if (this.hub.sessionKey !== null && key !== null && key !== this.hub.sessionKey) {
      this.hub.reset({ mode: 'live', label: 'Live', ...this.status });
    }
    const fresh = this.hub.sessionKey === null && this.hub.events.length === 0;
    if (key !== null) this.hub.sessionKey = key;
    const file = this.recorder && result.SessionInfo ? this.recorder.open(result.SessionInfo) : null;

    const apply = () => {
      const snapshot = {};
      for (const [rawTopic, value] of Object.entries(result)) {
        const topic = topicName(rawTopic);
        if (rawTopic.endsWith('.z')) this.addStream(topic, value, now);
        else snapshot[topic] = value;
      }
      this.addEvent('__snapshot', snapshot, now);
      const authenticated = 'Position.z' in result || 'CarData.z' in result;
      this.connectedAt = now;
      this.setStatus({ connected: true, error: null, authenticated });
      this.hub.source.session = sessionLabel(result.SessionInfo);
    };

    if (fresh && file) {
      // Redémarrage pendant une session : on recharge l'historique enregistré
      // avant d'y ajouter les nouveaux messages (le délai TV reste exact).
      this.pending = [];
      readRecording(file).then(({ events, stream }) => {
        if (events.length || stream.length) {
          this.hub.preload(events, stream);
          this.hub.source.restored = events.length;
          console.log(`[live] ${events.length} messages rechargés depuis l'enregistrement local`);
        }
      }).catch((err) => console.warn('[live] relecture impossible :', err.message)).finally(() => {
        apply();
        const queued = this.pending || [];
        this.pending = null;
        for (const [rawTopic, data, t, utc] of queued) this.onFeed(rawTopic, data, t, utc);
      });
      return;
    }
    apply();
  }

  addEvent(topic, data, t, utc) {
    this.hub.addEvent(topic, data, t, utc);
    this.recorder?.write(t, topic, data);
  }

  addStream(topic, raw, t) {
    this.hub.addStream(topic, raw, t);
    this.recorder?.write(t, topic, raw, true);
  }

  // utc : heure d'émission du message par la F1, gardée pour le chronométrage (positions estimées sans GPS)
  onFeed(rawTopic, data, now, utc) {
    if (isProbe(rawTopic)) { probeFeed(rawTopic, data); return; }
    if (this.pending) { this.pending.push([rawTopic, data, now, utc]); return; }
    const topic = topicName(rawTopic);
    if (topic === 'TimingData') this.lastTimingAt = Date.now();   // séance en cours (statistiques)
    if (rawTopic.endsWith('.z')) {
      this.addStream(topic, data, now);
      if (!this.status.authenticated) this.setStatus({ authenticated: true });
      return;
    }
    if (topic === 'SessionInfo' && data?.Key && this.hub.sessionKey && data.Key !== this.hub.sessionKey) {
      // Nouvelle session : on repart d'un état propre, GPS redemandé (l'autre appareil n'est peut-être plus là)
      this.elsewhere = false;
      this.losses = [];
      this.status.elsewhere = false;
      this.hub.reset({ mode: 'live', label: 'Live', ...this.status });
      this.restart();
      return;
    }
    this.addEvent(topic, data, now, topic === 'TimingData' && typeof utc === 'string' ? utc : undefined);
  }
}

export function sessionLabel(info) {
  if (!info) return null;
  return [info.Meeting?.Name, info.Name].filter(Boolean).join(' — ');
}
