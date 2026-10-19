// Photos libres de droits pour illustrer un post du Studio : Wikimedia Commons et Flickr. Seulement
// les licences qui permettent de réutiliser et de modifier la photo, usage commercial compris (ni « NC »
// ni « ND ») ; chaque photo vient avec son auteur et sa licence, à créditer sur le visuel.
export const PHOTO_UA = 'PaddockLive/1.0 (https://paddocklive.app; Studio du créateur)';
const FREE = (name) => !!name && !/\b(NC|ND)\b|non-?commercial|no ?deriv|all rights reserved|fair use/i.test(name);
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// Nom court de la licence pour le crédit (« CC BY-SA 2.0 »)
export function shortLicense(name) {
  const n = String(name || '');
  const v = n.match(/\d\.\d/)?.[0] || '';
  if (/^CC/i.test(n) || n === 'Domaine public') return n;
  if (/CC0/i.test(n)) return 'CC0';
  if (/Attribution-ShareAlike/i.test(n)) return `CC BY-SA${v ? ` ${v}` : ''}`;
  if (/Attribution/i.test(n)) return `CC BY${v ? ` ${v}` : ''}`;
  if (/public domain|no known copyright|government/i.test(n)) return 'Domaine public';
  return n;
}

// Plus récentes d'abord : photos du moment (pilote, écurie, circuit de cette saison)
async function commons(q, fetchFn) {
  const p = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '15', gsrsort: 'create_timestamp_desc',
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1600', iiextmetadatafilter: 'Artist|LicenseShortName' });
  const j = await (await fetchFn(`https://commons.wikimedia.org/w/api.php?${p}`, { headers: { 'User-Agent': PHOTO_UA } })).json();
  return Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((pg) => {
    const ii = pg.imageinfo?.[0];
    const license = strip(ii?.extmetadata?.LicenseShortName?.value);
    if (!ii?.thumburl || !FREE(license)) return null;
    return { url: ii.thumburl, thumb: ii.thumburl.replace(/\/\d+px-/, '/400px-'), author: strip(ii.extmetadata?.Artist?.value).slice(0, 80) || 'Wikimedia Commons', license: shortLicense(license), site: 'Wikimedia Commons', page: ii.descriptionurl || '' };
  }).filter(Boolean);
}

// Photos Flickr sous licence libre, par Openverse (moteur de recherche de la fondation WordPress, sans
// clé : l'API de Flickr est réservée aux comptes payants). Licences filtrées par Openverse et ici.
async function flickr(q, fetchFn) {
  const p = new URLSearchParams({ q, source: 'flickr', license_type: 'commercial,modification', page_size: '15', mature: 'false' });
  const j = await (await fetchFn(`https://api.openverse.org/v1/images/?${p}`, { headers: { 'User-Agent': PHOTO_UA } })).json();
  return (j.results || []).map((r) => {
    const license = r.license === 'cc0' ? 'CC0' : r.license === 'pdm' ? 'Domaine public' : `CC ${String(r.license || '').toUpperCase()} ${r.license_version || ''}`.trim();
    return /^https:\/\/live\.staticflickr\.com\//.test(r.url || '') && FREE(license)
      ? { url: r.url, thumb: r.thumbnail || r.url, author: String(r.creator || 'Flickr').slice(0, 80), license: shortLicense(license), site: 'Flickr', page: r.foreign_landing_url || '' } : null;
  }).filter(Boolean);
}

// Résultats gardés une heure par requête (mémoire du serveur)
const memo = new Map();
export async function freePhotos(q, { fetchFn = fetch, now = Date.now() } = {}) {
  q = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (q.length < 2) return { items: [] };
  const hit = memo.get(q);
  if (hit && now - hit.at < 3600e3) return hit.v;
  const [a, b] = await Promise.all([flickr(q, fetchFn).catch(() => []), commons(q, fetchFn).catch(() => [])]);
  // Les deux sources en alternance, Wikimedia d'abord (ses photos les plus récentes en tête)
  const v = { items: Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [b[i], a[i]]).flat().filter(Boolean).slice(0, 24) };
  if (v.items.length) memo.set(q, { at: now, v });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return v;
}
