// Grille de départ officielle de la FIA (« Provisional / Final Starting Grid », « … Sprint Starting
// Grid ») : document des commissaires lu dans le PDF (texte positionné { x, y, s } de pdf.js), avec
// les départs des stands et les pénalités. Partagé entre le serveur de Paddock Live (carte « Avant le départ » de
// l'accueil, analytics/fia-tech.js) et la page du créateur.

// Documents de grille d'un Grand Prix : le plus récent du bon type (sprint ou course), définitif
// de préférence
export function gridDocument(docs, { sprint = false } = {}) {
  const list = (docs || []).filter((d) => /starting grid/i.test(d.title || '') && /sprint/i.test(d.title) === !!sprint);
  const rank = (d) => (/final/i.test(d.title) ? 1 : 0);
  return list.sort((a, b) => rank(b) - rank(a) || (b.published || 0) - (a.published || 0))[0] || null;
}

const NUM = /^\d{1,2}$/;
// « Charles LECLERC », « Kimi ANTONELLI * », « Nico HULKENBERG »
const DRIVER = /^(\p{Lu}[\p{L}'.-]*(?: \p{L}[\p{L}'.-]*)*?) (\p{Lu}[\p{Lu}'-]+(?: \p{Lu}[\p{Lu}'-]+)*)( \*)?$/u;

export function parseStartingGrid(pages) {
  const page = pages.find((items) => items.some((i) => /starting grid$/i.test(i.s.trim())) && items.some((i) => DRIVER.test(i.s.trim())));
  if (!page) return null;
  const items = page.map((i) => ({ ...i, s: i.s.trim() }));
  const head = items.find((i) => /starting grid$/i.test(i.s));
  const pitY = items.find((i) => /START FROM THE PIT LANE/i.test(i.s))?.y ?? -Infinity;
  const penY = items.find((i) => /^\*\s*PENALTIES/i.test(i.s))?.y ?? -Infinity;
  const notesY = items.find((i) => /^NOTES$/i.test(i.s))?.y ?? -Infinity;
  const rows = [];
  for (const it of items) {
    const m = DRIVER.exec(it.s);
    if (!m || it.y <= Math.max(penY, notesY) || it.y >= head.y) continue;
    const car = items.find((c) => NUM.test(c.s) && Math.abs(c.y - it.y) <= 2 && c.x < it.x && it.x - c.x < 40);
    if (!car) continue;
    // Position : nombre seul juste sous la ligne du pilote, à gauche du numéro
    const pos = items.find((p) => NUM.test(p.s) && p !== car && p.y < it.y && it.y - p.y <= 9 && p.x < car.x - 4 && car.x - p.x < 45);
    const team = items.filter((t) => t.y < it.y && it.y - t.y <= 16 && Math.abs(t.x - it.x) <= 3 && t !== it && !/^\d+:\d/.test(t.s))
      .sort((a, b) => b.y - a.y)[0];
    rows.push({ num: car.s, first: m[1], last: m[2].charAt(0) + m[2].slice(1).toLowerCase().replace(/([ '-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()), lastUp: m[2], team: team?.s || '', pos: pos ? Number(pos.s) : null, pitlane: it.y < pitY, star: !!m[3], y: it.y });
  }
  if (!rows.length) return null;
  // Ordre de la grille ; départs des stands à la suite
  rows.sort((a, b) => (a.pitlane - b.pitlane) || ((a.pos ?? 99) - (b.pos ?? 99)) || (b.y - a.y));
  let last = 0;
  for (const r of rows) { if (r.pos) last = Math.max(last, r.pos); else r.pos = ++last; delete r.y; }
  // Pénalités : « Car 14 - 30 place grid penalty - Additional power unit elements … - Stewards' … »
  const penalties = [];
  for (const it of items.filter((i) => i.y < penY && /^Cars? [\d ,&and]+ - /i.test(i.s)).sort((a, b) => b.y - a.y)) {
    const cars = (/^Cars? ([\d ,&and]+?) - /i.exec(it.s)?.[1].match(/\d+/g)) || [];
    const text = it.s.replace(/^Cars? [\d ,&and]+ - /i, '').replace(/\s*-\s*Stewards'.*$/i, '').trim();
    penalties.push({ cars, text, fr: penaltyFr(text) });
  }
  const title = head.s;
  return { final: /final/i.test(title), sprint: /sprint/i.test(title), rows, penalties };
}

const REASONS = [
  [/additional power unit elements/i, 'éléments moteur supplémentaires'],
  [/gearbox/i, 'boîte de vitesses changée'],
  [/impeding/i, 'a gêné un autre pilote'],
  [/yellow flag/i, 'pas assez ralenti sous drapeau jaune'],
  [/red flag/i, 'non-respect du drapeau rouge'],
  [/parc ferm/i, 'voiture modifiée sous régime de parc fermé'],
  [/unsafe release/i, 'sortie des stands dangereuse'],
  [/collision/i, 'accrochage'],
  [/track limits/i, 'limites de piste'],
  [/speeding in the pit lane/i, 'excès de vitesse aux stands'],
  [/survival cell|chassis/i, 'châssis changé'],
];

// « 30 place grid penalty - Additional power unit … » -> « recul de 30 places (éléments moteur supplémentaires) »
export function penaltyFr(text) {
  const parts = String(text).split(/\s+-\s+/);
  const what = parts[0] || '';
  const why = parts.slice(1).join(' - ');
  const n = /(\d+)\s*place/i.exec(what)?.[1];
  const head = /pit lane/i.test(what) ? 'départ des stands' : /back of the grid/i.test(what) ? 'départ en fond de grille' : n ? `recul de ${n} places` : what.toLowerCase();
  const reason = REASONS.find(([re]) => re.test(why))?.[1] || why.toLowerCase();
  return reason ? `${head} (${reason})` : head;
}
