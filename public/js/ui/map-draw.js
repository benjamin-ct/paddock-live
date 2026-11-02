// Dessins partagés par la carte 2D (ui/map.js) et la vue 3D (ui/map3d.js, dans la texture de ses étiquettes) :
// pastille d'un pilote, pastilles des secteurs, des virages, des drapeaux jaunes et de la voiture de sécurité,
// étiquettes. g : contexte 2D du canevas.
import { tx } from '../i18n.js';

// Polices de la carte : Saira Condensed ; chiffres en chasse fixe
export const FONT = () => '"Saira Condensed", "Titillium Web", sans-serif';
export const MONO = () => '"JetBrains Mono", Consolas, monospace';

// Texte lisible sur une couleur d'écurie
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const v = parseInt(m[1], 16);
  const lum = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.6 ? '#0b0b0d' : '#ffffff';
}

// Pastille d'un pilote en (x, y) : c = { r (rayon), col, d (pilote), num, pos, sp (suivi), isA, isB } ;
// o = { labels (trigramme, sinon simple point), posOpt (case Positions : anneau du leader), posBadges (petit rond de
// position), gps (sinon contour pointillé : position estimée), ring (contour selon le thème) }
export function drawPuck(g, x, y, c, o) {
  if (!c.sp && o.posOpt && c.pos === 1) {
    // Leader : anneau jaune
    g.beginPath();
    g.arc(x, y, c.r + 4, 0, Math.PI * 2);
    g.strokeStyle = '#FACC15';
    g.lineWidth = 2;
    g.stroke();
  }
  if (c.sp) {
    g.beginPath();
    g.arc(x, y, c.r + 4, 0, Math.PI * 2);
    g.strokeStyle = c.isA ? '#3ea6ff' : c.isB ? '#ff9f1a' : '#ffffff';
    g.lineWidth = 2.5;
    g.stroke();
  }
  // Ombre (disque sombre décalé, moins coûteux qu'un flou à chaque image)
  g.beginPath();
  g.arc(x + 0.8, y + 1.6, c.r + 2, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0, 0, 0, .45)';
  g.fill();
  g.beginPath();
  g.arc(x, y, c.r, 0, Math.PI * 2);
  g.fillStyle = c.col;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = o.ring;
  g.stroke();
  if (o.labels) {
    // Trigramme dans la pastille
    g.fillStyle = inkOn(c.col);
    g.font = `800 ${(c.r * 0.78).toFixed(1)}px ${FONT()}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(tx(c.d?.Tla || c.num), x, y + 0.5);
    if (o.posBadges && c.pos) {
      // Numéro de position dans un petit rond, en haut à droite de la pastille
      const br = Math.max(6.5, c.r * 0.48), bx = x + c.r * 0.82, by = y - c.r * 0.82;
      g.beginPath();
      g.arc(bx, by, br, 0, Math.PI * 2);
      g.fillStyle = '#07080A';
      g.fill();
      g.strokeStyle = c.pos === 1 ? '#FACC15' : '#3A414D';
      g.lineWidth = 1.2;
      g.stroke();
      g.fillStyle = '#F1F3F6';
      g.font = `700 ${(br * 1.2).toFixed(1)}px ${MONO()}`;
      g.fillText(tx(String(c.pos)), bx, by + 0.5);
    }
  } else {
    // Reflet
    g.beginPath();
    g.arc(x - c.r * 0.3, y - c.r * 0.35, c.r * 0.38, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255, 255, 255, .28)';
    g.fill();
  }
  if (!o.gps) {
    g.beginPath();
    g.arc(x, y, c.r, 0, Math.PI * 2);
    g.setLineDash([2, 2]);
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 1;
    g.stroke();
    g.setLineDash([]);
  }
}

// Étiquette arrondie centrée en (x, y) (zones LD, détection, stands)
export function drawBadge(g, x, y, text, bg, fg, edge) {
  g.font = `800 10.5px ${FONT()}`;
  const w = g.measureText(text).width + 12;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x - w / 2, y - 8, w, 16, 5);
  g.fill();
  if (edge) { g.strokeStyle = edge; g.lineWidth = 1; g.stroke(); }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(tx(text), x, y + 0.5);
}

// Pastille d'un secteur (couleur color) : « S1 · 38.178 · RUS » avec le meilleur temps b = { time, tla }, sinon « S1 »
export function drawSectorBadge(g, x, y, i, color, b) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (b) {
    g.font = `700 11px ${FONT()}`;
    const head = `S${i + 1}`;
    const hw = g.measureText(head).width + 10;
    g.font = `600 10.5px ${MONO()}`;
    const tw = g.measureText(b.time).width;
    g.font = `700 11px ${FONT()}`;
    const nw = g.measureText(b.tla).width;
    const w = hw + tw + nw + 18;
    g.fillStyle = 'rgba(14,17,22,.96)';
    g.beginPath();
    g.roundRect(x - w / 2, y - 10, w, 20, 6);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x - w / 2, y - 10, hw, 20, [6, 0, 0, 6]);
    g.fill();
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.fillText(tx(head), x - w / 2 + 5, y + 0.5);
    g.fillStyle = '#C084FC';
    g.font = `600 10.5px ${MONO()}`;
    g.fillText(tx(b.time), x - w / 2 + hw + 6, y + 0.5);
    g.fillStyle = '#F1F3F6';
    g.font = `700 11px ${FONT()}`;
    g.fillText(tx(b.tla), x - w / 2 + hw + tw + 12, y + 0.5);
    g.textAlign = 'center';
    return;
  }
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x - 13, y - 9, 26, 18, 4);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = `800 11px ${FONT()}`;
  g.fillText(tx(`S${i + 1}`), x, y + 0.5);
}

// Pastille ronde d'un numéro de virage (rayon rad, police déjà choisie) ; p : couleurs (chip, chipEdge, chipText)
export function drawCornerChip(g, x, y, rad, number, p) {
  g.beginPath();
  g.arc(x, y, rad, 0, Math.PI * 2);
  g.fillStyle = p.chip;
  g.fill();
  g.strokeStyle = p.chipEdge;
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = p.chipText;
  g.fillText(tx(String(number)), x, y + 0.5);
}

// Fanion(s) d'un secteur de commissaires sous drapeau jaune (dbl : double jaune) et son numéro
export function drawFlagBadge(g, x, y, number, dbl) {
  g.font = `800 10.5px ${FONT()}`;
  const label = String(number);
  const fw = (dbl ? 2 : 1) * 7 + 2;
  const bw = Math.max(28, fw + g.measureText(label).width + 10);
  g.fillStyle = dbl ? '#ff9f1a' : '#f5c518';
  g.beginPath();
  g.roundRect(x - bw / 2, y - 9, bw, 18, 4);
  g.fill();
  const x0 = x - (fw + g.measureText(label).width) / 2;
  g.fillStyle = g.strokeStyle = '#1a1500';
  g.lineWidth = 1.3;
  for (let k = 0; k < (dbl ? 2 : 1); k++) {
    const fx = x0 + k * 7 + 1;
    g.beginPath();
    g.moveTo(fx, y + 5); g.lineTo(fx, y - 5);
    g.stroke();
    g.beginPath();
    g.moveTo(fx, y - 5); g.lineTo(fx + 5, y - 3.2); g.lineTo(fx, y - 1.4);
    g.closePath();
    g.fill();
  }
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(tx(label), x0 + fw, y + 0.5);
}

// Voiture de sécurité (position estimée)
export function drawScBadge(g, x, y) {
  g.beginPath();
  g.roundRect(x - 13, y - 9, 26, 18, 4);
  g.fillStyle = '#ffb020';
  g.fill();
  g.strokeStyle = '#1d1200';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = '#1d1200';
  g.font = `900 11px ${FONT()}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(tx('SC'), x, y + 0.5);
}
