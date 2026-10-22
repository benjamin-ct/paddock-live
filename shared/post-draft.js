// Brouillons de posts, gardés sur le serveur Paddock Live (code créateur) et repris dans l'appli comme
// dans le Studio : données des visuels, images écartées, format, options et textes retouchés à la main.
// Pas de vidéo (trop lourde) : elle se refait à la reprise.
import { captions } from './social.js';
import { newsCaptions } from './social-news.js';
import { seasonCaptions } from './social-season.js';
import { moreCaptions } from './social-more.js';

export const DRAFTS_MAX = 30;
// Une ligne de la base : 2 Mo au plus (photo d'un post écrit à la main comprise)
export const DRAFT_BYTES = 1500000;
const MORE = new Set(['prerace', 'champ', 'flash']);
const FMTS = new Set(['ig', 'story', 'x', 'link']);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;   // crypto.randomUUID()
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// Textes d'un post d'après ses données (même choix que l'éditeur qui l'a fait)
export function captionsFor(d, sig, { spoiler = true, linkInComment = false } = {}) {
  if (d.news) return newsCaptions(d, sig, { linkInComment });
  if (MORE.has(d.post)) return moreCaptions(d, sig);
  if (d.post) return seasonCaptions(d, sig);
  return captions(d, sig, { spoiler });
}

export const isDraftId = (id) => typeof id === 'string' && ID.test(id);

// Brouillon reçu (serveur) : champs connus seulement, taille bornée ; null s'il est invalide
export function cleanDraft(b) {
  if (!b || !isDraftId(b.id) || !b.d || typeof b.d !== 'object' || Array.isArray(b.d)) return null;
  const opts = {};
  for (const k of ['follow', 'question', 'photos', 'noSpoiler', 'linkComment']) if (typeof b.opts?.[k] === 'boolean') opts[k] = b.opts[k];
  const edited = {};
  for (const [k, v] of Object.entries(b.edited || {})) if (/^[a-z]{1,12}$/.test(k) && typeof v === 'string') edited[k] = v.slice(0, 5000);
  const out = {
    id: b.id, title: str(b.title, 200) || 'Post', kind: str(b.kind, 20), key: str(b.key, 200), at: Number(b.at) || 0,
    fmt: FMTS.has(b.fmt) ? b.fmt : 'ig', skip: (Array.isArray(b.skip) ? b.skip : []).filter((s) => typeof s === 'string').slice(0, 40).map((s) => s.slice(0, 40)),
    opts, edited, d: b.d,
  };
  return new TextEncoder().encode(JSON.stringify(out)).length <= DRAFT_BYTES ? out : null;
}

// Ligne de la liste des brouillons (sans les données)
export const draftSummary = (dr) => ({ id: dr.id, title: dr.title, kind: dr.kind, at: dr.at });

// Photos du post (ImageBitmap) mises en JPEG pour le brouillon, et l'inverse à la reprise (navigateur)
const isBitmap = (x) => !!x && typeof x === 'object' && typeof x.close === 'function' && 'width' in x;
function toJpeg(img, max) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
export function packDraftImages(d) {
  const out = { ...d };
  if (isBitmap(d.image)) out.image = toJpeg(d.image, 1080);
  if (Array.isArray(d.gallery)) out.gallery = d.gallery.map((g) => (isBitmap(g?.image) ? { ...g, image: toJpeg(g.image, 800) } : g));
  return out;
}
export async function unpackDraftImages(d) {
  const img = async (x) => (typeof x === 'string' && x.startsWith('data:image/') ? createImageBitmap(await (await fetch(x)).blob()) : x);
  const out = { ...d, image: await img(d.image) };
  if (Array.isArray(d.gallery)) out.gallery = await Promise.all(d.gallery.map(async (g) => ({ ...g, image: await img(g?.image) })));
  if (out.image === undefined) delete out.image;
  return out;
}
