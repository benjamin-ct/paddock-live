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

// Allocation gratuite de Workers AI : 10 000 neurones par jour (remise à zéro à minuit UTC), facturés au-delà avec le
// forfait Workers payant. Chaque appel est compté d'après la grille de Cloudflare (jetons ou durée du son rendus par le
// modèle) dans « neurons:jour » : plus aucun appel passé AI_NEURON_LIMIT (marge pour les appels en cours), et plus de
// nouvelle demande RESERVE neurones avant, sauf pour les radios d'équipe et le Studio
const RATES = {   // neurones par million de jetons : entrée, sortie
  '@cf/mistralai/mistral-small-3.1-24b-instruct': [31876, 50488],
  '@cf/meta/m2m100-1.2b': [31050, 31050],
};
const PER_MINUTE = { '@cf/openai/whisper-large-v3-turbo': 46.63, '@cf/openai/whisper': 41.14 };
const RESERVE = 1000;
const neuronLimit = (env) => Number(env.AI_NEURON_LIMIT) || 9000;
const tokens = (x) => Math.ceil((typeof x === 'string' ? x : JSON.stringify(x ?? '')).length / 3);   // si le modèle ne les donne pas

export function neuronsOf(model, input, r) {
  if (PER_MINUTE[model]) return PER_MINUTE[model] * (Number(r?.transcription_info?.duration) || Number(r?.words?.at(-1)?.end) || 0) / 60;
  if (!RATES[model]) throw new Error(`${model} : prix inconnu`);
  const [a, b] = RATES[model];
  const inT = r?.usage?.prompt_tokens ?? tokens(input.messages ?? input.text);
  const outT = r?.usage?.completion_tokens ?? tokens(r?.response ?? r?.choices?.[0]?.message?.content ?? r?.translated_text);
  return (inT * a + outT * b) / 1e6;
}

async function neuronsUsed(env, day) {
  return Number((await env.DB.prepare('SELECT n FROM ai_usage WHERE day = ?1').bind(`neurons:${day}`).first())?.n) || 0;
}

// À la place de env.AI.run : refusé (erreur 4006, comme l'allocation épuisée de Cloudflare) passé le plafond, compté sinon
export async function runAI(env, model, input) {
  const day = new Date().toISOString().slice(0, 10);
  if ((await neuronsUsed(env, day)) >= neuronLimit(env)) throw new Error('4006: daily free allocation of neurons used up (Paddock Live)');
  const r = await env.AI.run(model, input);
  await spend(env, `neurons:${day}`, Math.ceil(neuronsOf(model, input, r)), Number.MAX_SAFE_INTEGER);
  return r;
}

// key : compteur du jour (« 2026-10-18 », « radio:2026-10-18 ») ; day : date du jour ; ip : appelant
export async function aiQuota(env, { key, day, n, limit, ip }) {
  if ((await neuronsUsed(env, day)) >= neuronLimit(env) - (/^radio:|\|studio$/.test(key) ? 0 : RESERVE)) return false;
  if (ip && !(await spend(env, `${day}|${ip}|${key}`, n, Math.ceil(limit / 4)))) return false;
  return spend(env, key, n, limit);
}

// Studio (code créateur) : plafond à lui, qui ne dépend pas de celui partagé par les applis
export const studioQuota = (env, day) => ({ key: `${day}|studio`, limit: Number(env.STUDIO_AI_LIMIT) || 500 });

// Compteurs par adresse des jours passés : effacés (appelé une fois par jour)
export function pruneIpQuota(env, day) {
  return env.DB.prepare("DELETE FROM ai_usage WHERE day LIKE '____-__-__|%' AND day < ?1").bind(day).run();
}
