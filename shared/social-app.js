// Posts du compte Paddock Live (@paddockliveapp, l'appli), préparés dans le Studio et publiés à la main : son
// visuel (logo, petit titre rouge, grand titre aux mots en rouge, texte, capture ou photo dans un cadre, pied
// « Gratuit · Windows, Mac, Linux » et le site), une image par page du carrousel, et ses textes. Une vidéo à soi
// (enregistrement d'écran) prend la place de la capture de la première page.
import { C, TITLE, BODY, MONO, txt, rr, photoCredit, background, pill } from './social-draw.js';
import { xLength } from './social.js';

export const APP_SITE = 'paddocklive.app';
const FREE = 'Gratuit · Windows, Mac, Linux';
const TAGS = '#F1 #Formule1 #PaddockLive';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - (1 - clamp01(x)) ** 3;

// Titre sans les astérisques des mots en rouge
export const plain = (s) => String(s || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
// Mots du titre, ceux entre astérisques en rouge : « Ce qu'ils se disent à la radio, *en français.* »
export function richWords(s) {
  const out = [];
  String(s || '').split('*').forEach((part, i) => { for (const w of part.split(/\s+/).filter(Boolean)) out.push({ w, red: i % 2 === 1 }); });
  return out;
}

// Données du post : pages gardées (titre, texte ou image), une au moins
export function appPost(pages) {
  const list = pages.filter((p) => plain(p.title) || String(p.text || '').trim() || p.image);
  const kept = list.length ? list : [{ kicker: '', title: 'Votre *titre* ici', text: '' }];
  return { post: 'app', title: plain(kept[0].title) || 'Paddock Live', pages: kept, color: C.red };
}
export const appSlides = (d) => (d.pages || []).map((_, i) => `app-${i + 1}`);

// Logo : carré rouge « PL » en italique, puis « Paddock Live » (Live en rouge)
function logo(ctx, x, y, s) {
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, '#ff2a1a'); g.addColorStop(0.55, '#d40500'); g.addColorStop(1, '#8e0300');
  rr(ctx, x, y, s, s, s * 0.22); ctx.fillStyle = g; ctx.fill();
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2); ctx.transform(1, 0, -0.25, 1, 0, 0);
  txt(ctx, 'PL', 0, s * 0.2, { size: Math.round(s * 0.56), weight: 800, family: TITLE, align: 'center' });
  ctx.restore();
  const size = Math.round(s * 0.78);
  txt(ctx, 'Paddock', x + s * 1.3, y + s * 0.78, { size, weight: 800, family: TITLE });
  ctx.font = `800 ${size}px ${TITLE}`;
  txt(ctx, 'Live', x + s * 1.3 + ctx.measureText('Paddock ').width, y + s * 0.78, { size, weight: 800, family: TITLE, color: C.red });
}

// Même fond que les autres visuels (halo rouge, grain)
const backdrop = (ctx, W, H) => background(ctx, W, H, C.red);

// Titre au plus grand qui tient (largeur, lignes au plus, hauteur) : { size, lines: [[{ w, red }]] }
function fitRich(ctx, words, maxW, maxH, sizes, maxLines) {
  let pick = null;
  for (const size of sizes) {
    ctx.font = `800 ${size}px ${TITLE}`;
    const space = ctx.measureText(' ').width;
    const lines = [];
    let line = []; let lw = 0;
    for (const x of words) {
      const w = ctx.measureText(x.w).width;
      if (line.length && lw + space + w > maxW) { lines.push(line); line = []; lw = 0; }
      lw += (line.length ? space : 0) + w;
      line.push(x);
    }
    if (line.length) lines.push(line);
    pick = { size, lines };
    if (lines.length <= maxLines && lines.length * size * 0.98 <= maxH && words.every((x) => ctx.measureText(x.w).width <= maxW)) break;
  }
  return pick;
}

// Texte coupé en lignes de largeur maxW (max lignes, la dernière finie par « … » s'il en reste)
function lines(ctx, text, maxW, font, max) {
  ctx.font = font;
  const out = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxW) {
      if (out.length === max - 1) return [...out, `${line}…`];
      out.push(line); line = w;
    } else line = test;
  }
  return line ? [...out, line] : out;
}

// Page n du post ; media : vidéo (<video>) à la place de l'image de la page ; num / total : rang parmi les pages
// publiées (« 1 / 3 »)
export function appPage(ctx, W, H, d, n, { media = null, num = n, total = 1 } = {}) {
  const p = d.pages?.[n - 1] || {};
  const u = W / 1080;
  const tall = H / W > 1.5;   // story et vidéo plein écran : sous et au-dessus de l'interface du réseau
  const pad = 72 * u;
  const top = (tall ? 190 : 80) * u;
  const foot = H - (tall ? 230 : 70) * u;
  backdrop(ctx, W, H);
  logo(ctx, pad, top, 60 * u);
  if (total > 1) txt(ctx, `${num} / ${total}`, W - pad, top + 42 * u, { size: Math.round(30 * u), weight: 700, family: MONO, color: C.muted, align: 'right' });
  const img = media || (p.image?.width ? p.image : null);
  const iw = img?.videoWidth || img?.width || 0;
  const ih = img?.videoHeight || img?.height || 0;
  let y = top + 130 * u;
  // Titre : sans image, plus grand et plus de place
  const room = (foot - 80 * u - y) * (iw ? 0.36 : 0.62);
  const t = fitRich(ctx, richWords(p.title), W - pad * 2, room, (iw ? [112, 104, 96, 88, 80, 72, 64, 58] : [170, 150, 132, 116, 104, 94, 84, 74, 66]).map((v) => Math.round(v * u)), iw ? 3 : 5);
  const lh = Math.round(t.size * 0.98);
  const body = lines(ctx, String(p.text || '').trim(), W - pad * 2, `400 ${Math.round(38 * u)}px ${BODY}`, iw ? 3 : 6);
  // Sans image : le bloc de texte centré dans la page
  const block = (p.kicker ? 62 * u : 0) + t.lines.length * lh + 34 * u + (body.length ? body.length * 52 * u + 24 * u : 0);
  if (!iw) y += Math.max(0, (foot - 80 * u - y - block) / 2);
  if (p.kicker) {
    pill(ctx, String(p.kicker).toUpperCase(), pad, y - 4 * u, 50 * u, { bg: C.red, dot: '#fff' });
    y += 66 * u;
  }
  ctx.font = `800 ${t.size}px ${TITLE}`;
  const space = ctx.measureText(' ').width;
  t.lines.forEach((line, i) => {
    let x = pad;
    for (const w of line) { txt(ctx, w.w, x, y + t.size * 0.82 + i * lh, { size: t.size, weight: 800, family: TITLE, italic: true, color: w.red ? C.red : C.text }); ctx.font = `800 ${t.size}px ${TITLE}`; x += ctx.measureText(w.w).width + space; }
  });
  y += t.lines.length * lh + 34 * u;
  body.forEach((l, i) => txt(ctx, l, pad, y + 36 * u + i * 52 * u, { size: Math.round(38 * u), weight: 400, family: BODY, color: '#c9ced8' }));
  if (body.length) y += body.length * 52 * u + 24 * u;
  // Capture, photo ou vidéo, cadre arrondi et liseré : sur toute la largeur, sous le texte, le bas coupé s'il en
  // manque peu (comme une capture qui continue) ; sinon en entier, centrée dans la place restante
  const bw = W - pad * 2;
  const bh = foot - 70 * u - (y + 20 * u);
  if (iw && ih && bh > 80 * u) {
    const kw = bw / iw;
    const cut = !media && ih * kw > bh && bh / (ih * kw) >= 0.65;
    const k = cut || ih * kw <= bh ? kw : bh / ih;
    const dw = iw * k; const dh = Math.min(ih * k, bh);
    const dx = pad + (bw - dw) / 2; const dy = y + 20 * u + (k === kw && !tall ? 0 : (bh - dh) / 2);
    ctx.save();
    rr(ctx, dx, dy, dw, dh, 22 * u); ctx.clip();
    ctx.fillStyle = C.bg2; ctx.fillRect(dx, dy, dw, dh);
    if (!img.videoWidth || img.readyState >= 2) ctx.drawImage(img, 0, 0, iw, dh / k, dx, dy, dw, dh);
    ctx.restore();
    rr(ctx, dx, dy, dw, dh, 22 * u); ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
    if (!media) photoCredit(ctx, p.credit, dx, dy, dw, dh, u);
  }
  txt(ctx, FREE, pad, foot, { size: Math.round(34 * u), weight: 400, family: BODY, color: C.muted, max: W * 0.55 });
  txt(ctx, APP_SITE, W - pad, foot, { size: Math.round(34 * u), weight: 700, family: BODY, align: 'right' });
}

// Fin de la vidéo : logo, promesse de l'appli, gratuit, le site
export const APP_OUTRO = 2.8;
export function appOutro(ctx, W, H, s) {
  const u = W / 1080;
  backdrop(ctx, W, H);
  const cy = H * 0.38;
  const k1 = out3(s / 0.5);
  ctx.save(); ctx.globalAlpha = k1;
  const s1 = 110 * u;
  ctx.font = `800 ${Math.round(s1 * 0.78)}px ${TITLE}`;
  logo(ctx, (W - s1 * 1.3 - ctx.measureText('Paddock Live').width) / 2, cy - 160 * u + (1 - k1) * 40 * u, s1);
  txt(ctx, 'LA F1 EN DIRECT, CALÉE SUR TA TV', W / 2, cy + 60 * u, { size: Math.round(64 * u), weight: 800, family: TITLE, italic: true, align: 'center', max: W * 0.88, spacing: 1 });
  ctx.restore();
  const k2 = out3((s - 0.35) / 0.5);
  ctx.save(); ctx.globalAlpha = k2;
  txt(ctx, FREE, W / 2, cy + 150 * u, { size: Math.round(42 * u), weight: 400, family: BODY, color: C.muted, align: 'center', max: W * 0.88 });
  ctx.restore();
  const k3 = out3((s - 0.7) / 0.45);
  if (k3 > 0) {
    const bw = 560 * u; const bh = 120 * u;
    ctx.save(); ctx.globalAlpha = k3;
    ctx.translate(W / 2, cy + 330 * u); ctx.scale(0.7 + 0.3 * k3, 0.7 + 0.3 * k3);
    rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fillStyle = C.red; ctx.fill();
    txt(ctx, APP_SITE, 0, 20 * u, { size: Math.round(56 * u), weight: 800, family: TITLE, color: '#fff', align: 'center', spacing: 1 });
    ctx.restore();
  }
}

// Texte coupé à max caractères (comptés par count), en retirant d'abord le texte de la page puis des mots du titre
function fitted(head, body, tail, max, count = (s) => [...s].length) {
  const join = (h, b) => [h, b, tail].filter(Boolean).join('\n\n');
  if (count(join(head, body)) <= max) return join(head, body);
  let h = head;
  while (count(join(h, '')) > max && h.includes(' ')) h = `${h.split(' ').slice(0, -2).join(' ')}…`;
  return join(h, '');
}

// Textes du post : légendes longues (Instagram, Facebook), courtes (X, Bluesky, Threads), vidéo (TikTok, YouTube)
export function appCaptions(d) {
  const [first = {}, ...rest] = d.pages || [];
  const head = plain(first.title);
  const body = [String(first.text || '').trim(), rest.map((p) => (plain(p.title) ? `▸ ${plain(p.title)}${String(p.text || '').trim() ? ` : ${String(p.text).trim()}` : ''}` : '')).filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
  const free = 'Gratuit sur Windows, Mac et Linux';
  const short = fitted(head, String(first.text || '').trim(), `${free} : https://${APP_SITE}`, 280, xLength);
  return {
    instagram: [head, body, `${free} : lien dans la bio.`, TAGS].filter(Boolean).join('\n\n'),
    facebook: [head, body, `${free} 👉 https://${APP_SITE}`].filter(Boolean).join('\n\n'),
    threads: fitted(head, body, `${free} : https://${APP_SITE}`, 500),
    x: short,
    bsky: fitted(head, String(first.text || '').trim(), `${free} : https://${APP_SITE}`, 300),
    tiktok: [...[head, String(first.text || '').trim(), `${free} : lien dans la bio.`, `${TAGS} #F1TV`].filter(Boolean).join('\n\n')].slice(0, 2200).join(''),
    youtube: [[...head].slice(0, 100).join(''), String(first.text || '').trim(), `${free} : https://${APP_SITE}`].filter(Boolean).join('\n'),
    comment: '',
  };
}
