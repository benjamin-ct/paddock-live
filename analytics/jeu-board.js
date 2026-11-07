// Classement du jeu du jour « Devine le circuit » (paddocklive.app/jeu/) : seulement pour qui le rejoint (pseudo choisi
// sur la page). Un résultat par joueur et par jour, le premier envoyé ; points calculés ici avec la difficulté du jour
// (analytics/jeu/game.js). Joueur : identifiant aléatoire gardé par son navigateur ; un pseudo appartient au premier
// identifiant qui le prend. Le jeu se joue dans le navigateur : le classement ne peut pas empêcher la triche.
import { TRIES, plan, points, parisDay } from './jeu/game.js';
import { callerIp } from './quota.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const UID = /^[a-z0-9]{24}$/;
const MAX_SENDS = 30;   // envois par adresse et par jour
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

async function board(env, day, uid) {
  const top = await env.DB.prepare('SELECT p.name, s.pts, s.tries, s.won FROM jeu_scores s JOIN jeu_players p ON p.uid = s.uid WHERE s.day = ? ORDER BY s.pts DESC, s.at ASC LIMIT ?').bind(day, TOP).all();
  const all = await env.DB.prepare('SELECT p.name, SUM(s.pts) AS pts, COUNT(*) AS days FROM jeu_scores s JOIN jeu_players p ON p.uid = s.uid GROUP BY s.uid ORDER BY pts DESC, MIN(s.at) ASC LIMIT ?').bind(TOP).all();
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM jeu_scores WHERE day = ?').bind(day).first())?.n || 0;
  const players = (await env.DB.prepare('SELECT COUNT(DISTINCT uid) AS n FROM jeu_scores').first())?.n || 0;
  let me = null;
  if (UID.test(uid || '')) {
    const mine = await env.DB.prepare('SELECT s.pts, s.at, p.name FROM jeu_scores s JOIN jeu_players p ON p.uid = s.uid WHERE s.day = ? AND s.uid = ?').bind(day, uid).first();
    const total = await env.DB.prepare('SELECT SUM(pts) AS pts, MIN(at) AS at FROM jeu_scores WHERE uid = ?').bind(uid).first();
    if (mine || total?.pts !== null) {
      const dayRank = mine ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM jeu_scores WHERE day = ? AND (pts > ? OR (pts = ? AND at < ?))').bind(day, mine.pts, mine.pts, mine.at).first()).n + 1 : null;
      const allRank = total?.pts !== null && total?.pts !== undefined
        ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM (SELECT SUM(pts) AS pts, MIN(at) AS at FROM jeu_scores GROUP BY uid) WHERE pts > ? OR (pts = ? AND at < ?)').bind(total.pts, total.pts, total.at).first()).n + 1 : null;
      me = { day: mine ? { pts: mine.pts, rank: dayRank } : null, all: allRank ? { pts: total.pts, rank: allRank } : null };
    }
  }
  return { day, count, players, today: top.results || [], all: all.results || [], me };
}

export async function jeuApi(req, env, url, { now = Date.now() } = {}) {
  if (!env.DB) return json({ error: 'Classement indisponible' }, 503);
  const today = parisDay(new Date(now));
  if (url.pathname === '/jeu/api/board' && req.method === 'GET') {
    const day = Number(url.searchParams.get('day')) || today;
    if (day < today - 1 || day > today) return json({ error: 'Jour invalide' }, 400);
    return json(await board(env, day, url.searchParams.get('uid')));
  }
  if (url.pathname === '/jeu/api/score' && req.method === 'POST') {
    if (Number(req.headers.get('Content-Length') || 0) > 2048) return json({ error: 'Envoi trop gros' }, 413);
    const b = await req.json().catch(() => null);
    const day = Number(b?.day), tries = Number(b?.tries), won = b?.won === true;
    // Jour de Paris en cours, ou la veille (partie finie juste après minuit)
    if (!b || !UID.test(b.uid || '') || !Number.isInteger(day) || day < today - 1 || day > today || !Number.isInteger(tries) || tries < 1 || tries > TRIES || (!won && tries !== TRIES)) {
      return json({ error: 'Résultat illisible' }, 400);
    }
    const name = cleanName(b.name);
    if (!nameOk(name)) return json({ error: 'Pseudo refusé : choisis-en un autre (2 à 20 caractères, sans insulte)', code: 'name' }, 400);
    const ip = callerIp(req) || 'local';
    const iso = new Date(now).toISOString().slice(0, 10);
    const n = (await env.DB.prepare('SELECT n FROM jeu_new WHERE ip = ? AND day = ?').bind(ip, iso).first())?.n || 0;
    if (n >= MAX_SENDS) return json({ error: 'Trop d\'envois aujourd\'hui : réessaie demain' }, 429);
    await env.DB.prepare('INSERT INTO jeu_new (ip, day, n) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, iso).run();
    // Pseudo déjà pris par un autre joueur
    const key = nameKey(name);
    const owner = await env.DB.prepare('SELECT uid FROM jeu_players WHERE nkey = ?').bind(key).first();
    if (owner && owner.uid !== b.uid) return json({ error: 'Ce pseudo est déjà pris : choisis-en un autre', code: 'name' }, 409);
    await env.DB.prepare('INSERT INTO jeu_players (uid, name, nkey, at) VALUES (?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET name = excluded.name, nkey = excluded.nkey')
      .bind(b.uid, name, key, now).run();
    const pts = points(plan(day).level, tries, won);
    await env.DB.prepare('INSERT INTO jeu_scores (day, uid, pts, tries, won, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day, uid) DO NOTHING')
      .bind(day, b.uid, pts, tries, won ? 1 : 0, now).run();
    return json({ ok: true, name, ...(await board(env, day, b.uid)) });
  }
  return json({ error: 'Introuvable' }, 404);
}
