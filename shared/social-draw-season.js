// Visuels des posts de saison (mode créateur) : horaires du week-end, pneus et météo, records du
// circuit, notes des pilotes, duels entre coéquipiers, positions tour par tour, récap de la semaine,
// et images de la vidéo animée de la course. Mêmes outils de dessin que les autres posts.
import { C, TITLE, BODY, MONO, MEDAL, rr, txt, fitLines, vivid, alpha, background, frame, newsSlide, teamLogo, card, pill, kicker, footer, topY, footY } from './social-draw.js';
import { lapStr } from './social-season.js';

const dec = (v, n = 1) => (v == null ? '—' : Number(v).toFixed(n).replace('.', ','));
const TYRE = { hard: ['DURS', '#f3f5f9'], medium: ['MÉDIUMS', '#f5c518'], soft: ['TENDRES', '#e10600'] };

const panel = (ctx, x, y, w, h, r = 22) => card(ctx, x, y, w, h, r);
const note = (ctx, W, f, text) => txt(ctx, text, W - f.pad, f.bottom + 20, { size: 28, weight: 600, color: C.muted, align: 'right' });

// ---------- Programme : horaires (heure de Paris), groupés par jour ----------
export function horaires(ctx, W, H, d, o) {
  background(ctx, W, H, C.red);
  const f = frame(ctx, W, H, d, o, 'Horaires');
  const days = [];
  for (const s of d.sessions) { const k = s.dayNum; let g = days.find((x) => x.k === k); if (!g) days.push(g = { k, day: s.day, list: [] }); g.list.push(s); }
  const rows = d.sessions.length + days.length;
  const unit = Math.min(H > 1600 ? 190 : 120, (f.bottom - f.top - 20) / Math.max(rows, 1));
  let y = f.top + 10;
  for (const g of days) {
    txt(ctx, `${g.day} ${g.k}`.toUpperCase(), f.pad, y + unit * 0.62, { size: Math.round(unit * 0.32), weight: 800, family: TITLE, color: C.red, spacing: 3 });
    ctx.fillStyle = C.line; ctx.fillRect(f.pad, y + unit * 0.8, W - f.pad * 2, 2);
    y += unit;
    for (const s of g.list) {
      if (s.main) { panel(ctx, f.pad, y + 6, W - f.pad * 2, unit - 12, 14); ctx.fillStyle = C.red; ctx.fillRect(f.pad, y + unit * 0.2, 8, unit * 0.6); }
      txt(ctx, s.time, f.pad + 34, y + unit * 0.64, { size: Math.round(unit * 0.44), weight: 700, family: MONO, color: s.main ? C.text : C.muted });
      txt(ctx, s.label.toUpperCase(), f.pad + 34 + unit * 1.75, y + unit * 0.62, { size: Math.round(unit * 0.36), weight: s.main ? 800 : 700, family: TITLE, color: s.main ? C.text : C.muted, spacing: 1, max: W - f.pad * 2 - unit * 2.2 });
      y += unit;
    }
  }
  note(ctx, W, f, 'Heures de Paris');
}

// ---------- Programme : pneus Pirelli et météo prévue ----------
export function infos(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Pneus et météo');
  const blocks = [d.tyres && 'tyres', d.forecast?.length && 'meteo'].filter(Boolean);
  const gap = 30;
  const bw = W - f.pad * 2;
  const full = (f.bottom - f.top - gap * (blocks.length - 1)) / blocks.length;
  const bh = Math.min(full, H > 1600 ? 860 : 680);
  const y0 = f.top + (f.bottom - f.top - blocks.length * bh - gap * (blocks.length - 1)) / 2;
  blocks.forEach((b, i) => {
    const x = f.pad;
    const y = y0 + i * (bh + gap);
    panel(ctx, x, y, bw, bh);
    txt(ctx, b === 'tyres' ? 'PNEUS PIRELLI' : 'MÉTÉO PRÉVUE', x + 30, y + 56, { size: 30, weight: 800, family: TITLE, color: C.muted, spacing: 3 });
    if (b === 'tyres') {
      const r = Math.min(bw / 8, (bh - 150) / 2.8, 140);
      ['hard', 'medium', 'soft'].forEach((k, j) => {
        const cx = x + bw * (j + 0.5) / 3;
        const cy = y + 90 + (bh - 90) * 0.45;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#1c2230'; ctx.fill();
        ctx.lineWidth = r * 0.22; ctx.strokeStyle = TYRE[k][1]; ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.stroke();
        txt(ctx, `C${d.tyres[k]}`, cx, cy + r * 0.2, { size: Math.round(r * 0.62), weight: 800, family: TITLE, align: 'center' });
        txt(ctx, TYRE[k][0], cx, cy + r + 54, { size: Math.round(Math.min(34, r * 0.4)), weight: 700, family: TITLE, color: TYRE[k][1], align: 'center', spacing: 2 });
      });
    } else {
      const list = d.forecast.slice(-3);
      const cw = (bw - 60) / list.length;
      list.forEach((w, j) => {
        const cx = x + 30 + cw * (j + 0.5);
        const top = y + 110;
        txt(ctx, w.day.toUpperCase(), cx, top + 30, { size: 30, weight: 800, family: TITLE, align: 'center', spacing: 2 });
        txt(ctx, `${Math.round(w.tmax)}°`, cx, top + 30 + Math.min(150, bh * 0.36), { size: Math.round(Math.min(110, bh * 0.28)), weight: 800, family: TITLE, align: 'center' });
        txt(ctx, `min ${Math.round(w.tmin)}°`, cx, top + 70 + Math.min(150, bh * 0.36), { size: 28, weight: 600, color: C.muted, align: 'center' });
        const rain = Math.round(w.rain ?? 0);
        txt(ctx, `PLUIE ${rain} %`, cx, top + 120 + Math.min(150, bh * 0.36), { size: 30, weight: 800, family: TITLE, color: rain >= 50 ? '#4aa3ff' : rain >= 20 ? C.gold : C.green, align: 'center', spacing: 1 });
      });
    }
  });
  if (d.forecast?.length) note(ctx, W, f, 'Prévisions Open-Meteo, susceptibles d\'évoluer');
}

// ---------- Le saviez-vous : éditions précédentes ----------
export function editions(ctx, W, H, d, o) {
  background(ctx, W, H, d.bestPole?.color);
  const f = frame(ctx, W, H, d, o, 'Éditions précédentes');
  const list = d.editions.slice(0, 5);
  const head = 70;
  const rowH = Math.min(H > W ? 170 : 120, (f.bottom - f.top - head) / Math.max(1, list.length));
  const cols = [f.pad + 20, f.pad + (W - f.pad * 2) * 0.2, f.pad + (W - f.pad * 2) * 0.6];
  txt(ctx, 'ANNÉE', cols[0], f.top + 30, { size: 27, weight: 700, family: TITLE, color: C.muted, spacing: 3 });
  txt(ctx, 'POLE POSITION', cols[1], f.top + 30, { size: 27, weight: 700, family: TITLE, color: C.muted, spacing: 3 });
  txt(ctx, 'MEILLEUR TOUR EN COURSE', cols[2], f.top + 30, { size: 27, weight: 700, family: TITLE, color: C.muted, spacing: 3 });
  const cell = (x, y, p, best) => {
    if (!p) { txt(ctx, '—', x, y, { size: 40, weight: 700, family: TITLE, color: C.muted }); return; }
    ctx.fillStyle = vivid(p.color); ctx.fillRect(x, y - rowH * 0.36, 6, rowH * 0.5);
    txt(ctx, p.name.toUpperCase(), x + 22, y - rowH * 0.06, { size: Math.round(rowH * 0.26), weight: 800, family: TITLE, max: (W - f.pad * 2) * 0.36 });
    txt(ctx, lapStr(p.time), x + 22, y + rowH * 0.22, { size: Math.round(rowH * 0.22), weight: 700, family: MONO, color: best ? C.gold : C.muted });
  };
  list.forEach((e, i) => {
    const y = f.top + head + i * rowH;
    if (i % 2 === 0) panel(ctx, f.pad, y, W - f.pad * 2, rowH - 8, 12);
    const mid = y + rowH / 2;
    txt(ctx, String(e.year), cols[0], mid + rowH * 0.12, { size: Math.round(rowH * 0.34), weight: 800, family: TITLE });
    cell(cols[1], mid, e.pole, e.pole && d.bestPole && e.year === d.bestPole.year);
    cell(cols[2], mid, e.fastest, e.fastest && d.bestRaceLap && e.year === d.bestRaceLap.year);
  });
  note(ctx, W, f, 'En doré : record du circuit sur ces éditions');
}

// ---------- Notes des pilotes ----------
const noteColor = (n) => (n >= 8 ? C.green : n >= 6.5 ? C.gold : n >= 5 ? '#f39c4a' : C.red);
export function topflop(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, 'Tops et flops');
  const top = d.rows.slice(0, 3);
  const flop = d.rows.slice(-3).reverse();
  const card = (r, x, y, w, h, big) => {
    panel(ctx, x, y, w, h);
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x, y + h * 0.18, 8, h * 0.64);
    const ns = Math.round(h * (big ? 0.5 : 0.46));
    txt(ctx, dec(r.note), x + w - 30, y + h * 0.5 + ns * 0.36, { size: ns, weight: 800, family: TITLE, color: noteColor(r.note), align: 'right' });
    txt(ctx, r.last.toUpperCase(), x + 32, y + h * 0.46, { size: Math.round(h * (big ? 0.26 : 0.3)), weight: 800, family: TITLE, italic: true, max: w - ns * 2.4 });
    const sub = `${r.team} · ${r.classified ? `P${r.pos}` : 'Abandon'}${r.grid ? ` (parti P${r.grid})` : ''}`;
    txt(ctx, sub, x + 32, y + h * 0.76, { size: Math.round(h * (big ? 0.15 : 0.17)), weight: 600, color: C.muted, max: w - ns * 2.4 });
  };
  const avail = f.bottom - f.top - 130;
  const big = avail * 0.58 / 3;
  const small = avail * 0.42 / 3;
  let y = f.top;
  txt(ctx, 'LES TOPS', f.pad, y + 30, { size: 30, weight: 800, family: TITLE, color: C.green, spacing: 4 });
  y += 50;
  top.forEach((r) => { card(r, f.pad, y, W - f.pad * 2, big - 14, true); y += big; });
  y += 20;
  txt(ctx, 'LES FLOPS', f.pad, y + 30, { size: 30, weight: 800, family: TITLE, color: C.red, spacing: 4 });
  y += 50;
  flop.forEach((r) => { card(r, f.pad, y, W - f.pad * 2, small - 12, false); y += small; });
  note(ctx, W, f, `Note Paddock Live : résultat, ${d.withPace ? 'rythme, ' : ''}places gagnées, duel avec le coéquipier`);
}

export function notes(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Notes des pilotes');
  const list = d.rows.slice(0, 22);
  const cols = list.length > 12 ? 2 : 1;
  const per = Math.ceil(list.length / cols);
  const colW = (W - f.pad * 2 - (cols - 1) * 36) / cols;
  const rowH = Math.min(H > 1600 ? 110 : 90, (f.bottom - f.top - 10) / per);
  const fs = Math.round(rowH * 0.42);
  list.forEach((r, i) => {
    const x = f.pad + Math.floor(i / per) * (colW + 36);
    const y = f.top - 6 + (i % per) * rowH;
    card(ctx, x, y, colW, rowH - 8, (rowH - 8) * 0.3, { tint: r.color, light: i >= 3 });
    const mid = y + rowH / 2 + fs * 0.34;
    teamLogo(ctx, o, r.team, x + 18 + fs * 0.55, y + (rowH - 4) / 2, fs * 0.85, 'center', fs * 1.1);
    const cx0 = x + 30 + fs * 1.1;
    txt(ctx, r.code, cx0, mid, { size: fs, weight: 800, family: TITLE, italic: true });
    txt(ctx, r.classified ? `P${r.pos}` : 'AB.', cx0 + fs * 2.5, mid, { size: Math.round(fs * 0.7), weight: 700, family: MONO, color: C.muted });
    // Barre de la note (de 3 à 10)
    const bx = cx0 + fs * 4.5;
    const bw = colW - (bx - x) - fs * 2.6;
    rr(ctx, bx, y + rowH * 0.38, bw, rowH * 0.24, rowH * 0.12); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    rr(ctx, bx, y + rowH * 0.38, Math.max(rowH * 0.24, bw * (r.note - 3) / 7), rowH * 0.24, rowH * 0.12); ctx.fillStyle = noteColor(r.note); ctx.fill();
    txt(ctx, dec(r.note), x + colW - 14, mid, { size: fs, weight: 800, family: TITLE, color: noteColor(r.note), align: 'right' });
  });
  note(ctx, W, f, 'Notes sur 10');
}

// ---------- Duels entre coéquipiers (saison) ----------
export function equipes(ctx, W, H, d, o, page) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, `Après ${d.after} course${d.after > 1 ? 's' : ''}`);
  const per = Math.ceil(d.rows.length / Math.ceil(d.rows.length / 5));
  const list = d.rows.slice((page - 1) * per, page * per);
  const rowH = (f.bottom - f.top) / Math.max(per, 1);
  list.forEach((r, i) => {
    const y = f.top + i * rowH;
    const h = rowH - 16;
    panel(ctx, f.pad, y, W - f.pad * 2, h);
    const col = vivid(r.color);
    ctx.fillStyle = col; ctx.fillRect(f.pad, y + 14, 8, h - 28);
    const fs = Math.round(Math.min(h * 0.2, H > 1600 ? 60 : 46));
    const cx = W / 2;
    txt(ctx, r.team.toUpperCase(), cx, y + fs * 1.1, { size: Math.round(fs * 0.62), weight: 700, family: TITLE, color: col, align: 'center', spacing: 3, max: W * 0.5 });
    // Noms : jusqu'aux chiffres des barres, sans les chevaucher
    const nameMax = (W - W * 0.34) / 2 - f.pad - 34 - fs * 1.1;
    txt(ctx, r.a.last.toUpperCase(), f.pad + 34, y + h * 0.5, { size: fs, weight: 800, family: TITLE, italic: true, max: nameMax });
    txt(ctx, r.b.last.toUpperCase(), W - f.pad - 30, y + h * 0.5, { size: fs, weight: 800, family: TITLE, italic: true, align: 'right', max: nameMax });
    // Barres qualifs et course : part de chacun
    const bar = (label, a, b, by) => {
      const bw = W * 0.34;
      const bx = cx - bw / 2;
      const share = a + b ? a / (a + b) : 0.5;
      txt(ctx, label, cx, by - 8, { size: Math.max(16, Math.round(fs * 0.42)), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2 });
      rr(ctx, bx, by, bw, fs * 0.34, fs * 0.17); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      rr(ctx, bx, by, Math.max(fs * 0.34, bw * share), fs * 0.34, fs * 0.17); ctx.fillStyle = col; ctx.fill();
      txt(ctx, String(a), bx - 16, by + fs * 0.32, { size: Math.round(fs * 0.62), weight: 800, family: TITLE, align: 'right', color: a >= b ? C.text : C.muted });
      txt(ctx, String(b), bx + bw + 16, by + fs * 0.32, { size: Math.round(fs * 0.62), weight: 800, family: TITLE, color: b >= a ? C.text : C.muted });
    };
    bar('QUALIFS', r.a.q, r.b.q, y + h * 0.42);
    bar('COURSE', r.a.r, r.b.r, y + h * 0.42 + fs * 1.25);
    const gap = r.gap == null ? '' : `Écart médian en qualif : ${dec(Math.abs(r.gap), 3)} s`;
    txt(ctx, `${r.a.pts} pts`, f.pad + 34, y + h * 0.5 + fs * 0.95, { size: Math.round(fs * 0.55), weight: 700, family: MONO, color: C.muted });
    txt(ctx, `${r.b.pts} pts`, W - f.pad - 30, y + h * 0.5 + fs * 0.95, { size: Math.round(fs * 0.55), weight: 700, family: MONO, color: C.muted, align: 'right' });
    if (gap && h > fs * 3.4) txt(ctx, gap, cx, y + h - 14, { size: Math.max(18, Math.round(fs * 0.42)), weight: 600, color: C.muted, align: 'center' });
  });
}

// ---------- Course au titre : pilotes (team = false) ou constructeurs ----------
// Bandeau : points encore en jeu, ou le champion ; puis les concurrents encore en course et les deux
// premiers éliminés (grisés). Barre : points actuels, hachures jusqu'au maximum possible, trait du leader.
export function titre(ctx, W, H, d, o, team) {
  const all = team ? d.constructors : d.drivers;
  const champ = team ? d.champTeam : d.champion;
  const clinch = team ? d.clinchC : d.clinchD;
  background(ctx, W, H, all[0]?.color);
  const f = frame(ctx, W, H, d, o, team ? 'Constructeurs' : 'Pilotes');
  const u = Math.min(W, H) / 1080;
  // Bandeau
  const bh = Math.round(130 * u);
  panel(ctx, f.pad, f.top - 10, W - f.pad * 2, bh);
  ctx.fillStyle = champ ? C.gold : C.red; ctx.fillRect(f.pad, f.top, 8, bh - 20);
  const by = f.top - 10 + bh / 2;
  if (champ) {
    txt(ctx, team ? 'CHAMPION DU MONDE DES CONSTRUCTEURS' : 'CHAMPION DU MONDE', f.pad + 40 * u, by - 12 * u, { size: Math.round(30 * u), weight: 700, family: TITLE, color: C.gold, spacing: 3, max: W - f.pad * 2 - 80 * u });
    txt(ctx, champ.name.toUpperCase(), f.pad + 40 * u, by + 42 * u, { size: Math.round(52 * u), weight: 800, family: TITLE, italic: true, max: W - f.pad * 2 - 80 * u });
  } else {
    txt(ctx, `${team ? d.left.c : d.left.d} PTS`, f.pad + 40 * u, by + 26 * u, { size: Math.round(72 * u), weight: 800, family: TITLE, italic: true });
    txt(ctx, 'ENCORE EN JEU', f.pad + 40 * u, by - 34 * u, { size: Math.round(27 * u), weight: 700, family: TITLE, color: C.red, spacing: 3 });
    const rest = d.left.races ? `${d.left.races} GP RESTANT${d.left.races > 1 ? 'S' : ''}${d.left.sprints ? ` · ${d.left.sprints} SPRINT${d.left.sprints > 1 ? 'S' : ''}` : ''}` : 'SAISON TERMINÉE';
    txt(ctx, rest, W - f.pad - 30 * u, by + 12 * u, { size: Math.round(30 * u), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
  }
  // Concurrents : encore en course, puis deux éliminés
  const max = H > 1600 ? 10 : 7;
  const alive = all.filter((e) => e.alive).length;
  const list = all.slice(0, Math.min(max, Math.max(alive + 2, 3)));
  const top = f.top - 10 + bh + 24 * u;
  const rowH = Math.min((H > 1600 ? 190 : 120) * u, (f.bottom - top - 30 * u) / Math.max(list.length, 1));
  const fs = Math.round(rowH * 0.32);
  const lead = Math.max(...all.map((e) => e.points));
  const scale = Math.max(...list.map((e) => e.maxPts), 1);
  list.forEach((e, i) => {
    const y = top + i * rowH;
    const h = rowH - 12 * u;
    const col = vivid(e.color);
    ctx.save();
    if (!e.alive) ctx.globalAlpha = 0.45;
    panel(ctx, f.pad, y, W - f.pad * 2, h, 14);
    ctx.fillStyle = col; ctx.fillRect(f.pad, y + 10, 6, h - 20);
    const px = f.pad + fs * 1.7;
    txt(ctx, String(e.pos), px, y + h * 0.5 + fs * 0.34, { size: Math.round(fs * 1.1), weight: 800, family: TITLE, color: i === 0 ? C.gold : C.text, align: 'right' });
    const slot = fs * 1.3;
    teamLogo(ctx, o, e.team, px + fs * 0.4 + slot / 2, y + h * 0.5, fs * 0.95, 'center', slot);
    const tx = px + fs * 0.7 + slot;
    const right = W - f.pad - fs * 0.6;
    const ny = y + h * 0.42;
    txt(ctx, `${e.points} PTS`, right, ny, { size: Math.round(fs * 0.86), weight: 700, family: MONO, align: 'right' });
    txt(ctx, e.label.toUpperCase(), tx, ny, { size: fs, weight: 800, family: TITLE, italic: true, max: right - tx - fs * 4.4 });
    const status = !e.alive ? `${team ? 'Éliminée' : 'Éliminé'} · manche ${e.outRound}` : e.behind ? `À ${e.behind} pts · ${e.maxPts} pts au plus` : 'En tête';
    txt(ctx, status.toUpperCase(), tx, ny + fs * 0.78, { size: Math.round(Math.max(fs * 0.5, 20 * u)), weight: 700, family: TITLE, color: !e.alive ? C.red : e.behind ? C.muted : C.gold, spacing: 1.5 });
    // Barre : points (couleur d'écurie) + possible (clair) ; trait = points du leader
    const bx = tx; const bw = right - tx; const bar = Math.max(6, fs * 0.2); const yb = y + h - bar - fs * 0.32;
    rr(ctx, bx, yb, bw, bar, bar / 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    if (e.alive) { rr(ctx, bx, yb, Math.max(bar, bw * (e.maxPts / scale)), bar, bar / 2); ctx.fillStyle = alpha(col, 0.3); ctx.fill(); }
    rr(ctx, bx, yb, Math.max(bar, bw * (e.points / scale)), bar, bar / 2); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = C.text; ctx.fillRect(bx + bw * (lead / scale) - 1.5, yb - bar * 0.6, 3, bar * 2.2);
    ctx.restore();
  });
  const msg = champ ? '' : clinch?.next ? `${clinch.leader} peut être sacré dès ${clinch.next}` : clinch?.earliest ? `Titre possible au plus tôt : ${clinch.earliest}` : '';
  const more = alive > list.length ? `+ ${alive - list.length} autres encore en course` : '';
  note(ctx, W, f, [msg, more].filter(Boolean).join('  ·  ') || 'Barre claire : points encore possibles');
}

// ---------- Course au titre : comment le leader peut être sacré (comme dans l'appli) ----------
// Un bloc par championnat encore ouvert : quand le titre peut se jouer, et au prochain Grand Prix,
// l'avance à prendre sur chaque rival (et la place qu'il doit faire si le leader gagne ou finit 2e)
const gapTxt = (m) => (m === 1 ? '+1 PT OU PLUS' : m > 0 ? `+${m} PTS OU PLUS` : m === 0 ? 'ÉGALITÉ OU MIEUX' : m === -1 ? '−1 PT AU PIRE' : `−${-m} PTS AU PIRE`);
export const titleBlocks = (d) => [['PILOTES', d.clinchD, d.champion], ['CONSTRUCTEURS', d.clinchC, d.champTeam]].filter(([, c, champ]) => c && !champ);
export function titreComment(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Comment être sacré');
  const u = Math.min(W, H) / 1080;
  const gap = 30 * u;
  const blocks = titleBlocks(d);
  const bw = W - f.pad * 2;
  const pw = bw - 60 * u;
  const rowH = 62 * u;
  // Texte de chaque bloc : conditions (tableau) ou explication ; hauteur selon le contenu
  const list = blocks.map(([title, c]) => {
    const top = c.needs[0];
    const fit = c.possibleNext ? null : fitLines(ctx, top ? `Pas encore au ${c.nextGp} : il faudrait à ${c.leader} ${top.margin} points de plus que ${top.label} (${c.max} au maximum sur le week-end). Au plus tôt si ${c.leader} marque le maximum à chaque manche et ${top.label} aucun point.` : `${c.leader} en tête.`, pw, [30, 26, 22].map((v) => Math.round(v * u)), 5, BODY, 600);
    const h = 150 * u + (fit ? fit.lines.length * fit.size * 1.35 + 10 * u : 30 * u + rowH * (c.needs.length + 1) + 50 * u);
    return { title, c, fit, h };
  });
  const area = f.bottom - f.top + 10;
  const total = list.reduce((a, b) => a + b.h, 0) + gap * (list.length - 1);
  let y0 = f.top - 10 + Math.max(0, (area - total) / 2);
  list.forEach(({ title, c, fit, h }, i) => {
    const x = f.pad;
    const bh = h;
    panel(ctx, x, y0, bw, bh);
    const px = x + 30 * u;
    let y = y0 + 52 * u;
    txt(ctx, title, px, y, { size: Math.round(27 * u), weight: 700, family: TITLE, color: C.red, spacing: 3 });
    y += 52 * u;
    const head = c.possibleNext ? `TITRE POSSIBLE DÈS ${c.next.toUpperCase()}` : `TITRE AU PLUS TÔT : ${(c.earliest || 'dernière manche').toUpperCase()}`;
    txt(ctx, head, px, y, { size: Math.round(40 * u), weight: 800, family: TITLE, color: C.gold, max: pw });
    y += 46 * u;
    if (fit) {
      fit.lines.forEach((l, k) => txt(ctx, l, px, y + k * fit.size * 1.35, { size: fit.size, weight: 600, color: C.text }));
    } else {
      txt(ctx, `${c.needs.length > 1 ? 'Conditions pour' : 'Condition pour'} ${c.leader}${c.needs.length > 1 ? ', toutes à la fois' : ''}${c.sprint ? ' (sprint et course cumulés)' : ''}`, px, y, { size: Math.round(27 * u), weight: 600, color: C.muted, max: pw });
      y += 20 * u;
      const places = c.needs.some((n) => n.win);
      const cols = places ? [0, 0.34, 0.62, 0.84] : [0, 0.5];
      ['RIVAL', 'SUR LE WEEK-END', ...(places ? ['EN GAGNANT', 'EN FINISSANT 2E'] : [])].forEach((t, k) => txt(ctx, t, px + pw * cols[k], y + rowH * 0.75, { size: Math.round(24 * u), weight: 700, family: TITLE, color: C.muted, spacing: 2, max: pw * ((cols[k + 1] || 1) - cols[k] - 0.01) }));
      c.needs.forEach((n, k) => {
        const ry = y + rowH * (k + 1.75);
        ctx.fillStyle = vivid(n.color || C.muted); ctx.fillRect(px, ry - rowH * 0.42, 6, rowH * 0.5);
        txt(ctx, n.label.toUpperCase(), px + 18 * u, ry, { size: Math.round(30 * u), weight: 800, family: TITLE, max: pw * (cols[1] - 0.03) - 18 * u });
        txt(ctx, gapTxt(n.margin), px + pw * cols[1], ry, { size: Math.round(28 * u), weight: 800, family: TITLE, max: pw * ((cols[2] || 1) - cols[1] - 0.02) });
        if (places) {
          txt(ctx, n.win.toUpperCase(), px + pw * cols[2], ry, { size: Math.round(27 * u), weight: 700, family: TITLE, color: C.muted, max: pw * 0.2 });
          txt(ctx, n.second.toUpperCase(), px + pw * cols[3], ry, { size: Math.round(27 * u), weight: 700, family: TITLE, color: C.muted, max: pw * 0.16 });
        }
      });
      txt(ctx, 'À égalité de points, le titre va au plus grand nombre de victoires.', px, y0 + bh - 26 * u, { size: Math.round(24 * u), weight: 600, color: C.muted, max: pw });
    }
    y0 += h + gap;
  });
}

// ---------- Positions tour par tour ----------
export function positions(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, 'Tour par tour');
  const n = d.drivers.length;
  const left = f.pad + 70;
  const right = W - f.pad - 150;
  const top = f.top + 10;
  const bottom = f.bottom - 30;
  const xOf = (lap) => left + (right - left) * lap / Math.max(1, d.total);
  const yOf = (p) => top + (bottom - top) * (p - 1) / Math.max(1, n - 1);
  ctx.save();
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  for (let p = 1; p <= n; p++) { ctx.beginPath(); ctx.moveTo(left, yOf(p)); ctx.lineTo(right, yOf(p)); ctx.stroke(); }
  ctx.restore();
  for (let p = 1; p <= n; p++) if (p === 1 || p % 5 === 0) txt(ctx, `P${p}`, left - 16, yOf(p) + 8, { size: 26, weight: 700, family: MONO, color: C.muted, align: 'right' });
  const step = d.total > 40 ? 10 : 5;
  for (let l = step; l <= d.total - step / 2; l += step) txt(ctx, String(l), xOf(l), bottom + 30, { size: 24, weight: 600, family: MONO, color: C.muted, align: 'center' });
  txt(ctx, 'TOURS', right, bottom + 30, { size: 24, weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
  // Pilotes classés dans les 10 premiers en couleur, les autres en gris
  const order = [...d.drivers].sort((a, b) => (b.finish || 99) - (a.finish || 99));
  for (const x of order) {
    const hi = x.classified && x.finish <= 10;
    ctx.save();
    ctx.strokeStyle = hi ? vivid(x.color) : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = hi ? 5 : 2.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    const pts = [[0, x.grid || n], ...x.pos.map((p, i) => [i + 1, p])];
    for (const [lap, p] of pts) {
      if (!p) break;
      if (!started) { ctx.moveTo(xOf(lap), yOf(p)); started = true; } else ctx.lineTo(xOf(lap), yOf(p));
    }
    ctx.stroke();
    ctx.restore();
  }
  // Étiquettes : à l'arrivée (place finale) ou au tour de l'abandon, sans chevauchement
  const placed = [];
  for (const x of [...d.drivers].sort((a, b) => (a.finish || 99) - (b.finish || 99))) {
    const p = x.classified && x.finish ? x.finish : x.pos[x.laps - 1];
    if (!p) continue;
    const hi = x.classified && x.finish <= 10;
    const lx = (x.classified ? right : xOf(x.laps)) + 14;
    let ly = yOf(p) + 8;
    while (placed.some(([px, py]) => Math.abs(px - lx) < 80 && Math.abs(py - ly) < 20)) ly += 20;
    placed.push([lx, ly]);
    txt(ctx, x.classified ? x.code : `${x.code} AB.`, lx, ly, { size: hi ? 24 : 18, weight: 800, family: TITLE, color: hi ? C.text : C.muted });
  }
}

// ---------- Récap de la semaine ----------
export function recapCover(ctx, W, H, d, o) {
  background(ctx, W, H, C.red);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  kicker(ctx, pad, top, u, 'ACTU F1', `DU ${d.date}`.toUpperCase());
  const colW = W - pad * 2;
  let y = H * (H / W > 1.5 ? 0.18 : 0.17);
  const big = txt(ctx, 'LA SEMAINE', pad, y + 140 * u, { size: Math.round(170 * u), weight: 800, family: TITLE, italic: true, max: colW });
  txt(ctx, 'EN F1', pad, y + 140 * u + big * 0.95, { size: big, weight: 800, family: TITLE, italic: true, color: C.red });
  y += 140 * u + big * 0.95 + 70 * u;
  // Sommaire : les infos de la semaine
  const lx = pad;
  const lw = W - pad * 2;
  let ly = y;
  const end = H - Math.round(Math.min(W, H) * 0.12);
  // Infos gardées dans le carrousel (images écartées : retirées du sommaire)
  const kept = o.slides ? o.slides.filter((s) => /^recap-\d+$/.test(s)).map((s) => d.items[Number(s.slice(6)) - 1]).filter(Boolean) : d.items;
  const each = Math.min((end - ly) / Math.max(1, kept.length), 230 * u);
  kept.forEach((it, i) => {
    txt(ctx, String(i + 1).padStart(2, '0'), lx, ly + 46 * u, { size: Math.round(48 * u), weight: 800, family: TITLE, color: C.red });
    txt(ctx, it.badge.label, lx + 90 * u, ly + 22 * u, { size: Math.round(27 * u), weight: 700, family: TITLE, color: it.badge.color, spacing: 3 });
    const t = fitLines(ctx, it.title.toUpperCase(), lw - 90 * u, [44, 38, 32, 28].map((v) => Math.round(v * u)), each > 170 * u ? 3 : each > 120 * u ? 2 : 1, TITLE, 800);
    t.lines.forEach((l, k) => txt(ctx, l, lx + 90 * u, ly + 64 * u + k * t.size * 1.02, { size: t.size, weight: 800, family: TITLE, italic: true }));
    ly += each;
  });
  const fy = footY(W, H);
  footer(ctx, W, H, o);
  txt(ctx, `${kept.length} INFO${kept.length > 1 ? 'S' : ''} À RETENIR`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.025), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}
export function recapItem(ctx, W, H, d, o, i, fmt) {
  const it = d.items[i - 1];
  if (!it) return;
  newsSlide(ctx, W, H, { ...it, breaking: false }, { ...o, slides: [] }, fmt);
  const u = Math.min(W, H) / 1080;
  const kept = o.slides ? o.slides.filter((s) => /^recap-\d+$/.test(s)) : d.items.map((_, k) => `recap-${k + 1}`);
  txt(ctx, `${Math.max(1, kept.indexOf(`recap-${i}`) + 1)} / ${kept.length}`, W - Math.round(W * 0.055), topY(W, H) + 46 * u, { size: Math.round(34 * u), weight: 700, family: MONO, color: C.muted, align: 'right' });
}

// ---------- Vidéo animée de la course (images successives) ----------
// Feux de départ, puis le graphique des positions qui se dessine tour après tour : une ligne par
// pilote (couleur de l'écurie), tout le classement en direct au bout des lignes (écarts, PIT),
// arrêts au stand et abandons marqués, périodes de safety car, VSC et drapeau rouge en bandes de
// couleur, dépassements mis en lumière, bandeau des moments forts ; pour finir le podium et les
// chiffres de la course.
const FLAG = {
  green: { color: '#3ddc84', label: 'DRAPEAU VERT' }, yellow: { color: '#ffd60a', label: 'DRAPEAU JAUNE' },
  sc: { color: '#ffc400', label: 'SAFETY CAR' }, vsc: { color: '#ff9f1c', label: 'VIRTUAL SAFETY CAR' },
  neutral: { color: '#ffc400', label: 'COURSE NEUTRALISÉE' }, red: { color: '#ff2d2d', label: 'DRAPEAU ROUGE' },
};
const BANNER = {
  sc: ['SAFETY CAR', () => 'Voiture de sécurité en piste'], vsc: ['VIRTUAL SAFETY CAR', () => 'Course neutralisée'],
  neutral: ['COURSE NEUTRALISÉE', () => 'Safety car ou VSC'], red: ['DRAPEAU ROUGE', () => 'Course interrompue'],
  restart: ['DRAPEAU VERT', () => 'La course reprend'], lead: ['NOUVEAU LEADER', (e, n) => n],
  out: ['ABANDON', (e, n) => n], penalty: ['PÉNALITÉ', (e, n) => `${n} · ${e.text}`], fastest: ['MEILLEUR TOUR', (e, n) => `${n} · ${lapStr(e.time)}`],
};
const BANNER_COLOR = { restart: '#3ddc84', lead: '#e8c35a', out: '#ff4d4d', penalty: '#ff8a3d', fastest: '#b36bff' };
const NEUTRAL = new Set(['sc', 'vsc', 'red', 'neutral']);
const BIG = new Set(['restart', 'lead', 'out', 'penalty']);
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Durées : feux de départ, course (tours des neutralisations et des moments forts plus lents), arrivée.
// Bandeaux programmés à la suite les uns des autres, à partir du tour de l'événement.
const timings = new WeakMap();
export function raceVideoTiming(d) {
  if (timings.has(d)) return timings.get(d);
  const ev = d.story?.events || [];
  const w = [];
  for (let l = 1; l <= d.total; l++) {
    const here = ev.filter((e) => e.lap === l);
    w.push(1 + (here.some((e) => NEUTRAL.has(e.kind)) ? 2.4 : here.some((e) => BIG.has(e.kind)) ? 1.4 : here.length ? 0.6 : 0));
  }
  const race = Math.max(30, Math.min(48, d.total * 0.8));
  const per = race / Math.max(1, w.reduce((a, b) => a + b, 0));
  const intro = 3.6;
  const starts = [intro];
  for (const x of w) starts.push(starts.at(-1) + x * per);
  const banners = [];
  let free = 0;
  for (const e of ev) {
    if (!BANNER[e.kind] || e.lap > d.total) continue;
    const t0 = Math.max(starts[e.lap - 1], free);
    if (t0 > starts[e.lap] + 2) continue;   // trop de bandeaux d'affilée : celui-ci est passé
    banners.push({ ...e, t0, t1: t0 + 1.7 });
    free = t0 + 1.8;
  }
  const out = { intro, per, w, starts, banners, race, outro: 6, duration: starts.at(-1) + 6 };
  timings.set(d, out);
  return out;
}
// Tours bouclés par le leader (0..total) et avancée dans le tour suivant
function lapAt(tm, total, time) {
  if (time <= tm.intro) return { lap: 0, f: 0 };
  for (let l = 0; l < total; l++) if (time < tm.starts[l + 1]) return { lap: l, f: (time - tm.starts[l]) / (tm.starts[l + 1] - tm.starts[l]) };
  return { lap: total, f: 0 };
}

// Temps cumulés et écarts au leader à la fin de chaque tour
const gapsMemo = new WeakMap();
function gapsOf(d) {
  if (gapsMemo.has(d)) return gapsMemo.get(d);
  const cum = d.drivers.map((x) => { let s = 0; return x.times.map((t) => (t ? (s += t) : null)); });
  const lead = [0];
  for (let l = 1; l <= d.total; l++) lead.push(Math.min(...cum.map((c) => c[l - 1] ?? Infinity)));
  const ref = [...d.drivers.flatMap((x) => x.times.slice(1).filter((t) => t > 0))].sort((a, b) => a - b);
  const g = { cum, lead, lapRef: ref[ref.length >> 1] || 90 };
  gapsMemo.set(d, g);
  return g;
}

// Point d'une courbe entre deux tours (tangentes horizontales : les dépassements en douceur)
const bez = (x0, y0, x1, y1, t) => {
  const m = (x0 + x1) / 2;
  const k = 1 - t;
  return [k * k * k * x0 + 3 * k * k * t * m + 3 * k * t * t * m + t * t * t * x1, k * k * k * y0 + 3 * k * k * t * y0 + 3 * k * t * t * y1 + t * t * t * y1];
};

export function raceFrame(ctx, W, H, d, o, time) {
  const tm = raceVideoTiming(d);
  const story = d.story || { status: [], events: [] };
  // Paysage (YouTube…) : même mise en page, un peu plus petite, sans les marges des applis verticales
  const land = W > H;
  const u = land ? H / 1350 : W / 1080;
  // Marges des réseaux : TikTok rogne ~100 px de chaque côté (9:16 sur un iPhone), ses onglets couvrent le haut
  // et la légende du post le bas
  const pad = Math.round(Math.min(W, H) * 0.1);
  const foot = (land ? 90 : 310) * u;
  const { lap, f } = lapAt(tm, d.total, time);
  const done = time >= tm.starts.at(-1);
  const intro = time < tm.intro;
  const st = done || intro ? 'green' : story.status[Math.min(d.total, lap + 1) - 1] || 'green';
  const flag = FLAG[st] || FLAG.green;
  background(ctx, W, H, st === 'green' ? C.red : flag.color);
  if (st !== 'green') {
    const rg = ctx.createRadialGradient(W / 2, H * 0.1, 0, W / 2, H * 0.1, W * 1.1);
    rg.addColorStop(0, `${flag.color}30`); rg.addColorStop(1, `${flag.color}00`);
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }
  // En-tête : Grand Prix, tour, état de la piste
  const top = Math.round(land ? 40 * u : H * 0.035 + 90 * u);
  // Vidéo dessinée dans le cadre réduit des applis (u < 1) : textes d'un cran plus grands
  const tu = Math.max(u, 0.9);
  ctx.fillStyle = C.red; rr(ctx, pad, top, 10 * u, 76 * u, 4 * u); ctx.fill();
  txt(ctx, d.gp.toUpperCase(), pad + 26 * u, top + 36 * u, { size: Math.round(46 * tu), weight: 800, family: TITLE, max: W - 2 * pad - 380 * u, italic: true });   // pas sous le tour
  txt(ctx, `SAISON ${d.year} · ${d.total} TOURS`, pad + 26 * u, top + 78 * u, { size: Math.round(31 * tu), weight: 700, family: TITLE, color: '#c3cad8', spacing: 2, max: W - 2 * pad - 380 * u });
  const label = intro ? 'DÉPART' : done ? 'ARRIVÉE' : `TOUR ${Math.min(d.total, lap + 1)}/${d.total}`;
  txt(ctx, label, W - pad, top + 46 * u, { size: Math.round(56 * tu), weight: 800, family: TITLE, color: done ? C.gold : C.text, align: 'right', italic: true });
  if (!intro && !done) pill(ctx, flag.label, W - pad, top + 62 * u, 42 * tu, { bg: st === 'green' ? 'rgba(61,220,132,0.18)' : flag.color, color: st === 'green' ? C.green : '#111', align: 'right', dot: true });

  // ---- Graphique des positions : une ligne par pilote, qui se dessine tour après tour ----
  const n = d.drivers.length;
  const prog = done ? d.total : intro ? 0 : Math.min(d.total, lap + f);
  const x0 = pad + 52 * u;
  const x1 = W - pad - 220 * u;
  const y0 = top + 150 * u;
  const y1 = H - foot - 330 * u;
  const rowH = (y1 - y0) / Math.max(1, n - 1);
  const X = (l) => x0 + ((x1 - x0) * l) / d.total;
  const Y = (p) => y0 + (p - 1) * rowH;
  // Repères : positions, tours, périodes neutralisées (bandes de couleur, nom au-dessus)
  for (let p = 1; p <= n; p++) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x0, Y(p) - 0.5, x1 - x0, 1);
    txt(ctx, String(p), x0 - 16 * u, Y(p) + 8 * u, { size: Math.round(Math.min(25 * tu, rowH * 0.8)), weight: 800, family: TITLE, color: p <= 3 ? MEDAL[p - 1] : C.muted, align: 'right', italic: true });
  }
  for (let l = 10; l <= d.total - 6; l += 10) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(X(l), y0 - 14 * u, 1, y1 - y0 + 28 * u);
    if (X(l) < x1 - 110 * tu) txt(ctx, String(l), X(l), y1 + 46 * u, { size: Math.round(25 * tu), weight: 700, family: TITLE, color: C.muted, align: 'center' });   // pas sous « TOURS »
  }
  txt(ctx, 'TOURS', x1, y1 + 46 * u, { size: Math.round(25 * tu), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
  for (let i = 0; i < d.total; i++) {
    const s = story.status[i];
    if (!s || s === 'green' || i >= prog) continue;
    const a = X(i);
    const b = X(Math.min(i + 1, prog));
    ctx.fillStyle = `${FLAG[s].color}${s === 'yellow' ? '1c' : '33'}`;
    ctx.fillRect(a, y0 - 24 * u, b - a + 0.5, y1 - y0 + 48 * u);
    if (story.status[i - 1] !== s && s !== 'yellow') txt(ctx, { sc: 'SC', vsc: 'VSC', red: 'ROUGE', neutral: 'NEUTRAL.' }[s], a + 4 * u, y0 - 32 * u, { size: Math.round(26 * tu), weight: 800, family: TITLE, color: FLAG[s].color, spacing: 1 });
  }
  // Lignes des pilotes (la tête de chaque ligne avance avec la course)
  const posAt = (x, l) => (l === 0 ? (x.grid || n) : x.pos[l - 1] || (x.classified && l > x.laps ? x.finish : null));
  const g = gapsOf(d);
  const gapAt = (i, l) => {
    const x = d.drivers[i];
    if (l === 0) return null;
    const c = g.cum[i][Math.min(l, x.laps) - 1];
    return c == null ? null : c - g.lead[Math.min(l, x.laps)];
  };
  const L = Math.floor(prog);
  const fe = done ? 0 : ease(clamp01((prog - L) * 1.4));
  const heads = [];
  const order = d.drivers.map((x, i) => i).sort((a, b) => (posAt(d.drivers[b], L) || 99) - (posAt(d.drivers[a], L) || 99));
  for (const i of order) {
    const x = d.drivers[i];
    const col = vivid(x.color);
    const last = Math.min(L, x.classified ? d.total : x.laps);
    ctx.beginPath();
    let px = X(0);
    let py = Y(posAt(x, 0));
    ctx.moveTo(px, py);
    for (let l = 1; l <= last; l++) {
      const p = posAt(x, l);
      if (!p) break;
      const nx = X(l);
      const ny = Y(p);
      ctx.bezierCurveTo((px + nx) / 2, py, (px + nx) / 2, ny, nx, ny);
      px = nx; py = ny;
    }
    // Tour en cours : morceau de courbe jusqu'à la tête
    const alive = x.classified || L < x.laps;
    const pNext = alive && L < d.total ? posAt(x, L + 1) : null;
    let hx = px;
    let hy = py;
    if (pNext && !done && prog > L) {
      const steps = 8;
      for (let k = 1; k <= steps; k++) { const [bx, byy] = bez(px, py, X(L + 1), Y(pNext), (k / steps) * (prog - L)); ctx.lineTo(bx, byy); }
      hx = X(prog);
      hy = py + (Y(pNext) - py) * fe;
    }
    const lead = alive && Math.round((hy - y0) / rowH) === 0;
    ctx.strokeStyle = col; ctx.globalAlpha = alive ? 0.92 : 0.45; ctx.lineWidth = (lead ? 6 : 4) * u; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Arrêts au stand : points blancs sur la ligne
    for (const pl of x.pits || []) {
      if (pl > prog || !posAt(x, pl)) continue;
      ctx.beginPath(); ctx.arc(X(pl), Y(posAt(x, pl)), 6 * u, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 2.5 * u; ctx.strokeStyle = col; ctx.stroke();
    }
    if (!alive) {
      // Abandon : croix au bout de la ligne
      const ex = X(x.laps);
      const ey = Y(posAt(x, x.laps) || n);
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 4 * u;
      ctx.beginPath(); ctx.moveTo(ex - 9 * u, ey - 9 * u); ctx.lineTo(ex + 9 * u, ey + 9 * u); ctx.moveTo(ex + 9 * u, ey - 9 * u); ctx.lineTo(ex - 9 * u, ey + 9 * u); ctx.stroke();
      continue;
    }
    heads.push({ i, x, col, hx, hy, gain: pNext && posAt(x, L) ? posAt(x, L) - pNext : 0, pit: !done && (x.pits || []).includes(L + 1) });
  }
  // Têtes des lignes et étiquettes (code, écart ou PIT) : tout le classement en direct
  heads.sort((a, b) => b.hy - a.hy);
  const fs = Math.round(Math.min(37 * tu, rowH * 0.74));
  // Étiquettes jamais l'une sur l'autre (pilotes qui se croisent, même place un instant) : écartées d'une
  // ligne de texte au moins, en restant au plus près de leur pilote
  const gap = fs * 1.12;
  const byY = [...heads].sort((a, b) => a.hy - b.hy);
  byY.forEach((h, k) => { h.ly = k ? Math.max(h.hy, byY[k - 1].ly + gap) : h.hy; });
  for (let k = byY.length - 1; k >= 0; k--) {
    const max = k === byY.length - 1 ? Math.max(byY[k].hy, y1 + rowH * 0.3) : byY[k + 1].ly - gap;
    byY[k].ly = Math.min(byY[k].ly, max);
  }
  for (const h of heads) {
    const pos = Math.round((h.hy - y0) / rowH) + 1;
    if (h.gain > 0 && fe > 0 && fe < 1) {
      ctx.beginPath(); ctx.arc(h.hx, h.hy, 22 * u, 0, Math.PI * 2); ctx.fillStyle = `rgba(61,220,132,${0.45 * Math.sin(fe * Math.PI)})`; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(h.hx, h.hy, (pos === 1 ? 12 : 9) * u, 0, Math.PI * 2); ctx.fillStyle = h.col; ctx.fill();
    ctx.lineWidth = 3 * u; ctx.strokeStyle = pos === 1 ? C.gold : '#0b0d12'; ctx.stroke();
    const lx = h.hx + 18 * u;
    const ly = h.ly;
    if (Math.abs(ly - h.hy) > 2) { ctx.beginPath(); ctx.moveTo(h.hx + 10 * u, h.hy); ctx.lineTo(lx, ly); ctx.strokeStyle = h.col; ctx.lineWidth = 2 * u; ctx.stroke(); }
    rr(ctx, lx, ly - fs * 0.5, 4 * u, fs, 2 * u); ctx.fillStyle = h.col; ctx.fill();
    txt(ctx, h.x.code, lx + 12 * u, ly + fs * 0.36, { size: fs, weight: 800, family: TITLE, color: pos <= 3 ? MEDAL[pos - 1] : C.text, italic: true });
    const cw = ctx.measureText(h.x.code).width;   // écart toujours après le code, sans le toucher
    let right = '';
    if (h.pit) right = 'PIT';
    else if (pos === 1) right = done ? 'VAINQUEUR' : intro ? '' : 'LEADER';
    else if (!intro) {
      const lp = done ? d.total : L;
      if (h.x.classified && lp > h.x.laps) right = `+${lp - h.x.laps}T`;
      else { const gl = gapAt(h.i, lp); right = gl != null && gl >= 0 && gl < 600 ? `+${dec(gl, 1)}` : ''; }
    }
    if (right) txt(ctx, right, lx + 12 * u + Math.max(fs * 2.2, cw + fs * 0.45), ly + fs * 0.34, { size: Math.round(fs * 0.86), weight: 700, family: /^[+\d,]+$/.test(right) ? MONO : TITLE, color: right === 'PIT' ? '#ff8a3d' : right === 'VAINQUEUR' ? C.gold : '#c3cad8' });
  }

  // Feux de départ (présentation)
  if (intro) {
    const on = Math.min(5, Math.floor((time / (tm.intro - 0.6)) * 6));
    const out = time > tm.intro - 0.45;
    const lw = 5 * 92 * u;
    const lx = (W - lw) / 2;
    const ly = (y0 + y1) / 2 - 90 * u;
    rr(ctx, lx - 20 * u, ly - 20 * u, lw + 40 * u, 200 * u, 24 * u); ctx.fillStyle = 'rgba(8,9,12,0.94)'; ctx.fill();
    for (let k = 0; k < 5; k++) {
      ctx.beginPath(); ctx.arc(lx + 46 * u + k * 92 * u, ly + 50 * u, 32 * u, 0, Math.PI * 2);
      const lit = !out && k < on;
      ctx.fillStyle = lit ? '#ff1a1a' : '#2a0b0b';
      if (lit) { ctx.shadowColor = '#ff1a1a'; ctx.shadowBlur = 30 * u; }
      ctx.fill(); ctx.shadowBlur = 0;
    }
    txt(ctx, out ? "C'EST PARTI !" : 'GRILLE DE DÉPART', W / 2, ly + 150 * u, { size: Math.round(46 * tu), weight: 800, family: TITLE, align: 'center', color: out ? C.green : C.text, italic: true });
  }

  // ---- Bandeau du bas : moment fort en cours, sinon le leader ----
  const bandY = y1 + 90 * u;
  const bandH = H - foot - bandY;
  const bn = tm.banners.find((b) => time >= b.t0 && time < b.t1);
  if (bn && !done) {
    const k = clamp01((time - bn.t0) / 0.25);
    const fade = clamp01((bn.t1 - time) / 0.3);
    const x = d.drivers.find((y) => y.code === bn.code);
    const name = x ? `${x.first} ${x.last}`.trim() : bn.code || '';
    const [title, sub] = BANNER[bn.kind];
    const col = BANNER_COLOR[bn.kind] || FLAG[bn.kind]?.color || C.red;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(W / 2, bandY + bandH / 2);
    ctx.scale(0.6 + 0.4 * ease(k), 1);
    ctx.transform(1, 0, -0.12, 1, 0, 0);
    rr(ctx, -W / 2 + pad, -bandH / 2, W - 2 * pad, bandH, 14 * u); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-W / 2 + pad, bandH / 2 - 12 * u, W - 2 * pad, 12 * u);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = fade * k;
    const dark = ['sc', 'vsc', 'neutral', 'restart', 'lead'].includes(bn.kind) ? '#0b0d12' : '#fff';
    txt(ctx, title, W / 2, bandY + bandH / 2 + 2 * u, { size: Math.round(66 * tu), weight: 800, family: TITLE, color: dark, align: 'center', max: W - 3 * pad, italic: true });
    txt(ctx, sub(bn, name).toUpperCase(), W / 2, bandY + bandH / 2 + 56 * u, { size: Math.round(34 * tu), weight: 700, family: TITLE, color: dark, align: 'center', spacing: 1.5, max: W - 3 * pad });
    ctx.restore();
  } else if (!intro && !done) {
    const lead = d.drivers.find((x) => posAt(x, Math.max(1, L)) === 1);
    if (lead) {
      card(ctx, pad, bandY + 20 * u, W - 2 * pad, bandH - 40 * u, 24 * u, { tint: lead.color });
      txt(ctx, 'EN TÊTE', pad + 30 * u, bandY + bandH / 2 - 22 * u, { size: Math.round(27 * tu), weight: 700, family: TITLE, color: C.muted, spacing: 3 });
      txt(ctx, `${lead.first} ${lead.last}`.toUpperCase(), pad + 30 * u, bandY + bandH / 2 + 40 * u, { size: Math.round(48 * tu), weight: 800, family: TITLE, max: W * 0.5, italic: true });
      const c = story.events.filter((e) => e.lap <= L + 1);
      const facts = [['sc', 'SC', 'SC'], ['vsc', 'VSC', 'VSC'], ['out', 'ABANDON', 'ABANDONS'], ['lead', 'CHANGEMENT DE LEADER', 'CHANGEMENTS DE LEADER']].map(([kk, one, many]) => { const v = c.filter((e) => e.kind === kk).length; return v ? `${v} ${v > 1 ? many : one}` : ''; }).filter(Boolean);
      txt(ctx, facts.join('  ·  ') || 'COURSE SANS INCIDENT', W - pad - 30 * u, bandY + bandH / 2 - 22 * u, { size: Math.round(27 * tu), weight: 700, family: TITLE, color: C.text, align: 'right', spacing: 1, max: W * 0.55 });
    }
  }

  // ---- Arrivée : podium et chiffres de la course dans le bandeau (le classement final reste visible) ----
  if (done) {
    const k = ease(clamp01((time - tm.starts.at(-1)) / 0.8));
    const pod = [...d.drivers].filter((x) => x.finish).sort((a, b) => a.finish - b.finish).slice(0, 3);
    const w0 = pod[0];
    ctx.save();
    ctx.globalAlpha = k;
    rr(ctx, pad, bandY, W - 2 * pad, bandH, 18 * u); ctx.fillStyle = 'rgba(8,9,12,0.92)'; ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3 * u; ctx.stroke();
    if (w0) {
      rr(ctx, pad + 18 * u, bandY + 26 * u, 6 * u, bandH - 52 * u, 3 * u); ctx.fillStyle = vivid(w0.color); ctx.fill();   // trait de l'écurie, dans le cadre doré
      txt(ctx, 'VAINQUEUR', pad + 40 * u, bandY + 54 * u, { size: Math.round(29 * tu), weight: 800, family: TITLE, color: C.gold, spacing: 4 });
      txt(ctx, `${w0.first} ${w0.last}`.toUpperCase(), pad + 40 * u, bandY + 122 * u, { size: Math.round(66 * tu), weight: 800, family: TITLE, italic: true, max: W * 0.55 });
      txt(ctx, w0.team.toUpperCase(), pad + 40 * u, bandY + 164 * u, { size: Math.round(28 * tu), weight: 700, family: TITLE, color: C.muted, spacing: 2, max: W * 0.4 });
    }
    pod.slice(1).forEach((x, j) => {
      const yy = bandY + 70 * u + j * 64 * u;
      txt(ctx, `P${j + 2}`, W * 0.66, yy, { size: Math.round(36 * tu), weight: 800, family: TITLE, color: MEDAL[j + 1], italic: true });
      txt(ctx, x.last.toUpperCase(), W * 0.66 + 62 * tu, yy, { size: Math.round(40 * tu), weight: 800, family: TITLE, max: W * 0.25, italic: true });
    });
    const c = story.counts || {};
    const facts = [
      c.sc ? `${c.sc} SAFETY CAR${c.sc > 1 ? 'S' : ''}` : '', c.vsc ? `${c.vsc} VSC` : '', c.neutral ? `${c.neutral} NEUTRALISATION${c.neutral > 1 ? 'S' : ''}` : '',
      c.red ? `${c.red} DRAPEAU${c.red > 1 ? 'X' : ''} ROUGE${c.red > 1 ? 'S' : ''}` : '', d.leadChanges ? `${d.leadChanges} CHANGEMENT${d.leadChanges > 1 ? 'S' : ''} DE LEADER` : '',
    ].filter(Boolean);
    if (!facts.length) facts.push('AUCUNE NEUTRALISATION');
    const b = story.best ? d.drivers.find((x) => x.code === story.best.code) : null;
    const best = story.best ? `MEILLEUR TOUR ${(b?.last || story.best.code).toUpperCase()} ${lapStr(story.best.time)}` : '';
    // Meilleur tour sous le podium, chiffres de la course sur toute la largeur en bas : jamais l'un sur l'autre
    if (best) txt(ctx, best, W - pad - 30 * u, bandY + 172 * u, { size: Math.round(25 * tu), weight: 700, family: TITLE, color: '#b36bff', align: 'right', spacing: 1, max: W * 0.4 });
    txt(ctx, facts.join(' · '), pad + 40 * u, bandY + bandH - 22 * u, { size: Math.round(27 * tu), weight: 700, family: TITLE, color: C.text, spacing: 1, max: W - 2 * pad - 70 * u });
    ctx.restore();
  }
  const fy = H - Math.round(H * 0.025);
  ctx.fillStyle = C.red; rr(ctx, pad, fy - 27 * tu, 8 * u, 30 * tu, 3 * u); ctx.fill();
  txt(ctx, o.signature || '@BenjyPaddock', pad + 20 * u, fy, { size: Math.round(34 * tu), weight: 700, family: TITLE, spacing: 1 });
  if (done) txt(ctx, 'ABONNEZ-VOUS POUR LA SUITE', W - pad, fy, { size: Math.round(29 * tu), weight: 800, family: TITLE, color: C.red, align: 'right', spacing: 2, max: W * 0.5 });
  else if (story.estimated && story.events.some((e) => e.kind === 'neutral')) txt(ctx, "Neutralisations estimées d'après les temps au tour", W - pad, fy, { size: Math.round(24 * tu), weight: 600, color: C.muted, align: 'right', max: W * 0.5 });
}

// ---------- Race Week : visuel propre à chaque Grand Prix ----------
// Couleurs du drapeau du pays, drapeau en fond, nom de la ville en filigrane, tracé lumineux du
// circuit ; mise en page qui alterne selon la manche (tracé à droite, en bas ou à gauche).
const rgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0xe10600;
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
};
function drawTrack(ctx, shape, box, color, u) {
  const s = Math.min(box.w / shape.w, box.h / shape.h);
  const ox = box.x + (box.w - shape.w * s) / 2;
  const oy = box.y + (box.h - shape.h * s) / 2;
  const P = ([x, y]) => [ox + x * s, oy + y * s];
  const path = () => { ctx.beginPath(); shape.pts.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Halo, piste, ligne centrale
  ctx.shadowColor = color; ctx.shadowBlur = 60 * u;
  ctx.strokeStyle = rgba(color, 0.55); ctx.lineWidth = 34 * u; path(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color; ctx.lineWidth = 16 * u; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 4 * u; path(); ctx.stroke();
  // Ligne de départ : damier
  const [sx, sy] = P(shape.pts[0]);
  const q = 9 * u;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(sx - 2 * q + i * q, sy - q + j * q, q, q); }
  ctx.restore();
}
export function raceweek(ctx, W, H, d, o) {
  const u = Math.min(W, H) / 1080;
  const [c1, c2] = d.palette;
  const v = d.variant || 0;
  // Fond : dégradé sombre teinté aux couleurs du pays
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#07080c'); g.addColorStop(1, '#10131b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, col, a) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, rgba(col, a)); rg.addColorStop(1, rgba(col, 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); };
  glow(v === 2 ? W * 0.15 : W * 0.85, H * 0.18, Math.max(W, H) * 0.75, c1, 0.42);
  glow(v === 2 ? W * 0.9 : W * 0.1, H * 0.95, Math.max(W, H) * 0.6, c2, 0.16);
  // Drapeau en grand, incliné et fondu
  if (o.flag) {
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.translate(W * (v === 2 ? 0.25 : 0.72), H * 0.32);
    ctx.rotate(-0.21);
    const fw = Math.max(W, H) * 0.95;
    ctx.drawImage(o.flag, -fw / 2, -fw * o.flag.height / o.flag.width / 2, fw, fw * o.flag.height / o.flag.width);
    ctx.restore();
  }
  // Nom de la ville en filigrane
  if (d.city) {
    ctx.save();
    ctx.translate(W / 2, H * 0.56);
    ctx.rotate(-0.14);
    const word = d.city.toUpperCase();
    let fs = 400 * u;
    ctx.font = `800 ${fs}px ${TITLE}`;
    const wmax = H * 1.15;
    if (ctx.measureText(word).width > wmax) { fs *= wmax / ctx.measureText(word).width; ctx.font = `800 ${fs}px ${TITLE}`; }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3 * u; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText(word, 0, 0);
    ctx.restore();
  }
  // Bandes de vitesse aux couleurs du drapeau
  ctx.save();
  ctx.translate(v === 2 ? 0 : W, 0);
  if (v !== 2) ctx.scale(-1, 1);
  [[c1, 0], [c2, 1], ['#ffffff', 2]].forEach(([col, i]) => {
    ctx.fillStyle = rgba(col, i === 2 ? 0.5 : 0.85);
    ctx.beginPath(); ctx.moveTo(0, H * (0.06 + i * 0.035)); ctx.lineTo(W * 0.22 - i * 40 * u, H * (0.06 + i * 0.035)); ctx.lineTo(W * 0.2 - i * 40 * u, H * (0.06 + i * 0.035) + 12 * u); ctx.lineTo(0, H * (0.06 + i * 0.035) + 12 * u); ctx.fill();
  });
  ctx.restore();
  const pad = Math.round(W * 0.06);
  const fy = footY(W, H);
  const story = H / W > 1.5;
  // Bloc de texte : hauteur calculée d'abord, le tracé prend la place qui reste
  const right = v === 2;
  const tx = right ? W - pad : pad;
  const align = right ? 'right' : 'left';
  const colW = W - pad * 2;
  const facts = [[d.laps, 'TOURS'], [d.km != null ? String(d.km).replace('.', ',') : null, 'KM'], [d.corners, 'VIRAGES']].filter(([x]) => x != null);
  let big = Math.round((story ? 210 : 170) * u);
  const titleSizes = [64, 56, 50, 44].map((x) => Math.round(x * u));
  const measure = (bg, withPrev) => {
    const t = fitLines(ctx, d.gp.toUpperCase(), colW, titleSizes, 2, TITLE, 800);
    const h = 30 * u + bg * 1.76 + 46 * u + t.lines.length * t.size * 1.02 + 20 * u + 60 * u + (facts.length ? 106 * u : 0) + (d.race ? 80 * u : 0) + (withPrev && d.prev ? 36 * u : 0);
    return { t, h };
  };
  const top0 = H * 0.075;
  const bottom0 = fy - 56 * u;
  const minTrack = (story ? 0.3 : 0.24) * H;
  let withPrev = true;
  let m = measure(big, withPrev);
  while (m.h > bottom0 - top0 - minTrack && big > 110 * u) { big -= 10 * u; m = measure(big, withPrev); }
  if (m.h > bottom0 - top0 - minTrack) { withPrev = false; m = measure(big, false); }
  // Position du texte : en haut pour la variante 1, en bas sinon
  const textTop = v === 1 ? top0 : bottom0 - m.h;
  // Tracé du circuit dans l'espace libre
  if (d.shape) {
    const gap = 30 * u;
    const box = v === 1 ? { x: pad, y: textTop + m.h + gap, w: W - pad * 2, h: bottom0 - (textTop + m.h + gap) }
      : { x: v === 2 ? pad : W * 0.3, y: Math.max(top0 + 40 * u, H * 0.15), w: W * 0.64, h: textTop - gap - Math.max(top0 + 40 * u, H * 0.15) };
    if (box.h > 80 * u) drawTrack(ctx, d.shape, box, c1, u);
  }
  let y = textTop;
  txt(ctx, `MANCHE ${d.round}${d.rounds ? ` / ${d.rounds}` : ''}`, tx, y + 26 * u, { size: Math.round(30 * u), weight: 800, family: TITLE, color: /^#F5F5F5$/i.test(c1) ? c2 : c1, align, spacing: 6 * u });
  y += 30 * u;
  txt(ctx, 'RACE', tx, y + big * 0.86, { size: big, weight: 800, family: TITLE, italic: true, align, max: colW });
  y += big * 0.86;
  // WEEK : contour aux couleurs du pays
  ctx.save();
  ctx.font = `800 ${big}px ${TITLE}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.lineWidth = 5 * u; ctx.strokeStyle = c1; ctx.fillStyle = rgba(c1, 0.18);
  ctx.fillText('WEEK', tx, y + big * 0.9); ctx.strokeText('WEEK', tx, y + big * 0.9);
  ctx.restore();
  y += big * 0.9 + 46 * u;
  const t = m.t;
  t.lines.forEach((l, i) => txt(ctx, l, tx, y + t.size * 0.82 + i * t.size * 1.02, { size: t.size, weight: 800, family: TITLE, italic: true, align }));
  y += t.lines.length * t.size * 1.02 + 20 * u;
  txt(ctx, `${d.date}${d.city ? `  ·  ${d.city}` : ''}`.toUpperCase(), tx, y + 28 * u, { size: Math.round(28 * u), weight: 600, family: TITLE, color: C.muted, align, spacing: 2 * u, max: colW });
  y += 60 * u;
  // Chiffres du circuit
  if (facts.length) {
    const fw = Math.min(200 * u, colW / facts.length);
    facts.forEach(([val, lab], i) => {
      const fx = right ? tx - (facts.length - 1 - i) * fw : tx + i * fw;
      ctx.fillStyle = c1; ctx.fillRect(right ? fx - 6 * u : fx, y, 6 * u, 74 * u);
      const ix = right ? fx - 22 * u : fx + 22 * u;
      txt(ctx, String(val), ix, y + 44 * u, { size: Math.round(50 * u), weight: 800, family: TITLE, align });
      txt(ctx, lab, ix, y + 72 * u, { size: Math.round(25 * u), weight: 700, family: TITLE, color: C.muted, align, spacing: 3 * u });
    });
    y += 106 * u;
  }
  if (d.race) {
    const label = `COURSE ${d.race.day.toUpperCase()} ${d.race.time.replace(':', 'H')}`;
    ctx.font = `800 ${Math.round(30 * u)}px ${TITLE}`;
    const w = ctx.measureText(label).width + 40 * u + label.length * 2 * u;
    const bx = right ? tx - w : tx;
    rr(ctx, bx, y, w, 54 * u, 27 * u); ctx.fillStyle = C.red; ctx.fill();
    txt(ctx, label, bx + w / 2, y + 37 * u, { size: Math.round(30 * u), weight: 800, family: TITLE, color: '#fff', align: 'center', spacing: 2 * u });
    y += 80 * u;
  }
  if (withPrev && d.prev) txt(ctx, `VAINQUEUR ${d.prev.year} : ${d.prev.name.toUpperCase()}`, tx, y + 20 * u, { size: Math.round(27 * u), weight: 700, family: TITLE, color: C.muted, align, spacing: 2 * u, max: colW });
  // Pied
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.032), weight: 700, family: TITLE, spacing: 1 });
  txt(ctx, 'HEURE DE PARIS', W - pad, fy, { size: Math.round(Math.min(W, H) * 0.02), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}
