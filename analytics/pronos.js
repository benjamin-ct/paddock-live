// Pronostics entre amis en ligne : un groupe (lien paddocklive.app/p/<id>) où chacun pronostique la
// pole et le podium depuis une page web ou depuis l'appli, hors du réseau local. Saison et résultats :
// ceux que garde le serveur (seasonRow). Un pseudo appartient au premier qui l'utilise : son jeton,
// gardé par son navigateur ou son appli, est demandé pour le modifier. Le créateur reçoit un jeton
// qui lui permet de supprimer le groupe pour tout le monde. Mêmes règles et mêmes points
// que dans l'appli (shared/predict.js).
import { seasonRow } from './studio.js';
import { predictView, checkPick, playerKey } from '../shared/predict.js';
import { gpFull } from '../shared/gp-names.js';
import { callerIp } from './quota.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const GROUP_RE = /^[a-z0-9]{10}$/;
const MAX_PLAYERS = 50;
const MAX_NEW = 20;   // groupes créés par adresse et par jour
const SEASON_AGE = 6 * 3600e3;   // saison enregistrée acceptée telle quelle (tenue à jour par la tâche planifiée)

const newId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const groupOf = (env, id) => env.DB.prepare('SELECT id, name FROM pronos_groups WHERE id = ?').bind(id).first();
const adminOf = (env, id) => env.DB.prepare('SELECT tok FROM pronos_admins WHERE grp = ?').bind(id).first();

// Pronostics d'une saison du groupe : { rounds: { manche: { clé: { name, pole, p1, p2, p3, tok } } } }
async function storeOf(env, id, year) {
  const { results } = await env.DB.prepare('SELECT round, pkey, name, pole, p1, p2, p3, tok FROM pronos WHERE grp = ? AND year = ?').bind(id, year).all();
  const store = { rounds: {} };
  for (const r of results || []) (store.rounds[r.round] ||= {})[r.pkey] = { name: r.name, pole: r.pole, p1: r.p1, p2: r.p2, p3: r.p3, tok: r.tok };
  return store;
}

export async function pronosApi(req, env, url, { now = Date.now() } = {}) {
  const path = url.pathname.slice('/p/api/'.length);
  if (path === 'new' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Pronostics F1';
    const ip = callerIp(req) || 'local';
    const day = new Date(now).toISOString().slice(0, 10);
    const n = (await env.DB.prepare('SELECT n FROM pronos_new WHERE ip = ? AND day = ?').bind(ip, day).first())?.n || 0;
    if (n >= MAX_NEW) return json({ error: 'Trop de groupes créés aujourd\'hui : réessayez demain' }, 429);
    await env.DB.prepare('INSERT INTO pronos_new (ip, day, n) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ip, day).run();
    const id = newId();
    await env.DB.prepare('INSERT INTO pronos_groups (id, name, at) VALUES (?, ?, ?)').bind(id, name, now).run();
    const admin = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO pronos_admins (grp, tok) VALUES (?, ?)').bind(id, admin).run();
    return json({ id, name, admin });
  }
  if (!GROUP_RE.test(path)) return json({ error: 'Groupe inconnu' }, 404);
  const group = await groupOf(env, path);
  if (!group) return json({ error: 'Groupe introuvable : vérifiez le lien' }, 404);
  const yNow = new Date(now).getUTCFullYear();
  if (req.method === 'GET') {
    const year = Number(url.searchParams.get('year')) || yNow;
    if (Math.abs(year - yNow) > 1) return json({ error: 'Année invalide' }, 400);
    const tok = url.searchParams.get('tok') || '';
    const s = (await seasonRow(env, year, { maxAge: SEASON_AGE })).v;
    const v = predictView(await storeOf(env, group.id, year), s, (_, p) => !!tok && p.tok === tok, now);
    // Nom des Grands Prix en français pour la page web
    return json({ group, year, ...v, races: v.races.map((r) => ({ ...r, fr: gpFull(r.name, false) })) });
  }
  if (req.method === 'POST') {
    const b = await req.json().catch(() => null);
    const year = Number(b?.year) || yNow;
    if (!b || Math.abs(year - yNow) > 1) return json({ error: 'Pronostic illisible' }, 400);
    const store = await storeOf(env, group.id, year);
    const key = playerKey(b.name);
    const old = store.rounds[b.round]?.[key] || null;
    // Pseudo déjà utilisé (cette manche ou une autre) : seul son jeton permet de jouer avec
    const owner = Object.values(store.rounds).map((r) => r[key]).find(Boolean);
    if (owner && owner.tok !== b.tok) return json({ error: 'Ce pseudo est déjà pris dans ce groupe : choisissez-en un autre' }, 403);
    const players = new Set(Object.values(store.rounds).flatMap((r) => Object.keys(r)));
    if (!players.has(key) && players.size >= MAX_PLAYERS) return json({ error: `Groupe complet (${MAX_PLAYERS} joueurs)` }, 403);
    let out;
    try { out = checkPick((await seasonRow(env, year, { maxAge: SEASON_AGE })).v, b, old, now); } catch (err) { return json({ error: err.message }, 400); }
    const tok = owner?.tok || (typeof b.tok === 'string' && /^[\w-]{20,64}$/.test(b.tok) ? b.tok : crypto.randomUUID());
    const p = out.pick;
    await env.DB.prepare(`INSERT INTO pronos (grp, year, round, pkey, name, pole, p1, p2, p3, tok, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(grp, year, round, pkey) DO UPDATE SET name = excluded.name, pole = excluded.pole, p1 = excluded.p1, p2 = excluded.p2, p3 = excluded.p3, at = excluded.at`)
      .bind(group.id, year, out.race.round, out.key, p.name, p.pole, p.p1, p.p2, p.p3, tok, now).run();
    return json({ ok: true, tok, poleOpen: out.poleOpen, podiumOpen: out.podiumOpen });
  }
  // Suppression pour tout le monde : par le créateur (jeton reçu à la création) ; groupe créé avant ce
  // jeton : par son seul joueur, ou par n'importe qui s'il est vide
  if (req.method === 'DELETE') {
    const b = await req.json().catch(() => ({}));
    const admin = (await adminOf(env, group.id))?.tok;
    const { results } = await env.DB.prepare('SELECT DISTINCT tok FROM pronos WHERE grp = ?').bind(group.id).all();
    if (admin ? b.admin !== admin : !(results || []).every((r) => r.tok === b.tok)) {
      return json({ error: admin ? 'Seul le créateur du groupe peut le supprimer pour tout le monde' : 'D\'autres joueurs pronostiquent dans ce groupe : il ne peut pas être supprimé' }, 403);
    }
    for (const sql of ['DELETE FROM pronos WHERE grp = ?', 'DELETE FROM pronos_admins WHERE grp = ?', 'DELETE FROM pronos_groups WHERE id = ?']) await env.DB.prepare(sql).bind(group.id).run();
    return json({ ok: true });
  }
  return json({ error: 'Méthode non prise en charge' }, 405);
}
