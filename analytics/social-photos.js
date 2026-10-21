// Photos des réseaux pour un post news du Studio (livrée, tenue spéciale) : dernières publications
// Instagram des écuries citées (« business discovery » de Meta, avec le compte Instagram relié) et posts
// Bluesky avec photos sur le sujet (recherche publique). Photos seulement (pas de vidéos), récentes.
import { call, GRAPH } from '../shared/meta-publish.js';

const BSKY_SEARCH = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';
const MAX_IG = 12;
const MAX_BSKY = 8;

// Comptes Instagram des écuries (clés de NEWS_TEAMS) ; plusieurs noms possibles quand une écurie a
// changé de nom : le premier qui répond est gardé
export const TEAM_INSTAGRAM = {
  ferrari: ['scuderiaferrari'],
  mercedes: ['mercedesamgf1'],
  mclaren: ['mclaren'],
  redbull: ['redbullracing'],
  rb: ['visacashapprb', 'racingbulls'],
  aston: ['astonmartinf1'],
  williams: ['williamsracing'],
  alpine: ['alpinef1team'],
  haas: ['haasf1team'],
  audi: ['audif1team', 'audif1', 'stakef1team'],
  cadillac: ['cadillacf1', 'cadillacformula1team'],
};

// Légende d'un post qui parle du look (livrée de la voiture, tenue des pilotes), dans les langues des écuries
export const LOOK_WORDS = {
  livree: /liver(y|ies)|livr[ée]e|livrea|lackierung|decoraci[oó]n|special (paint|colou?rs?|design|look)|one-?off|new look|car design/i,
  tenue: /helmet|casque|casco|\bhelm|race ?suits?|overalls|combinaison|tuta|teamwear|\bkit\b|special (suit|design|look)/i,
};

// Réponse « business discovery » -> [{ url, t, src }] : photos et photos des carrousels publiées entre since
// et until (ms), des posts dont le début de la légende correspond à match (tous sans match) : la livrée est
// le sujet du post, pas un mot glissé dans l'aperçu du week-end
export function igPhotos(bd, username, since = 0, match = null, until = Infinity) {
  const out = [];
  for (const m of bd?.media?.data || []) {
    const t = Date.parse(m.timestamp) || 0;
    if (t < since || t > until || (match && !match.test(String(m.caption || '').slice(0, 160)))) continue;
    const items = m.media_type === 'CAROUSEL_ALBUM' ? m.children?.data || [] : [m];
    for (const c of items) if (c.media_type === 'IMAGE' && /^https:\/\//.test(c.media_url || '')) out.push({ url: c.media_url, t, src: `Instagram @${username}` });
  }
  return out.slice(0, MAX_IG);
}

// Réponse de la recherche Bluesky -> [{ url, t, src }] : photos en taille réelle des posts dont le texte
// passe keep (la recherche ramène aussi des posts qui n'ont que des mots en commun)
export function bskyPhotos(res, keep = () => true) {
  const out = [];
  for (const p of res?.posts || []) {
    if (!keep(String(p.record?.text || ''))) continue;
    const e = p.embed || {};
    const images = e.images || e.media?.images || [];
    for (const im of images) if (/^https:\/\/cdn\.bsky\.app\//.test(im.fullsize || '')) out.push({ url: im.fullsize, t: Date.parse(p.indexedAt) || 0, src: `Bluesky @${p.author?.handle || ''}` });
  }
  return out.slice(0, MAX_BSKY);
}

// Photos d'Instagram (écuries teams, posts sur le look) et de Bluesky (posts qui citent who et parlent du
// look), depuis since (ms) -> { items, errors }
export async function socialPhotos({ meta, teams = [], look = '', who = '', since = 0, until = Infinity, fetchFn = fetch }) {
  const items = [];
  const errors = [];
  const page = meta ? [meta, ...(meta.pages || [])].find((p) => p.igId && p.pageToken) : null;
  for (const key of teams.filter((k) => TEAM_INSTAGRAM[k]).slice(0, 3)) {
    if (!page) { errors.push('Instagram : compte non relié'); break; }
    let found = false;
    for (const username of TEAM_INSTAGRAM[key]) {
      const fields = `business_discovery.username(${username}){media.limit(25){caption,media_type,media_url,timestamp,children{media_type,media_url}}}`;
      const r = await call(`${GRAPH}/${page.igId}?${new URLSearchParams({ fields, access_token: page.pageToken })}`).catch(() => null);
      if (!r?.business_discovery) continue;
      items.push(...igPhotos(r.business_discovery, username, since, LOOK_WORDS[look] || null, until));
      found = true;
      break;
    }
    if (!found) errors.push(`Instagram : compte de ${key} introuvable`);
  }
  if (who) {
    const q = `${who} ${look === 'tenue' ? 'helmet' : 'livery'}`;
    const name = who.toLowerCase();
    const keep = (text) => text.toLowerCase().includes(name) && (!LOOK_WORDS[look] || LOOK_WORDS[look].test(text));
    try {
      const params = new URLSearchParams({ q, limit: '40', sort: 'top', ...(since ? { since: new Date(since).toISOString() } : {}) });
      const res = await fetchFn(`${BSKY_SEARCH}?${params}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      items.push(...bskyPhotos(await res.json(), keep));
    } catch (err) { errors.push(`Bluesky : ${err.message}`); }
  }
  return { items, errors };
}

// Hôtes des photos renvoyées ci-dessus (lues ensuite par le serveur pour le Studio)
export const isSocialImageHost = (host) => /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(host) || host === 'cdn.bsky.app';
