// Journal des publications sur cet ordinateur (config.json), complété par celui de la page web du
// créateur quand elle est activée (publications faites depuis le téléphone).
import { getConfig, saveConfig } from './config.js';
import { addEntry, mergeHistory, removeEntry, withoutRemoved, cleanKey, REMOVED_MAX } from '../shared/post-history.js';
import { studioCall } from './studio-sync.js';
import { postStats } from '../shared/post-stats.js';

// Posts retirés ici ou sur la page web : enlevés des deux journaux
export async function postHistory({ fetchFn } = {}) {
  const remote = await studioCall('history', { fetchFn });
  const removed = [...new Set([...(getConfig().postsRemoved || []), ...(remote?.removed || [])])].slice(0, REMOVED_MAX);
  const local = getConfig().postsHistory || [];
  const kept = withoutRemoved(local, removed);
  if (kept.length !== local.length || removed.length !== (getConfig().postsRemoved || []).length) saveConfig({ postsHistory: kept, postsRemoved: removed });
  return withoutRemoved(mergeHistory(kept, remote?.items || []), removed);
}

export async function recordPost(entry, { fetchFn } = {}) {
  const list = addEntry(getConfig().postsHistory || [], entry);
  const k = cleanKey(entry?.key);
  saveConfig({ postsHistory: list, postsRemoved: (getConfig().postsRemoved || []).filter((x) => x !== k) });
  await studioCall('history', { body: { entry }, fetchFn });
  return list;
}

// Post supprimé sur les réseaux : retiré du journal et des statistiques (ici et sur la page web)
export async function removePost(key, { fetchFn } = {}) {
  if (!cleanKey(key)) throw new Error('Post inconnu');
  const r = removeEntry(getConfig().postsHistory || [], getConfig().postsRemoved || [], key);
  saveConfig({ postsHistory: r.items, postsRemoved: r.removed });
  await studioCall('history/remove', { body: { key }, fetchFn });
  return r.items;
}

// Statistiques des posts : celles de la page web quand elle est activée (mêmes chiffres que le Studio,
// avec l'activité de tous les comptes), sinon avec les comptes de cet ordinateur
export async function statsOfPosts({ fetchFn } = {}) {
  // Chiffres des posts et des comptes : deux appels (limite de requêtes de la page web)
  const [remote, acc] = await Promise.all([studioCall('stats', { fetchFn, timeout: 60000 }), studioCall('stats/accounts', { fetchFn, timeout: 60000 }).catch(() => null)]);
  if (remote?.posts) return { ...remote, accounts: acc?.accounts || remote.accounts };
  const s = getConfig().social || {};
  return postStats(await postHistory(), { meta: s.meta, threads: s.threads, bluesky: s.bluesky });
}
