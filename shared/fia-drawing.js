// Dessin du plan du circuit publié par la FIA (« Competition Notes - Circuit Map », PDF vectoriel) : le tracé et les
// marques du mode dépassement y sont dessinés en couleurs (bandes rouges et bleues des zones « ligne droite », traits
// verts de la détection et de l'activation). Le dessin est recalé sur le tracé de la carte (même forme, autre échelle
// et orientation), puis ses marques sont projetées sur le tracé : fin exacte de chaque zone, points de détection et
// d'activation à leur place. Lu par le serveur de Paddock Live (analytics/zones.js, via shared/zones.js).

// PDF -> dessin de la page du plan (celle de l'encadré « CIRCUIT DATA ») : { texts: [{ x, y, s, h }], shapes } ou null (h : hauteur
// des caractères)
let pdfLib = null;
export async function pdfDrawing(buf) {
  pdfLib ||= await import('unpdf');
  const pdf = await pdfLib.getDocumentProxy(new Uint8Array(buf), { verbosity: 0 });
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const texts = (await page.getTextContent()).items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str, h: Math.abs(it.transform[3]) }));
      if (texts.some((t) => /^CIRCUIT DATA$/i.test(t.s.trim()))) return { texts, shapes: drawingShapes(await page.getOperatorList()) };
    }
    return null;
  } finally { await pdf.destroy?.(); }
}

// Opérateurs du dessin (pdf.js, getOperatorList) : codes fixes de la bibliothèque
const OP = { save: 10, restore: 11, transform: 12, setFillRGBColor: 59, constructPath: 91 };
export const COLORS = { normal: '#ff0000', low: '#007eff', overtake: '#37dd00' };
const MARKS = new Set(Object.values(COLORS));

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

// Liste des opérations d'une page ({ fnArray, argsArray }) -> formes remplies [{ fill, pts: [[x, y], …] }], en
// coordonnées de la page (celles du texte de getTextContent)
export function drawingShapes({ fnArray, argsArray }) {
  let ctm = [1, 0, 0, 1, 0, 0], fill = '#000000';
  const stack = [], shapes = [];
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i], a = argsArray[i];
    if (op === OP.save) stack.push(ctm);
    else if (op === OP.restore) ctm = stack.pop() || ctm;
    else if (op === OP.transform) ctm = mul(ctm, a);
    else if (op === OP.setFillRGBColor) fill = String(a[0]).toLowerCase();
    else if (op === OP.constructPath) {
      // Chemin codé : 0 moveTo (x, y), 1 lineTo (x, y), 2 curveTo (6 nombres), 3 quadraticCurveTo (4), 4 closePath
      const d = Object.values(a?.[1]?.[0] || {});
      const pts = [];
      for (let k = 0; k < d.length;) {
        const c = [2, 2, 6, 4][d[k++]] ?? 0;
        if (c) {
          const x = d[k + c - 2], y = d[k + c - 1];   // point d'arrivée
          pts.push([ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
        }
        k += c;
      }
      if (pts.length) shapes.push({ fill, pts });
    }
  }
  return shapes;
}

// Recalage d'un nuage de points p sur q (similitude : échelle, rotation, symétrie éventuelle, translation) par
// plus proches voisins successifs (ICP), depuis plusieurs orientations de départ
const sub = (arr, n) => (arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor((i * arr.length) / n)]));
function centre(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  x /= pts.length; y /= pts.length;
  let r = 0;
  for (const p of pts) r += (p[0] - x) ** 2 + (p[1] - y) ** 2;
  return { x, y, r: Math.sqrt(r / pts.length) || 1 };
}
const apply = (t, p) => {
  const x = (p[0] - t.cx) * (t.flip ? -1 : 1), y = p[1] - t.cy;
  return [t.s * (Math.cos(t.th) * x - Math.sin(t.th) * y) + t.tx, t.s * (Math.sin(t.th) * x + Math.cos(t.th) * y) + t.ty];
};
function nearest(q, p) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < q.length; i++) {
    const d = (q[i][0] - p[0]) ** 2 + (q[i][1] - p[1]) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  return [bi, Math.sqrt(best)];
}
function icp(p, q, t, iters) {
  for (let it = 0; it < iters; it++) {
    // Couples (p, plus proche q), puis meilleure similitude (forme fermée en 2D)
    const pairs = p.map((pt) => [pt, q[nearest(q, apply(t, pt))[0]]]);
    let px = 0, py = 0, qx = 0, qy = 0;
    for (const [a, b] of pairs) { px += (a[0] - t.cx) * (t.flip ? -1 : 1); py += a[1] - t.cy; qx += b[0]; qy += b[1]; }
    const n = pairs.length;
    px /= n; py /= n; qx /= n; qy /= n;
    let sa = 0, sb = 0, sp = 0;
    for (const [a, b] of pairs) {
      const x = (a[0] - t.cx) * (t.flip ? -1 : 1) - px, y = a[1] - t.cy - py, u = b[0] - qx, v = b[1] - qy;
      sa += x * u + y * v; sb += x * v - y * u; sp += x * x + y * y;
    }
    const th = Math.atan2(sb, sa), s = Math.hypot(sa, sb) / (sp || 1);
    t = { ...t, th, s, tx: qx - s * (Math.cos(th) * px - Math.sin(th) * py), ty: qy - s * (Math.sin(th) * px + Math.cos(th) * py) };
  }
  return t;
}
// Écart moyen dans les deux sens (le dessin couvre tout le tracé, et le tracé tout le dessin)
function gap(t, p, q) {
  const tp = p.map((pt) => apply(t, pt));
  let e = 0;
  for (const pt of tp) e += nearest(q, pt)[1];
  for (const pt of q) e += nearest(tp, pt)[1];
  return e / (tp.length + q.length);
}
export function fitDrawing(outline, track) {
  const q = track.map((p) => [p.x, p.y]);
  const cp = centre(outline), cq = centre(q);
  const pc = sub(outline, 120), qc = sub(q, 240), pf = sub(outline, 400), qf = sub(q, 500);
  const starts = [];
  for (const flip of [false, true]) {
    for (let deg = 0; deg < 360; deg += 15) {
      let t = { cx: cp.x, cy: cp.y, flip, th: (deg * Math.PI) / 180, s: cq.r / cp.r, tx: cq.x, ty: cq.y };
      t = icp(pc, qc, t, 10);
      starts.push({ t, e: gap(t, pc, qc) });
    }
  }
  starts.sort((a, b) => a.e - b.e);
  let best = null;
  for (const { t } of starts.slice(0, 3)) {
    const tt = icp(pf, qf, t, 20), e = gap(tt, pf, qf);
    if (!best || e < best.e) best = { t: tt, e };
  }
  return { ...best, apply: (pt) => apply(best.t, pt) };
}

// Dessin d'une page ({ shapes, texts }) + tracé (Track) -> { runs: [{ from, to }], detection, activation, corners, err } ou
// null : runs = portions du tracé couvertes par les bandes des zones « ligne droite » ; detection / activation = indices
// du tracé ; corners = numéros des virages [{ number, idx, angle }] ; err = écart moyen du recalage (en m). M : unités du
// tracé par mètre.
export function drawingMarks({ shapes, texts = [] }, track, M = 10) {
  const n = track.pts.length;
  if (n < 20 || !shapes?.length) return null;
  // Tracé du dessin : la couleur (hors marques) dont la forme se recale le mieux sur le tracé de la carte
  const byColor = new Map();
  for (const s of shapes) if (!MARKS.has(s.fill)) byColor.set(s.fill, [...(byColor.get(s.fill) || []), ...s.pts]);
  const span = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); };
  const cands = [...byColor.values()].filter((pts) => pts.length >= 200).map((pts) => ({ pts, span: span(pts) })).sort((a, b) => b.pts.length - a.pts.length).slice(0, 6);
  if (!cands.length) return null;
  const big = Math.max(...cands.map((c) => c.span));
  let fit = null;
  for (const c of cands.filter((c) => c.span > big * 0.3)) {
    const f = fitDrawing(c.pts, track.pts);
    if (!fit || f.e < fit.e) fit = f;
  }
  // Recalage trop imprécis (plus de 12 m en moyenne) : dessin inutilisable
  if (!fit || fit.e > 12 * M) return null;
  const q = track.pts.map((p) => [p.x, p.y]);
  const near = (pt) => { const [i, d] = nearest(q, fit.apply(pt)); return d < 20 * M ? i : null; };
  // Bandes rouges et bleues : indices couverts, trous bouchés (moins de 40 m : la bande s'interrompt sur la ligne de
  // départ), portions de plus de 60 m
  const cov = new Uint8Array(n);
  for (const s of shapes) if (s.fill === COLORS.normal || s.fill === COLORS.low) for (const pt of s.pts) { const i = near(pt); if (i !== null) cov[i] = 1; }
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.hypot(q[(i + 1) % n][0] - q[i][0], q[(i + 1) % n][1] - q[i][1]);
  const step = total / n || 6 * M;
  const holes = Math.ceil((40 * M) / step), minLen = Math.ceil((60 * M) / step);
  // Départ du parcours dans une portion sans bande (une zone peut passer la ligne d'arrivée, indice 0)
  const start = cov.findIndex((v, i) => !v && [...Array(holes).keys()].every((h) => !cov[(i - 1 - h + n) % n]));
  const runs = [];
  if (start >= 0 && cov.some(Boolean)) {
    let from = null, lastOn = null;
    for (let k = 0; k <= n; k++) {
      const i = (start + k) % n;
      if (cov[i] && k < n) { if (from === null) from = i; lastOn = i; continue; }
      if (from !== null && (k === n || ![...Array(holes).keys()].some((h) => cov[(i + h) % n]))) {
        const len = (lastOn - from + n) % n + 1;
        if (len >= minLen) runs.push({ from, to: lastOn });
        from = null;
      }
    }
  }
  // Traits verts sur le tracé (un trait = deux formes : regroupées à moins de 15 m) : détection et activation, rattachées
  // aux libellés « OT D » / « OT A » du plan (ceux de la légende sont loin du tracé), sans prendre deux fois le même trait
  const ticks = [];
  for (const s of shapes.filter((s) => s.fill === COLORS.overtake)) {
    const c = s.pts.reduce((a, p) => [a[0] + p[0] / s.pts.length, a[1] + p[1] / s.pts.length], [0, 0]);
    const idx = near(c);
    if (idx !== null && !ticks.some((t) => Math.hypot(...fit.apply(t.c).map((v, k) => v - fit.apply(c)[k])) < 15 * M)) ticks.push({ c, idx });
  }
  // Libellés « OT D » / « OT A » d'un seul tenant, ou écrits à la verticale en deux morceaux (« OT » puis « D » / « A »)
  const str = (t) => String(t.s).trim();
  const ot = [...texts.filter((t) => /^OT\s*[DA]$/i.test(str(t))).map((t) => ({ ...t, k: str(t).slice(-1).toUpperCase() }))];
  for (const t of texts.filter((t) => /^OT$/i.test(str(t)))) {
    const l = texts.filter((u) => /^[DA]$/i.test(str(u)) && Math.hypot(u.x - t.x, u.y - t.y) < 30).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
    if (l) ot.push({ x: (t.x + l.x) / 2, y: (t.y + l.y) / 2, k: str(l).toUpperCase() });
  }
  const labels = (re) => ot.filter((t) => t.k === (re.source.includes('D') ? 'D' : 'A'));
  // Distance trait - libellé, en unités du tracé ; au-delà de 400 m (légende), pas de rattachement
  const d2 = (t, l) => { const a = fit.apply(t.c), b = fit.apply([l.x, l.y]), d = Math.hypot(a[0] - b[0], a[1] - b[1]); return d < 400 * M ? d : Infinity; };
  let detection = null, activation = null, best = Infinity;
  for (const ld of labels(/^OT\s*D$/i)) for (const la of labels(/^OT\s*A$/i)) {
    for (const td of ticks) for (const ta of ticks) {
      if (td === ta && ticks.length > 1) continue;
      const cost = d2(td, ld) + d2(ta, la);
      if (cost < best && Number.isFinite(cost)) { best = cost; detection = td.idx; activation = ta.idx; }
    }
  }
  if (detection === activation) { detection = null; activation = null; }   // un seul trait : on garde le texte du plan
  // Numéros des virages : le groupe de numéros (même hauteur, au moins 5) écrit le plus gros (les postes des commissaires
  // sont plus petits), au point du tracé le plus proche du libellé (à moins de 100 m) ; angle : direction du libellé
  const groups = new Map();
  for (const t of texts) if (/^\d{1,2}$/.test(str(t)) && t.h) groups.set(t.h.toFixed(1), [...(groups.get(t.h.toFixed(1)) || []), t]);
  const turns = [...groups].filter(([, g]) => new Set(g.map(str)).size >= 5).sort((a, b) => b[0] - a[0])[0]?.[1] || [];
  const corners = [];
  for (const t of turns) {
    const number = Number(str(t)), p = fit.apply([t.x, t.y]), [idx, d] = nearest(q, p);
    if (d < 100 * M && !corners.some((c) => c.number === number)) corners.push({ number, idx, angle: Math.round((Math.atan2(p[1] - q[idx][1], p[0] - q[idx][0]) * 180) / Math.PI) });
  }
  return { runs, detection, activation, corners, err: Math.round(fit.e / M) };
}
