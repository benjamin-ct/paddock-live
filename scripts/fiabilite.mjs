// Tests de fiabilité sur de vraies séances (archives F1, compte F1 TV de config.json ou F1TV_TOKEN) :
//   node scripts/fiabilite.mjs [chemin d'archive…] [--appli] [--web] [--vitesse=30] [--minutes=3]
// Sans chemin : la dernière course, la dernière qualification et la dernière course sprint de la saison.
// 1. Moteur : chaque message de la séance appliqué comme dans l'appli (shared/derive.js) ; erreurs, temps de calcul et
//    vérifications (tours de chaque pilote dans l'ordre, tour du leader, positions finales, arrêts).
// 2. Version web : la même séance passée par le relais du Worker (analytics/live-relay.js) et le délai TV du navigateur
//    (web-hub.js), avec des spectateurs qui arrivent en cours de séance ; leur état final doit être celui de l'appli.
// 3. --appli : serveur local sans rien envoyer au Worker, l'appli dans le navigateur (écran principal et fenêtres
//    Circuit, Analyse, Duel) : gels de l'affichage mesurés une minute à vitesse réelle, puis replay accéléré pour
//    parcourir la séance ; erreurs de page relevées.
// 4. --web : la version web construite (scripts/build-studio.mjs) dans le navigateur, reliée à un relais local nourri
//    par l'archive à vitesse réelle (tracé du circuit lu sur le site en ligne, en lecture seule ; rien n'y est envoyé) :
//    écran principal et fenêtres (boutons du haut) ; données affichées, erreurs de page et gels relevés.
// Code de sortie 1 si un problème est trouvé. Ne se lance pas pendant une séance en direct (compte F1 TV partagé).
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { applyEvent, createDerived } from '../shared/derive.js';
import { realStopCount } from '../shared/pits.js';
import { LiveRelay } from '../analytics/live-relay.js';
import { WebHub } from '../analytics/live-page/web-hub.js';
import { loadArchive } from '../server/replay.js';
import { archiveJSON } from '../server/archive.js';
import { renew } from '../server/f1tv-auth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const problems = [];
const say = (s) => console.log(s);
const fail = (session, msg) => { problems.push(`${session} : ${msg}`); say(`  ✗ ${msg}`); };
const ok = (msg) => say(`  ✓ ${msg}`);
const T0 = 1.9e12;   // heure de réception fictive du premier message (mêmes horodatages pour l'appli et la version web)
const lines = (obj) => (Array.isArray(obj) ? obj.map((v, i) => [String(i), v]) : Object.entries(obj || {})).filter(([, v]) => v);

// Séances à rejouer
async function defaultSessions() {
  const year = new Date().getUTCFullYear();
  const idx = await archiveJSON(`${year}/Index.json`);
  const past = idx.Meetings.flatMap((m) => m.Sessions.filter((s) => s.Path && Date.parse(s.EndDate || s.StartDate) < Date.now() - 6 * 3600e3).map((s) => ({ ...s, meeting: m.Name })));
  const last = (pred) => past.filter(pred).at(-1);
  return [last((s) => s.Type === 'Race' && !/sprint/i.test(s.Name)), last((s) => s.Type === 'Qualifying' && !/sprint/i.test(s.Name)), last((s) => /sprint/i.test(s.Name) && s.Type === 'Race')]
    .filter(Boolean).map((s) => ({ path: s.Path.startsWith(`${year}/`) ? s.Path : `${year}/${s.Path}`, label: `${s.meeting} · ${s.Name}` }));
}

// 1. Moteur de l'appli
function engine(label, events) {
  const state = {}, derived = createDerived();
  let worst = 0, worstTopic = '', errors = 0;
  const t0 = performance.now();
  for (const e of events) {
    const a = performance.now();
    try { applyEvent(state, derived, e.topic, e.data, e.t); } catch (err) { if (errors++ < 3) fail(label, `message ${e.topic} refusé : ${err.message}`); }
    const d = performance.now() - a;
    if (d > worst) { worst = d; worstTopic = e.topic; }
  }
  const total = performance.now() - t0;
  say(`  ${events.length} messages en ${Math.round(total)} ms (le plus long : ${worst.toFixed(1)} ms, ${worstTopic})`);
  if (worst > 50) fail(label, `un message a pris ${Math.round(worst)} ms (${worstTopic}) : l'affichage gèlerait`);
  if (!errors) ok('aucun message refusé');

  // Tours de chaque pilote : numéros croissants, sans doublon
  let bad = 0;
  for (const [num, laps] of Object.entries(derived.laps)) {
    for (let i = 1; i < laps.length; i++) if (laps[i].lap <= laps[i - 1].lap) { if (bad++ < 3) fail(label, `pilote ${num} : tour ${laps[i].lap} après le tour ${laps[i - 1].lap}`); }
  }
  if (!bad) ok(`tours dans l'ordre pour ${Object.keys(derived.laps).length} pilotes`);
  // Positions finales : 1 à N, chacune une fois
  const pos = lines(state.TimingData?.Lines).map(([, l]) => Number(l.Position)).filter(Boolean).sort((a, b) => a - b);
  if (pos.length && pos.every((p, i) => p === i + 1)) ok(`positions finales 1 à ${pos.length}`);
  else fail(label, `positions finales incohérentes : ${pos.join(', ')}`);
  // Course : le leader a autant de tours enregistrés que la course (à un près : le tour de formation ou l'arrivée)
  const kind = state.SessionInfo?.Type;
  if (kind === 'Race') {
    const leader = lines(state.TimingData?.Lines).find(([, l]) => Number(l.Position) === 1)?.[0];
    const total = Number(state.LapCount?.CurrentLap) || 0, have = derived.laps[leader]?.length || 0;
    if (leader && Math.abs(total - have) <= 1) ok(`leader : ${have} tours enregistrés sur ${total}`);
    else fail(label, `leader ${leader} : ${have} tours enregistrés pour ${total} tours de course`);
    // Arrêts : ceux de l'historique des tours, pas plus que ceux comptés par l'appli (relais de pneus)
    let off = 0;
    for (const [num, l] of lines(state.TimingData?.Lines)) {
      const stops = realStopCount(state.TimingAppData?.Lines?.[num], l);
      if (typeof stops === 'number' && (stops < 0 || stops > 6)) { if (off++ < 3) fail(label, `pilote ${num} : ${stops} arrêts`); }
    }
    if (!off) ok('nombre d\'arrêts plausible pour chaque pilote');
  }
  return { state, derived };
}

// 2. Version web : relais + délai TV du navigateur, spectateurs arrivés en cours de route
function web(label, events, ref) {
  const DELAY = 5000;
  const relay = new LiveRelay({}, {});
  const viewers = [];
  const join = (now) => {
    const v = { msgs: [] };
    v.ws = { ok: true, send: (s) => v.msgs.push(s) };
    v.hub = new WebHub({ apply: applyEvent, reset: (m) => { v.state = m.state; v.derived = m.derived; }, batch: (m) => { for (const e of m.events) applyEvent(v.state, v.derived, ...e); } });
    relay.clients.add(v.ws);
    relay.hello(v.ws, now);
    viewers.push(v);
  };
  const pump = (now) => {
    relay.flush();
    for (const v of viewers) {
      for (const s of v.msgs.splice(0)) {
        const m = JSON.parse(s);   // comme sur le réseau : JSON
        if (m.type === 'hello') v.hub.hello(m); else if (m.type === 'evs') v.hub.push(m.events);
      }
      v.hub.tick(now - DELAY);
      v.hub.roll(now);
    }
  };
  const first = events.find((e) => e.topic === 'SessionInfo')?.data || {};
  relay.onFrame(JSON.stringify({ type: 3, invocationId: '1', result: { SessionInfo: first } }), T0);
  const end = events.at(-1).t - T0, joins = [0.05, 0.4, 0.8].map((f) => T0 + f * end);
  let next = 0, lastRoll = 0;
  for (const e of events) {
    const now = e.t;
    while (next < joins.length && e.t >= joins[next]) { join(now); next++; }
    relay.add(e.topic, e.data, now);
    if (now - lastRoll > 10000) { relay.roll(now); lastRoll = now; pump(now); }
  }
  const fin = T0 + end + DELAY + 1000;
  const firstDiff = (a, b) => { for (const n of Object.keys({ ...a, ...b })) { const la = a[n] || [], lb = b[n] || []; for (let i = 0; i < Math.max(la.length, lb.length); i++) if (!same(la[i], lb[i])) return `pilote ${n}, tour ${la[i]?.lap ?? lb[i]?.lap} : ${JSON.stringify(la[i])?.slice(0, 160)} / ${JSON.stringify(lb[i])?.slice(0, 160)}`; } return ''; };
  pump(fin);
  pump(fin + 1000);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const refState = JSON.parse(JSON.stringify(ref.state)), refLaps = JSON.parse(JSON.stringify(ref.derived.laps));
  viewers.forEach((v, i) => {
    const who = `spectateur arrivé à ${Math.round(((joins[i] - T0) / end) * 100)} % de la séance`;
    if (!v.state) return fail(label, `${who} : rien d'affiché`);
    const diff = Object.keys({ ...refState, ...v.state }).filter((k) => !same(refState[k], v.state[k]));
    if (diff.length) fail(label, `${who} : état différent de l'appli (${diff.slice(0, 5).join(', ')})`);
    else if (!same(refLaps, v.derived.laps)) fail(label, `${who} : historique des tours différent de l'appli (${firstDiff(refLaps, v.derived.laps)})`);
    else ok(`${who} : même état et même historique des tours que l'appli`);
  });
}

// 3. Appli dans le navigateur, replay accéléré
async function browser(label, sessionPath, startMs, speed, minutes) {
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { return fail(label, 'Playwright absent : partie --appli sautée'); }
  const port = 8890 + Math.floor(Math.random() * 50);
  const env = { ...process.env, PORT: String(port), NO_RECORDING: '1' };
  for (const k of ['TRANSLATE', 'RADIO', 'STATS', 'FEEDBACK', 'PRONOS', 'STUDIO', 'RELAY']) env[`PADDOCK_${k}_URL`] = '';   // rien vers le Worker
  const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 60; i++) { if ((await fetch(`${base}/api/archive?year=2026`).then((r) => r.text()).catch(() => '')).includes('Meetings')) break; await new Promise((r) => setTimeout(r, 1000)); }
    await fetch(`${base}/api/replay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: sessionPath, startOffsetMs: startMs }) });
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, locale: 'fr-FR' });
    const errors = [];
    const watch = async (url, name) => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${name} : ${e.message}`));
      // Tâches longues après le chargement de la page (8 s) : celles du démarrage ne gênent pas le direct
      await p.addInitScript(() => { window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.startTime > 8000) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true }); });
      await p.goto(base + url);
      return { p, name };
    };
    // Gels mesurés une minute à vitesse réelle (accéléré, l'appli reçoit 30 fois plus de messages qu'en direct),
    // puis replay accéléré pour parcourir la séance à la recherche d'erreurs
    const pages = [await watch('/', 'écran principal')];
    for (const [w, n] of [['map', 'Circuit'], ['analysis', 'Analyse'], ['duel', 'Duel']]) pages.push(await watch(`/?panel=${w}`, n));
    await pages[0].p.waitForTimeout(60e3);
    for (const { p, name } of pages) {
      const long = await p.evaluate(() => window.__long);
      const big = long.filter((d) => d > 200);
      if (big.length) fail(label, `${name} : ${big.length} gel(s) de plus de 200 ms à vitesse réelle (le plus long : ${Math.round(Math.max(...big))} ms)`);
      else ok(`${name} : aucun gel de plus de 200 ms à vitesse réelle (${long.length} tâches longues en 1 min)`);
    }
    await fetch(`${base}/api/replay/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'speed', speed }) });
    await pages[0].p.waitForTimeout(minutes * 60e3);
    if (errors.length) for (const e of [...new Set(errors)].slice(0, 5)) fail(label, `erreur de page, ${e}`);
    else ok(`aucune erreur de page en ${minutes} min de replay à ${speed}×`);
    await b.close();
  } finally { server.kill(); }
}

// 4. Version web dans le navigateur, sur un relais local
let built = false;
async function webBrowser(label, archive, startMs, minutes) {
  const req = createRequire(import.meta.url);
  let chromium, WebSocketServer;
  try { ({ chromium } = req('playwright')); ({ WebSocketServer } = req('ws')); } catch { return fail(label, 'Playwright absent : partie --web sautée'); }
  if (!built) {
    const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-studio.mjs')], { encoding: 'utf8' });
    if (b.status) return fail(label, `version web non construite : ${(b.stderr || b.stdout).trim().split('\n').at(-1)}`);
    built = true;
  }
  const SITE = path.join(ROOT, 'analytics', 'site');
  const relay = new LiveRelay({}, {});
  const t0 = Date.now(), at = (off) => t0 + (off - startMs);
  const { events, stream, info } = archive;
  relay.onFrame(JSON.stringify({ type: 3, invocationId: '1', result: { SessionInfo: info } }), at(0));
  let ie = 0, is = 0;
  for (; ie < events.length && events[ie].off < startMs; ie++) relay.add(events[ie].topic, events[ie].data, at(events[ie].off));
  for (; is < stream.length && stream[is].off < startMs; is++) if (stream[is].off > startMs - 150e3) relay.addStream(stream[is].topic, stream[is].raw, at(stream[is].off));
  relay.out = []; relay.outStream = [];
  relay.roll(Date.now());
  relay.status = { ...relay.status, connected: true, authenticated: true };
  const feed = setInterval(() => {
    const off = startMs + (Date.now() - t0);
    for (; ie < events.length && events[ie].off <= off; ie++) relay.add(events[ie].topic, events[ie].data, at(events[ie].off));
    for (; is < stream.length && stream[is].off <= off; is++) relay.addStream(stream[is].topic, stream[is].raw, at(stream[is].off));
    relay.flush();
  }, 250);
  const rollT = setInterval(() => relay.roll(Date.now()), 10e3);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((rq, res) => {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
    // Tracé et abords du circuit : lectures publiques du site en ligne (GET seulement)
    if (rq.method === 'GET' && /^\/live\/api\/(circuit|surroundings|loops|zones|elevation)$/.test(p)) {
      return fetch(`https://app.paddocklive.app${rq.url}`).then(async (r) => { res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' }); res.end(Buffer.from(await r.arrayBuffer())); }, () => { res.writeHead(502); res.end(); });
    }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (rq, sock, head) => {
    if (!rq.url.startsWith('/live/ws')) return sock.destroy();
    wss.handleUpgrade(rq, sock, head, (ws) => {
      ws.ok = true;
      relay.clients.add(ws);
      relay.hello(ws, Date.now() - 150e3);
      ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type === 'stream') ws.send(JSON.stringify({ type: 'stream', items: relay.streamBetween(m.from, m.to) })); } catch { /* message illisible */ } });
      ws.on('close', () => relay.clients.delete(ws));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, locale: 'fr-FR' });
    const errors = [];
    const open = async (url, name) => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${name} : ${e.message}`));
      await p.addInitScript(() => { window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.startTime > 8000) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true }); });
      await p.goto(base + url);
      return { p, name };
    };
    const pages = [await open('/live/', 'écran principal')];
    await pages[0].p.waitForTimeout(12000);
    const rows = await pages[0].p.evaluate(() => document.querySelectorAll('.tower tbody tr[data-num]').length);
    if (rows) ok(`classement affiché (${rows} pilotes)`); else fail(label, 'version web : classement vide après 12 s');
    const wins = await pages[0].p.evaluate(() => [...document.querySelectorAll('.win-btn')].map((x) => [x.dataset.win, x.textContent.trim()]));
    for (const [w, n] of wins) pages.push(await open(`/live/?only=${w}`, `fenêtre ${n}`));
    await pages[0].p.waitForTimeout(minutes * 60e3);
    for (const { p, name } of pages) {
      const big = (await p.evaluate(() => window.__long)).filter((d) => d > 200);
      if (big.length) fail(label, `version web, ${name} : ${big.length} gel(s) de plus de 200 ms (le plus long : ${Math.round(Math.max(...big))} ms)`);
      else ok(`version web, ${name} : aucun gel de plus de 200 ms`);
    }
    if (errors.length) for (const e of [...new Set(errors)].slice(0, 5)) fail(label, `version web, erreur de page, ${e}`);
    else ok(`version web : aucune erreur de page en ${minutes} min à vitesse réelle`);
  } finally {
    await b.close();
    clearInterval(feed); clearInterval(rollT);
    wss.close(); server.close();
  }
}

try { await renew(); } catch (err) { say(`Connexion F1 TV : ${err.message}`); }
const paths = args.filter((a) => !a.startsWith('--'));
const sessions = paths.length ? paths.map((p) => ({ path: p, label: p })) : await defaultSessions();
for (const s of sessions) {
  say(`\n${s.label}`);
  let events, startMs = 0, a;
  try {
    a = await loadArchive(s.path);
    startMs = a.startOff + 15 * 60e3;   // replay dans le navigateur : 15 min après le départ
    events = a.events.map((e) => ({ topic: e.topic, data: e.data, t: T0 + e.off }));
  } catch (err) { fail(s.label, `archive illisible : ${err.message}`); continue; }
  say('Moteur de l\'appli');
  const ref = engine(s.label, events);
  say('Version web (relais et délai TV)');
  web(s.label, events, ref);
  if (args.includes('--appli')) { say('Appli dans le navigateur'); await browser(s.label, s.path, startMs, opt('vitesse', 30), opt('minutes', 3)); }
  if (args.includes('--web')) { say('Version web dans le navigateur'); await webBrowser(s.label, a, startMs, Math.min(opt('minutes', 2), 5)); }
}
say(problems.length ? `\n${problems.length} problème(s) trouvé(s).` : '\nAucun problème trouvé.');
process.exit(problems.length ? 1 : 0);
