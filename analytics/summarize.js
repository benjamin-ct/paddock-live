// Résumé détaillé d'un article en points clés, en français (Workers AI), pour les posts « news » en
// plusieurs images. Reformulé : jamais de phrase recopiée de l'article (contrôle de passages
// identiques), seulement les faits de l'article. Chaque article n'est résumé qu'une fois (base),
// et compte dans le plafond quotidien partagé avec la traduction.
import { MODEL } from './translate.js';
import { badScript } from '../shared/translation-check.js';
import { fold } from '../shared/news.js';
import { aiQuota, runAI, studioQuota } from './quota.js';

const TAG = 'sum1';          // dans la clé du cache : changer les consignes = nouveaux résumés
export const MAX_INPUT = 12000;
const COST = 5;              // un résumé pèse comme 5 traductions dans le plafond du jour
const COPY_RUN = 9;          // 9 mots identiques à la suite = phrase recopiée

const SYSTEM = `You write news summaries in French for the social media account of a Formula 1 fan site.
From the article given by the user, write between 3 and 5 key points in French.
Rules:
- Each point is one complete sentence of 12 to 30 words, easy to read on a phone.
- Rephrase everything in your own words: never copy a sentence from the article, no quotations.
- Only facts stated in the article: nothing invented, no opinion, no prediction.
- Keep names of drivers, teams, people, circuits and sponsors exactly as written.
- Most important point first. Do not repeat the title word for word.
- Write French accents correctly. Do not number the points.
- Answer ONLY with a JSON array of strings.`;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function keyOf(title, text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${TAG}|${MODEL}|${title}|${text}`)));
}

// Corps reçu -> { title, text }, ou null s'il est invalide
export function cleanSummaryRequest(body) {
  if (!body || typeof body !== 'object') return null;
  const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  const text = typeof body.text === 'string' ? body.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_INPUT) : '';
  if (!title || text.length < 200) return null;
  return { title, text };
}

const words = (s) => fold(s).match(/[\p{L}\p{N}]+/gu) || [];
// Passage de l'article repris mot pour mot dans un point (article en français surtout). text : texte
// de l'article, ou ses suites de mots déjà calculées (copyRuns)
export function copyRuns(text) {
  const src = words(text);
  const runs = new Set();
  for (let i = 0; i + COPY_RUN <= src.length; i++) runs.add(src.slice(i, i + COPY_RUN).join(' '));
  return runs;
}
export function copiedFrom(point, text) {
  const runs = text instanceof Set ? text : copyRuns(text);
  const w = words(point);
  for (let i = 0; i + COPY_RUN <= w.length; i++) if (runs.has(w.slice(i, i + COPY_RUN).join(' '))) return true;
  return false;
}

// Réponse du modèle -> liste brute : Workers AI renvoie une réponse JSON déjà décodée (tableau, ou
// objet { points: [...] }), sinon du texte où la liste est cherchée
function listOf(reply) {
  if (Array.isArray(reply)) return reply;
  if (reply && typeof reply === 'object') return Object.values(reply).find(Array.isArray) || null;
  const t = String(reply || '');
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  try { const list = JSON.parse(t.slice(a, b + 1)); return Array.isArray(list) ? list : null; } catch { return null; }
}

// Réponse du modèle -> points retenus (2 au moins), ou null ; why : raison du refus (format, copie…)
export function parsePoints(reply, text = '', why = {}) {
  const list = listOf(reply);
  if (!list) { why.reason = 'format'; return null; }
  const runs = copyRuns(text);
  const clean = list.filter((x) => typeof x === 'string').map((x) => x.replace(/^\s*(?:[-–—•*]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length >= 20 && x.length <= 320 && !badScript(x, 'fr'));
  const out = clean.filter((x) => !copiedFrom(x, runs)).slice(0, 5);
  if (out.length < 2) why.reason = clean.length >= 2 ? 'copy' : 'format';
  return out.length >= 2 ? out : null;
}
const REASONS = {
  ai: "Le service d'IA n'a pas répondu, réessayez dans quelques minutes",
  format: "Réponse de l'IA inutilisable pour cet article, réessayez",
  copy: "Résumé trop proche du texte de l'article (phrases recopiées) : écrivez les points vous-même",
};

export async function summarizeArticle(env, req, day = new Date().toISOString().slice(0, 10), ip = null, quota = null) {
  const k = await keyOf(req.title, req.text);
  const hit = await env.DB.prepare('SELECT out FROM translations WHERE k = ?1').bind(k).first();
  if (hit?.out) { try { return { points: JSON.parse(hit.out), cached: true }; } catch { /* entrée abîmée : refaite */ } }
  const q = quota || { key: day, limit: Number(env.AI_DAILY_LIMIT) || 1000 };
  if (!(await aiQuota(env, { key: q.key, day, n: COST, limit: q.limit, ip }))) return { limited: true };
  // Deux essais : réponse mal formée ou trop proche du texte de l'article
  const why = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    let reply = null;
    try {
      const r = await runAI(env, MODEL, {
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Title: ${req.title}\n\nArticle:\n${req.text}` }],
        temperature: attempt ? 0.4 : 0.2,
        max_tokens: 900,
      });
      reply = r?.response ?? r?.choices?.[0]?.message?.content;
    } catch { reply = null; why.reason = 'ai'; }
    const points = reply == null ? null : parsePoints(reply, req.text, why);
    if (points) {
      await env.DB.prepare('INSERT OR REPLACE INTO translations (k, out, at) VALUES (?1, ?2, ?3)').bind(k, JSON.stringify(points), Date.now()).run();
      return { points };
    }
  }
  return { points: null, error: REASONS[why.reason] || REASONS.format };
}

// ---------- Post écrit à la main dans le Studio : texte du créateur mis en forme ----------
const POST_COST = 3;         // pèse comme 3 traductions dans le plafond du jour
const POST_SYSTEM = `You help the owner of a French Formula 1 fan account turn his own notes into a social media post.
From the notes given by the user, write in French:
- "title": a short, punchy, factual headline (at most 90 characters, no emoji, no hashtag);
- "summary": one or two sentences that tell the news clearly (at most 260 characters);
- "points": 0 to 5 key points, one complete sentence each (12 to 30 words), only if the notes contain enough details; otherwise an empty list.
Rules: keep only facts from the notes, add nothing, no opinion unless the notes give one. Keep names of drivers, teams and people exactly as written. Write French accents correctly.
Answer ONLY with a JSON object: {"title": "...", "summary": "...", "points": ["..."]}`;

// Corps reçu -> texte du créateur (20 à 4 000 caractères), ou null
export function cleanPostRequest(body) {
  const text = typeof body?.text === 'string' ? body.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000) : '';
  return text.length >= 20 ? text : null;
}

// Réponse du modèle -> { title, summary, points }, ou null si inutilisable
export function parsePostReply(reply) {
  let o = reply && typeof reply === 'object' && !Array.isArray(reply) ? reply : null;
  if (!o) {
    const t = String(reply || '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { o = JSON.parse(t.slice(a, b + 1)); } catch { o = null; } }
  }
  const one = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const title = one(o?.title, 120);
  const summary = one(o?.summary, 320);
  if (!title || !summary || badScript(`${title} ${summary}`, 'fr')) return null;
  const points = (Array.isArray(o.points) ? o.points : []).map((x) => one(x, 320).replace(/^(?:[-–—•*]|\d+[.)])\s*/, '')).filter((x) => x.length >= 15 && !badScript(x, 'fr')).slice(0, 5);
  return { title, summary, points };
}

export async function rewritePost(env, text, day = new Date().toISOString().slice(0, 10)) {
  const q = studioQuota(env, day);
  if (!(await aiQuota(env, { key: q.key, day, n: POST_COST, limit: q.limit }))) return { limited: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await runAI(env, MODEL, {
        messages: [{ role: 'system', content: POST_SYSTEM }, { role: 'user', content: text }],
        temperature: attempt ? 0.5 : 0.3,
        max_tokens: 900,
      });
      const post = parsePostReply(r?.response ?? r?.choices?.[0]?.message?.content);
      if (post) return post;
    } catch { /* nouvel essai */ }
  }
  return { error: "L'IA n'a pas pu mettre ce texte en forme, réessayez ou écrivez le post vous-même" };
}
