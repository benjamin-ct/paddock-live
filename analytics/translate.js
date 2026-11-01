// Traduction partagée : chaque texte n'est traduit qu'une fois pour tous les utilisateurs de Paddock Live,
// puis gardé dans la base. Plafond quotidien contre les abus ; au-delà, l'appli traduit sur l'ordinateur comme avant.
// Claude (secret ANTHROPIC_API_KEY : crédits API de l'abonnement Max, perdus s'ils ne servent pas) : Opus pour
// l'Actu et la technique, Sonnet sans réflexion, plus rapide, pour le reste (radios, direction de course, anciennes
// applis qui n'envoient pas le type de texte). Plafond en dollars du jour atteint (claudeRoom) : Mistral. Pas de
// clé, erreur de l'API (crédits du mois épuisés…) : pause de 10 minutes et Mistral comme avant ; réponse refusée
// ou mal formée : Mistral pour ce paquet, gardé aussi sous la clé de Claude. Traductions gardées
// séparément (MODEL_TAG, CLAUDE_TAG) : celles de Mistral resservent quand Claude est en pause.
// Modèle de langage (Mistral Small 3.1) avec des consignes F1 : noms propres gardés, jargon des fans,
// sens traduit plutôt que mot à mot (titres écrits comme dans la presse sportive, exemples à l'appui).
// Plusieurs textes par appel (les consignes, envoyées à chaque appel, coûtent plus que les titres) ;
// réponse mal formée -> modèle de traduction simple (m2m100) en secours.
// Allocation Workers AI du jour épuisée (erreur 4006, remise à zéro à minuit UTC) : plus aucun appel,
// réponse « plafond atteint » comme pour le plafond de Paddock Live.
// Traduction avec des caractères d'une autre écriture (chinois glissé dans du français…) : refaite.
import Anthropic from '@anthropic-ai/sdk';
import { badTranslation, badScript } from '../shared/translation-check.js';
import { aiQuota, runAI, countClaude, claudeRoom } from './quota.js';
export const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
export const FALLBACK = '@cf/meta/m2m100-1.2b';
const MODEL_TAG = 'ms31b';  // dans la clé du cache : changer de modèle ou de consignes = nouvelles traductions
const CLAUDE_TAG = 'cl1';
const RADIO_TAG = 'r3';   // consignes des radios (mots mal entendus remis dans le contexte) : leurs traductions refaites, pas celles de l'Actu
export const KINDS = ['news', 'radio', 'tech'];
export const CLAUDE = {
  opus: { model: 'claude-opus-5-5', output_config: { effort: 'medium' } },
  sonnet: { model: 'claude-sonnet-5-5', thinking: { type: 'between_tools' } },
};
// Traduction inutilisable : autre écriture, ou réponse au lieu d'une traduction (texte illisible : radios, direction de
// course, anciennes applis sans type). Pas pour l'Actu et la technique : un vrai titre peut dire « il semble que »
const bad = (out, to, it) => (it.kind === 'news' || it.kind === 'tech' ? badScript(out, to) : badTranslation(out, to, it.text));
export const claudeFor = (kind) => (kind === 'news' || kind === 'tech' ? CLAUDE.opus : CLAUDE.sonnet);
const CLAUDE_PAUSE = 10 * 60e3;
let claudeOffUntil = 0;
const PER_CALL = 20;
const CALL_CHARS = 8000;   // et pas plus de texte que la réponse du modèle (4 000 jetons) peut en rendre
const NAMES = { fr: 'French', en: 'English', es: 'Spanish', de: 'German', it: 'Italian', nl: 'Dutch', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese' };
export const LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh'];
export const MAX_ITEMS = 40;
export const MAX_TEXT = 2000;
const MAX_TOTAL = 24000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function keyOf(from, to, text, tag = MODEL_TAG) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${tag}|${from}|${to}|${text}`)));
}

const FR = ` Team radio jargon: "box, box" = "rentre aux stands", "copy" = "reçu", "lift and coast" = "lever le pied", "deg" = "dégradation", "softs/mediums/hards" = "tendres/mediums/durs", "pole" = "pole position", "flat spot" = "méplat", "run/stint" = "relais", "on your gearbox" = "dans tes roues". Race control: "stewards" = "commissaires", "track limits" = "limites de piste", "time deleted" = "temps supprimé", "noted" = "noté", "under investigation" = "sous enquête", "safety car" = "voiture de sécurité", "timed at" = "à", "pass holders" = "titulaires d’un pass". News: "team/equipe" = "écurie", "car/carro" = "monoplace", "FP1/TL1" = "EL1", "qualifying/classificação" = "qualifications", "power unit" = "moteur", "pit stop" = "arrêt au stand", "upgrades" = "évolutions", "revenue/receita" = "chiffre d’affaires" or "recettes", "vice-champion/vice-campeão" = "vice-champion". Technical updates: "floor" = "fond plat", "endplate" = "dérive", "brake duct" = "écope de frein", "furniture" = "appendices", "car attitude" = "assiette", "downforce/load" = "appui". French typography: space before ":" ";" "?" "!". Write French accents and cedillas correctly, even in capital letters.
Examples of good French:
"F1: VICE-CAMPEÃ DE 2025, MERCEDES SUPERA RECEITA BILIONÁRIA DA MCLAREN; VEJA NÚMEROS" -> "F1 : VICE-CHAMPIONNE 2025, MERCEDES DÉPASSE LE MILLIARD DE RECETTES DE MCLAREN : LES CHIFFRES"
"Hamilton reveals what went wrong in Brazil" -> "Hamilton explique ce qui n’a pas marché au Brésil"
"Watch: Norris's stunning lap that secured pole" -> "Vidéo : le tour magique de Norris pour la pole"`;

const system = (to) => `You are a professional ${NAMES[to]}-speaking F1 journalist translating for a Formula 1 app. Translate each input text into ${NAMES[to]}.
Rules:
- Translate the meaning, not word for word: write what a native ${NAMES[to]}-speaking sports journalist would write. Rephrase expressions that sound unnatural when translated literally; never invent or drop a fact.
- Headlines stay short headlines in the style of ${NAMES[to]} sports media. Calls to action such as "see the numbers", "watch", "veja", "confira", "check out" become a short label (the figures, video…) or are dropped.
- Keep names of drivers, teams, people, circuits, cities, sponsors and car models exactly as written (e.g. Câmara, Verstappen, Red Bull, Haas, Marina Bay). Never translate a surname as a common word.
- Team radio texts come from automatic speech recognition and often contain misheard words. Fix a driver or team name that was obviously misheard (e.g. "Ghastly" -> "Gasly") and obviously misheard F1 words from the context (e.g. "super understood" -> "super understeer", "the rooms were starting to go" -> "the rears were starting to go", "books, books" -> "box, box"). Other examples: "the answer breaking" -> "the engine braking", "the staff are under investigation" -> "the stewards are investigating", "Carl looks good" -> "car looks good", "Kimmy" -> "Kimi". A word that is out of place on a team radio (vulgar, sexual, absurd) was misheard: never translate it literally, give the F1 word that sounds closest and fits the sentence (e.g. "good porn" -> "good pace"). When words still look wrong, give the most plausible reading for a driver or engineer talking during a session (e.g. "the biggest blue turning" -> "the biggest blue flag"), or translate them as heard. Write "[…]" only for a single word that has no possible meaning, at most once per message; never several "[…]" in one message and never only "[…]".
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
  const r = await runAI(env, MODEL, {
    messages: [{ role: 'system', content: system(to) }, { role: 'user', content: JSON.stringify(texts) }],
    temperature: 0.1,
    max_tokens: Math.min(4000, 200 + texts.reduce((a, t) => a + t.length, 0)),
  });
  return parseList(r?.response ?? r?.choices?.[0]?.message?.content, texts.length);
}

// Claude : liste de traductions, ou null (refus, réponse coupée ou mal formée) ; erreur de l'API levée
async function claude(env, texts, to, kind) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: env.CLAUDE_FETCH, maxRetries: 1, timeout: 60e3 });   // CLAUDE_FETCH : tests
  const cfg = claudeFor(kind);
  const r = await client.messages.create({
    ...cfg,
    max_tokens: 16000,   // de la place pour la réflexion d'Opus
    system: [{ type: 'text', text: system(to), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(texts) }],
  });
  const list = r.stop_reason === 'end_turn' ? parseList(r.content.filter((b) => b.type === 'text').map((b) => b.text).join(''), texts.length) : null;
  await countClaude(env, cfg.model, r.usage, list ? texts.length : 0).catch(() => {});   // suivi dans le Studio
  return list;
}

// Workers AI : « you have used up your daily free allocation of 10,000 neurons »
export const aiSpent = (e) => /\b4006\b|daily free allocation/i.test(String(e?.message || e));

async function simple(env, text, from, to, spent) {
  if (spent.on) return null;
  try {
    const r = await runAI(env, FALLBACK, { text, source_lang: from, target_lang: to });
    return String(r?.translated_text || '').trim() || null;
  } catch (e) { if (aiSpent(e)) spent.on = true; return null; }
}

// Corps reçu -> { to, items: [{ text, from, kind? }] } (kind : type de texte, KINDS), ou null s'il est invalide
export function cleanRequest(body) {
  if (!body || typeof body !== 'object' || !LANGS.includes(body.to) || !Array.isArray(body.items)) return null;
  const items = body.items.slice(0, MAX_ITEMS).map((it) => ({
    text: typeof it?.text === 'string' ? it.text.trim().slice(0, MAX_TEXT) : '',
    from: LANGS.includes(it?.from) ? it.from : 'en',
    ...(KINDS.includes(it?.kind) && { kind: it.kind }),
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

// Traductions déjà gardées dans la base : clé -> texte
async function stored(env, keys) {
  const want = [...new Set(keys)];
  if (!want.length) return new Map();
  const rows = (await env.DB.prepare(`SELECT k, out FROM translations WHERE k IN (${want.map(() => '?').join(',')})`).bind(...want).all()).results || [];
  return new Map(rows.map((r) => [r.k, r.out]));
}

// Mistral par paquet ; paquet raté -> traduction simple texte par texte, seulement pour les traductions suspectes sinon
async function mistral(env, items, to, spent) {
  let list = null;
  if (!spent.on) try { list = await llm(env, items.map((it) => it.text), to); } catch (e) { if (aiSpent(e)) spent.on = true; }
  return Promise.all(items.map(async (it, j) => {
    if (list && !bad(list[j], to, it)) return list[j];
    const s = await simple(env, it.text, it.from, to, spent);
    return s && !bad(s, to, it) ? s : null;
  }));
}

// quota : { key, limit } (Studio : studioQuota), sinon le plafond du jour partagé par les applis
export async function translateBatch(env, req, day = new Date().toISOString().slice(0, 10), ip = null, quota = null) {
  const claudeOn = !!env.ANTHROPIC_API_KEY && Date.now() >= claudeOffUntil;
  const keys = await Promise.all(req.items.map((it) => keyOf(it.from, req.to, it.text, `${claudeOn ? CLAUDE_TAG : MODEL_TAG}${it.kind === 'radio' ? RADIO_TAG : ''}`)));
  const out = req.items.map((it) => (it.from === req.to ? it.text : null));
  // Déjà traduits (par n'importe quel utilisateur)
  const found = await stored(env, keys.filter((k, i) => out[i] === null));
  keys.forEach((k, i) => { if (out[i] === null && found.has(k) && !bad(found.get(k), req.to, req.items[i])) out[i] = found.get(k); });
  const todo = [...new Set(keys.filter((k, i) => out[i] === null))].map((k) => ({ k, it: req.items[keys.indexOf(k)] }));
  if (!todo.length) return { out, cached: true };
  // Plafond du jour
  const q = quota || { key: day, limit: Number(env.AI_DAILY_LIMIT) || 1000 };
  if (!(await aiQuota(env, { key: q.key, day, n: todo.length, limit: q.limit, ip, claude: claudeOn }))) return { out, limited: true };
  // Paquets de 20 (ou 8 000 caractères), un seul modèle Claude par paquet
  const opus = (x) => (claudeOn && claudeFor(x.it.kind) === CLAUDE.opus ? 1 : 0);
  todo.sort((a, b) => opus(a) - opus(b));
  const groups = [];
  let size = 0;
  for (const x of todo) {
    const last = groups[groups.length - 1];
    if (last && last.length < PER_CALL && size + x.it.text.length <= CALL_CHARS && opus(last[0]) === opus(x)) { last.push(x); size += x.it.text.length; } else { groups.push([x]); size = x.it.text.length; }
  }
  const spent = { on: false };
  // Par texte : { t, k } (traduction, clé sous laquelle la garder) ou null
  const results = await mapLimit(groups, 3, async (g) => {
    const res = g.map(() => null);
    // Claude a répondu, mais traduction refusée ou mal formée : celle de secours est gardée aussi sous sa clé, sinon
    // Claude serait rappelé pour ce texte à chaque demande (pas après une erreur de l'API : retenté après la pause)
    let answered = false;
    if (claudeOn && await claudeRoom(env, day).catch(() => false)) {
      let list = null;
      try { list = await claude(env, g.map(({ it }) => it.text), req.to, g[0].it.kind); answered = true; } catch { claudeOffUntil = Date.now() + CLAUDE_PAUSE; }
      g.forEach(({ k, it }, j) => { if (list && !bad(list[j], req.to, it)) res[j] = { t: list[j], k }; });
    }
    // Sans Claude : traductions de Mistral déjà gardées, sinon Mistral
    const rest = await Promise.all(g.flatMap(({ k, it }, j) => (res[j] ? [] : [(claudeOn ? keyOf(it.from, req.to, it.text) : Promise.resolve(k)).then((mk) => ({ j, mk, it }))])));
    const old = claudeOn ? await stored(env, rest.map((r) => r.mk)) : new Map();
    const need = rest.filter((r) => {
      const o = old.get(r.mk);
      if (o && !bad(o, req.to, r.it)) { res[r.j] = { t: o, ...(answered && { ck: g[r.j].k }) }; return false; }
      return true;
    });
    const tr = need.length ? await mistral(env, need.map((r) => r.it), req.to, spent) : [];
    need.forEach((r, n) => { if (tr[n]) res[r.j] = { t: tr[n], k: r.mk, ...(answered && { ck: g[r.j].k }) }; });
    return res;
  });
  const done = results.flat();
  const now = Date.now();
  const store = [];
  todo.forEach(({ k }, j) => {
    if (!done[j]) return;
    keys.forEach((kk, i) => { if (kk === k && out[i] === null) out[i] = done[j].t; });
    for (const sk of [done[j].k, done[j].ck]) if (sk) store.push(env.DB.prepare('INSERT OR REPLACE INTO translations (k, out, at) VALUES (?1, ?2, ?3)').bind(sk, done[j].t, now));
  });
  if (store.length) await env.DB.batch(store);
  return spent.on ? { out, limited: true } : { out };
}
