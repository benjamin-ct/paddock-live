// Tracés des circuits (public/data/f1-circuits.json, d'après bacinger/f1-circuits, licence MIT : une ligne de
// points [longitude, latitude] par circuit) : tracé d'un Grand Prix retrouvé par sa position et dessin simplifié.
// Fonctions pures (testées), pour le radar de la Météo et le Calendrier de la Saison.

// Tracé du circuit le plus proche d'une position (moins de maxKm) : le calendrier donne la position du circuit, le
// tracé commence à quelques centaines de mètres (1,2 km au plus pour Las Vegas)
export function nearestShape(shapes, lat, lon, maxKm = 15) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null, bd = maxKm;
  for (const c of shapes || []) {
    const [x, y] = c.line[0];
    const d = Math.hypot((x - lon) * 111 * Math.cos((lat * Math.PI) / 180), (y - lat) * 111);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// Dessin du tracé dans un carré 100 × 100 (points « x,y x,y… »), nord en haut comme sur la carte : longitudes
// resserrées selon la latitude, tracé centré, la plus grande dimension sur 92
export function shapeOutline(line) {
  if (!line?.length) return '';
  const k = Math.cos((line[0][1] * Math.PI) / 180);
  const pts = line.map(([lon, lat]) => [lon * k, -lat]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const s = 92 / (Math.max(w, h) || 1), ox = (100 - w * s) / 2, oy = (100 - h * s) / 2;
  return pts.map(([x, y]) => `${(ox + (x - x0) * s).toFixed(1)},${(oy + (y - y0) * s).toFixed(1)}`).join(' ');
}
