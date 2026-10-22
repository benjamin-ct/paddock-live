// Posts « news » pour les réseaux sociaux (mode créateur) : grosses nouvelles de la F1 (transferts,
// pénalités, annonces officielles, accidents…) repérées dans l'Actu, mises en forme avec nos propres
// visuels (jamais les photos ni le texte des articles : titre et court résumé traduits, source citée).
// Code pur, partagé par l'appli et la page web du créateur.
import { NEWS_DRIVERS, NEWS_TEAMS, fold, newsSimilarity } from './news.js';
import { hashtag, teamTag, fiveTags, twoTags, THREADS_TAG, xLength } from './social.js';
import { portraitUrl, portraitTeam } from './portraits.js';

// Type de nouvelle, d'après le titre et le résumé (toutes langues des sources, sans accents)
const KINDS = [
  ['penalite', 'PÉNALITÉ', '#f5a524', /penalt|penalit|sanction|grid drop|disqualif|squalific|descalific|reprimand|avertissement|strafe|stewards|commissaires/],
  ['transfert', 'TRANSFERT', '#3ddc84', /\bsigns?\b|signed|signe |s'engage|engage avec|rejoindra|remplacera|contract|contrat|contratto|contrato|vertrag|joins|rejoint|\bdeal\b|accord |agreement|replace|remplace|\bseat\b|baquet|line-?up/],
  ['depart', 'DÉPART', '#c792ea', /retire|retraite|ritiro|leaves|quitte|quits|sacked|fired|limoge|licenzia|despedido|resign|demission|entlassen|steps down/],
  ['accident', 'ACCIDENT', '#ff5252', /crash|accident|incidente|unfall|injur|blesse|infortun|verletz|hospital|hopital/],
  ['tenue', 'TENUE', '#ff6fb1', /race ?suits?|overalls|combinaison|tuta (speciale|celebrativa)|rennanzug|mono especial|helmet (design|livery)|(special|new|one-?off|tribute) helmet|casque (special|inedit|hommage)|nouveau casque|design (de|du) casque|casco (speciale|especial)|helmdesign|sonderhelm/],
  ['livree', 'LIVRÉE', '#00b2ff', /livery|liveries|livree|livrea|lackierung|decoracion|special (paint|colou?rs)|one-?off (look|design|colou?rs)/],
  ['officiel', 'OFFICIEL', '#e10600', /official|officiel|ufficiale|oficial|offiziell|confirm|announce|annonce|annuncia|anuncia|statement|communique/],
];
// Looks spéciaux d'un Grand Prix (livrée de la voiture, tenue des pilotes) : toujours gardés et signalés,
// la photo de l'article proposée pour le post
export const LOOKS = new Set(['tenue', 'livree']);
// Types au choix (post écrit à la main), « Actu F1 » compris
export const NEWS_BADGES = [...KINDS.map(([key, label, color]) => ({ key, label, color })), { key: 'actu', label: 'ACTU F1', color: '#e10600' }];
export function newsKind(item) {
  // D'après le titre ; le résumé ne compte que pour les livrées et les tenues (un mot du résumé suffisait
  // à classer en « transfert » une news sur les pneus ou un simple coup de fil)
  const title = fold(String(item.title || '').slice(0, 300));
  const summary = fold(String(item.summary || '').slice(0, 500));
  const k = KINDS.find(([, , , re]) => re.test(title)) || KINDS.find(([key, , , re]) => LOOKS.has(key) && re.test(summary));
  if (k) return { key: k[0], label: k[1], color: k[2] };
  return item.cat === 'official' ? { key: 'officiel', label: 'OFFICIEL', color: '#e10600' } : { key: 'actu', label: 'ACTU F1', color: '#e10600' };
}

// Noms propres d'un titre (mots à majuscule, sans accents), hors écuries et mots courants : deux
// titres qui citent la même personne pour le même type de nouvelle parlent du même sujet, même
// dans deux langues différentes
const COMMON = new Set(['formula', 'formule', 'formel', 'grand', 'prix', 'official', 'breaking', 'the', 'les', 'des', 'una', 'der', 'die', 'and', 'with', 'pour', 'avec', 'f1']);
const TEAM_WORDS = new Set(NEWS_TEAMS.flatMap(([, , n]) => n.flatMap((x) => fold(x).split(' '))));
function names(title) {
  const out = new Set();
  for (const m of String(title).matchAll(/(?:^|[\s'"«(])(\p{Lu}[\p{L}-]{3,})/gu)) {
    const w = fold(m[1]).replace(/[^a-z-]/g, '');
    if (w.length >= 4 && !COMMON.has(w) && !TEAM_WORDS.has(w)) out.add(w);
  }
  return out;
}
// Types incompatibles seulement s'ils sont tous deux précis (pénalité et transfert d'un même pilote)
const GENERIC = new Set(['actu', 'officiel']);
const kindsMatch = (a, b) => { const x = newsKind(a).key; const y = newsKind(b).key; return x === y || GENERIC.has(x) || GENERIC.has(y); };
// Même sujet pour deux nouvelles quelconques (noms propres calculés ici)
export const sameStoryOf = (a, b) => sameStory({ ...a, _names: names(a.title) }, { ...b, _names: names(b.title) });
const sameStory = (a, b) => kindsMatch(a._fr || a, b._fr || b) && Math.abs(a.t - b.t) < 30 * 3600e3
  && ([...a._names].some((w) => b._names.has(w)) || newsSimilarity(a._fr || a, b._fr || b) >= 0.3);

// Grosses nouvelles des dernières heures : importantes (alerte), ou reprises par plusieurs médias.
// Une seule par sujet. Vidéos et publications exclues. frTitle(it) : titre traduit en français s'il est
// connu (le même article publié en plusieurs langues est alors reconnu, type compris)
export function bigNews(items, { now = Date.now(), hours = 48, all = false, frTitle = null } = {}) {
  const score = (it) => (it.imp || 0) * 2 + Math.min(it.sources || 1, 5) + (it.cat === 'official' ? 1 : 0);
  const keep = (it) => it.kind !== 'video' && it.kind !== 'post' && it.t >= now - hours * 3600e3
    && (all || (it.imp || 0) >= 2 || ((it.sources || 1) >= 3 && (it.imp || 0) >= 1) || LOOKS.has(newsKind(it).key));   // livrées et tenues spéciales toujours gardées
  // Article retenu pour un sujet : officiel, puis le plus repris (l'annonce elle-même plutôt que les
  // analyses qui suivent), en français ou en anglais (mieux traduit), puis le premier paru
  const lang = (it) => (it.lang === 'fr' ? 0 : it.lang === 'en' ? 1 : 2);
  const better = (a, b) => ((a.cat === 'official') !== (b.cat === 'official') ? a.cat === 'official'
    : (a.sources || 1) !== (b.sources || 1) ? (a.sources || 1) > (b.sources || 1) : lang(a) !== lang(b) ? lang(a) < lang(b) : a.t < b.t);
  const best = new Map();
  for (const it of items.filter(keep)) {
    const k = it.cluster || it.id;
    const cur = best.get(k);
    if (!cur || better(it, cur)) best.set(k, it);
  }
  // Sujets séparés par l'Actu mais identiques (même personne, autre langue…) : réunis
  const list = [...best.values()].map((it) => {
    const fr = frTitle?.(it);
    return { ...it, _names: names(fr || it.title), _fr: fr ? { title: fr, tags: it.tags, cat: it.cat } : null, sources: it.sources || 1 };
  })
    .sort((a, b) => score(b) - score(a) || b.t - a.t);
  const out = [];
  for (const it of list) {
    const twin = out.find((o) => sameStory(o.item, it));
    if (!twin) { out.push({ item: it, total: it.sources, imp: it.imp || 0 }); continue; }
    twin.total += it.sources;
    twin.imp = Math.max(twin.imp, it.imp || 0);
    if (better(it, twin.item)) twin.item = it;
  }
  return out.map(({ item: { _names, _tok, _fr, ...it }, total, imp }) => ({ ...it, imp, sources: total, score: score({ ...it, imp, sources: total }) }))
    .sort((a, b) => b.score - a.score || b.t - a.t);
}

// Écurie au cœur d'une nouvelle : celle du titre, sinon la première citée (une livrée Haas dont le résumé
// cite aussi Ferrari et Red Bull : Haas)
export const mentionsTeam = (text, key) => (NEWS_TEAMS.find(([k]) => k === key)?.[2] || []).some((a) => fold(text).includes(fold(a)));
export function mainTeam(title, teams = []) {
  const list = teams.filter((t) => t.key !== 'fia');
  return list.find((t) => mentionsTeam(title, t.key)) || list[0] || null;
}

// Autres articles sur la même nouvelle (autres médias) : pour leurs photos (livrée sous d'autres angles…).
// Un par média, les plus proches dans le temps d'abord ; vidéos et publications exclues. kind : seulement
// les nouvelles de ce type (une livrée : pas les statistiques ni les avant-courses du même Grand Prix)
export function similarArticles(it, items, max = 4, kind = '') {
  const seen = new Set([it.src]);
  return items.filter((x) => x.id !== it.id && /^https:\/\//.test(x.link || '') && x.kind !== 'video' && x.kind !== 'post'
    && (!kind || newsKind(x).key === kind) && ((it.cluster && x.cluster === it.cluster) || sameStoryOf(it, x)))
    .sort((a, b) => Math.abs(a.t - it.t) - Math.abs(b.t - it.t))
    .filter((x) => !seen.has(x.src) && seen.add(x.src))
    .slice(0, max);
}

// Très grosse info (vidéo « Breaking news ») : importance maximale, ou reprise par au moins 10 médias et
// importante (annonce officielle, décision) ou transfert, départ, accident, pénalité
export function isBreaking(it) {
  const imp = it.imp || 0;
  return imp >= 3 || ((it.sources || 1) >= 10 && (imp >= 2 || ['transfert', 'depart', 'accident', 'penalite'].includes(newsKind(it).key)));
}

// Ordre d'affichage des grosses news : « à la une » (importance, moins 1 point par tranche de 12 h
// pour que les news fraîches passent devant) ou « récentes » (la plus récente d'abord) ; les news
// déjà publiées (done) vont à la fin
export function sortNews(list, { by = 'top', now = Date.now(), done = () => false } = {}) {
  const hot = (it) => (it.score || 0) - (now - it.t) / (12 * 3600e3);
  return [...list].sort((a, b) => Number(!!done(a)) - Number(!!done(b))
    || (by === 'recent' ? b.t - a.t : hot(b) - hot(a) || b.t - a.t));
}
// Types présents dans une liste de news, avec leur nombre (filtre par type), les plus fréquents d'abord
export function newsKinds(list) {
  const out = new Map();
  for (const it of list) {
    const k = newsKind(it);
    if (!out.has(k.key)) out.set(k.key, { ...k, n: 0 });
    out.get(k.key).n++;
  }
  return [...out.values()].sort((a, b) => b.n - a.n);
}

// Autres championnats (sources de la FIA) : écartés des sélections automatiques (récap)
export const OTHER_SERIES = /formula e\b|formule e\b|\bwec\b|\bwrc\b|rally|rallye|karting|\bf[234]\b|formula [234]\b|world cup|coupe du monde|macau|macao|cross-country|\bgt\b|endurance|extreme h|hill ?climb/i;

// Résumé court : deux phrases au plus, 280 caractères
export function shortSummary(text, max = 280) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const parts = s.match(/[^.!?…]+[.!?…]+["»”’)]*\s*/g) || [];
  let out = '';
  for (const p of parts.slice(0, 2)) { if ((out + p).length > max) break; out += p; }
  return (out.trim() || `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);
}

const TEAM_COLORS = {
  ferrari: '#E80020', mercedes: '#27F4D2', mclaren: '#FF8000', redbull: '#3671C6', rb: '#6692FF', aston: '#229971',
  williams: '#64C4FF', alpine: '#0093CC', haas: '#B6BABD', audi: '#F50537', cadillac: '#C9A86A', fia: '#2b5fd9',
};
// Écurie de la base des portraits -> couleur ci-dessus (pilote absent de la liste de la séance)
const SLUG_COLOR = { redbullracing: 'redbull', racingbulls: 'rb', astonmartin: 'aston', haasf1team: 'haas' };
const seasonColor = (tla) => { const t = portraitTeam(tla); return t ? TEAM_COLORS[SLUG_COLOR[t] || t] : null; };
const cap = (s) => String(s).replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());

// Pilotes et écuries cités, avec photo et couleur quand la liste des pilotes de la séance les donne
function people(tags = [], driverList = {}) {
  const byTla = new Map(Object.entries(driverList || {}).filter(([, d]) => d?.Tla).map(([num, d]) => [d.Tla, { num, ...d }]));
  const drivers = [];
  const teams = [];
  for (const k of tags) {
    const drv = NEWS_DRIVERS.find(([t]) => t === k);
    if (drv) {
      const d = byTla.get(k);
      drivers.push({
        tla: k, num: d?.num || k, first: d?.FirstName || '', last: d?.LastName || cap(drv[1][0]), team: d?.TeamName || '',
        color: d?.TeamColour ? `#${String(d.TeamColour).replace('#', '')}` : seasonColor(k) || '#8b95a8', headshot: portraitUrl(k, true) || d?.HeadshotUrl || null,
      });
      continue;
    }
    const tm = NEWS_TEAMS.find(([t]) => t === k);
    if (tm) teams.push({ key: k, name: tm[1], color: TEAM_COLORS[k] || '#8b95a8' });
  }
  // Couleur d'écurie déduite pour un pilote sans liste (sa seule écurie citée)
  for (const d of drivers) if (d.color === '#8b95a8' && teams.length === 1 && teams[0].key !== 'fia') { d.color = teams[0].color; d.team ||= teams[0].name; }
  return { drivers: drivers.slice(0, 3), teams: teams.slice(0, 3) };
}

// Points clés d'un résumé détaillé : lignes non vides, 6 au plus, raisonnablement courtes
export function cleanPoints(points) {
  const list = Array.isArray(points) ? points : String(points || '').split('\n');
  return list.map((p) => String(p || '').replace(/^\s*(?:[-–—•*]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 2).slice(0, 6).map((p) => (p.length > 260 ? `${p.slice(0, 259).replace(/\s+\S*$/, '')}…` : p));
}

// Nouvelle (de l'Actu) -> données du post. title / summary : textes en français (traduits si besoin) ;
// points : résumé détaillé en points clés (images suivantes du carrousel)
export function newsPost(item, { title, summary, points = [], driverList = {}, sourceName = '' } = {}) {
  const kind = newsKind(item);
  const { drivers, teams } = people(item.tags, driverList);
  const main = drivers[0]?.color || teams.find((t) => t.key !== 'fia')?.color || kind.color;
  const when = new Date(item.t || Date.now());
  return {
    kind: 'news', final: true, news: true, breaking: isBreaking(item),
    badge: kind, title: String(title || item.title || '').trim(), summary: shortSummary(summary ?? item.summary),
    source: sourceName || item.srcName || item.src || '', sources: item.sources || 1, link: item.link || '',
    date: when.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    year: when.getFullYear(), drivers, teams, color: main, rows: drivers, points: cleanPoints(points),
  };
}

// Emoji du type de nouvelle, en tête des textes (🚨 pour les très grosses infos)
const NEWS_EMOJI = { penalite: '⚠️', transfert: '✍️', depart: '👋', accident: '💥', tenue: '🪖', livree: '🎨', officiel: '📢', actu: '🏎️' };

// Légendes prêtes à copier (Instagram / Facebook, X, Threads, story). linkInComment : le lien de
// l'article part en premier commentaire (Facebook, Threads, X) au lieu d'être dans le texte.
export function newsCaptions(nd, signature = '', { linkInComment = false } = {}) {
  const sig = signature ? `\n\n${signature}` : '';
  const src = nd.source ? `📰 Source : ${nd.source}` : '';
  const people = [
    ...nd.drivers.map((d) => hashtag(`${d.first}${d.last}`)),
    ...nd.drivers.map((d) => d.team).filter(Boolean).map(teamTag),
    ...nd.teams.filter((t) => t.key !== 'fia').map((t) => teamTag(t.name)),
    ...(nd.teams.some((t) => t.key === 'fia') ? ['#FIA'] : []),
  ];
  const tags = fiveTags(['#F1', ...people, '#F1News']);
  const head = `${nd.breaking ? '🚨' : NEWS_EMOJI[nd.badge.key] || '🏎️'} ${nd.badge.label} | ${nd.title}`;
  // Lien de l'article : Facebook, Threads et X (pas Instagram, où il n'est pas cliquable)
  const url = /^https:\/\//.test(nd.link || '') ? nd.link : '';
  const comment = url && linkInComment ? `🔗 Lire l'article : ${url}` : '';
  const link = comment ? '' : url;
  const srcLink = `${src}${link ? `${src ? '\n' : ''}🔗 Lire l'article : ${link}` : ''}`;
  const pts = nd.points?.length ? `\n\n📌 L'essentiel :\n${nd.points.map((p) => `👉 ${p}`).join('\n')}` : '';
  let instagram = `${head}\n\n${nd.summary}${pts}${src ? `\n\n${src}` : ''}${sig}\n\n${tags.join(' ')}`;
  // Instagram : 2 200 caractères au plus (les points restent lisibles sur les images)
  if (instagram.length > 2200) instagram = instagram.replace(pts, '');
  const facebook = `${head}\n\n${nd.summary}${pts}${srcLink ? `\n\n${srcLink}` : ''}${sig}`;
  // X : 280 caractères (lien = 23) ; hashtags retirés un à un, puis la ligne de la source, puis le titre raccourci
  const xLink = link ? `\n${link}` : '';
  // Texte court (X : 280, lien compté 23 ; Bluesky : 300, lien compté en entier)
  const short = (len, max) => {
    const xt = twoTags(tags);
    const build = (withSrc) => `${head}${withSrc && src ? `\n\n${src}` : '\n'}${xLink}\n\n${xt.join(' ')}`;
    let t = build(true);
    while (len(t) > max && xt.length > 1) { xt.pop(); t = build(true); }
    if (len(t) > max) t = build(false);
    if (len(t) > max) t = `${head.slice(0, Math.max(10, max - len(`…${xLink}\n\n${xt[0]}`))).trim()}…${xLink}\n\n${xt[0]}`;
    return t;
  };
  const x = short(xLength, 280);
  const bsky = short((t) => [...t].length, 300);
  let threads = `${head}\n\n${nd.summary}${srcLink ? `\n\n${srcLink}` : ''}${sig}\n\n${THREADS_TAG}`;
  if (threads.length > 500) threads = `${head}${srcLink ? `\n\n${srcLink}` : ''}\n\n${THREADS_TAG}`;
  if (threads.length > 500) threads = `${head.slice(0, 500 - (threads.length - head.length) - 1)}…${threads.slice(head.length)}`;
  return { instagram, facebook, x, bsky, threads, story: head, comment };
}
