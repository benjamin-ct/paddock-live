// Plafonds d'IA du jour (table ai_usage) : un total pour tout le monde et, pour les appels anonymes, une
// part par adresse IP (le quart du total) : un seul appelant ne peut pas priver tous les autres.
// Vérifié et compté en une seule requête : des envois simultanés ne lisent plus tous le même total
async function spend(env, key, n, limit) {
  if (n > limit) return false;
  const r = await env.DB.prepare('INSERT INTO ai_usage (day, n) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET n = n + excluded.n WHERE ai_usage.n + excluded.n <= ?3')
    .bind(key, n, limit).run();
  return r?.meta?.changes === 1;
}

// Adresse de l'appelant pour les plafonds : en IPv6, son bloc /64 (une connexion en a des milliards, qu'un
// abuseur changerait à chaque appel) ; null hors de Cloudflare
export function callerIp(req) {
  const ip = req.headers.get('CF-Connecting-IP');
  return ip && ip.includes(':') ? `${ip.split(':').slice(0, 4).join(':')}::/64` : ip || null;
}

// Envois anonymes d'un appelant (statistiques de l'appli) : au plus `limit` par jour et par adresse
export const ipQuota = (env, { key, day, ip, n = 1, limit }) => spend(env, `${day}|${ip}|${key}`, n, limit);

// Workers AI : 10 000 neurones gratuits par jour (remise à zéro à minuit UTC), facturés au-delà (forfait Workers payant,
// 0,011 $ les 1 000). Chaque appel est compté d'après la grille de Cloudflare (jetons ou durée du son rendus par le modèle)
// dans « neurons:jour ». Plafond du jour : AI_NEURON_DAY, AI_NEURON_GP_DAY les week-ends de Grand Prix, jamais plus que
// les neurones gratuits plus ce qui reste du budget payé des 30 derniers jours (AI_NEURON_MONTH : 850 000, environ 9,40 $,
// sous les 10 € par mois). Plus aucun appel à 1 000 neurones du plafond (marge pour les appels en cours) ; plus de
// nouvelle demande un dixième avant, sauf pour les radios d'équipe et le Studio. Les plafonds de chaque usage
// (textes traduits, radios…) sont ceux d'un jour ordinaire et suivent le plafond du jour.
const RATES = {   // neurones par million de jetons : entrée, sortie
  '@cf/mistralai/mistral-small-3.1-24b-instruct': [31876, 50488],
  '@cf/meta/m2m100-1.2b': [31050, 31050],
};
const PER_MINUTE = { '@cf/openai/whisper-large-v3-turbo': 46.63, '@cf/openai/whisper': 41.14 };
const FREE = 10000, MARGIN = 1000, DAY_MS = 86400e3;
const tokens = (x) => Math.ceil((typeof x === 'string' ? x : JSON.stringify(x ?? '')).length / 3);   // si le modèle ne les donne pas

export function neuronsOf(model, input, r) {
  if (PER_MINUTE[model]) return PER_MINUTE[model] * (Number(r?.transcription_info?.duration) || Number(r?.words?.at(-1)?.end) || 0) / 60;
  if (!RATES[model]) throw new Error(`${model} : prix inconnu`);
  const [a, b] = RATES[model];
  const inT = r?.usage?.prompt_tokens ?? tokens(input.messages ?? input.text);
  const outT = r?.usage?.completion_tokens ?? tokens(r?.response ?? r?.choices?.[0]?.message?.content ?? r?.translated_text);
  return (inT * a + outT * b) / 1e6;
}

// API de Claude (traductions) : coût de chaque appel d'après les jetons facturés, en millionièmes de dollar, dans
// « claude-opus:jour » ou « claude-sonnet:jour », et textes traduits dans « claude-texts:jour ». Suivi seulement : les
// crédits de l'abonnement Max (100 $ par mois) s'arrêtent d'eux-mêmes une fois épuisés.
const CLAUDE_RATES = {   // $ par million de jetons : entrée, sortie, écriture du cache (5 min), lecture du cache
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.2],
};
export function claudeCost(model, u) {
  if (!CLAUDE_RATES[model]) throw new Error(`${model} : prix inconnu`);
  const [a, b, w, r] = CLAUDE_RATES[model];
  return ((u?.input_tokens || 0) * a + (u?.output_tokens || 0) * b + (u?.cache_creation_input_tokens || 0) * w + (u?.cache_read_input_tokens || 0) * r) / 1e6;
}
export async function countClaude(env, model, usage, texts) {
  const day = new Date().toISOString().slice(0, 10);
  await spend(env, `claude-${model.includes('opus') ? 'opus' : 'sonnet'}:${day}`, Math.round(claudeCost(model, usage) * 1e6), Number.MAX_SAFE_INTEGER);
  if (texts) await spend(env, `claude-texts:${day}`, texts, Number.MAX_SAFE_INTEGER);
}

// Week-end de Grand Prix : du vendredi au lundi (UTC) autour du jour de la course, d'après la saison gardée par la tâche
// planifiée ; lu une fois par jour
let gp = { day: null, on: false };
async function gpWeekend(env, day) {
  if (gp.day !== day) {
    const row = await env.DB.prepare('SELECT v FROM studio WHERE k = ?1').bind(`season:${day.slice(0, 4)}`).first().catch(() => null);
    let races = [];
    try { races = JSON.parse(row?.v || 'null')?.v?.races || []; } catch { /* saison illisible : jour ordinaire */ }
    const t = Date.parse(day);
    gp = { day, on: races.some((r) => { const race = Date.parse(String(r.date).slice(0, 10)); return t >= race - 2 * DAY_MS && t <= race + DAY_MS; }) };
  }
  return gp.on;
}

// { used : neurones du jour, top : plafond du jour (marge déduite), gp : week-end de Grand Prix, spent : neurones payés
// sur 30 jours, aujourd'hui compris, budget : AI_NEURON_MONTH }
export async function neuronBudget(env, day) {
  const from = new Date(Date.parse(day) - 29 * DAY_MS).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare('SELECT day, n FROM ai_usage WHERE day >= ?1 AND day <= ?2').bind(`neurons:${from}`, `neurons:${day}`).all();
  let used = 0, paid = 0;
  for (const r of results || []) {
    if (r.day === `neurons:${day}`) used = Number(r.n) || 0;
    else paid += Math.max(0, (Number(r.n) || 0) - FREE);
  }
  const gp = await gpWeekend(env, day);
  const budget = Number(env.AI_NEURON_MONTH) || 850000;
  const dayTop = gp ? Number(env.AI_NEURON_GP_DAY) || 70000 : Number(env.AI_NEURON_DAY) || 15000;
  return { used, top: Math.min(dayTop, FREE + Math.max(0, budget - paid)) - MARGIN, gp, spent: paid + Math.max(0, used - FREE), budget };
}

// Ce que l'IA a produit (compteurs des plafonds) : { today, month } avec, pour chacun, apps (textes traduits ou
// résumés par les applis, un résumé compte pour 5), studio (textes du Studio : résumé 5, post 3), radios (radios
// d'équipe transcrites), onboard (tranches de 30 s des caméras embarquées), neurons ; API de Claude : opus et sonnet
// (millionièmes de dollar), claudeTexts (textes traduits) ; aujourd'hui seulement, appsTop : textes de l'appelant
// qui en a demandé le plus (sa part du plafond)
export async function aiCounters(env, day) {
  const from = new Date(Date.parse(day) - 29 * DAY_MS).toISOString().slice(0, 10);
  const range = (p) => env.DB.prepare('SELECT day, n FROM ai_usage WHERE day >= ?1 AND day <= ?2').bind(`${p}${from}`, `${p}${day}~`).all().then((r) => r.results || []);
  const out = { today: {}, month: {} };
  const add = (kind, k, n) => {
    out.month[kind] = (out.month[kind] || 0) + (Number(n) || 0);
    if (k.includes(day)) out.today[kind] = (out.today[kind] || 0) + (Number(n) || 0);
  };
  const [days, radios, onboard, neurons, opus, sonnet, claudeTexts] = await Promise.all(['', 'radio:', 'onboard:', 'neurons:', 'claude-opus:', 'claude-sonnet:', 'claude-texts:'].map(range));
  // Jour seul : applis ; « jour|studio » : Studio ; « jour|adresse|… » : part d'un appelant, déjà comptée
  for (const r of days) {
    if (/^\d{4}-\d\d-\d\d$/.test(r.day)) add('apps', r.day, r.n);
    else if (/^[\d-]+\|studio$/.test(r.day)) add('studio', r.day, r.n);
    else if (r.day.startsWith(`${day}|`) && r.day.endsWith(`|${day}`)) out.today.appsTop = Math.max(out.today.appsTop || 0, Number(r.n) || 0);
  }
  for (const [kind, rows] of Object.entries({ radios, onboard, neurons, opus, sonnet, claudeTexts })) for (const r of rows) add(kind, r.day, r.n);
  return out;
}

// À la place de env.AI.run : refusé (erreur 4006, comme l'allocation épuisée de Cloudflare) passé le plafond, compté sinon
export async function runAI(env, model, input) {
  const day = new Date().toISOString().slice(0, 10);
  const { used, top } = await neuronBudget(env, day);
  if (used >= top) throw new Error('4006: daily allocation of neurons used up (Paddock Live)');
  const r = await env.AI.run(model, input);
  await spend(env, `neurons:${day}`, Math.ceil(neuronsOf(model, input, r)), Number.MAX_SAFE_INTEGER);
  return r;
}

// key : compteur du jour (« 2026-10-18 », « radio:2026-10-18 ») ; day : date du jour ; ip : appelant ; limit : celle
// d'un jour ordinaire ; claude : traduction par l'API de Claude, qui ne consomme pas de neurones (seul le plafond de
// textes compte ; si Mistral la remplace, runAI refuse lui-même passé le plafond des neurones)
// Plafond d'un usage agrandi avec le plafond du jour (top : neuronBudget), et part d'un même appelant
export const dayLimit = (env, limit, top) => Math.max(1, Math.round(limit * top / ((Number(env.AI_NEURON_DAY) || 15000) - MARGIN)));
export const ipShare = (limit) => Math.ceil(limit / 4);

export async function aiQuota(env, { key, day, n, limit, ip, claude = false }) {
  const { used, top } = await neuronBudget(env, day);
  if (!claude && used >= top - (/^radio:|\|studio$/.test(key) ? 0 : top / 10)) return false;
  limit = dayLimit(env, limit, top);
  if (ip && !(await spend(env, `${day}|${ip}|${key}`, n, ipShare(limit)))) return false;
  return spend(env, key, n, limit);
}

// Radio plus longue que prévu (un MP3 très compressé de 35 min passe pour une radio) : tranches de 30 s en plus,
// comptées après coup sur le total et la part de l'appelant, sans plafond (les demandes suivantes sont refusées)
export async function aiMore(env, { key, day, n, ip }) {
  if (!(n > 0)) return;
  await spend(env, key, n, Number.MAX_SAFE_INTEGER);
  if (ip) await spend(env, `${day}|${ip}|${key}`, n, Number.MAX_SAFE_INTEGER);
}

// API de Claude : plafond en dollars du jour (CLAUDE_DAILY_USD, 5 $ par défaut : crédits de 100 $ par mois, plus
// les week-ends de Grand Prix), vérifié avant chaque appel ; au-delà, Mistral comme pour une erreur de l'API
export async function claudeRoom(env, day) {
  const { results } = await env.DB.prepare('SELECT day, n FROM ai_usage WHERE day IN (?1, ?2)').bind(`claude-opus:${day}`, `claude-sonnet:${day}`).all();
  return (results || []).reduce((a, r) => a + (Number(r.n) || 0), 0) < (Number(env.CLAUDE_DAILY_USD) || 5) * 1e6;
}

// Studio (code créateur) : plafond à lui, qui ne dépend pas de celui partagé par les applis
export const studioQuota = (env, day) => ({ key: `${day}|studio`, limit: Number(env.STUDIO_AI_LIMIT) || 500 });

// Compteurs par adresse des jours passés : effacés (appelé une fois par jour). Ceux du Studio (« jour|studio ») restent :
// la colonne « 30 jours » de Stats → Appli les additionne
export function pruneIpQuota(env, day) {
  return env.DB.prepare("DELETE FROM ai_usage WHERE day LIKE '____-__-__|%' AND day NOT LIKE '%|studio' AND day < ?1").bind(day).run();
}
