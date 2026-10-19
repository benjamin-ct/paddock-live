// Photos libres de droits pour illustrer un post du Studio : Wikimedia Commons et Flickr. Seulement
// les licences qui permettent de réutiliser et de modifier la photo, usage commercial compris (ni « NC »
// ni « ND ») ; chaque photo vient avec son auteur et sa licence, à créditer sur le visuel.
export const PHOTO_UA = 'PaddockLive/1.0 (https://paddocklive.app; Studio du créateur)';
// Source trop lente : abandonnée au bout de 8 s (les autres répondent quand même)
const get = (fetchFn, url) => fetchFn(url, { headers: { 'User-Agent': PHOTO_UA }, signal: AbortSignal.timeout(8000) });
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

// Année de la photo : celle du nom du fichier (« 2025 Japan GP - Haas - Esteban Ocon ») sinon celle de l'envoi
const year = (title, at) => +(String(title).match(/\b(?:19[5-9]\d|20\d\d)\b/)?.[0] || String(at || '').slice(0, 4)) || 0;
const recent = (list) => list.sort((a, b) => b.year - a.year);

// Mots qui comptent dans la recherche (sans « Formula 1 », « Grand Prix »), « Redbull » écrit comme sur Commons ;
// une photo n'est gardée que si son titre, sa description ou ses catégories les contiennent tous
const GENERIC = /^(formula|formule|formel|f1|one|1|grand|prix|gp)$/i;
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const words = (q) => q.replace(/\bredbull\b/gi, 'Red Bull').split(' ').filter((w) => w && !GENERIC.test(w));
const about = (text, ws) => { const t = fold(text); return ws.every((w) => t.includes(fold(w))); };
// Photo de F1 (titre, description ou catégories) : « Red Bull » ne ramène pas le club de foot
const F1 = /formula ?(1|one)|formel ?1|formule ?1|\bf1\b|grand prix|\bgp\b/i;

// Tailles d'images acceptées par Wikimedia seulement (330, 1280… : les autres sont refusées)
async function commonsSearch(search, fetchFn, byDate) {
  const p = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${search} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '30',
    ...(byDate ? { gsrsort: 'create_timestamp_desc' } : {}),
    prop: 'imageinfo', iiprop: 'url|extmetadata|timestamp', iiurlwidth: '1280', iiextmetadatafilter: 'Artist|LicenseShortName|ImageDescription|Categories' });
  const j = await (await get(fetchFn, `https://commons.wikimedia.org/w/api.php?${p}`)).json();
  return Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((pg) => {
    const ii = pg.imageinfo?.[0];
    const m = ii?.extmetadata || {};
    const license = strip(m.LicenseShortName?.value);
    if (!ii?.thumburl || !FREE(license)) return null;
    return { url: ii.thumburl, thumb: ii.thumburl.replace(/\/\d+px-/, '/330px-'), author: strip(m.Artist?.value).slice(0, 80) || 'Wikimedia Commons', license: shortLicense(license), site: 'Wikimedia Commons', page: ii.descriptionurl || '',
      year: year(pg.title, ii.timestamp), text: `${pg.title} ${strip(m.ImageDescription?.value)} ${m.Categories?.value || ''}` };
  }).filter(Boolean);
}
// D'abord les fichiers qui portent le nom cherché (« Haas VF-26 of Esteban Ocon »), plus récents en tête ;
// ensuite les plus pertinents de la recherche dans les descriptions, « Formula 1 » ajouté (sinon « Ocon »
// trouve aussi des gravures anciennes). Les deux recherches en même temps.
async function commons(q, ws, fetchFn) {
  const core = ws.join(' ') || q;
  const [named, loose] = await Promise.all([commonsSearch(`intitle:"${core.replace(/"/g, '')}"`, fetchFn, true).catch(() => []), commonsSearch(`${core} Formula 1`, fetchFn, false).catch(() => [])]);
  const seen = new Set(named.map((p) => p.url));
  return [...recent(named).filter((p) => F1.test(p.text)), ...loose.filter((p) => !seen.has(p.url) && about(p.text, ws) && F1.test(p.text))];
}

// Photos Flickr sous licence libre, par Openverse (moteur de recherche de la fondation WordPress, sans
// clé : l'API de Flickr est réservée aux comptes payants). Licences filtrées par Openverse et ici.
async function flickr(q, ws, fetchFn) {
  const p = new URLSearchParams({ q: ws.join(' ') || q, source: 'flickr', license_type: 'commercial,modification', page_size: '20', mature: 'false' });
  const j = await (await get(fetchFn, `https://api.openverse.org/v1/images/?${p}`)).json();
  return (j.results || []).map((r) => {
    const license = r.license === 'cc0' ? 'CC0' : r.license === 'pdm' ? 'Domaine public' : `CC ${String(r.license || '').toUpperCase()} ${r.license_version || ''}`.trim();
    const text = `${r.title || ''} ${(r.tags || []).map((t) => t.name).join(' ')}`;
    return /^https:\/\/live\.staticflickr\.com\//.test(r.url || '') && FREE(license) && about(text, ws)
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
  const ws = words(q);
  const [a, b] = await Promise.all([flickr(q, ws, fetchFn).catch(() => []), commons(q, ws, fetchFn).catch(() => [])]);
  // Wikimedia d'abord (photos récentes, nommées) ; Flickr ensuite : ce qu'Openverse en garde est surtout ancien
  const v = { items: [...b, ...a].slice(0, 30).map(({ year: _, text: __, ...p }) => p) };
  if (v.items.length) memo.set(q, { at: now, v });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return v;
}
