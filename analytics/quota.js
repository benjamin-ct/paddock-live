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

// key : compteur du jour (« 2026-10-18 », « radio:2026-10-18 ») ; day : date du jour ; ip : appelant
export async function aiQuota(env, { key, day, n, limit, ip }) {
  if (ip && !(await spend(env, `${day}|${ip}|${key}`, n, Math.ceil(limit / 4)))) return false;
  return spend(env, key, n, limit);
}

// Studio (code créateur) : plafond à lui, qui ne dépend pas de celui partagé par les applis
export const studioQuota = (env, day) => ({ key: `${day}|studio`, limit: Number(env.STUDIO_AI_LIMIT) || 4000 });

// Compteurs par adresse des jours passés : effacés (appelé une fois par jour)
export function pruneIpQuota(env, day) {
  return env.DB.prepare("DELETE FROM ai_usage WHERE day LIKE '____-__-__|%' AND day < ?1").bind(day).run();
}
