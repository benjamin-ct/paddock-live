// Questions et suggestions des utilisateurs : envoyées depuis l'appli (Réglages → À propos, relais du
// serveur local) ou le site (FAQ), gardées dans la base, signalées sur le téléphone du créateur et lues
// dans le Studio (bouton Messages). Limitées par adresse et par jour.
// Pièces jointes (captures, vidéos) : le message annonce leur nombre et reçoit un jeton d'envoi, puis
// chaque fichier arrive seul (POST /f/file), gardé dans le stockage R2 (MEDIA, fb/<message>/<n>), sa
// liste dans la base. Les plus anciennes sont effacées au-delà de MAX_STORED.
import { notifyPhones } from './alerts.js';
import { callerIp } from './quota.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const KINDS = { idea: 'Idée', question: 'Question', bug: 'Problème' };
const MAX_TEXT = 2000;
const MAX_PER_DAY = 10;   // messages par adresse et par jour
const MAX_KEPT = 500;
export const MAX_FILES = 3;
// Formats acceptés (pas de SVG : il peut contenir du code) et taille maximale de chaque fichier
export const FILE_TYPES = { 'image/png': 8e6, 'image/jpeg': 8e6, 'image/webp': 8e6, 'image/gif': 8e6, 'video/mp4': 40e6, 'video/webm': 40e6, 'video/quicktime': 40e6 };
const MAX_STORED = 2e9;   // R2 : 10 Go gratuits
const fileKey = (msg, n) => `fb/${msg}/${n}`;
// Pièces jointes des messages choisis effacées (fichiers et liste)
async function dropFiles(env, where, ...args) {
  const { results } = await env.DB.prepare(`SELECT msg, n FROM feedback_media WHERE ${where}`).bind(...args).all();
  if (!results?.length) return;
  await env.MEDIA?.delete(results.map((f) => fileKey(f.msg, f.n)));
  await env.DB.prepare(`DELETE FROM feedback_media WHERE ${where}`).bind(...args).run();
}
const UPLOAD_TTL = 3600e3;
const line = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

// Message valide (type connu, texte d'au moins 5 caractères) ou null
export function cleanFeedback(b) {
  if (!b || typeof b !== 'object' || !KINDS[b.kind]) return null;
  const text = String(b.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, MAX_TEXT);
  if (text.length < 5) return null;
  return {
    kind: b.kind, text, contact: line(b.contact, 120),
    src: b.src === 'app' ? 'app' : 'site', version: line(b.version, 24), os: line(b.os, 12), lang: b.lang === 'en' ? 'en' : 'fr',
    files: Math.max(0, Math.min(MAX_FILES, Math.floor(Number(b.files) || 0))),
  };
}

// POST /f : nouveau message (avec un jeton d'envoi s'il annonce des pièces jointes)
export async function feedbackPost(req, env, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB) return json({ error: 'Envoi indisponible' }, 503);
  if (Number(req.headers.get('Content-Length') || 0) > 16 * 1024) return json({ error: 'Message trop long' }, 413);
  const text = await req.text();
  if (text.length > 16 * 1024) return json({ error: 'Message trop long' }, 413);
  let body = null;
  try { body = JSON.parse(text); } catch { /* illisible */ }
  const m = cleanFeedback(body);
  if (!m) return json({ error: 'Message trop court' }, 400);
  const ip = callerIp(req) || 'local';
  const day = new Date(now).toISOString().slice(0, 10);
  const n = (await env.DB.prepare('SELECT n FROM feedback_new WHERE ip = ? AND day = ?').bind(ip, day).first())?.n || 0;
  if (n >= MAX_PER_DAY) return json({ error: 'Trop de messages aujourd\'hui : réessayez demain' }, 429);
  await env.DB.prepare('INSERT INTO feedback_new (ip, day, n) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, day).run();
  const { id } = await env.DB.prepare('INSERT INTO feedback (at, kind, text, contact, src, version, os, lang, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id')
    .bind(now, m.kind, m.text, m.contact, m.src, m.version, m.os, m.lang).first();
  await env.DB.prepare('DELETE FROM feedback WHERE id NOT IN (SELECT id FROM feedback ORDER BY at DESC LIMIT ?)').bind(MAX_KEPT).run();
  await dropFiles(env, 'msg NOT IN (SELECT id FROM feedback)');
  await env.DB.prepare('DELETE FROM feedback_up WHERE at < ?').bind(now - UPLOAD_TTL).run();
  let up = null;
  if (m.files) {
    up = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO feedback_up (msg, tok, files, at) VALUES (?, ?, ?, ?)').bind(id, up, m.files, now).run();
  }
  const clip = `${m.text.slice(0, 160)}${m.files ? ` (+${m.files} pièce${m.files > 1 ? 's' : ''} jointe${m.files > 1 ? 's' : ''})` : ''}`;
  await notifyPhones(env, { title: `${KINDS[m.kind]} · ${m.src === 'app' ? 'appli' : 'site'}`, body: clip, url: '/studio/?alert=messages' }, { fetchFn, now }).catch(() => 0);
  return json(up ? { ok: true, id, up } : { ok: true });
}

// POST /f/file?id=…&up=…&n=… : une pièce jointe (corps brut, type dans Content-Type)
export async function feedbackFile(req, env, url, { now = Date.now() } = {}) {
  if (!env.DB || !env.MEDIA) return json({ error: 'Envoi indisponible' }, 503);
  const id = Number(url.searchParams.get('id')), n = Number(url.searchParams.get('n'));
  const type = String(req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const max = FILE_TYPES[type];
  if (!max) return json({ error: 'Format non accepté : image (PNG, JPEG, WebP, GIF) ou vidéo (MP4, WebM, MOV)' }, 415);
  if (Number(req.headers.get('Content-Length') || 0) > max) return json({ error: `Fichier trop lourd (${max / 1e6} Mo au plus)` }, 413);
  const up = Number.isInteger(id) ? await env.DB.prepare('SELECT tok, files, at FROM feedback_up WHERE msg = ?').bind(id).first() : null;
  if (!up || up.tok !== url.searchParams.get('up') || now - up.at > UPLOAD_TTL) return json({ error: 'Envoi expiré : renvoyez le message' }, 403);
  if (!Number.isInteger(n) || n < 0 || n >= up.files) return json({ error: 'Pièce jointe inattendue' }, 400);
  if (await env.DB.prepare('SELECT 1 AS x FROM feedback_media WHERE msg = ? AND n = ?').bind(id, n).first()) return json({ error: 'Pièce jointe déjà reçue' }, 409);
  const data = new Uint8Array(await req.arrayBuffer());
  if (!data.length) return json({ error: 'Fichier vide' }, 400);
  if (data.length > max) return json({ error: `Fichier trop lourd (${max / 1e6} Mo au plus)` }, 413);
  await env.MEDIA.put(fileKey(id, n), data, { httpMetadata: { contentType: type } });
  await env.DB.prepare('INSERT INTO feedback_media (msg, n, type, size) VALUES (?, ?, ?, ?)').bind(id, n, type, data.length).run();
  // Place limitée : pièces jointes des messages les plus anciens effacées
  for (;;) {
    const t = (await env.DB.prepare('SELECT SUM(size) AS t, MIN(msg) AS old FROM feedback_media').first()) || {};
    if (!(t.t > MAX_STORED) || t.old === id) break;
    await dropFiles(env, 'msg = ?', t.old);
  }
  return json({ ok: true });
}

// Routes du Studio (après vérification de la clé) : liste, pièce jointe, messages lus, suppression
export async function feedbackApi(path, req, env, url) {
  if (path === 'feedback' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, at, kind, text, contact, src, version, os, lang, seen FROM feedback ORDER BY at DESC').all();
    const { results: files } = await env.DB.prepare('SELECT msg, n, type, size FROM feedback_media ORDER BY msg, n').all();
    return json({ items: (results || []).map((m) => ({ ...m, files: (files || []).filter((f) => f.msg === m.id).map(({ n, type, size }) => ({ n, type, size })) })) });
  }
  if (path === 'feedback/file' && req.method === 'GET') {
    const msg = Number(url.searchParams.get('msg')), n = Number(url.searchParams.get('n'));
    const f = await env.DB.prepare('SELECT type FROM feedback_media WHERE msg = ? AND n = ?').bind(msg, n).first();
    const o = f && FILE_TYPES[f.type] ? await env.MEDIA?.get(fileKey(msg, n)) : null;
    if (!o) return json({ error: 'Pièce jointe introuvable' }, 404);
    return new Response(o.body, { headers: { 'Content-Type': f.type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (path === 'feedback/seen' && req.method === 'POST') {
    await env.DB.prepare('UPDATE feedback SET seen = 1 WHERE seen = 0').run();
    return json({ ok: true });
  }
  if (path === 'feedback/remove' && req.method === 'POST') {
    const id = Number((await req.json().catch(() => null))?.id);
    if (!Number.isInteger(id)) return json({ error: 'Message inconnu' }, 400);
    await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
    await dropFiles(env, 'msg = ?', id);
    await env.DB.prepare('DELETE FROM feedback_up WHERE msg = ?').bind(id).run();
    return json({ ok: true });
  }
  return null;
}
