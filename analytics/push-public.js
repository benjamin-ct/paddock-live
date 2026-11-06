// Alertes sur le téléphone pour tout le monde, même loin de l'ordinateur : page paddocklive.app/alertes/
// (ajoutée à l'écran d'accueil sur iPhone), abonnée par Web Push (standard des navigateurs, gratuit) à
// trois sujets au choix : rappel 30 minutes avant chaque séance (et la veille vers 21 h quand elle tombe entre minuit et
// 7 h chez soi), résultats (ils dévoilent la course : à
// cocher soi-même), grosses news. Abonnements dans push_subs (adresse du service de notification et clés de
// chiffrement du téléphone, sujets, langue, fuseau horaire : rien d'autre) ; messages en file dans push_out, envoyés par
// lots chaque minute (appels du Worker à lui-même, avec leurs propres limites), enchaînés tant qu'il en reste (worker.js).
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
const TZ = 'tz@';                // fuseau envoyé par la page : sujet interne tz@Europe/Paris, toujours en dernier dans topics
const QUIET = [23, 7];           // heures calmes chez l'abonné : grosses news gardées et regroupées à 7 h
const tzOf = (topics) => { const i = topics.indexOf(TZ); return i < 0 ? null : topics.slice(i + TZ.length); };

// Fuseau envoyé par la page (Intl) : nom IANA connu du moteur, sinon rien
export function cleanTz(tz) {
  if (typeof tz !== 'string' || tz.length > 64 || !/^[A-Za-z]+(\/[A-Za-z0-9_+-]+)+$/.test(tz)) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return null; }
}

const LANGS = ['fr', 'en', 'it', 'es'];
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
    const tz = cleanTz(body?.tz);
    await env.DB.prepare('INSERT INTO push_subs (endpoint, p256dh, auth, topics, lang, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, topics = excluded.topics, lang = excluded.lang')
      .bind(s.endpoint, s.keys.p256dh, s.keys.auth, [...topics, ...(tz ? [TZ + tz] : [])].join(','), LANGS.includes(body?.lang) ? body.lang : 'fr', Date.now()).run();
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
    const m = {
      fr: { title: 'Alertes activées', body: 'Les alertes de Paddock Live arriveront ici.' },
      en: { title: 'Alerts are on', body: 'Paddock Live alerts will arrive here.' },
      it: { title: 'Avvisi attivati', body: 'Gli avvisi di Paddock Live arriveranno qui.' },
      es: { title: 'Alertas activadas', body: 'Las alertas de Paddock Live llegarán aquí.' },
    }[row.lang] || {};
    const r = await sendPush(await vapidKeys(env), subOf(row), { ...m, url: ALERTES }).catch(() => false);
    return r === true ? json({ ok: true }) : json({ error: 'Envoi refusé par le service de notification' }, 502);
  }
  return json({ error: 'Introuvable' }, 404);
}

const subOf = (r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } });

// ---------- Messages mis en file (une seule fois chacun : clé dans push_sent) ----------
// msg : { fr: { title, body }, en: { title, body }, it: …, es: …, url } (sans it ou es : anglais)
export async function queuePush(env, k, topic, msg, now = Date.now()) {
  const r = await env.DB.prepare('INSERT INTO push_sent (k, at) VALUES (?1, ?2) ON CONFLICT (k) DO NOTHING').bind(k, now).run();
  if (r?.meta?.changes !== 1) return false;
  await env.DB.prepare('INSERT INTO push_out (topic, msg, cursor, at) VALUES (?1, ?2, \'\', ?3)').bind(topic, JSON.stringify(msg), now).run();
  return true;
}

// Rappel des séances qui commencent dans 20 à 30 minutes (saison gardée en base par la tâche planifiée)
const EN_SESSION = { EL1: 'FP1', EL2: 'FP2', EL3: 'FP3', 'Qualif. sprint': 'Sprint Qualifying', Sprint: 'Sprint', Qualifications: 'Qualifying', Course: 'Race' };
const FR_SESSION = { EL1: 'Essais libres 1', EL2: 'Essais libres 2', EL3: 'Essais libres 3', 'Qualif. sprint': 'Qualifications sprint', Sprint: 'Sprint', Qualifications: 'Qualifications', Course: 'Course' };
const IT_SESSION = { EL1: 'Prove libere 1', EL2: 'Prove libere 2', EL3: 'Prove libere 3', 'Qualif. sprint': 'Qualifiche sprint', Sprint: 'Sprint', Qualifications: 'Qualifiche', Course: 'Gara' };
const ES_SESSION = { EL1: 'Libres 1', EL2: 'Libres 2', EL3: 'Libres 3', 'Qualif. sprint': 'Clasificación sprint', Sprint: 'Sprint', Qualifications: 'Clasificación', Course: 'Carrera' };
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
          it: { title: `${IT_SESSION[s.label] || s.label} tra 30 minuti`, body: gpFull(r.name, 'it') },
          es: { title: `${ES_SESSION[s.label] || s.label} en 30 minutos`, body: gpFull(r.name, 'es') },
          url: ALERTES,
        },
      });
    }
  }
  return out;
}

// Veille au soir (21 h à 21 h 10 chez l'abonné) : séances qui commencent entre minuit et 7 h la nuit suivante, dans
// chacun des fuseaux des abonnés (tzs). Une fois par fuseau et par soir.
const localOf = (ms, tz) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(ms).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute };
};
const hourFr = ({ h, m }) => `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
const hourEn = ({ h, m }) => `${h || 12}:${String(m).padStart(2, '0')} am`;
const hour24 = ({ h, m }) => `${h}:${String(m).padStart(2, '0')}`;
const atIt = (at) => `${at.h === 1 ? 'all\'' : 'alle '}${hour24(at)}`;      // « all'1:30 », « alle 5:00 »
const atEs = (at) => `${at.h === 1 ? 'a la' : 'a las'} ${hour24(at)}`;      // « a la 1:30 », « a las 5:00 »
// Séances dans 2 h 30 à 10 h 30 : les seules qui peuvent tomber dans la nuit qui suit 21 h quelque part
export function eveSoon(season, now = Date.now()) {
  const soon = [];
  for (const r of season?.races || []) for (const s of r.sessions || []) {
    const t = Date.parse(s.t);
    if (t - now > 2.5 * 3600e3 && t - now <= 10.5 * 3600e3) soon.push({ r, s, t });
  }
  return soon;
}
export function eveReminders(season, tzs, now = Date.now()) {
  const soon = eveSoon(season, now);
  const out = [];
  if (!soon.length) return out;
  for (const tz of tzs) {
    const here = localOf(now, tz);
    if (here.h !== 21 || here.m >= 10) continue;
    const tomorrow = localOf(now + 12 * 3600e3, tz).day;
    const night = soon.map((x) => ({ ...x, at: localOf(x.t, tz) })).filter((x) => x.at.day === tomorrow && x.at.h < 7).sort((a, b) => a.t - b.t);
    if (!night.length) continue;
    const gp = night[0].r;
    out.push({
      k: `eve:${tz}:${here.day}`,
      topic: `sessions,${TZ}${tz}`,
      msg: {
        fr: { title: `Cette nuit : ${night.map((x) => `${FR_SESSION[x.s.label] || x.s.label} à ${hourFr(x.at)}`).join(', ')}`, body: `${gpFull(gp.name)} · rappel 30 minutes avant` },
        en: { title: `Overnight: ${night.map((x) => `${EN_SESSION[x.s.label] || x.s.label} at ${hourEn(x.at)}`).join(', ')}`, body: `${gpFull(gp.name, true)} · reminder 30 minutes before` },
        it: { title: `Stanotte: ${night.map((x) => `${IT_SESSION[x.s.label] || x.s.label} ${atIt(x.at)}`).join(', ')}`, body: `${gpFull(gp.name, 'it')} · promemoria 30 minuti prima` },
        es: { title: `Esta noche: ${night.map((x) => `${ES_SESSION[x.s.label] || x.s.label} ${atEs(x.at)}`).join(', ')}`, body: `${gpFull(gp.name, 'es')} · aviso 30 minutos antes` },
        url: ALERTES,
      },
    });
  }
  return out;
}

// Fuseaux des abonnés au rappel des séances (sujet tz@…, en dernier dans topics)
export async function eveZones(env) {
  const { results = [] } = await env.DB.prepare('SELECT DISTINCT substr(topics, instr(topics, ?1) + 3) AS tz FROM push_subs WHERE instr(topics, ?1) > 0 AND instr(\',\' || topics || \',\', \',sessions,\') > 0').bind(TZ).all();
  return results.map((x) => cleanTz(x.tz)).filter(Boolean);
}

// Heures calmes (23 h à 7 h chez l'abonné) : les grosses news de la nuit, gardées par fuseau (studio, night:<fuseau>),
// partent en un seul message à 7 h
const quiet = (now, tz) => { const h = localOf(now, tz).h; return h >= QUIET[0] || h < QUIET[1]; };
async function keepForMorning(env, tz, job, msg, now) {
  const k = `night:${tz}`;
  const list = JSON.parse(await env.DB.prepare('SELECT v FROM studio WHERE k = ?1').bind(k).first('v') || '[]');
  if (list.some((x) => x.id === job.id)) return;
  list.push({ ...msg, id: job.id });
  await env.DB.prepare('INSERT INTO studio (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT (k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(k, JSON.stringify(list.slice(-10)), now).run();
}
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
export async function morningDigests(env, now = Date.now()) {
  const { results = [] } = await env.DB.prepare('SELECT k, v, at FROM studio WHERE k >= \'night:\' AND k < \'night;\'').all();
  for (const row of results) {
    const tz = cleanTz(row.k.slice(6));
    const here = tz && localOf(now, tz);
    if (tz && !(here.h === QUIET[1] && here.m < 10) && now - row.at < 24 * 3600e3) continue;
    await env.DB.prepare('DELETE FROM studio WHERE k = ?1').bind(row.k).run();
    const list = JSON.parse(row.v || '[]');
    if (!tz || !list.length || now - row.at >= 24 * 3600e3) continue;
    const one = list.length === 1 ? list[0] : null;
    await queuePush(env, `night:${tz}:${here.day}`, `news,${TZ}${tz}`, one || {
      fr: { title: `Cette nuit : ${plural(list.length, 'grosse news', 'grosses news')}`, body: list.map((x) => x.fr.body).join(' · ') },
      en: { title: `Overnight: ${plural(list.length, 'big story', 'big stories')}`, body: list.map((x) => x.en.body).join(' · ') },
      it: { title: `Stanotte: ${plural(list.length, 'grande notizia', 'grandi notizie')}`, body: list.map((x) => (x.it || x.en).body).join(' · ') },
      es: { title: `Esta noche: ${plural(list.length, 'gran noticia', 'grandes noticias')}`, body: list.map((x) => (x.es || x.en).body).join(' · ') },
      url: ALERTES,
    }, now);
  }
}

// Résultats parus depuis la lecture précédente de la saison (vainqueur, poleman) : seulement pour ceux qui
// ont choisi de les recevoir
export function resultMessages(before, after, now = Date.now()) {
  const out = [];
  for (const r of after?.races || []) {
    if (Math.abs(now - Date.parse(r.date)) > 3 * 86400e3) continue;
    const old = before?.races?.find((x) => x.round === r.round);
    const fr = gpFull(r.name), en = gpFull(r.name, true), it = gpFull(r.name, 'it'), es = gpFull(r.name, 'es');
    const done = (k) => r[k]?.length && !old?.[k]?.length;
    const msg = (who, t) => ({ fr: { title: t.fr(who), body: fr }, en: { title: t.en(who), body: en }, it: { title: t.it(who), body: it }, es: { title: t.es(who), body: es }, url: ALERTES });
    if (done('sprintResults')) out.push({ k: `res:${r.date}:sprint`, msg: msg(r.sprintResults[0].name, { fr: (w) => `Sprint : victoire de ${w}`, en: (w) => `Sprint: ${w} wins`, it: (w) => `Sprint: vince ${w}`, es: (w) => `Sprint: gana ${w}` }) });
    if (done('quali')) out.push({ k: `res:${r.date}:quali`, msg: msg(r.quali[0].name, { fr: (w) => `Pole position pour ${w}`, en: (w) => `Pole position for ${w}`, it: (w) => `Pole position per ${w}`, es: (w) => `Pole position para ${w}` }) });
    if (done('results')) out.push({ k: `res:${r.date}:race`, msg: msg(r.results[0].name, { fr: (w) => `Victoire de ${w}`, en: (w) => `${w} wins`, it: (w) => `Vittoria di ${w}`, es: (w) => `Victoria de ${w}` }) });
  }
  return out;
}

// ---------- Envoi par lots (appelé chaque minute s'il y a des messages en file) ----------
export async function pushRun(env, { fetchFn = fetch, now = Date.now(), batch = BATCH } = {}) {
  await env.DB.prepare('DELETE FROM push_out WHERE at < ?1').bind(now - STALE).run();
  const job = await env.DB.prepare('SELECT id, topic, msg, cursor FROM push_out ORDER BY id LIMIT 1').first();
  if (!job) return { sent: 0 };
  // Sujet du message, et fuseau visé s'il y en a un (« sessions,tz@Europe/Paris » : rappel de la veille, news du matin)
  const [topic, only] = job.topic.split(',');
  const { results: subs = [] } = await env.DB.prepare('SELECT endpoint, p256dh, auth, lang, topics FROM push_subs WHERE instr(\',\' || topics || \',\', ?1) > 0 AND endpoint > ?2 AND instr(\',\' || topics || \',\', ?4) > 0 ORDER BY endpoint LIMIT ?3')
    .bind(`,${topic},`, job.cursor, batch, only ? `,${only},` : ',').all();
  const msg = JSON.parse(job.msg);
  const keys = await vapidKeys(env);
  const gone = [], night = new Set();
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    const tz = topic === 'news' && !only && cleanTz(tzOf(s.topics || ''));
    if (tz && quiet(now, tz)) { night.add(tz); return; }
    const m = msg[s.lang] || (s.lang === 'fr' ? msg.fr : msg.en) || msg.fr;   // italien ou espagnol absents : anglais
    const r = await sendPush(keys, subOf(s), { title: m.title, body: m.body, url: msg.url, id: job.id }, { fetchFn, now }).catch(() => false);
    if (r === 'gone') gone.push(s.endpoint);
    else if (r) sent++;
  }));
  for (const e of gone) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?1').bind(e).run();
  for (const tz of night) await keepForMorning(env, tz, job, msg, now);
  if (subs.length < batch) await env.DB.prepare('DELETE FROM push_out WHERE id = ?1').bind(job.id).run();
  else await env.DB.prepare('UPDATE push_out SET cursor = ?1 WHERE id = ?2').bind(subs.at(-1).endpoint, job.id).run();
  return { sent, gone: gone.length, more: subs.length === batch };
}

// Nombre d'abonnés à un sujet (les grosses news ne sont relevées que si quelqu'un les attend)
export const subscribers = async (env, topic) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE instr(\',\' || topics || \',\', ?1) > 0').bind(`,${topic},`).first())?.n || 0;
