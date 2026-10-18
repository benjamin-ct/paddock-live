// Questions et suggestions des utilisateurs : envoyées depuis l'appli (Réglages → À propos, relais du
// serveur local) ou le site (FAQ), gardées dans la base, signalées sur le téléphone du créateur et lues
// dans le Studio (bouton Messages). Limitées par adresse et par jour.
import { notifyPhones } from './alerts.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const KINDS = { idea: 'Idée', question: 'Question', bug: 'Problème' };
const MAX_TEXT = 2000;
const MAX_PER_DAY = 10;   // messages par adresse et par jour
const MAX_KEPT = 500;
const line = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

// Message valide (type connu, texte d'au moins 5 caractères) ou null
export function cleanFeedback(b) {
  if (!b || typeof b !== 'object' || !KINDS[b.kind]) return null;
  const text = String(b.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, MAX_TEXT);
  if (text.length < 5) return null;
  return {
    kind: b.kind, text, contact: line(b.contact, 120),
    src: b.src === 'app' ? 'app' : 'site', version: line(b.version, 24), os: line(b.os, 12), lang: b.lang === 'en' ? 'en' : 'fr',
  };
}

// POST /f : nouveau message
export async function feedbackPost(req, env, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB) return json({ error: 'Envoi indisponible' }, 503);
  const text = await req.text();
  if (text.length > 16 * 1024) return json({ error: 'Message trop long' }, 413);
  let body = null;
  try { body = JSON.parse(text); } catch { /* illisible */ }
  const m = cleanFeedback(body);
  if (!m) return json({ error: 'Message trop court' }, 400);
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  const day = new Date(now).toISOString().slice(0, 10);
  const n = (await env.DB.prepare('SELECT n FROM feedback_new WHERE ip = ? AND day = ?').bind(ip, day).first())?.n || 0;
  if (n >= MAX_PER_DAY) return json({ error: 'Trop de messages aujourd\'hui : réessayez demain' }, 429);
  await env.DB.prepare('INSERT INTO feedback_new (ip, day, n) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, day).run();
  await env.DB.prepare('INSERT INTO feedback (at, kind, text, contact, src, version, os, lang, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .bind(now, m.kind, m.text, m.contact, m.src, m.version, m.os, m.lang).run();
  await env.DB.prepare('DELETE FROM feedback WHERE id NOT IN (SELECT id FROM feedback ORDER BY at DESC LIMIT ?)').bind(MAX_KEPT).run();
  await notifyPhones(env, { title: `${KINDS[m.kind]} · ${m.src === 'app' ? 'appli' : 'site'}`, body: m.text.slice(0, 180), url: '/studio/?alert=messages' }, { fetchFn, now }).catch(() => 0);
  return json({ ok: true });
}

// Routes du Studio (après vérification de la clé) : liste, messages lus, suppression
export async function feedbackApi(path, req, env) {
  if (path === 'feedback' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, at, kind, text, contact, src, version, os, lang, seen FROM feedback ORDER BY at DESC').all();
    return json({ items: results || [] });
  }
  if (path === 'feedback/seen' && req.method === 'POST') {
    await env.DB.prepare('UPDATE feedback SET seen = 1 WHERE seen = 0').run();
    return json({ ok: true });
  }
  if (path === 'feedback/remove' && req.method === 'POST') {
    const id = Number((await req.json().catch(() => null))?.id);
    if (!Number.isInteger(id)) return json({ error: 'Message inconnu' }, 400);
    await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return null;
}
