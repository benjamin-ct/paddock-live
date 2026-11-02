#!/usr/bin/env node
// Suivi du Studio (onglet Suivi, sans Google) tenu par les sessions Claude : tâches, journal, textes des posts, guides.
// Clé : variable PADDOCK_SUIVI_KEY (créée dans le Studio → Suivi → Réglages ; jamais dans une conversation).
//
//   node scripts/suivi.mjs get [tasks|log|posts|net|guides]          contenu (JSON)
//   node scripts/suivi.mjs tasks [liste]                              tâches non faites (identifiant, liste, titre)
//   node scripts/suivi.mjs task-add --list "…" --title "…" [--when "…"] [--domain "…"] [--detail "a / b"] [--link URL] [--status "À faire"|"En attente"|"Lien"]
//   node scripts/suivi.mjs task-done <identifiant ou titre exact>    statut « Fait » avec la date du jour
//   node scripts/suivi.mjs task-set <identifiant ou titre> --when "…" [--title …] [--list …] [--detail …] [--status …]
//   node scripts/suivi.mjs log-add --domain "Développement" --text "…" [--where "Fait"]   ligne en tête du journal
//   node scripts/suivi.mjs posts-put "<Week-end de … · textes des posts>" fichier.txt     textes des posts d'un Grand Prix
//   node scripts/suivi.mjs media-put "<Week-end de … · textes des posts>" image.png video.mp4 …   photos et vidéos du Grand Prix
//   node scripts/suivi.mjs media-list "<Week-end de … · textes des posts>"                     fichiers et leurs adresses
//   node scripts/suivi.mjs net-add posts fichier.json                 lignes ajoutées à une table des réseaux (posts, app, benjy, streamers)
//   node scripts/suivi.mjs guide-put "<nom du guide>" fichier.md
//   node scripts/suivi.mjs ops fichier.json                          liste d'opérations (voir analytics/suivi.js)
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.PADDOCK_SUIVI_URL || 'https://paddocklive.app/studio/api/suivi').replace(/\/$/, '');
const KEY = process.env.PADDOCK_SUIVI_KEY || '';
const [cmd, ...rest] = process.argv.slice(2);

function args(list) {
  const pos = [], opt = {};
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith('--')) opt[list[i].slice(2)] = list[++i] ?? '';
    else pos.push(list[i]);
  }
  return { pos, opt };
}

async function call(path, body) {
  if (!KEY) throw new Error('PADDOCK_SUIVI_KEY absente : clé à créer dans le Studio → Suivi → Réglages, puis à mettre dans les variables de l\'environnement');
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Suivi-Key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}
const ops = (list) => call('/ops', { ops: list });
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.pdf': 'application/pdf' };
async function putFile(gp, file) {
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) throw new Error(`${file} : type non pris en charge (${Object.keys(TYPES).join(' ')})`);
  const res = await fetch(`${BASE}/file?gp=${encodeURIComponent(gp)}&f=${encodeURIComponent(path.basename(file))}`, {
    method: 'PUT', headers: { 'X-Suivi-Key': KEY, 'Content-Type': type }, body: fs.readFileSync(file), signal: AbortSignal.timeout(300000),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${file} : ${d.error || `HTTP ${res.status}`}`);
  return new URL(d.file.url, BASE).href;
}
const show = (d) => console.log(JSON.stringify(d, null, 2));

const { pos, opt } = args(rest);
const run = {
  get: async () => show(await call(pos[0] ? `/${pos[0]}` : '')),
  tasks: async () => {
    const { tasks } = await call('/tasks');
    for (const t of tasks.filter((x) => x.status !== 'Fait' && (!pos[0] || x.list === pos[0]))) console.log(`${t.id}\t${t.list}\t${t.when || ''}\t${t.title}`);
  },
  'task-add': async () => {
    if (!opt.title) throw new Error('--title manquant');
    const r = await ops([{ op: 'task.add', task: opt }]);
    console.log(`Tâche ajoutée : ${r.ids[0]}`);
  },
  'task-done': async () => { await ops([{ op: 'task.set', id: pos.join(' '), status: 'Fait' }]); console.log('Fait'); },
  'task-set': async () => { await ops([{ op: 'task.set', id: pos.join(' '), ...opt }]); console.log('Modifiée'); },
  'log-add': async () => {
    if (!opt.text) throw new Error('--text manquant');
    await ops([{ op: 'log.add', entry: { domain: opt.domain || '', text: opt.text, where: opt.where || '', ...(opt.date ? { date: opt.date } : {}) } }]);
    console.log('Ajouté au journal');
  },
  'posts-put': async () => { await ops([{ op: 'posts.put', name: pos[0], text: fs.readFileSync(pos[1], 'utf8') }]); console.log('Textes des posts enregistrés'); },
  'media-put': async () => {
    if (!KEY) await call('');
    for (const f of pos.slice(1)) console.log(`${path.basename(f)} → ${await putFile(pos[0], f)}`);
  },
  'media-list': async () => {
    const { posts } = await call('/posts');
    const doc = posts.find((x) => x.name === pos[0]);
    if (!doc) throw new Error(`Grand Prix introuvable : ${pos[0]} (noms : ${posts.map((x) => x.name).join(', ')})`);
    for (const f of doc.files || []) console.log(`${f.name}\t${f.size}\t${new URL(`/studio/f/${f.key}/${encodeURIComponent(f.name)}`, BASE).href}`);
  },
  'net-add': async () => { await ops([{ op: 'net.add', table: pos[0], rows: JSON.parse(fs.readFileSync(pos[1], 'utf8')) }]); console.log('Lignes ajoutées'); },
  'guide-put': async () => { await ops([{ op: 'guide.put', name: pos[0], text: fs.readFileSync(pos[1], 'utf8') }]); console.log('Guide enregistré'); },
  ops: async () => show(await ops(JSON.parse(fs.readFileSync(pos[0], 'utf8')))),
}[cmd];

if (!run) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(cmd ? 1 : 0); }
run().catch((err) => { console.error(`Suivi : ${err.message}`); process.exit(1); });
