// Classement du jeu du jour « Devine le circuit » (paddocklive.app/jeu/) : seulement pour qui le rejoint (pseudo choisi
// sur la page). Un résultat par joueur et par jour, le premier envoyé ; points calculés ici avec la difficulté du jour,
// les erreurs, les jokers et le bonus de série (analytics/jeu/game.js). Classements du jour, de la semaine, du mois et
// général, avec la série en cours de chacun. Joueur : identifiant aléatoire gardé par son navigateur ; un pseudo appartient au premier
// identifiant qui le prend. Le jeu se joue dans le navigateur : le classement ne peut pas empêcher la triche.
import { TRIES, MAX_JOKERS, plan, points, streakBonus, parisDay } from './jeu/game.js';
import { callerIp } from './quota.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const UID = /^[a-z0-9]{24}$/;
const MAX_SENDS = 30;   // envois et groupes créés, par adresse et par jour
export const GROUP = /^[a-z0-9]{8}$/;
const MAX_MEMBERS = 100;
const TOP = 20;

// Pseudo : lettres, chiffres, espace, point, tiret, apostrophe ; 2 à 20 caractères
export const cleanName = (s) => String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} ._'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[0@4]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a' }[c])).replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
// Mots refusés dans un pseudo (insultes, propos haineux, en français et en anglais), sans accents ni chiffres déguisés
// (« 3 » pour « e »…) ; « admin », « paddock » et « modo » : pas de faux compte officiel. SUB : cherchés partout dans le
// pseudo collé ; WORD : seulement en mot entier (« nique » dans « Dominique », « cock » dans « Hitchcock »)
const SUB = ['connard', 'connasse', 'conasse', 'salope', 'salaud', 'encule', 'putain', 'batard', 'merde', 'tapette', 'gouine', 'negre', 'bougnoule',
  'youpin', 'couille', 'nazi', 'hitler', 'fuck', 'bitch', 'whore', 'nigger', 'nigga', 'faggot', 'admin', 'paddock', 'moderat'];
const WORD = new Set(['pute', 'nique', 'niquer', 'ntm', 'fdp', 'pd', 'pede', 'bite', 'chatte', 'cul', 'pedo', 'viol', 'shit', 'cunt', 'dick', 'cock',
  'pussy', 'slut', 'fag', 'retard', 'rape', 'porn', 'sex', 'modo']);
export function nameOk(name) {
  if (name.length < 2) return false;
  const all = fold(name);
  return !SUB.some((w) => all.includes(w)) && !name.split(/[\s._'-]+/).map(fold).some((w) => WORD.has(w)) && !WORD.has(all);
}
const nameKey = (name) => fold(name) || name.toLowerCase();
// Entrée dans un groupe (déjà membre : rien) ; false si le groupe est complet
async function join(env, grp, uid) {
  if (await env.DB.prepare('SELECT 1 AS x FROM jeu_members WHERE grp = ? AND uid = ?').bind(grp, uid).first()) return true;
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM jeu_members WHERE grp = ?').bind(grp).first())?.n || 0;
  if (n >= MAX_MEMBERS || !(await env.DB.prepare('SELECT 1 AS x FROM jeu_groups WHERE id = ?').bind(grp).first())) return false;
  await env.DB.prepare('INSERT INTO jeu_members (grp, uid, at) VALUES (?, ?, ?)').bind(grp, uid, Date.now()).run();
  return true;
}

// Périodes des classements (jours de Paris) : le jour, la semaine (du lundi), le mois, depuis le début
const monthStart = (day) => { const d = new Date(day * 864e5); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 864e5; };
export const periods = (day) => ({ today: [day, day], week: [day - ((day + 3) % 7), day], month: [monthStart(day), day], all: [0, day] });

// Série en cours de chaque joueur : jours trouvés d'affilée jusqu'à ce jour (ou la veille s'il n'a pas encore joué ;
// strict : jusqu'à ce jour seulement)
async function streaks(env, uids, day, strict = false) {
  if (!uids.length) return {};
  const { results } = await env.DB.prepare(`SELECT uid, day FROM jeu_results WHERE won = 1 AND day BETWEEN ? AND ? AND uid IN (${uids.map(() => '?').join(',')})`)
    .bind(day - 400, day, ...uids).all();
  const won = new Map();
  for (const r of results || []) (won.get(r.uid) || won.set(r.uid, new Set()).get(r.uid)).add(r.day);
  return Object.fromEntries(uids.map((u) => {
    const set = won.get(u) || new Set();
    let d = strict || set.has(day) ? day : day - 1, n = 0;
    while (set.has(d)) { n++; d--; }
    return [u, n];
  }));
}

// Classement d'une période, de tous les joueurs ou des membres d'un groupe d'amis (grp)
async function period(env, [from, to], uid, grp = null) {
  const only = grp ? ' AND uid IN (SELECT uid FROM jeu_members WHERE grp = ?)' : '', g = grp ? [grp] : [];
  const top = (await env.DB.prepare(`SELECT s.uid, p.name, SUM(s.pts) AS pts, COUNT(*) AS days, MIN(s.at) AS at FROM jeu_results s JOIN jeu_players p ON p.uid = s.uid
    WHERE s.day BETWEEN ? AND ?${only.replace('uid IN', 's.uid IN')} GROUP BY s.uid ORDER BY pts DESC, at ASC LIMIT ?`).bind(from, to, ...g, TOP).all()).results || [];
  const players = (await env.DB.prepare(`SELECT COUNT(DISTINCT uid) AS n FROM jeu_results WHERE day BETWEEN ? AND ?${only}`).bind(from, to, ...g).first())?.n || 0;
  let me = null;
  if (UID.test(uid || '')) {
    const m = await env.DB.prepare('SELECT SUM(pts) AS pts, MIN(at) AS at FROM jeu_results WHERE uid = ? AND day BETWEEN ? AND ?').bind(uid, from, to).first();
    if (m?.pts !== null && m?.pts !== undefined) {
      const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT SUM(pts) AS pts, MIN(at) AS at FROM jeu_results WHERE day BETWEEN ? AND ?${only} GROUP BY uid)
        WHERE pts > ? OR (pts = ? AND at < ?)`).bind(from, to, ...g, m.pts, m.pts, m.at).first();
      me = { pts: m.pts, rank: (ahead?.n || 0) + 1 };
    }
  }
  return { players, top, me };
}

async function board(env, day, uid, grp = null) {
  const out = {};
  for (const [k, range] of Object.entries(periods(day))) out[k] = await period(env, range, uid, grp);
  const st = await streaks(env, [...new Set([...Object.values(out).flatMap((b) => b.top.map((r) => r.uid)), ...(UID.test(uid || '') ? [uid] : [])])], day);
  for (const b of Object.values(out)) b.top = b.top.map(({ uid: u, name, pts, days }) => ({ name, pts, days, streak: st[u] || 0 }));
  const mine = UID.test(uid || '') ? await env.DB.prepare('SELECT pts, bonus, jokers, tries, won FROM jeu_results WHERE day = ? AND uid = ?').bind(day, uid).first() : null;
  const group = grp ? await groupOf(env, grp, uid) : null;
  return { day, boards: out, mine: mine ? { ...mine, streak: st[uid] || 0 } : null, ...(grp ? { group } : {}) };
}

// Groupe d'amis : nom, nombre de membres, et si ce joueur en fait partie
async function groupOf(env, grp, uid) {
  const g = await env.DB.prepare('SELECT id, name FROM jeu_groups WHERE id = ?').bind(grp).first();
  if (!g) return null;
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM jeu_members WHERE grp = ?').bind(grp).first())?.n || 0;
  const member = UID.test(uid || '') ? !!(await env.DB.prepare('SELECT 1 AS x FROM jeu_members WHERE grp = ? AND uid = ?').bind(grp, uid).first()) : false;
  return { id: g.id, name: g.name, members: n, member };
}
const newGroup = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
// Compteur par adresse et par jour (envois de résultats, groupes créés) : false au-delà de MAX_SENDS
async function count(env, req, now) {
  const ip = callerIp(req) || 'local', iso = new Date(now).toISOString().slice(0, 10);
  const n = (await env.DB.prepare('SELECT n FROM jeu_new WHERE ip = ? AND day = ?').bind(ip, iso).first())?.n || 0;
  if (n >= MAX_SENDS) return false;
  await env.DB.prepare('INSERT INTO jeu_new (ip, day, n) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, iso).run();
  return true;
}

export async function jeuApi(req, env, url, { now = Date.now() } = {}) {
  if (!env.DB) return json({ error: 'Classement indisponible' }, 503);
  const today = parisDay(new Date(now));
  if (url.pathname === '/jeu/api/board' && req.method === 'GET') {
    const day = Number(url.searchParams.get('day')) || today;
    if (day < today - 1 || day > today) return json({ error: 'Jour invalide' }, 400);
    const grp = url.searchParams.get('g');
    if (grp && !GROUP.test(grp)) return json({ error: 'Groupe inconnu' }, 404);
    const out = await board(env, day, url.searchParams.get('uid'), grp || null);
    if (grp && !out.group) return json({ error: 'Groupe introuvable : vérifie le lien' }, 404);
    return json(out);
  }
  if (url.pathname === '/jeu/api/score' && req.method === 'POST') {
    if (Number(req.headers.get('Content-Length') || 0) > 2048) return json({ error: 'Envoi trop gros' }, 413);
    const b = await req.json().catch(() => null);
    const day = Number(b?.day), tries = Number(b?.tries), won = b?.won === true, jokers = Number(b?.jokers ?? 0);
    // Jour de Paris en cours, ou la veille (partie finie juste après minuit)
    if (!b || !UID.test(b.uid || '') || !Number.isInteger(day) || day < today - 1 || day > today || !Number.isInteger(tries) || tries < 1 || tries > TRIES || (!won && tries !== TRIES)
      || !Number.isInteger(jokers) || jokers < 0 || jokers > MAX_JOKERS) {
      return json({ error: 'Résultat illisible' }, 400);
    }
    const name = cleanName(b.name);
    if (!nameOk(name)) return json({ error: 'Pseudo refusé : choisis-en un autre (2 à 20 caractères, sans insulte)', code: 'name' }, 400);
    if (!(await count(env, req, now))) return json({ error: 'Trop d\'envois aujourd\'hui : réessaie demain' }, 429);
    // Pseudo déjà pris par un autre joueur
    const key = nameKey(name);
    const owner = await env.DB.prepare('SELECT uid FROM jeu_players WHERE nkey = ?').bind(key).first();
    if (owner && owner.uid !== b.uid) return json({ error: 'Ce pseudo est déjà pris : choisis-en un autre', code: 'name' }, 409);
    await env.DB.prepare('INSERT INTO jeu_players (uid, name, nkey, at) VALUES (?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET name = excluded.name, nkey = excluded.nkey')
      .bind(b.uid, name, key, now).run();
    // Bonus de série : jours trouvés d'affilée juste avant celui-ci (au classement)
    const before = won ? (await streaks(env, [b.uid], day - 1, true))[b.uid] || 0 : 0;
    const bonus = won ? streakBonus(before) : 0;
    const pts = points(plan(day).level, tries - (won ? 1 : 0), jokers, won) + bonus;
    await env.DB.prepare('INSERT INTO jeu_results (day, uid, pts, bonus, tries, jokers, won, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, uid) DO NOTHING')
      .bind(day, b.uid, pts, bonus, tries, jokers, won ? 1 : 0, now).run();
    const grp = GROUP.test(b.g || '') ? b.g : null;
    if (grp) await join(env, grp, b.uid);
    return json({ ok: true, name, ...(await board(env, day, b.uid, grp)) });
  }
  // Groupe d'amis : création (par un joueur qui a déjà un pseudo), entrée, sortie
  if (url.pathname === '/jeu/api/group' && req.method === 'POST') {
    const b = await req.json().catch(() => null);
    if (!b || !UID.test(b.uid || '')) return json({ error: 'Demande illisible' }, 400);
    if (!(await env.DB.prepare('SELECT 1 AS x FROM jeu_players WHERE uid = ?').bind(b.uid).first())) return json({ error: 'Rejoins d\'abord le classement avec un pseudo' }, 403);
    if (b.action === 'leave') {
      if (!GROUP.test(b.g || '')) return json({ error: 'Groupe inconnu' }, 404);
      await env.DB.prepare('DELETE FROM jeu_members WHERE grp = ? AND uid = ?').bind(b.g, b.uid).run();
      return json({ ok: true });
    }
    if (b.action === 'join') {
      if (!GROUP.test(b.g || '') || !(await groupOf(env, b.g, b.uid))) return json({ error: 'Groupe introuvable : vérifie le lien' }, 404);
      if (!(await join(env, b.g, b.uid))) return json({ error: `Groupe complet (${MAX_MEMBERS} joueurs)` }, 403);
      return json({ ok: true, group: await groupOf(env, b.g, b.uid) });
    }
    const gname = cleanName(b.name).slice(0, 20);
    if (!nameOk(gname)) return json({ error: 'Nom refusé : choisis-en un autre (2 à 20 caractères, sans insulte)', code: 'name' }, 400);
    if (!(await count(env, req, now))) return json({ error: 'Trop de groupes créés aujourd\'hui : réessaie demain' }, 429);
    const id = newGroup();
    await env.DB.prepare('INSERT INTO jeu_groups (id, name, owner, at) VALUES (?, ?, ?, ?)').bind(id, gname, b.uid, now).run();
    await join(env, id, b.uid);
    return json({ ok: true, group: await groupOf(env, id, b.uid) });
  }
  return json({ error: 'Introuvable' }, 404);
}
