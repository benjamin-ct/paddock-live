// Lecture d'un article dans l'appli (mode lecture) : à partir de la page web d'un article, on garde
// le titre, la photo, la date et le texte (paragraphes et intertitres), sans menus ni publicités.
// D'abord les données structurées de la page (JSON-LD « articleBody »), sinon les paragraphes du
// bloc <article> (ou <main>) le plus fourni. Seul ce que le site sert à tout le monde est lu : un
// article réservé aux abonnés reste tronqué, avec le lien vers le site.
// Code pur (sans accès réseau), partagé par le serveur et les tests.
import { decodeEntities } from './news.js';

const MAX_PARAS = 80;
const MAX_PARA = 2000;
const BOILERPLATE = /cookie|newsletter|abonnez|abonnement|subscribe|sign up|inscrivez|tous droits|all rights reserved|publicit|advertis|follow us|suivez-nous|lire aussi|read more|also read|à lire aussi|related|partager|share this|copyright|©|getty images|motorsport images|photo ?:|photo de|crédit|lire aussi|voir aussi|en savoir plus/i;

// Paragraphe gardé : une vraie phrase (pas une légende, une cellule de tableau, un lien « lire aussi »)
const keepPara = (t) => t.length >= 15 && !(t.length < 90 && !/[.!?…»"”。！？」』]$/.test(t)) && !(t.length < 180 && BOILERPLATE.test(t));

const text = (html) => decodeEntities(String(html || '')
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
  .replace(/[ \s]+/g, ' ').replace(/\s+([,.!?:;…])/g, '$1').trim();

function meta(html, name) {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name|itemprop)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const v = tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1];
  return v ? text(v) : '';
}

// Objets JSON-LD de la page (listes et « @graph » dépliés)
function jsonLd(html) {
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') { out.push(o); if (o['@graph']) walk(o['@graph']); }
  };
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* bloc illisible */ }
  }
  return out;
}

// Long texte d'un seul tenant (JSON-LD) : coupé en paragraphes de quelques phrases
function splitBody(body) {
  const parts = String(body).split(/\n\s*\n|\r?\n/).map((p) => text(p)).filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (p.length <= 700) { out.push(p); continue; }
    let cur = '';
    for (const s of p.match(/[^.!?…]+[.!?…]+["»”’)]*\s*|[^.!?…]+$/g) || [p]) {
      if (cur && cur.length + s.length > 600) { out.push(cur.trim()); cur = ''; }
      cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.filter(keepPara).map((p) => ({ p }));
}

// Bloc principal : le <article> (sinon <main>) qui contient le plus de paragraphes
// Contenu de chaque élément <tag> (balises imbriquées comprises : un <article> peut en contenir d'autres)
function elements(html, tag) {
  const out = [];
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  const open = [];
  for (const m of html.matchAll(re)) {
    if (!m[1]) open.push(m.index + m[0].length);
    else if (open.length) {
      const start = open.pop();
      out.push(html.slice(start, m.index));
    }
  }
  return out;
}

function mainBlock(html) {
  const count = (s) => (s.match(/<p\b/gi) || []).length;
  let best = null;
  for (const tag of ['article', 'main']) {
    for (const inner of elements(html, tag)) {
      if (!best || count(inner) > count(best)) best = inner;
    }
    if (best && count(best) >= 3) return best;
  }
  return best && count(best) >= 3 ? best : (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] || html);
}

function htmlBlocks(html) {
  const block = mainBlock(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|aside|nav|footer|header|form|iframe|figure|figcaption|button|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const out = [];
  for (const m of block.matchAll(/<(p|h2|h3|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = text(m[2]);
    if (!t) continue;
    if (m[1] === 'h2' || m[1] === 'h3') {
      if (t.length >= 3 && t.length <= 160 && !BOILERPLATE.test(t)) out.push({ h: t });
      continue;
    }
    if (keepPara(t)) out.push({ p: t });
  }
  return out;
}

// Photos de l'article (livrée spéciale sous tous les angles…) : celles du bloc principal, sans logos ni
// icônes, ni vignettes des autres articles (images dans un lien vers une page) ; une seule taille par
// photo, la plus grande proposée
const MAX_IMAGES = 12;
const NOT_PHOTO = /logo|icon|avatar|sprite|placeholder|author|profile|badge|emoji|\.svg|\.gif|^data:/i;
// Encadrés autour d'une image qui n'est pas une photo de l'article : vidéo, encart, pub, articles liés
const NOT_ARTICLE = /video|player|poster|tile|teaser|promo|related|recommend|advert|sponsor|outbrain|taboola|newsletter/i;
const attr = (tag, name) => decodeEntities(tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'))?.[1] || '');
// Adresse de la plus grande taille proposée ; null pour une vignette (moins de 500 px de large)
function bestSrc(tag) {
  const set = (attr(tag, 'data-srcset') || attr(tag, 'srcset')).split(/,\s+/).map((c) => c.trim().split(/\s+/))
    .filter(([u, w]) => u && /^\d+w$/.test(w || '')).sort((x, y) => parseInt(y[1], 10) - parseInt(x[1], 10));
  if (set.length && parseInt(set[0][1], 10) < 500) return null;
  if (/^\d+px$/.test(attr(tag, 'sizes')) && parseInt(attr(tag, 'sizes'), 10) < 300) return null;
  const src = set[0]?.[0] || attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src');
  const w = src.match(/[,/_]w_(\d+)\b|[?&](?:w|width)=(\d+)\b/);
  return w && Number(w[1] || w[2]) < 500 ? null : src;
}
// Même photo à une autre taille : même dossier et même nom, sans les suffixes de taille
const photoKey = (u) => {
  const parts = new URL(u).pathname.toLowerCase().split('/').filter(Boolean);
  const name = (parts.pop() || '').replace(/(\.(jpe?g|png|webp|avif))+$/, '').replace(/-\d+x\d+$|-scaled$/, '');
  return `${parts.pop() || ''}/${name}`;
};
// Classes des éléments encore ouverts à la fin d'un morceau de page (ceux qui entourent ce qui suit),
// les 3 plus proches
const VOID = /^(img|br|hr|source|meta|link|input|wbr|col|area|base|embed|track|param)$/i;
function wrappers(before) {
  const open = [];
  for (const [t, close, name] of before.matchAll(/<(\/?)([a-z][\w-]*)\b[^>]*>/gi)) {
    if (close) { const i = open.map((o) => o.name).lastIndexOf(name.toLowerCase()); if (i >= 0) open.length = i; } else if (!VOID.test(name) && !t.endsWith('/>')) open.push({ name: name.toLowerCase(), cls: attr(t, 'class') });
  }
  return open.slice(-3).map((o) => o.cls).join(' ');
}
function articleImages(html, url, first) {
  const block = mainBlock(html).replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(aside|nav|footer|header|form|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\b(?![^>]*href=["'][^"']*\.(?:jpe?g|png|webp|avif)(?:\?[^"']*)?["'])[^>]*>[\s\S]*?<\/a>/gi, ' ');
  const out = [];
  const seen = new Set();
  const add = (src) => {
    let u;
    try { u = new URL(src, url || undefined).href; } catch { return; }
    if (!/^https:\/\//i.test(u) || NOT_PHOTO.test(u)) return;
    const k = photoKey(u);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(u);
  };
  if (first) add(first);
  for (const { 0: tag, index } of block.matchAll(/<img\b[^>]*>/gi)) {
    if (NOT_ARTICLE.test(`${wrappers(block.slice(Math.max(0, index - 1500), index))} ${attr(tag, 'class')}`)) continue;
    const w = Number(attr(tag, 'width')) || 0;
    const h = Number(attr(tag, 'height')) || 0;
    if ((w && w < 300) || (h && h < 200) || NOT_PHOTO.test(`${attr(tag, 'class')} ${attr(tag, 'alt')}`)) continue;
    const src = bestSrc(tag);
    if (src) add(src);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

// Page HTML -> { title, site, author, published, image, images, blocks: [{ p } | { h }], description }
export function extractArticle(html, url = '') {
  html = String(html || '');
  const ld = jsonLd(html);
  const art = ld.find((o) => typeof o.articleBody === 'string' && o.articleBody.length > 300)
    || ld.find((o) => /Article|Posting/i.test(String(o['@type'] || '')));
  const imgOf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? imgOf(v[0]) : v?.url || '');
  const authorOf = (v) => (Array.isArray(v) ? v.map(authorOf).filter(Boolean).join(', ') : typeof v === 'string' ? v : v?.name || '');

  let blocks = art?.articleBody?.length > 300 ? splitBody(art.articleBody) : [];
  const fromHtml = htmlBlocks(html);
  // Données structurées tronquées (abonnés, résumé) : le texte de la page s'il est plus complet
  const len = (list) => list.reduce((n, b) => n + (b.p || '').length, 0);
  if (len(fromHtml) > len(blocks) * 1.3) blocks = fromHtml;
  // Doublons (paragraphe répété dans un encadré) et tailles maximales
  const seen = new Set();
  blocks = blocks.filter((b) => { const k = b.p || b.h; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, MAX_PARAS).map((b) => (b.p ? { p: b.p.slice(0, MAX_PARA) } : b));
  // Intertitres en tête ou en fin sans paragraphe derrière : retirés
  while (blocks.length && blocks[0].h) blocks.shift();
  while (blocks.length && blocks.at(-1).h) blocks.pop();

  const title = text(art?.headline) || meta(html, 'og:title') || text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  let image = imgOf(art?.image) || meta(html, 'og:image') || meta(html, 'twitter:image');
  try { image = image ? new URL(image, url || undefined).href : ''; } catch { image = ''; }
  return {
    title: title.slice(0, 300),
    site: meta(html, 'og:site_name').slice(0, 80),
    author: text(authorOf(art?.author) || meta(html, 'author')).slice(0, 120),
    published: art?.datePublished || meta(html, 'article:published_time') || '',
    image: /^https:\/\//i.test(image) ? image : '',
    images: articleImages(html, url, /^https:\/\//i.test(image) ? image : ''),
    description: (text(art?.description) || meta(html, 'og:description') || meta(html, 'description')).slice(0, 600),
    blocks,
  };
}

// Vidéo YouTube : identifiant pour le lecteur intégré (youtube-nocookie.com), sinon null
export function youtubeId(link) {
  const m = String(link || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i);
  return m ? m[1] : null;
}
