// Définitions officielles du mode dépassement (point de détection, point d'activation) et des
// zones « ligne droite » (straight mode), lues dans le plan du circuit publié par la FIA pour
// chaque Grand Prix (« Competition Notes - Circuit Map… », encadré « CIRCUIT DATA »).
// Exemple (Bakou 2026) : OVERTAKE DETECTION - 90m after T16 · ACTIVATION - 20m before T17 ·
// STRAIGHT MODE 45m after T19 - ZONE A1 - 45m after T20 (activation adhérence normale / faible).
// Lu par le serveur de Paddock Live (analytics/zones.js).
import { lines } from './fia-tech.js';

// « 45m after T19 » -> { m: 45, dir: 1, turn: 19 } ; « at T5 » -> { m: 0, … }
export function parsePoint(text) {
  const t = String(text || '');
  const m = /(\d+(?:[.,]\d+)?)\s*m\s+(after|before)\s+T(?:urn)?\s*(\d+)/i.exec(t);
  if (m) return { m: Number(m[1].replace(',', '.')), dir: /after/i.test(m[2]) ? 1 : -1, turn: Number(m[3]), text: m[0] };
  // « at T5 », « Entry T11 », « T11 » : au virage lui-même
  const at = /\bT(?:urn)?\s*(\d+)\b/i.exec(t);
  return at ? { m: 0, dir: 1, turn: Number(at[1]), text: t.replace(/^\s*-\s*/, '').trim() } : null;
}

// Pages du PDF ([{x, y, s}]) -> { detection, activation, zones: [{ name, normal, low }] } ou null
export function parseCircuitData(pages) {
  for (const items of pages) {
    const head = items.find((i) => /^CIRCUIT DATA$/i.test(i.s.trim()));
    if (!head) continue;
    const ot = items.find((i) => /^OVERTAKE$/i.test(i.s.trim()) && Math.abs(i.y - head.y) < 4);
    const sm = items.find((i) => /^STRAIGHT MODE$/i.test(i.s.trim()) && Math.abs(i.y - head.y) < 4);
    // Lignes du tableau : sous l'en-tête, sur une quarantaine de points. Les valeurs sont lues
    // par rapport aux libellés (DETECTION / ACTIVATION : texte suivant ; ZONE : textes de part et
    // d'autre des tirets), car un long texte aligné à droite peut déborder sur la colonne voisine.
    const rows = lines(items.filter((i) => i.y < head.y - 2 && i.y > head.y - 45));
    const out = { detection: null, activation: null, zones: [] };
    const isDash = (it) => it && /^\s*-\s*$/.test(it.s);
    for (const row of rows) {
      const its = row.items;
      its.forEach((it, k) => {
        const label = it.s.trim().toUpperCase();
        if (ot && (label === 'DETECTION' || label === 'ACTIVATION') && its[k + 1]) {
          const key = label === 'DETECTION' ? 'detection' : 'activation';
          if (!out[key]) out[key] = parsePoint(its[k + 1].s);
        }
        const z = /^ZONE\s*([A-Z]?\d+)$/i.exec(it.s.trim());
        if (sm && z) {
          const before = isDash(its[k - 1]) ? its[k - 2] : its[k - 1];
          const after = isDash(its[k + 1]) ? its[k + 2] : its[k + 1];
          out.zones.push({ name: z[1].toUpperCase(), normal: before ? parsePoint(before.s) : null, low: after ? parsePoint(after.s) : null });
        }
      });
    }
    if (out.detection || out.activation || out.zones.length) return out;
  }
  return null;
}
