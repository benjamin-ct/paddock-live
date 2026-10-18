// Plafonds d'IA du jour (table ai_usage) : un total pour tout le monde et, pour les appels anonymes, une
// part par adresse IP (le quart du total) : un seul appelant ne peut pas priver tous les autres.
async function spend(env, key, n, limit) {
  const used = (await env.DB.prepare('SELECT n FROM ai_usage WHERE day = ?1').bind(key).first())?.n || 0;
  if (used + n > limit) return false;
  await env.DB.prepare('INSERT INTO ai_usage (day, n) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET n = n + excluded.n').bind(key, n).run();
  return true;
}

// key : compteur du jour (« 2026-10-18 », « radio:2026-10-18 ») ; day : date du jour ; ip : appelant
export async function aiQuota(env, { key, day, n, limit, ip }) {
  if (ip && !(await spend(env, `${day}|${ip}|${key}`, n, Math.ceil(limit / 4)))) return false;
  return spend(env, key, n, limit);
}

// Compteurs par adresse des jours passés : effacés (appelé une fois par jour)
export function pruneIpQuota(env, day) {
  return env.DB.prepare("DELETE FROM ai_usage WHERE day LIKE '____-__-__|%' AND day < ?1").bind(day).run();
}
