// Accès depuis un téléphone ou une tablette du réseau local. Désactivé par défaut : une fois
// activé (Réglages → Application), un second serveur écoute sur toutes les interfaces, sur un
// port fixe. Il est protégé par une clé secrète contenue dans l'adresse du QR code. Le premier
// passage avec la clé dépose un cookie, puis l'appareil reste autorisé. Les appareils sans la
// clé sont refusés, et les réglages de cet accès ne sont modifiables que depuis l'ordinateur.
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import qrcode from 'qrcode-generator';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, saveConfig, ROOT } from './config.js';
import { localHost } from './guard.js';

const COOKIE = 'paddock_key';
const DEFAULT_PORT = 3030;

export const isLoopback = (addr) => /^(127\.|::1$|::ffff:127\.)/.test(String(addr || ''));

export function newKey() {
  // 10 caractères faciles à recopier (sans 0/O ni 1/I/l)
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), (b) => abc[b % abc.length]).join('');
}

function cookieKey(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : null;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Requête autorisée : depuis cet ordinateur (adresse locale demandée : pas un site extérieur qui se fait passer
// pour 127.0.0.1, « DNS rebinding »), ou avec la bonne clé (cookie ou ?k=)
export function authorized(req, key) {
  if (isLoopback(req.socket.remoteAddress) && localHost(req.headers.host)) return true;
  if (!key) return false;
  if (safeEqual(cookieKey(req), key)) return true;
  const k = new URL(req.url, 'http://x').searchParams.get('k');
  return safeEqual(k, key);
}

// Adresses IPv4 de cet ordinateur sur le réseau local (les plus probables d'abord)
export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      const score = /^192\.168\./.test(a.address) ? 0 : /^10\./.test(a.address) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : 3;
      const virtual = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier/i.test(name) ? 1 : 0;
      out.push({ address: a.address, name, score: score + virtual * 5 });
    }
  }
  return out.sort((a, b) => a.score - b.score).map(({ address, name }) => ({ address, name }));
}

export function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

const DENIED = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Paddock Live</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#ddd;font:16px system-ui,sans-serif;text-align:center;padding:24px}b{color:#fff}</style></head>
<body><div><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2"/></svg><p><b>Accès protégé</b></p><p>Scannez le QR code affiché sur l'ordinateur dans Paddock Live :<br>Réglages, onglet Application, rubrique « Sur votre téléphone ou tablette ».</p><p style="color:#999;font-size:14px">Appli déjà ajoutée à l'écran d'accueil (la clé a peut-être été changée) : supprimez-la, rescannez le QR code, puis ajoutez-la de nouveau.</p></div></body></html>`;

// handler(req, res) : le même que le serveur principal ; onSocket(ws) : client WebSocket
export function createLan({ handler, onSocket }) {
  let server = null;
  let wss = null;
  let state = { running: false, port: null, error: null };

  const conf = () => {
    const c = getConfig();
    if (!c.lanKey) saveConfig({ lanKey: newKey() });
    return { enabled: !!getConfig().lanEnabled, key: getConfig().lanKey, port: Number(getConfig().lanPort) || DEFAULT_PORT };
  };

  function onRequest(req, res) {
    const { key } = conf();
    if (!authorized(req, key)) {
      const api = req.url.startsWith('/api/');
      res.writeHead(401, { 'Content-Type': api ? 'application/json' : 'text/html; charset=utf-8' });
      res.end(api ? JSON.stringify({ error: 'Accès protégé' }) : DENIED);
      return;
    }
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.has('k')) {
      // Première visite avec la clé : cookie (1 an), puis adresse sans la clé
      url.searchParams.delete('k');
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE}=${encodeURIComponent(key)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
        Location: url.pathname + (url.search || ''),
      });
      res.end();
      return;
    }
    // iPhone : l'appli ajoutée à l'écran d'accueil n'a pas les cookies de Safari ; elle démarre
    // donc avec la clé dans l'adresse (qui dépose le cookie dans son propre stockage)
    if (url.pathname === '/manifest.webmanifest') {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.webmanifest'), 'utf8'));
        m.start_url = `/?k=${encodeURIComponent(key)}`;
        res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(m));
        return;
      } catch { /* manifeste d'origine */ }
    }
    // Les réglages de l'accès réseau ne se font que depuis l'ordinateur lui-même
    if (url.pathname.startsWith('/api/lan')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Réglage disponible uniquement sur l\'ordinateur' }));
      return;
    }
    handler(req, res);
  }

  function start() {
    if (server) return;
    const { port } = conf();
    server = http.createServer(onRequest);
    wss = new WebSocketServer({
      server, path: '/ws', perMessageDeflate: { threshold: 4096 },
      verifyClient: ({ req }) => authorized(req, conf().key),
    });
    wss.on('connection', onSocket);
    server.on('error', (err) => {
      state = { running: false, port, error: err.code === 'EADDRINUSE' ? `le port ${port} est déjà utilisé` : err.message };
      server = null;
      wss = null;
    });
    server.listen(port, '0.0.0.0', () => {
      state = { running: true, port, error: null };
      console.log(`  Accès réseau local actif sur le port ${port}`);
    });
  }

  function stop() {
    if (!server) return;
    for (const c of wss?.clients || []) c.terminate();
    wss?.close();
    server.close();
    server.closeAllConnections?.();
    server = null;
    wss = null;
    state = { running: false, port: null, error: null };
  }

  function info() {
    const { enabled, key, port } = conf();
    const addrs = lanAddresses();
    const urls = addrs.map((a) => ({ ...a, url: `http://${a.address}:${port}/?k=${key}` }));
    return { enabled, running: state.running, error: state.error, port, key, urls, qr: urls[0] ? qrSvg(urls[0].url) : null };
  }

  function set({ enabled, regenerate, port }) {
    if (typeof port === 'number' && port >= 1024 && port <= 65535) saveConfig({ lanPort: port });
    if (regenerate) {
      saveConfig({ lanKey: newKey() });
      // Les appareils déjà autorisés doivent rescanner le QR code
      for (const c of wss?.clients || []) c.terminate();
    }
    if (typeof enabled === 'boolean') saveConfig({ lanEnabled: enabled });
    stop();
    if (conf().enabled) start();
    return new Promise((r) => setTimeout(() => r(info()), 300));
  }

  if (conf().enabled) start();
  return { info, set, stop };
}
