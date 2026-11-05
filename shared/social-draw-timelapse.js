// Vidéo « Course en accéléré » (mode créateur) : la course rejouée façon retransmission, une rangée par place.
// Chaque pilote est une petite F1 vue de dessus aux couleurs de son écurie (tracés simples : aileron arrière,
// pontons, cockpit, nez, aileron avant, roues), son trigramme derrière elle ; la voiture du leader en tête, les
// autres en arrière à proportion de leur écart (échelle en secondes qui suit le peloton, écarts trop grands tassés
// au bord). Départ : toutes les voitures sur la même ligne, dans l'ordre de la grille. Dépassements : la voiture
// glisse d'une rangée à l'autre ; arrêts au stand marqués PIT ; abandon : la voiture grise, recule à gauche et reste
// en bas du classement (« ABANDON ») jusqu'à l'arrivée. Feux, safety car en tête des voitures, bandeaux des
// moments forts (mêmes que la vidéo du graphique, raceVideoTiming), podium à l'arrivée.
import { C, TITLE, MONO, MEDAL, TYRE, rr, txt, fitLines, vivid, background, card, pill, v3 } from './social-draw.js';
import { realStints, stintList } from './pits.js';
import { BEST, T } from './social-draw-v3.js';
import { FLAG, BANNER, BANNER_COLOR, ease, clamp01, gapsOf, lapAt, raceVideoTiming, NEUTRAL } from './social-draw-season.js';
import { lapStr } from './social-season.js';

const dec = (v, n = 1) => Number(v).toFixed(n).replace('.', ',');

// Place au tour l (0 : grille) ; null une fois sorti
const posAt = (x, l, n) => (l === 0 ? (x.grid || n) : x.pos[l - 1] || (x.classified && l > x.laps ? x.finish : null));
// Écart au leader (s) à la fin du tour l, au dernier tour bouclé pour un pilote à un tour ou sorti
function gapAt(d, g, i, l) {
  const x = d.drivers[i];
  if (l === 0) return 0;   // départ : tout le monde sur la même ligne, rangé dans l'ordre de la grille
  const k = Math.min(l, x.laps);
  const c = k ? g.cum[i][k - 1] : null;
  return c == null ? null : c - g.lead[k];
}
// Tours de retard : tours bouclés par le leader avant que le pilote ne finisse son dernier tour compté
function lapsDown(d, g, i, l) {
  const x = d.drivers[i];
  const k = Math.min(l, x.laps);
  const c = k ? g.cum[i][k - 1] : null;
  if (c == null) return 0;
  let n = 0;
  for (let j = k + 1; j <= d.total; j++) if (g.lead[j] <= c) n++;
  return n;
}

// Relais de pneus de chaque pilote (trigramme) d'après TimingAppData et DriverList de la F1 : [{ c, from, to, age0 }]
// (from…to : tours de course roulés avec ces pneus ; age0 : tours qu'ils avaient déjà au montage). Les relais
// « mêmes pneus » sont fusionnés (realStints)
export function tyreStints(app, list) {
  const out = {};
  for (const [num, line] of Object.entries(app?.Lines || {})) {
    const code = list?.[num]?.Tla;
    if (!code) continue;
    let lap = 1;
    const st = [];
    for (const s of realStints(stintList(line).filter((x) => TYRE[x?.Compound]))) {
      const age0 = Number(s.StartLaps) || 0;
      const n = Math.max(0, (Number(s.TotalLaps) || 0) - age0);
      st.push({ c: s.Compound, from: lap, to: lap + n - 1, age0 });
      lap += n;
    }
    if (st.length) out[code] = st;
  }
  return out;
}
// Pneus pendant le tour « lap » (1 : premier tour ; 0 : grille) : composé et tours déjà roulés avec ces pneus
function tyreAt(d, code, lap) {
  const st = d.tyres?.[code];
  if (!st) return null;
  const s = st.find((x) => lap <= x.to) || st[st.length - 1];
  return { c: s.c, age: s.age0 + Math.max(0, lap - s.from) };
}

// Rangée affichée au tour l : les pilotes en course dans l'ordre de leur place, puis les abandons en bas (le dernier
// sorti juste sous les pilotes en course), gardés et grisés pour qu'on voie toujours qui est hors course
const ranksMemo = new WeakMap();
function rankAt(d, l) {
  let all = ranksMemo.get(d);
  if (!all) ranksMemo.set(d, (all = []));
  if (all[l]) return all[l];
  const n = d.drivers.length;
  const run = d.drivers.map((x, i) => [i, posAt(x, l, n)]).filter(([, p]) => p).sort((a, b) => a[1] - b[1]);
  const inRace = new Set(run.map(([i]) => i));
  const gone = d.drivers.map((x, i) => [i, x.laps || 0]).filter(([i]) => !inRace.has(i)).sort((a, b) => b[1] - a[1]);
  const r = new Array(n);
  run.forEach(([i], k) => { r[i] = k + 1; });
  gone.forEach(([i], k) => { r[i] = run.length + k + 1; });
  return (all[l] = r);
}

// Durée : le déroulé de la vidéo du graphique (tours importants ralentis, bandeaux), étiré pour que la course se
// suive mieux : ~1,1 s par tour, entre 45 et 80 s (Mexique, 71 tours : 88 s avec le départ et l'arrivée, sous les
// 90 s des Reels) ; en plus, pour chaque tour, le défilement de la piste (vitesse du leader : plus lent sous
// neutralisation, à l'arrêt au drapeau rouge) et l'échelle des écarts (les trois quarts du peloton dans la piste,
// lissée d'un tour à l'autre)
const memo = new WeakMap();
function stretched(d) {
  const b = raceVideoTiming(d);
  const f = Math.max(45, Math.min(80, d.total * 1.1)) / b.race;
  const at = (t) => b.intro + (t - b.intro) * f;
  const starts = b.starts.map(at);
  const banners = b.banners.map((e) => ({ ...e, t0: at(e.t0), t1: at(e.t0) + (e.t1 - e.t0) * Math.min(f, 1.4) }));
  return { ...b, per: b.per * f, race: b.race * f, starts, banners, duration: starts.at(-1) + b.outro };
}
export function timelapseTiming(d) {
  if (memo.has(d)) return memo.get(d);
  const tm = stretched(d);
  const g = gapsOf(d);
  const n = d.drivers.length;
  const speed = [];
  for (let l = 1; l <= d.total; l++) { const t = g.lead[l] - g.lead[l - 1]; speed.push(t > 0 && Number.isFinite(t) ? Math.min(1.15, g.lapRef / t) : 1); }
  const phase = [0];
  for (let l = 0; l < d.total; l++) phase.push(phase[l] + (tm.starts[l + 1] - tm.starts[l]) * speed[l]);
  const raw = [];
  for (let l = 0; l <= d.total; l++) {
    const gs = d.drivers.map((x, i) => (posAt(x, l, n) ? gapAt(d, g, i, l) : null)).filter((v) => v != null && v >= 0).sort((a, b) => a - b);
    raw.push(Math.max(8, Math.min(120, (gs[Math.floor((gs.length - 1) * 0.75)] || 0) * 1.15)));
  }
  // Lissage aller-retour : la piste « dézoome » et « zoome » en douceur, sans retard sur la course
  const win = [...raw];
  for (let l = 1; l < win.length; l++) win[l] = win[l - 1] + (win[l] - win[l - 1]) * 0.35;
  for (let l = win.length - 2; l >= 0; l--) win[l] = win[l + 1] + (win[l] - win[l + 1]) * 0.35;
  const out = { ...tm, speed, phase, win };
  memo.set(d, out);
  return out;
}

// F1 vue de dessus, nez à droite en (nx, cy) ; longueur l, largeur w
function car(ctx, nx, cy, l, w, col, tyre) {
  const X = (k) => nx - l + k * l;
  const Yh = (k) => k * w;
  // Bras de suspension, puis roues (arrière plus larges)
  ctx.strokeStyle = tyre; ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.beginPath();
  for (const [a, s] of [[0.18, -1], [0.18, 1], [0.76, -1], [0.76, 1]]) { ctx.moveTo(X(a), cy); ctx.lineTo(X(a), cy + s * Yh(0.4)); }
  ctx.stroke();
  ctx.fillStyle = tyre;
  for (const [a, b, h] of [[0.07, 0.29, 0.25], [0.68, 0.85, 0.22]]) for (const s of [-1, 1]) { rr(ctx, X(a), cy + (s < 0 ? -Yh(0.5) : Yh(0.5 - h)), (b - a) * l, Yh(h), w * 0.06); ctx.fill(); }
  ctx.fillStyle = col;
  rr(ctx, X(0), cy - Yh(0.4), l * 0.08, Yh(0.8), w * 0.05); ctx.fill();   // aileron arrière
  ctx.beginPath();   // carrosserie : pontons, capot moteur, nez effilé
  ctx.moveTo(X(0.06), cy - Yh(0.09));
  ctx.lineTo(X(0.3), cy - Yh(0.17)); ctx.lineTo(X(0.36), cy - Yh(0.3)); ctx.lineTo(X(0.58), cy - Yh(0.3)); ctx.lineTo(X(0.66), cy - Yh(0.12));
  ctx.lineTo(X(0.95), cy - Yh(0.06)); ctx.lineTo(X(0.95), cy + Yh(0.06));
  ctx.lineTo(X(0.66), cy + Yh(0.12)); ctx.lineTo(X(0.58), cy + Yh(0.3)); ctx.lineTo(X(0.36), cy + Yh(0.3)); ctx.lineTo(X(0.3), cy + Yh(0.17));
  ctx.lineTo(X(0.06), cy + Yh(0.09)); ctx.closePath(); ctx.fill();
  rr(ctx, X(0.9), cy - Yh(0.48), l * 0.1, Yh(0.96), w * 0.05); ctx.fill();   // aileron avant
  ctx.fillStyle = 'rgba(0,0,0,0.55)';   // cockpit, casque clair
  ctx.beginPath(); ctx.ellipse(X(0.52), cy, l * 0.08, w * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2f4f5';
  ctx.beginPath(); ctx.arc(X(0.5), cy, w * 0.075, 0, Math.PI * 2); ctx.fill();
}
// Voiture de sécurité : voiture de route vue de dessus (roues, pare-brise, toit et rampe de feux)
function safetyCar(ctx, nx, cy, l, w, col, tyre) {
  ctx.fillStyle = tyre;
  for (const a of [0.14, 0.7]) { rr(ctx, nx - l + a * l, cy - w * 0.56, l * 0.17, w * 1.12, w * 0.08); ctx.fill(); }
  rr(ctx, nx - l, cy - w / 2, l, w, w * 0.28); ctx.fillStyle = col; ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  rr(ctx, nx - l * 0.66, cy - w * 0.38, l * 0.4, w * 0.76, w * 0.16); ctx.fill();   // vitres
  ctx.fillStyle = col; rr(ctx, nx - l * 0.58, cy - w * 0.3, l * 0.22, w * 0.6, w * 0.08); ctx.fill();   // toit
  ctx.fillStyle = '#f2f4f5'; ctx.fillRect(nx - l * 0.5, cy - w * 0.32, l * 0.06, w * 0.64);   // rampe de feux
}

// Image de la vidéo à l'instant time (s)
export function timelapseFrame(ctx, W, H, d, o, time) {
  const tm = timelapseTiming(d);
  const story = d.story || { status: [], events: [] };
  const n = d.drivers.length;
  const g = gapsOf(d);
  // Zones sûres : les mêmes que la vidéo du graphique (raceFrame)
  const land = W > H;
  const u = land ? H / 1350 : W / 1080;
  const tu = Math.max(u, 0.9);
  const crop = land ? 0 : o.insta ? 55 * u : Math.max(0, (W - H * 9 / 19.5) / 2);
  const pad = Math.round(Math.min(W, H) * 0.1);
  const padL = land ? pad : Math.round(crop + 50 * u);
  const padR = land ? pad : Math.round(crop + 150 * u);
  const foot = land ? 90 * u : H * (o.insta ? 0.16 : 0.18);
  const sigY = land ? H - Math.round(H * 0.025) : H - foot;
  const bandEnd = land ? H - foot : sigY - 70 * u;
  const bw = W - padL - padR;
  const { lap, f } = lapAt(tm, d.total, time);
  const done = time >= tm.starts.at(-1);
  const intro = time < tm.intro;
  const L = done ? d.total : lap;
  const fr = done || intro ? 0 : f;
  const statusOf = (l) => (l >= 1 && l <= d.total ? story.status[l - 1] || 'green' : 'green');
  const st = done || intro ? 'green' : statusOf(L + 1);
  const flag = FLAG[st] || FLAG.green;
  background(ctx, W, H, st === 'green' ? C.red : flag.color);
  if (st !== 'green' && !v3) {
    const rg = ctx.createRadialGradient(W / 2, H * 0.1, 0, W / 2, H * 0.1, W * 1.1);
    rg.addColorStop(0, `${flag.color}30`); rg.addColorStop(1, `${flag.color}00`);
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }

  // ---- En-tête : Grand Prix et état de la piste, puis le tour et le leader ----
  const top = Math.round(land ? 40 * u : H * (o.insta ? 0.17 : 0.11));
  const leadOf = (l) => d.drivers.find((x) => posAt(x, l, n) === 1);
  const leader = done ? leadOf(d.total) : intro ? leadOf(0) : leadOf(Math.max(1, Math.min(d.total, L + (fr > 0.375 ? 1 : 0))));
  ctx.fillStyle = C.red; rr(ctx, padL, top, 8 * u, 46 * u, 3 * u); ctx.fill();
  const pillH = Math.round(40 * tu);
  ctx.font = `700 ${Math.round(pillH * 0.42)}px ${MONO}`;
  const pillW = intro || done ? 0 : ctx.measureText(flag.label).width + flag.label.length * 2 + pillH * 1.2;
  if (!intro && !done) pill(ctx, flag.label, W - padR, top + 4 * u, pillH, { bg: st === 'green' ? 'rgba(61,220,132,0.18)' : flag.color, color: st === 'green' ? C.green : '#111', align: 'right', dot: true });
  txt(ctx, d.gp.toUpperCase(), padL + 24 * u, top + 40 * u, { size: Math.round(44 * tu), weight: 800, family: TITLE, italic: true, max: bw - 24 * u - pillW - 30 * u });
  const rowB = top + 116 * u;
  let lx = padL;
  if (intro || done) {
    txt(ctx, intro ? 'DÉPART' : 'ARRIVÉE', lx, rowB, { size: Math.round(58 * tu), weight: 800, family: TITLE, italic: true, color: done ? C.gold : C.text });
    lx += ctx.measureText(intro ? 'DÉPART' : 'ARRIVÉE').width;
  } else {
    txt(ctx, 'TOUR', lx, rowB, { size: Math.round(32 * tu), weight: 700, family: TITLE, color: C.muted, spacing: 1 });
    lx += ctx.measureText('TOUR').width + 12 * u;
    txt(ctx, String(Math.min(d.total, L + 1)), lx, rowB, { size: Math.round(60 * tu), weight: 700, family: MONO });
    lx += ctx.measureText(String(Math.min(d.total, L + 1))).width + 4 * u;
    txt(ctx, `/${d.total}`, lx, rowB, { size: Math.round(32 * tu), weight: 600, family: MONO, color: C.muted });
    lx += ctx.measureText(`/${d.total}`).width;
  }
  if (leader) {
    const kick = intro ? 'EN POLE' : done ? 'VAINQUEUR' : 'EN TÊTE';
    const nameMax = W - padR - lx - 220 * tu;
    ctx.font = `800 ${Math.round(46 * tu)}px ${TITLE}`;
    const name = leader.last.toUpperCase() || leader.code;
    const s = txt(ctx, name, W - padR, rowB, { size: Math.round(46 * tu), weight: 800, family: TITLE, italic: true, align: 'right', max: nameMax, color: done ? C.gold : C.text });
    ctx.font = `800 ${s}px ${TITLE}`;
    const nw = ctx.measureText(name).width;
    ctx.fillStyle = vivid(leader.color); ctx.fillRect(W - padR - nw - 18 * u, rowB - s * 0.74, 6 * u, s * 0.78);
    txt(ctx, kick, W - padR - nw - 32 * u, rowB - 4 * u, { size: Math.round(26 * tu), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
  }

  // ---- Piste : une rangée par place, écart au leader en distance ----
  const colW = land ? Math.round(560 * u) : 0;
  const stripH = land ? 0 : Math.round(210 * u);
  const rowsTop = top + 176 * u;
  const rowsBot = land ? bandEnd : bandEnd - stripH - 26 * u;
  const rowH = (rowsBot - rowsTop) / n;
  const Y = (p) => rowsTop + (p - 0.5) * rowH;
  const laneR = land ? W - padR - colW - 40 * u : W - padR;
  const fs = Math.round(Math.min(30 * tu, rowH * 0.66));
  const Lc = rowH * 1.6;
  const Wc = Lc * 0.42;
  const laneL = padL + fs * 1.5;
  const minNose = laneL + fs * 2.3 + Lc;
  const frontX = laneR - (Lc * 0.85 + 16 * u);   // nez du leader ; devant, la place de la voiture de sécurité
  const compW = Math.min(60 * u, (frontX - minNose) * 0.14);
  const edgeX = minNose + compW;
  const span = frontX - edgeX;
  const Lw = Math.min(d.total, L + 1);
  const win = tm.win[L] + (tm.win[Lw] - tm.win[L]) * fr;
  const X = (gp) => (gp <= win ? frontX - (gp / win) * span : edgeX - compW * (1 - Math.exp(-(gp - win) / (win * 0.8))));
  const fe = done ? 1 : intro ? 0 : ease(clamp01((fr - 0.1) * 1.8));   // dépassements : glissade vive, au milieu du tour
  // Rangées : toutes gardées ; celles des abandons, en bas, ont leur numéro estompé
  const running = L === 0 ? n : d.drivers.filter((x) => posAt(x, L, n)).length;
  for (let p = 1; p <= n; p++) {
    if (p % 2 === 0) { ctx.globalAlpha = v3 ? 1 : 0.6; ctx.fillStyle = C.panel; ctx.fillRect(padL, Y(p) - rowH / 2, laneR - padL, rowH); }
    ctx.globalAlpha = p > running ? 0.45 : 1;
    txt(ctx, String(p), laneL - 12 * u, Y(p) + fs * 0.36, { size: Math.round(fs * 0.9), weight: v3 ? 600 : 800, family: v3 ? MONO : TITLE, color: p <= 3 ? MEDAL[p - 1] : C.muted, align: 'right', italic: true });
    ctx.globalAlpha = 1;
  }
  // Repères de l'échelle : graduations (s), pilotes au-delà tassés à gauche du pointillé
  const step = [2, 5, 10, 15, 20, 30, 40].find((s) => win / s <= 4.5) || 60;
  ctx.fillStyle = v3 ? T.line : 'rgba(255,255,255,0.07)';
  ctx.fillRect(frontX, rowsTop, Math.max(1, 2 * u), rowsBot - rowsTop);
  for (let s = step; s < win; s += step) {
    const x = X(s);
    if (x - edgeX < 50 * tu) break;
    ctx.fillStyle = v3 ? T.line : 'rgba(255,255,255,0.06)'; ctx.fillRect(x, rowsTop, Math.max(1, 1.5 * u), rowsBot - rowsTop);
    txt(ctx, `+${s} s`, x, rowsTop - 16 * u, { size: Math.round(20 * tu), weight: 600, family: MONO, color: C.muted, align: 'center' });
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(laneL, rowsTop, edgeX - laneL, rowsBot - rowsTop);
  ctx.strokeStyle = v3 ? T.line2 : 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, 1.5 * u);
  ctx.setLineDash([6 * u, 6 * u]); ctx.beginPath(); ctx.moveTo(edgeX, rowsTop); ctx.lineTo(edgeX, rowsBot); ctx.stroke(); ctx.setLineDash([]);
  // Bordures de la piste qui défilent (vitesse du leader) ; couleur de la neutralisation
  const ph = intro ? 0 : done ? tm.phase[d.total] + tm.speed[d.total - 1] * 1.2 * (1 - Math.exp(-(time - tm.starts.at(-1)) / 1.2))
    : tm.phase[L] + (tm.starts[L + 1] - tm.starts[L]) * fr * tm.speed[L];
  const dash = 48 * u;
  const off = (ph * 420 * u) % dash;
  for (const ky of [rowsTop - 6 * u, rowsBot + 2 * u]) {
    ctx.save(); ctx.beginPath(); ctx.rect(laneL, ky, laneR - laneL, 4 * u); ctx.clip();
    for (let k = -1, x = laneL - off; x < laneR; x += dash / 2, k++) {
      const even = (k & 1) === 0;
      ctx.fillStyle = st !== 'green' ? (even ? flag.color : 'rgba(0,0,0,0)') : v3 ? (even ? T.line2 : 'rgba(0,0,0,0)') : (even ? C.red : 'rgba(255,255,255,0.55)');
      ctx.fillRect(x, ky, dash / 2, 4 * u);
    }
    ctx.restore();
  }
  // Arrivée : ligne à la hauteur du leader (damier, filet blanc en Télémétrie)
  if (done) {
    const q = rowH / 3;
    for (let r = 0; r * q < rowsBot - rowsTop; r++) for (let c = 0; c < 2; c++) {
      if (v3 && c) continue;
      ctx.fillStyle = v3 ? T.text : (r + c) % 2 ? '#111' : '#f2f4f5';
      ctx.fillRect(frontX + 6 * u + c * q * (v3 ? 0 : 1), rowsTop + r * q, v3 ? 4 * u : q, Math.min(q, rowsBot - rowsTop - r * q));
    }
  }

  const tyre = v3 ? '#3a4452' : '#3a404a';
  // Voiture de sécurité devant le leader, entrée et sortie en fondu
  const isSC = (l) => ['sc', 'neutral'].includes(statusOf(l));
  const scA = intro || done ? 0 : isSC(L + 1) ? (isSC(L) ? 1 : clamp01(fr * 3)) : isSC(L) ? 1 - clamp01(fr * 3) : 0;
  if (scA > 0) {
    ctx.globalAlpha = scA;
    safetyCar(ctx, laneR - 4 * u - (1 - scA) * Lc * 0.4, Y(1), Lc * 0.8, Wc * 0.95, FLAG.sc.color, tyre);
    ctx.globalAlpha = 1;
  }

  // Voitures
  const cars = [];
  d.drivers.forEach((x, i) => {
    const last = done || L >= d.total;
    const p0 = rankAt(d, L)[i];
    const p1 = last ? p0 : rankAt(d, L + 1)[i];
    const gone0 = L > 0 && !posAt(x, L, n);                 // déjà hors course
    const gone1 = gone0 || (!last && !posAt(x, L + 1, n));   // sort pendant ce tour
    const g0 = gapAt(d, g, i, L);
    const g1 = last || gone1 ? g0 : gapAt(d, g, i, L + 1);
    const gp = g0 == null ? g1 : g1 == null ? g0 : g0 + (g1 - g0) * fr;
    // Abandon : la voiture grise et recule dans la zone tassée, à gauche, où elle reste jusqu'à l'arrivée
    const k = gone0 ? 1 : gone1 ? ease(clamp01(fr * 1.6)) : 0;
    const y = Y(p0) + (Y(p1) - Y(p0)) * fe;
    const nx0 = X(gp ?? win * 3);
    const nx = nx0 + (X(win * 3) - nx0) * k;
    let tag = '';
    if (k >= 1) tag = 'ABANDON';
    else if (!intro && !done && (x.pits || []).includes(L + 1)) tag = 'PIT';
    else if (!intro && L >= 1) { const dn = lapsDown(d, g, i, L); if (dn) tag = `+${dn}T`; }
    // Pneus du tour en cours (grille : ceux du départ ; arrivée : ceux du dernier relais), pas pour un abandon
    const tyre = k ? null : tyreAt(d, x.code, done ? d.total + 1 : intro ? 0 : L + 1);
    cars.push({ x, y, nx, out: k > 0, k, tag, tyre, gain: !k && fe > 0 && fe < 1 && p1 < p0 });
  });
  cars.sort((a, b) => (b.out - a.out) || (b.y - a.y));
  for (const c of cars) {
    // Abandon : voiture et trigramme grisés, estompés, gardés dans leur rangée
    ctx.globalAlpha = 1 - 0.45 * c.k;
    const col = c.out && c.k > 0.15 ? '#5b636e' : vivid(c.x.color);
    car(ctx, c.nx, c.y, Lc, Wc, col, tyre);
    const ty = c.y + fs * 0.36;
    const cx = c.nx - Lc - 8 * u;
    txt(ctx, c.x.code, cx, ty, { size: fs, weight: 800, family: TITLE, italic: true, align: 'right', color: c.out ? C.muted : C.text });
    if (c.gain) {
      const w = ctx.measureText(c.x.code).width;
      const s = fs * 0.32;
      const ax = cx - w - 10 * u - s;
      ctx.globalAlpha = (1 - c.k) * Math.sin(fe * Math.PI);
      ctx.fillStyle = C.green; ctx.beginPath(); ctx.moveTo(ax - s, c.y + s * 0.6); ctx.lineTo(ax + s, c.y + s * 0.6); ctx.lineTo(ax, c.y - s * 0.8); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1 - 0.45 * c.k;
    let tx = c.nx + 8 * u;
    // Pneus : pastille de la couleur du composé (lettre française, comme l'appli), puis leur âge en tours
    if (c.tyre) {
      const [tc, letter] = TYRE[c.tyre.c];
      const r = fs * 0.42;
      ctx.beginPath(); ctx.arc(tx + r, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = v3 ? T.bg : '#101318'; ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.3); ctx.strokeStyle = tc; ctx.stroke();
      txt(ctx, letter, tx + r, c.y + r * 0.4, { size: Math.round(r * 1.1), weight: 800, family: MONO, color: C.text, align: 'center' });
      const age = String(c.tyre.age);
      txt(ctx, age, tx + 2 * r + 5 * u, c.y + fs * 0.3, { size: Math.round(fs * 0.62), weight: 600, family: MONO, color: C.muted });
      tx += 2 * r + 5 * u + ctx.measureText(age).width + 8 * u;
    }
    if (c.tag) txt(ctx, c.tag, tx, c.y + fs * 0.3, { size: Math.round(fs * 0.72), weight: 700, family: MONO, color: c.tag === 'PIT' ? (v3 ? T.sc : '#ff8a3d') : C.muted });
    ctx.globalAlpha = 1;
  }

  // ---- Bandeau (sous la piste ; colonne de droite en paysage) ----
  const box = land ? { x: W - padR - colW, y: rowsTop, w: colW, h: bandEnd - rowsTop } : { x: padL, y: bandEnd - stripH, w: bw, h: stripH };
  const slot = land ? { ...box, h: Math.round(250 * u) } : box;
  const below = land ? { x: box.x, y: box.y + slot.h + 24 * u, w: box.w, h: box.h - slot.h - 24 * u } : null;
  const bn = tm.banners.find((b) => time >= b.t0 && time < b.t1);
  const facts = (b) => {
    const c = story.events.filter((e) => e.lap <= L + 1);
    const list = [['sc', 'SAFETY CAR', 'SAFETY CARS'], ['vsc', 'VSC', 'VSC'], ['red', 'DRAPEAU ROUGE', 'DRAPEAUX ROUGES'], ['out', 'ABANDON', 'ABANDONS'], ['lead', 'CHANGEMENT DE LEADER', 'CHANGEMENTS DE LEADER']]
      .map(([kk, one, many]) => { const v = c.filter((e) => e.kind === kk).length; return v ? `${v} ${v > 1 ? many : one}` : ''; }).filter(Boolean);
    card(ctx, b.x, b.y, b.w, b.h, 20 * u);
    txt(ctx, 'LA COURSE', b.x + 28 * u, b.y + 50 * u, { size: Math.round(26 * tu), weight: 700, family: TITLE, color: C.muted, spacing: 3 });
    if (land) (list.length ? list : ['SANS INCIDENT']).forEach((t, j) => txt(ctx, t, b.x + 28 * u, b.y + 108 * u + j * 56 * u, { size: Math.round(36 * tu), weight: 800, family: TITLE, italic: true, max: b.w - 56 * u }));
    else txt(ctx, list.join('  ·  ') || 'COURSE SANS INCIDENT', b.x + 28 * u, b.y + b.h / 2 + 40 * u, { size: Math.round(36 * tu), weight: 800, family: TITLE, italic: true, max: b.w - 56 * u });
  };
  if (intro) {
    // Feux de départ
    const on = Math.min(5, Math.floor((time / (tm.intro - 0.6)) * 6));
    const go = time > tm.intro - 0.45;
    const r = Math.min(30 * u, slot.w / 13);
    const lw = r * 2 * 5 + r * 0.8 * 4;
    const lx0 = slot.x + (slot.w - lw) / 2;
    card(ctx, slot.x, slot.y, slot.w, slot.h, 20 * u, { strong: true });
    for (let k = 0; k < 5; k++) {
      ctx.beginPath(); ctx.arc(lx0 + r + k * r * 2.8, slot.y + slot.h * 0.36, r, 0, Math.PI * 2);
      ctx.fillStyle = !go && k < on ? '#ff1a1a' : '#2a0b0b'; ctx.fill();
    }
    txt(ctx, go ? "C'EST PARTI !" : 'GRILLE DE DÉPART', slot.x + slot.w / 2, slot.y + slot.h * 0.8, { size: Math.round(42 * tu), weight: 800, family: TITLE, align: 'center', color: go ? C.green : C.text, italic: true, max: slot.w - 40 * u });
    if (below) facts(below);
  } else if (done) {
    // Podium et chiffres de la course
    const k = ease(clamp01((time - tm.starts.at(-1)) / 0.8));
    const pod = [...d.drivers].filter((x) => x.finish).sort((a, b) => a.finish - b.finish).slice(0, 3);
    const gapTxt = (x) => { const i = d.drivers.indexOf(x); const dn = lapsDown(d, g, i, d.total); const v = gapAt(d, g, i, d.total); return dn ? `+${dn}T` : v != null ? `+${dec(v)} s` : ''; };
    const b = box;
    ctx.save(); ctx.globalAlpha = k;
    card(ctx, b.x, b.y, b.w, b.h, 20 * u, { strong: true });
    rr(ctx, b.x, b.y, b.w, b.h, v3 ? 10 * u : 20 * u); ctx.strokeStyle = C.gold; ctx.lineWidth = 3 * u; ctx.stroke();
    const w0 = pod[0];
    const c = story.counts || {};
    const list = [c.sc ? `${c.sc} SAFETY CAR${c.sc > 1 ? 'S' : ''}` : '', c.vsc ? `${c.vsc} VSC` : '', c.red ? `${c.red} DRAPEAU${c.red > 1 ? 'X' : ''} ROUGE${c.red > 1 ? 'S' : ''}` : '', d.leadChanges ? `${d.leadChanges} CHANGEMENT${d.leadChanges > 1 ? 'S' : ''} DE LEADER` : ''].filter(Boolean);
    const bx = story.best ? d.drivers.find((x) => x.code === story.best.code) : null;
    const best = story.best ? `MEILLEUR TOUR ${(bx?.last || story.best.code).toUpperCase()} ${lapStr(story.best.time)}` : '';
    if (w0) {
      ctx.fillStyle = vivid(w0.color); ctx.fillRect(b.x + 22 * u, b.y + 28 * u, 6 * u, land ? 150 * u : b.h - 56 * u);
      txt(ctx, 'VAINQUEUR', b.x + 44 * u, b.y + 58 * u, { size: Math.round(28 * tu), weight: 800, family: TITLE, color: C.gold, spacing: 4 });
      txt(ctx, `${w0.first} ${w0.last}`.toUpperCase(), b.x + 44 * u, b.y + 122 * u, { size: Math.round(60 * tu), weight: 800, family: TITLE, italic: true, max: land ? b.w - 70 * u : b.w * 0.58 });
      txt(ctx, w0.team.toUpperCase(), b.x + 44 * u, b.y + (land ? 164 : 158) * u, { size: Math.round(26 * tu), weight: 700, family: TITLE, color: C.muted, spacing: 2, max: land ? b.w - 70 * u : b.w * 0.5 });
    }
    pod.slice(1).forEach((x, j) => {
      const px = land ? b.x + 44 * u : b.x + b.w * 0.64;
      const py = land ? b.y + 270 * u + j * 110 * u : b.y + 66 * u + j * 86 * u;
      const pw = land ? b.w - 70 * u : b.w * 0.36 - 24 * u;
      txt(ctx, `P${j + 2}`, px, py, { size: Math.round(36 * tu), weight: 800, family: v3 ? MONO : TITLE, color: MEDAL[j + 1], italic: true });
      txt(ctx, x.last.toUpperCase(), px + 64 * tu, py, { size: Math.round(38 * tu), weight: 800, family: TITLE, italic: true, max: pw - 64 * tu });
      txt(ctx, gapTxt(x), px + 64 * tu, py + 32 * tu, { size: Math.round(22 * tu), weight: 600, family: MONO, color: C.muted });
    });
    if (land) {
      const fy = b.y + 520 * u;
      list.forEach((t, j) => txt(ctx, t, b.x + 44 * u, fy + j * 46 * u, { size: Math.round(28 * tu), weight: 700, family: TITLE, color: C.text, max: b.w - 70 * u }));
      if (best) txt(ctx, best, b.x + 44 * u, b.y + b.h - 34 * u, { size: Math.round(24 * tu), weight: 700, family: TITLE, color: BEST, spacing: 1, max: b.w - 70 * u });
    } else {
      if (best) txt(ctx, best, b.x + 44 * u, b.y + b.h - 22 * u, { size: Math.round(22 * tu), weight: 700, family: TITLE, color: BEST, spacing: 1, max: b.w * 0.56 });
    }
    ctx.restore();
  } else if (bn) {
    // Moment fort : bandeau de la couleur de l'événement, qui s'ouvre de gauche à droite
    const k = ease(clamp01((time - bn.t0) / 0.3));
    const fade = clamp01((bn.t1 - time) / 0.3);
    const x = d.drivers.find((y) => y.code === bn.code);
    const name = x ? `${x.first} ${x.last}`.trim() : bn.code || '';
    const [title, sub] = BANNER[bn.kind];
    const col = BANNER_COLOR[bn.kind] || FLAG[bn.kind]?.color || C.red;
    const dark = ['sc', 'vsc', 'neutral', 'restart', 'lead'].includes(bn.kind) || (bn.kind === 'fastest' && v3) ? '#0b0d12' : '#fff';
    ctx.save(); ctx.globalAlpha = fade;
    rr(ctx, slot.x, slot.y, slot.w * k, slot.h, v3 ? 6 * u : 18 * u); ctx.fillStyle = v3 && bn.kind === 'fastest' ? BEST : col; ctx.fill();
    ctx.globalAlpha = fade * clamp01((k - 0.5) * 2);
    const lines = fitLines(ctx, title, slot.w - 60 * u, [60, 52, 44].map((v) => Math.round(v * tu)), land ? 2 : 1, TITLE, 800);
    const ty = slot.y + slot.h / 2 - (lines.lines.length - 1) * lines.size * 0.5;
    lines.lines.forEach((l, j) => txt(ctx, l, slot.x + slot.w / 2, ty + j * lines.size + 4 * u, { size: lines.size, weight: 800, family: TITLE, color: dark, align: 'center', italic: true }));
    txt(ctx, sub(bn, name).toUpperCase(), slot.x + slot.w / 2, ty + (lines.lines.length - 1) * lines.size + 56 * u, { size: Math.round(30 * tu), weight: 700, family: TITLE, color: dark, align: 'center', spacing: 1.5, max: slot.w - 60 * u });
    ctx.restore();
    if (below) facts(below);
  } else if (land) {
    // Paysage : leader en haut de la colonne
    if (leader) {
      card(ctx, slot.x, slot.y, slot.w, slot.h, 20 * u, { tint: leader.color });
      txt(ctx, 'EN TÊTE', slot.x + 32 * u, slot.y + 60 * u, { size: Math.round(26 * tu), weight: 700, family: TITLE, color: C.muted, spacing: 3 });
      txt(ctx, `${leader.first} ${leader.last}`.toUpperCase(), slot.x + 32 * u, slot.y + 136 * u, { size: Math.round(52 * tu), weight: 800, family: TITLE, italic: true, max: slot.w - 64 * u });
      txt(ctx, leader.team.toUpperCase(), slot.x + 32 * u, slot.y + 190 * u, { size: Math.round(26 * tu), weight: 700, family: TITLE, color: C.muted, spacing: 2, max: slot.w - 64 * u });
    }
    facts(below);
  } else facts(box);

  // Signature (comme la vidéo du graphique)
  ctx.fillStyle = C.red; rr(ctx, padL, sigY - 27 * tu, 8 * u, 30 * tu, 3 * u); ctx.fill();
  txt(ctx, o.signature || '@BenjyPaddock', padL + 20 * u, sigY, { size: Math.round(34 * tu), weight: 700, family: TITLE, spacing: 1 });
  const rest = bw - 120 * u - ctx.measureText(o.signature || '@BenjyPaddock').width;
  if (done) txt(ctx, 'ABONNEZ-VOUS POUR LA SUITE', W - padR, sigY, { size: Math.round(29 * tu), weight: 800, family: TITLE, color: C.red, align: 'right', spacing: 2, max: rest });
  else if (story.estimated && story.events.some((e) => NEUTRAL.has(e.kind) && e.kind !== 'red')) txt(ctx, "Neutralisations estimées d'après les temps au tour", W - padR, sigY, { size: Math.round(24 * tu), weight: 600, color: C.muted, align: 'right', max: rest });
}
