// Photos libres de droits pour illustrer un post du Studio : Wikimedia Commons, et Flickr si la clé
// FLICKR_KEY est fournie. Seulement les licences qui permettent de réutiliser et de modifier la photo,
// usage commercial compris (ni « NC » ni « ND ») ; chaque photo vient avec son auteur et sa licence, à
// créditer sur le visuel.
export const PHOTO_UA = 'PaddockLive/1.0 (https://paddocklive.app; Studio du créateur)';
const FREE = (name) => !!name && !/\b(NC|ND)\b|non-?commercial|no ?deriv|all rights reserved|fair use/i.test(name);
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// Nom court de la licence pour le crédit (« CC BY-SA 2.0 »)
export function shortLicense(name) {
  const n = String(name || '');
  const v = n.match(/\d\.\d/)?.[0] || '';
  if (/^CC/i.test(n) || /^Public domain$/i.test(n)) return n;
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

// Licences Flickr relues une fois (identifiants et noms)
let flickrLicenses = null;
async function flickr(q, key, fetchFn, now) {
  const call = async (method, extra = {}) => (await fetchFn(`https://api.flickr.com/services/rest/?${new URLSearchParams({ method, api_key: key, format: 'json', nojsoncallback: '1', ...extra })}`)).json();
  if (!flickrLicenses) flickrLicenses = (await call('flickr.photos.licenses.getInfo')).licenses?.license || null;
  const ok = new Map((flickrLicenses || []).filter((l) => FREE(l.name)).map((l) => [String(l.id), l.name]));
  if (!ok.size) return [];
  const j = await call('flickr.photos.search', { text: q, license: [...ok.keys()].join(','), sort: 'relevance', content_type: '1', media: 'photos', safe_search: '1', per_page: '15',
    min_taken_date: String(Math.floor((now - 2 * 365 * 86400e3) / 1000)), extras: 'owner_name,license,url_l,url_z,url_m' });
  return (j.photos?.photo || []).filter((p) => (p.url_l || p.url_z) && ok.has(String(p.license))).map((p) => ({
    url: p.url_l || p.url_z, thumb: p.url_m || p.url_z || p.url_l, author: String(p.ownername || 'Flickr').slice(0, 80), license: shortLicense(ok.get(String(p.license))), site: 'Flickr', page: `https://www.flickr.com/photos/${p.owner}/${p.id}`,
  }));
}

// Résultats gardés une heure par requête (mémoire du serveur)
const memo = new Map();
export async function freePhotos(env, q, { fetchFn = fetch, now = Date.now() } = {}) {
  q = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (q.length < 2) return { items: [], flickr: !!env.FLICKR_KEY };
  const hit = memo.get(q);
  if (hit && now - hit.at < 3600e3) return hit.v;
  const [a, b] = await Promise.all([env.FLICKR_KEY ? flickr(q, env.FLICKR_KEY, fetchFn, now).catch(() => []) : [], commons(q, fetchFn).catch(() => [])]);
  const v = { items: [...a, ...b].slice(0, 24), flickr: !!env.FLICKR_KEY };
  if (v.items.length) memo.set(q, { at: now, v });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return v;
}
