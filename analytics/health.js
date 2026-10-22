// Bilan de santé (tâche planifiée, toutes les 6 heures) : notification sur le téléphone du créateur
// seulement quand quelque chose ne va pas, une fois par problème et par jour :
// - flux F1 en direct : la négociation de connexion (comme l'appli) ne répond plus comme prévu ;
// - erreurs de l'appli : hier, nettement plus que les 7 jours d'avant ;
// - jetons (Threads, F1 TV) bientôt expirés : dates notées par le Studio à son ouverture, sans les jetons.
import { getRow, setRow, readJSON, notifyPhones } from './alerts.js';

const NEGOTIATE = 'https://livetiming.formula1.com/signalrcore/negotiate?negotiateVersion=1';
const DAY = 86400e3;
export const HEALTH = { errMin: 10, errRatio: 3, tokenDays: 7, every: 6 };
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

// Flux F1 : null si tout va bien, sinon le problème
async function f1Feed(fetchFn) {
  try {
    const res = await fetchFn(NEGOTIATE, { method: 'POST', headers: { 'Content-Length': '0' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return `Flux F1 en direct : la connexion répond HTTP ${res.status}`;
    const j = await res.json().catch(() => null);
    return j?.connectionToken || j?.connectionId ? null : 'Flux F1 en direct : réponse inattendue (format changé ?)';
  } catch (err) { return `Flux F1 en direct injoignable (${String(err?.message || err).slice(0, 80)})`; }
}

// Erreurs de l'appli d'hier comparées à la moyenne des 7 jours d'avant
async function appErrors(env, now) {
  const y = dayOf(now - DAY);
  const rows = (await env.DB.prepare("SELECT day, SUM(n) AS n FROM counts WHERE day >= ?1 AND day <= ?2 AND event LIKE 'error.%' GROUP BY day").bind(dayOf(now - 8 * DAY), y).all()).results || [];
  const last = rows.find((r) => r.day === y)?.n || 0;
  const before = rows.filter((r) => r.day !== y).reduce((t, r) => t + r.n, 0) / 7;
  if (last < HEALTH.errMin || last < HEALTH.errRatio * Math.max(before, 1)) return null;
  const top = await env.DB.prepare('SELECT place, version, SUM(n) AS n FROM error_details WHERE day = ?1 GROUP BY place, version ORDER BY n DESC LIMIT 1').bind(y).first().catch(() => null);
  return `Erreurs de l'appli : ${last} hier, contre ${Math.round(before)} par jour avant${top ? ` (surtout ${top.place}, v${top.version})` : ''}`;
}

// Jetons bientôt expirés (dates notées par le Studio)
const TOKEN_NAMES = { threads: 'Threads', threads2: 'Threads (2e compte)', f1tv: 'F1 TV' };
function tokens(exp, now) {
  const out = [];
  for (const [k, name] of Object.entries(TOKEN_NAMES)) {
    const t = exp?.[k];
    if (!t || t - now > HEALTH.tokenDays * DAY) continue;
    const d = Math.ceil((t - now) / DAY);
    out.push([`token.${k}`, t <= now ? `Jeton ${name} expiré : ouvrez le Studio ou reconnectez-le dans l'appli` : `Jeton ${name} : expire dans ${d} jour${d > 1 ? 's' : ''} (ouvrez le Studio pour le prolonger)`]);
  }
  return out;
}

export async function healthCheck(env, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB) return null;
  const st = await readJSON(env, 'health', {});
  const problems = [];
  // Flux F1 : alerte au 2e échec de suite, seulement s'il a déjà répondu depuis ce serveur (pas de
  // fausse alerte si la F1 bloque les serveurs de Cloudflare)
  const f1 = await f1Feed(fetchFn);
  const f1fails = f1 ? (st.f1fails || 0) + 1 : 0;
  if (f1 && f1fails >= 2 && st.f1ok) problems.push(['f1', f1]);
  const err = await appErrors(env, now).catch(() => null);
  if (err) problems.push(['errors', err]);
  problems.push(...tokens(await readJSON(env, 'expiries', {}), now));
  // Une notification par problème et par jour
  const today = dayOf(now);
  const sent = Object.fromEntries(Object.entries(st.sent || {}).filter(([, d]) => d === today));
  const fresh = problems.filter(([k]) => !sent[k]);
  if (fresh.length) {
    await notifyPhones(env, { title: 'Paddock Live · à vérifier', body: fresh.map(([, m]) => m).join('\n'), id: `health-${today}-${fresh.map(([k]) => k).join('-')}`, url: '/studio/?alert=health' }, { fetchFn, now }).catch(() => 0);
    for (const [k] of fresh) sent[k] = today;
  }
  const next = { at: now, f1fails, f1ok: st.f1ok || !f1, f1: f1 || null, problems: problems.map(([k, m]) => ({ k, m })), sent };
  await setRow(env, 'health', JSON.stringify(next));
  return next;
}

// Studio : dates d'expiration des jetons (pas les jetons) notées pour le bilan de santé
export async function noteExpiries(env, vault, jwtExp) {
  const exp = { threads: vault.threads?.expiresAt || null, threads2: vault.threads2?.expiresAt || null, f1tv: vault.f1tv ? jwtExp(vault.f1tv) || null : null };
  const v = JSON.stringify(exp);
  if (await getRow(env, 'expiries') !== v) await setRow(env, 'expiries', v);
}
