// Livrées spéciales de chaque saison (/live/api/season/liveries?year=) : une entrée par écurie et par Grand Prix,
// vérifiée et avec la source de l'annonce (analytics/liveries-data.js, tenue à la main : une nouvelle livrée s'ajoute
// ici, sans nouvelle version de l'appli). L'image est celle de l'article source (og:image), lue une fois et gardée
// 7 jours ; au plus 20 articles lus par demande (les autres à la suivante), sans image si le site refuse
import { extractArticle } from '../shared/article.js';
import { LIVERIES } from './liveries-data.js';

const WEEK = 7 * 86400;
const PER_CALL = 20;
const UA = 'Mozilla/5.0 (Paddock Live; +https://paddocklive.app)';

async function imageOf(url, fetchFn, budget) {
  const ck = new Request(`https://live.cache/livery-img/${encodeURIComponent(url)}`);
  const hit = await caches.default.match(ck).catch(() => null);
  if (hit) return (await hit.json()).image || '';
  if (budget.left-- <= 0) return '';
  let image = '';
  try {
    const res = await fetchFn(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) image = extractArticle(await res.text(), url).image || '';
  } catch { /* site injoignable : sans image */ }
  await caches.default.put(ck, new Response(JSON.stringify({ image }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${image ? WEEK : 86400}` } })).catch(() => {});
  return image;
}

export async function liveriesWeb(year, { fetchFn = fetch } = {}) {
  const list = LIVERIES[year] || [];
  const budget = { left: PER_CALL };
  const liveries = await Promise.all(list.map(async (l) => ({ ...l, image: await imageOf(l.url, fetchFn, budget) })));
  return { year, liveries };
}
