// Traduction partagée (Workers AI) : chaque texte n'est traduit qu'une fois pour tous les utilisateurs
// de Paddock Live, puis gardé dans la base. Plafond quotidien contre les abus ; au-delà, l'appli
// traduit sur l'ordinateur comme avant.
// Modèle de langage (Mistral Small 3.1) avec des consignes F1 : noms propres gardés, jargon des fans,
// sens traduit plutôt que mot à mot (titres écrits comme dans la presse sportive, exemples à l'appui).
// Plusieurs textes par appel (les consignes, envoyées à chaque appel, coûtent plus que les titres) ;
// réponse mal formée -> modèle de traduction simple (m2m100) en secours.
// Allocation Workers AI du jour épuisée (erreur 4006, remise à zéro à minuit UTC) : plus aucun appel,
// réponse « plafond atteint » comme pour le plafond de Paddock Live.
// Traduction avec des caractères d'une autre écriture (chinois glissé dans du français…) : refaite.
import { badTranslation } from '../shared/translation-check.js';
import { aiQuota } from './quota.js';
export const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
export const FALLBACK = '@cf/meta/m2m100-1.2b';
const MODEL_TAG = 'ms31b';  // dans la clé du cache : changer de modèle ou de consignes = nouvelles traductions
const PER_CALL = 20;
const CALL_CHARS = 8000;   // et pas plus de texte que la réponse du modèle (4 000 jetons) peut en rendre
const NAMES = { fr: 'French', en: 'English', es: 'Spanish', de: 'German', it: 'Italian', nl: 'Dutch', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese' };
export const LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh'];
export const MAX_ITEMS = 40;
export const MAX_TEXT = 2000;
const MAX_TOTAL = 24000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function keyOf(from, to, text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${MODEL_TAG}|${from}|${to}|${text}`)));
}

const FR = ` Team radio jargon: "box, box" = "rentre aux stands", "copy" = "reçu", "lift and coast" = "lever le pied", "deg" = "dégradation", "softs/mediums/hards" = "tendres/mediums/durs", "pole" = "pole position". Race control: "stewards" = "commissaires", "track limits" = "limites de piste", "time deleted" = "temps supprimé", "noted" = "noté", "under investigation" = "sous enquête", "safety car" = "voiture de sécurité", "timed at" = "à", "pass holders" = "titulaires d’un pass". News: "team/equipe" = "écurie", "car/carro" = "monoplace", "FP1/TL1" = "EL1", "qualifying/classificação" = "qualifications", "power unit" = "moteur", "pit stop" = "arrêt au stand", "upgrades" = "évolutions", "revenue/receita" = "chiffre d’affaires" or "recettes", "vice-champion/vice-campeão" = "vice-champion". French typography: space before ":" ";" "?" "!". Write French accents and cedillas correctly, even in capital letters.
Examples of good French:
"F1: VICE-CAMPEÃ DE 2025, MERCEDES SUPERA RECEITA BILIONÁRIA DA MCLAREN; VEJA NÚMEROS" -> "F1 : VICE-CHAMPIONNE 2025, MERCEDES DÉPASSE LE MILLIARD DE RECETTES DE MCLAREN : LES CHIFFRES"
"Hamilton reveals what went wrong in Brazil" -> "Hamilton explique ce qui n’a pas marché au Brésil"
"Watch: Norris's stunning lap that secured pole" -> "Vidéo : le tour magique de Norris pour la pole"`;

const system = (to) => `You are a professional ${NAMES[to]}-speaking F1 journalist translating for a Formula 1 app. Translate each input text into ${NAMES[to]}.
Rules:
- Translate the meaning, not word for word: write what a native ${NAMES[to]}-speaking sports journalist would write. Rephrase expressions that sound unnatural when translated literally; never invent or drop a fact.
- Headlines stay short headlines in the style of ${NAMES[to]} sports media. Calls to action such as "see the numbers", "watch", "veja", "confira", "check out" become a short label (the figures, video…) or are dropped.
- Keep names of drivers, teams, people, circuits, cities, sponsors and car models exactly as written (e.g. Câmara, Verstappen, Red Bull, Haas, Marina Bay). Never translate a surname as a common word.
- Use the natural vocabulary of ${NAMES[to]}-speaking F1 fans and commentators.${to === 'fr' ? FR : ''}
- Keep the capitalisation style, quotes, numbers, units and the meaning of punctuation. Do not add explanations, notes or quotes around the result.
- The input is a JSON array of strings. Answer ONLY with a JSON array of the translations, same order, same length.`;

// Réponse du modèle -> liste de chaînes (ou null si mal formée)
export function parseList(reply, n) {
  if (Array.isArray(reply)) return reply.length === n && reply.every((x) => typeof x === 'string') ? reply : null;
  const t = String(reply || '');
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  try {
    const list = JSON.parse(t.slice(a, b + 1));
    return Array.isArray(list) && list.length === n && list.every((x) => typeof x === 'string' && x.trim()) ? list.map((x) => x.trim()) : null;
  } catch { return null; }
}

async function llm(env, texts, to) {
  const r = await env.AI.run(MODEL, {
    messages: [{ role: 'system', content: system(to) }, { role: 'user', content: JSON.stringify(texts) }],
    temperature: 0.1,
    max_tokens: Math.min(4000, 200 + texts.reduce((a, t) => a + t.length, 0)),
  });
  return parseList(r?.response ?? r?.choices?.[0]?.message?.content, texts.length);
}

// Workers AI : « you have used up your daily free allocation of 10,000 neurons »
export const aiSpent = (e) => /\b4006\b|daily free allocation/i.test(String(e?.message || e));

async function simple(env, text, from, to, spent) {
  if (spent.on) return null;
  try {
    const r = await env.AI.run(FALLBACK, { text, source_lang: from, target_lang: to });
    return String(r?.translated_text || '').trim() || null;
  } catch (e) { if (aiSpent(e)) spent.on = true; return null; }
}

// Corps reçu -> { to, items: [{ text, from }] }, ou null s'il est invalide
export function cleanRequest(body) {
  if (!body || typeof body !== 'object' || !LANGS.includes(body.to) || !Array.isArray(body.items)) return null;
  const items = body.items.slice(0, MAX_ITEMS).map((it) => ({
    text: typeof it?.text === 'string' ? it.text.trim().slice(0, MAX_TEXT) : '',
    from: LANGS.includes(it?.from) ? it.from : 'en',
  }));
  if (!items.length || items.some((it) => !it.text) || items.reduce((a, it) => a + it.text.length, 0) > MAX_TOTAL) return null;
  return { to: body.to, items };
}

async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); }
  }));
  return out;
}

// quota : { key, limit } (Studio : studioQuota), sinon le plafond du jour partagé par les applis
export async function translateBatch(env, req, day = new Date().toISOString().slice(0, 10), ip = null, quota = null) {
  const keys = await Promise.all(req.items.map((it) => keyOf(it.from, req.to, it.text)));
  const out = req.items.map((it) => (it.from === req.to ? it.text : null));
  // Déjà traduits (par n'importe quel utilisateur)
  const want = [...new Set(keys.filter((k, i) => out[i] === null))];
  if (want.length) {
    const rows = (await env.DB.prepare(`SELECT k, out FROM translations WHERE k IN (${want.map(() => '?').join(',')})`).bind(...want).all()).results || [];
    const found = new Map(rows.map((r) => [r.k, r.out]));
    keys.forEach((k, i) => { if (out[i] === null && found.has(k) && !badTranslation(found.get(k), req.to, req.items[i].text)) out[i] = found.get(k); });
  }
  const todo = [...new Set(keys.filter((k, i) => out[i] === null))].map((k) => ({ k, it: req.items[keys.indexOf(k)] }));
  if (!todo.length) return { out, cached: true };
  // Plafond du jour
  const q = quota || { key: day, limit: Number(env.AI_DAILY_LIMIT) || 20000 };
  if (!(await aiQuota(env, { key: q.key, day, n: todo.length, limit: q.limit, ip }))) return { out, limited: true };
  // Modèle de langage par paquets de 20 (ou 8 000 caractères) ; paquet raté -> traduction simple texte par texte
  const groups = [];
  let size = 0;
  for (const x of todo) {
    const last = groups[groups.length - 1];
    if (last && last.length < PER_CALL && size + x.it.text.length <= CALL_CHARS) { last.push(x); size += x.it.text.length; } else { groups.push([x]); size = x.it.text.length; }
  }
  const spent = { on: false };
  const results = await mapLimit(groups, 3, async (g) => {
    let list = null;
    if (!spent.on) try { list = await llm(env, g.map(({ it }) => it.text), req.to); } catch (e) { if (aiSpent(e)) spent.on = true; }
    // Paquet raté : tout en traduction simple ; sinon seulement les traductions suspectes
    return Promise.all(g.map(async ({ it }, j) => {
      if (list && !badTranslation(list[j], req.to, it.text)) return list[j];
      const s = await simple(env, it.text, it.from, req.to, spent);
      return s && !badTranslation(s, req.to, it.text) ? s : null;
    }));
  });
  const done = results.flat();
  const now = Date.now();
  const store = [];
  todo.forEach(({ k }, j) => {
    if (!done[j]) return;
    keys.forEach((kk, i) => { if (kk === k && out[i] === null) out[i] = done[j]; });
    store.push(env.DB.prepare('INSERT OR REPLACE INTO translations (k, out, at) VALUES (?1, ?2, ?3)').bind(k, done[j], now));
  });
  if (store.length) await env.DB.batch(store);
  return spent.on ? { out, limited: true } : { out };
}
