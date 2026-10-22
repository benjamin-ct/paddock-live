// Journal des publications du créateur (posts des séances et des news), partagé par l'appli et la
// page web : sert à marquer les news déjà publiées (même sujet reconnu, même repris par un autre
// média ou dans une autre langue) et aux statistiques des posts (identifiants par réseau).
import { sameStoryOf } from './social-news.js';

export const HISTORY_MAX = 200;
const NETS = ['instagram', 'facebook', 'threads', 'x', 'bluesky', 'tiktok', 'youtube'];
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// Entrée nettoyée : { key, at, kind: 'news' | 'session', title, srcTitle, link, summary, nets: { réseau: { id, url } } }
export function cleanEntry(e, now = Date.now()) {
  if (!e || typeof e !== 'object') return null;
  const nets = {};
  for (const n of NETS) {
    const r = e.nets?.[n];
    if (!r || typeof r !== 'object') continue;
    const id = typeof r.id === 'string' ? r.id.slice(0, 200) : r.id && typeof r.id === 'object' ? { uri: str(r.id.uri, 300), cid: str(r.id.cid, 120) } : null;
    nets[n] = { id, url: /^https:\/\//.test(r.url || '') ? str(r.url, 500) : null };
  }
  if (!Object.keys(nets).length) return null;
  const at = Number(e.at) > 0 && Number(e.at) <= now + 60e3 ? Number(e.at) : now;
  return {
    key: str(e.key, 80) || `${at}`, at, kind: e.kind === 'news' ? 'news' : 'session',
    title: str(e.title, 200), srcTitle: str(e.srcTitle, 300), link: /^https:\/\//.test(e.link || '') ? str(e.link, 500) : '', summary: str(e.summary, 300), nets,
  };
}

// Ajout (ou complément d'une entrée existante, même clé : autres réseaux publiés ensuite)
export function addEntry(list, entry) {
  const e = cleanEntry(entry);
  if (!e) return list;
  const out = (Array.isArray(list) ? list : []).filter(Boolean);
  // Entrée à compléter : même clé (ou republication de cette clé), sans autre post déjà noté sur ces réseaux ;
  // sinon (même post republié sur un réseau) entrée à part, les identifiants du premier envoi gardés
  const same = (a, b) => JSON.stringify(a?.id ?? null) === JSON.stringify(b?.id ?? null);
  const i = out.findIndex((x) => (x.key === e.key || x.key.startsWith(`${e.key}~`)) && Object.entries(e.nets).every(([n, r]) => !x.nets?.[n] || same(x.nets[n], r)));
  if (i >= 0) out[i] = { ...out[i], nets: { ...out[i].nets, ...e.nets } };
  else out.unshift(out.some((x) => x.key === e.key) ? { ...e, key: `${e.key.slice(0, 70)}~${e.at.toString(36)}` } : e);
  return out.sort((a, b) => b.at - a.at).slice(0, HISTORY_MAX);
}

export const mergeHistory = (...lists) => lists.flat().filter(Boolean).reduce((acc, e) => addEntry(acc, e), []);

// Posts retirés par le créateur (supprimés sur les réseaux) : leurs clés sont gardées pour que
// l'appli et la page web ne se les renvoient pas l'une à l'autre
export const REMOVED_MAX = 500;
export const cleanKey = (k) => (typeof k === 'string' && k.trim() ? k.trim().slice(0, 80) : null);
export function removeEntry(list, removed, key) {
  const k = cleanKey(key);
  if (!k) return { items: list || [], removed: removed || [] };
  return { items: (list || []).filter((e) => e?.key !== k), removed: [k, ...(removed || []).filter((x) => x !== k)].slice(0, REMOVED_MAX) };
}
export const withoutRemoved = (list, removed = []) => (list || []).filter((e) => e && !removed.includes(e.key));

// Nouvelle déjà publiée : même lien, ou même sujet (noms propres, type) dans les 3 jours
export function postedEntry(item, history = []) {
  return history.find((e) => e.kind === 'news' && (
    (e.link && e.link === item.link)
    || (Math.abs((item.t || 0) - e.at) < 72 * 3600e3 && sameStoryOf({ title: e.srcTitle || e.title, summary: e.summary, t: item.t }, item))
  )) || null;
}

// Créneau conseillé pour publier, d'après les chiffres des posts déjà publiés (onglet Stats) : la tranche de
// 3 heures (heure de Paris) dont les posts ont eu le plus de réactions (j'aime, commentaires, partages,
// enregistrements), comparées à la médiane pour ne pas dépendre d'un seul post. null tant qu'il y a trop peu
// de posts (8 au moins, 3 par tranche, 2 tranches) ou pas d'écart net (20 % au-dessus de la moyenne).
const SLOTS = [[6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]];
const parisHour = (t) => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Paris' }).format(t));
export function bestSlot(posts) {
  const scored = (posts || []).map((p) => {
    const nets = Object.values(p?.stats || {}).filter(Boolean);
    return nets.length && p.at ? { at: p.at, e: nets.reduce((s, x) => s + (x.likes || 0) + (x.comments || 0) + (x.shares || 0) + (x.saves || 0), 0) } : null;
  }).filter(Boolean);
  if (scored.length < 8) return null;
  const sorted = scored.map((p) => p.e).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const all = scored.reduce((s, p) => s + p.e / median, 0) / scored.length;
  const slots = SLOTS.map(([from, to]) => {
    const list = scored.filter((p) => { const h = parisHour(p.at); return h >= from && h < to; });
    return { from, to, n: list.length, mean: list.reduce((s, p) => s + p.e / median, 0) / (list.length || 1) };
  }).filter((s) => s.n >= 3);
  if (slots.length < 2) return null;
  const best = slots.sort((a, b) => b.mean - a.mean)[0];
  return best.mean >= all * 1.2 ? { from: best.from, to: best.to, n: scored.length, ratio: Math.round((best.mean / all) * 10) / 10 } : null;
}
