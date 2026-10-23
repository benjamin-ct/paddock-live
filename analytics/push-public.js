// Alertes sur le téléphone pour tout le monde, même loin de l'ordinateur : page paddocklive.app/alertes/
// (ajoutée à l'écran d'accueil sur iPhone), abonnée par Web Push (standard des navigateurs, gratuit) à
// trois sujets au choix : rappel 30 minutes avant chaque séance, résultats (ils dévoilent la course : à
// cocher soi-même), grosses news. Abonnements dans push_subs (adresse du service de notification et clés de
// chiffrement du téléphone, sujets, langue : rien d'autre) ; messages en file dans push_out, envoyés par
// lots chaque minute (appel du Worker à lui-même, avec ses propres limites).
import { vapidKeys, sendPush, validSubscription } from './alerts.js';
import { ipQuota, callerIp } from './quota.js';
import { gpFull } from '../shared/gp-names.js';

export const TOPICS = ['sessions', 'results', 'news'];
const MAX_SUBS = 20000;          // abonnements en tout (coût des envois borné)
const SUBS_PER_IP = 20;          // abonnements ou changements par adresse et par jour
const TESTS_PER_IP = 10;
const BATCH = 40;                // envois par appel (sous la limite de sous-requêtes d'un appel)
const STALE = 6 * 3600e3;        // message pas encore parti au bout de 6 h : abandonné
const REMIND = 30 * 60e3;        // rappel 30 minutes avant la séance
const ALERTES = '/alertes/';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const cleanTopics = (t) => (Array.isArray(t) ? TOPICS.filter((x) => t.includes(x)) : []);

// ---------- Routes publiques (/a/…) ----------
export async function publicPushApi(req, env, path) {
  if (!env.DB) return json({ error: 'Base indisponible' }, 503);
  if (path === 'key' && req.method === 'GET') return json({ key: (await vapidKeys(env)).pub, topics: TOPICS });
  if (req.method !== 'POST') return json({ error: 'Introuvable' }, 404);
  if (Number(req.headers.get('Content-Length') || 0) > 4096) return json({ error: 'Trop volumineux' }, 413);
  const body = await req.json().catch(() => null);
  const day = new Date().toISOString().slice(0, 10);
  const ip = callerIp(req);
  if (path === 'sub') {
    const s = body?.subscription;
    const topics = cleanTopics(body?.topics);
    if (!validSubscription(s)) return json({ error: 'Abonnement invalide' }, 400);
    if (ip && !(await ipQuota(env, { key: 'push-sub', day, ip, limit: SUBS_PER_IP }))) return json({ error: 'Trop de changements aujourd\'hui' }, 429);
    if (!topics.length) {
      await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?1').bind(s.endpoint).run();
      return json({ ok: true, topics });
    }
    const known = await env.DB.prepare('SELECT 1 FROM push_subs WHERE endpoint = ?1').bind(s.endpoint).first();
    if (!known && ((await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first())?.n || 0) >= MAX_SUBS) return json({ error: 'Trop d\'abonnés pour le moment, réessayez plus tard' }, 503);
    await env.DB.prepare('INSERT INTO push_subs (endpoint, p256dh, auth, topics, lang, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, topics = excluded.topics, lang = excluded.lang')
      .bind(s.endpoint, s.keys.p256dh, s.keys.auth, topics.join(','), body?.lang === 'en' ? 'en' : 'fr', Date.now()).run();
    return json({ ok: true, topics });
  }
  if (path === 'off') {
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?1').bind(String(body?.endpoint || '')).run();
    return json({ ok: true });
  }
  if (path === 'test') {
    if (ip && !(await ipQuota(env, { key: 'push-test', day, ip, limit: TESTS_PER_IP }))) return json({ error: 'Trop d\'essais aujourd\'hui' }, 429);
    const row = await env.DB.prepare('SELECT endpoint, p256dh, auth, lang FROM push_subs WHERE endpoint = ?1').bind(String(body?.endpoint || '')).first();
    if (!row) return json({ error: 'Ce téléphone n\'est pas abonné' }, 404);
    const en = row.lang === 'en';
    const r = await sendPush(await vapidKeys(env), subOf(row), { title: en ? 'Alerts are on' : 'Alertes activées', body: en ? 'Paddock Live alerts will arrive here.' : 'Les alertes de Paddock Live arriveront ici.', url: ALERTES }).catch(() => false);
    return r === true ? json({ ok: true }) : json({ error: 'Envoi refusé par le service de notification' }, 502);
  }
  return json({ error: 'Introuvable' }, 404);
}

const subOf = (r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } });

// ---------- Messages mis en file (une seule fois chacun : clé dans push_sent) ----------
// msg : { fr: { title, body }, en: { title, body }, url }
export async function queuePush(env, k, topic, msg, now = Date.now()) {
  const r = await env.DB.prepare('INSERT INTO push_sent (k, at) VALUES (?1, ?2) ON CONFLICT (k) DO NOTHING').bind(k, now).run();
  if (r?.meta?.changes !== 1) return false;
  await env.DB.prepare('INSERT INTO push_out (topic, msg, cursor, at) VALUES (?1, ?2, \'\', ?3)').bind(topic, JSON.stringify(msg), now).run();
  return true;
}

// Rappel des séances qui commencent dans 20 à 30 minutes (saison gardée en base par la tâche planifiée)
const EN_SESSION = { EL1: 'FP1', EL2: 'FP2', EL3: 'FP3', 'Qualif. sprint': 'Sprint Qualifying', Sprint: 'Sprint', Qualifications: 'Qualifying', Course: 'Race' };
const FR_SESSION = { EL1: 'Essais libres 1', EL2: 'Essais libres 2', EL3: 'Essais libres 3', 'Qualif. sprint': 'Qualifications sprint', Sprint: 'Sprint', Qualifications: 'Qualifications', Course: 'Course' };
export function sessionReminders(season, now = Date.now()) {
  const out = [];
  for (const r of season?.races || []) {
    for (const s of r.sessions || []) {
      const t = Date.parse(s.t);
      if (!(t - now > REMIND - 10 * 60e3 && t - now <= REMIND)) continue;
      out.push({
        k: `remind:${s.t}:${r.round}:${s.label}`,
        msg: {
          fr: { title: `${FR_SESSION[s.label] || s.label} dans 30 minutes`, body: gpFull(r.name) },
          en: { title: `${EN_SESSION[s.label] || s.label} in 30 minutes`, body: gpFull(r.name, true) },
          url: ALERTES,
        },
      });
    }
  }
  return out;
}

// Résultats parus depuis la lecture précédente de la saison (vainqueur, poleman) : seulement pour ceux qui
// ont choisi de les recevoir
export function resultMessages(before, after, now = Date.now()) {
  const out = [];
  for (const r of after?.races || []) {
    if (Math.abs(now - Date.parse(r.date)) > 3 * 86400e3) continue;
    const old = before?.races?.find((x) => x.round === r.round);
    const fr = gpFull(r.name), en = gpFull(r.name, true);
    const done = (k) => r[k]?.length && !old?.[k]?.length;
    if (done('sprintResults')) out.push({ k: `res:${r.date}:sprint`, msg: { fr: { title: `Sprint : victoire de ${r.sprintResults[0].name}`, body: fr }, en: { title: `Sprint: ${r.sprintResults[0].name} wins`, body: en }, url: ALERTES } });
    if (done('quali')) out.push({ k: `res:${r.date}:quali`, msg: { fr: { title: `Pole position pour ${r.quali[0].name}`, body: fr }, en: { title: `Pole position for ${r.quali[0].name}`, body: en }, url: ALERTES } });
    if (done('results')) out.push({ k: `res:${r.date}:race`, msg: { fr: { title: `Victoire de ${r.results[0].name}`, body: fr }, en: { title: `${r.results[0].name} wins`, body: en }, url: ALERTES } });
  }
  return out;
}

// ---------- Envoi par lots (appelé chaque minute s'il y a des messages en file) ----------
export async function pushRun(env, { fetchFn = fetch, now = Date.now(), batch = BATCH } = {}) {
  await env.DB.prepare('DELETE FROM push_out WHERE at < ?1').bind(now - STALE).run();
  const job = await env.DB.prepare('SELECT id, topic, msg, cursor FROM push_out ORDER BY id LIMIT 1').first();
  if (!job) return { sent: 0 };
  const { results: subs = [] } = await env.DB.prepare('SELECT endpoint, p256dh, auth, lang FROM push_subs WHERE instr(\',\' || topics || \',\', ?1) > 0 AND endpoint > ?2 ORDER BY endpoint LIMIT ?3')
    .bind(`,${job.topic},`, job.cursor, batch).all();
  const msg = JSON.parse(job.msg);
  const keys = await vapidKeys(env);
  const gone = [];
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    const m = msg[s.lang] || msg.fr;
    const r = await sendPush(keys, subOf(s), { title: m.title, body: m.body, url: msg.url, id: job.id }, { fetchFn, now }).catch(() => false);
    if (r === 'gone') gone.push(s.endpoint);
    else if (r) sent++;
  }));
  for (const e of gone) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?1').bind(e).run();
  if (subs.length < batch) await env.DB.prepare('DELETE FROM push_out WHERE id = ?1').bind(job.id).run();
  else await env.DB.prepare('UPDATE push_out SET cursor = ?1 WHERE id = ?2').bind(subs.at(-1).endpoint, job.id).run();
  return { sent, gone: gone.length, more: subs.length === batch };
}

// Nombre d'abonnés à un sujet (les grosses news ne sont relevées que si quelqu'un les attend)
export const subscribers = async (env, topic) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE instr(\',\' || topics || \',\', ?1) > 0').bind(`,${topic},`).first())?.n || 0;
