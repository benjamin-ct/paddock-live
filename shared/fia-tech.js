// Évolutions techniques et éléments moteur de la saison, lus dans les documents officiels de la FIA publiés à chaque
// Grand Prix (fia.com) : lecture des PDF et des tableaux, communs à l'appli (server/fia-tech.js) et au serveur de la
// version web (analytics/fia-tech.js).

export const FIA_VERSION = 5;

// ---------------- Lecture des PDF ----------------
let pdfLib = null;
export async function pdfPages(buf) {
  // Chargé à la demande (Node 22+ requis par la bibliothèque)
  if (!pdfLib) {
    try { pdfLib = await import('unpdf'); } catch (err) {
      throw new Error(`lecture des PDF impossible (Node.js 22 ou plus récent requis : ${err.message})`);
    }
  }
  const pdf = await pdfLib.getDocumentProxy(new Uint8Array(buf), { verbosity: 0 });
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str })));
  }
  await pdf.destroy?.();
  return pages;
}

// Regroupe les morceaux de texte d'une page en lignes (même hauteur à 2,5 pt près), de haut en bas.
export function lines(items) {
  const rows = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2.5);
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.text = r.items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
  }
  return rows;
}

const joinText = (items) => items.sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').replace(/ - /g, ' - ').trim();

// « Car Presentation Submissions » : [{ team, n, component, type, reason, geometry, description }]
export function parseTechUpdates(pages) {
  const out = [];
  const noUpdates = [];
  let team = null;
  let cols = null;
  for (const items of pages) {
    const rows = lines(items);
    const ti = rows.findIndex((r) => /^Car Presentation/i.test(r.text));
    // En-tête du tableau : positions des colonnes
    const head = rows.find((r) => /Updated/.test(r.text) && /Primary/.test(r.text));
    // Écurie : la ligne sous le titre « Car Presentation » ; dans les documents de 2024, seule la première page a ce
    // titre, les suivantes n'ont que le nom de l'écurie au-dessus du tableau
    const name = ti >= 0 ? rows[ti + 1] : head && rows.filter((r) => r.y > head.y && teamOf(r.text).teamId).at(-1);
    let top = Infinity;
    if (name) {
      team = name.text;
      top = name.y - 1;
      if (rows.some((r) => /No updates?\b.*\b(submitted|for this event)/i.test(r.text))) noUpdates.push(team);
    }
    if (head) {
      const x = (re) => head.items.find((i) => re.test(i.s))?.x;
      cols = { reason: x(/Primary/) - 12, geom: x(/Geometric/) - 26, desc: x(/Brief/) - 16 };
      top = head.y - 18;   // sous la 2e ligne de l'en-tête
    }
    if (!team || !cols) continue;
    const body = items.filter((i) => i.y < top && !/^Car Presentation/.test(i.s));
    const anchors = body.filter((i) => i.x < 100 && /^\d{1,2}$/.test(i.s.trim())).sort((a, b) => b.y - a.y);
    const pageRows = [];
    anchors.forEach((a, k) => {
      const hi = k ? (anchors[k - 1].y + a.y) / 2 : top;
      const lo = anchors[k + 1] ? (anchors[k + 1].y + a.y) / 2 : -Infinity;
      const cell = body.filter((i) => i !== a && i.y <= hi && i.y > lo && !FOOTER.test(i.s));
      const col = (from, to) => joinText(cell.filter((i) => i.x >= from && i.x < to));
      const row = {
        team, n: Number(a.s), y: a.y, component: col(95, cols.reason), reasonTxt: col(cols.reason, cols.geom),
        geometry: col(cols.geom, cols.desc), description: col(cols.desc, 2000),
      };
      if (row.component || row.reasonTxt || row.geometry) pageRows.push(row);
    });
    // Cellules fusionnées (une même raison pour plusieurs lignes) : raison de la ligne la plus proche
    const kind = (r) => (classify(r.reasonTxt).type ? classify(r.reasonTxt) : classify(`${r.reasonTxt} ${r.component}`));
    for (const r of pageRows) {
      if (kind(r).type) continue;
      const near = pageRows.filter((o) => o !== r && classify(o.reasonTxt).type).sort((x, y) => Math.abs(x.y - r.y) - Math.abs(y.y - r.y))[0];
      if (near) r.reasonTxt = near.reasonTxt;
    }
    for (const r of pageRows) {
      const c = kind(r);
      out.push({
        team: r.team, n: r.n, component: cleanComponent(r.component), type: c.type || 'Performance', reason: c.reason || 'Unknown',
        reasonText: r.reasonTxt, geometry: r.geometry, description: r.description,
      });
    }
  }
  return { updates: out.filter((u) => u.component || u.description), noUpdates };
}

const FOOTER = /All Rights Reserved|Highly Confidential|^©/i;

// Type et raison normalisés (libellés FIA, écrits différemment selon les écuries)
const REASONS = [
  [/local load|local flow|downforce/i, 'Local Load'], [/flow|wake|onset|rear flow/i, 'Flow Conditioning'],
  [/brake cool/i, 'Brake Cooling'], [/cooling range|cooling level/i, 'Cooling Range'], [/cool/i, 'Cooling'],
  [/drag range/i, 'Drag Range'], [/drag/i, 'Drag Reduction'], [/balance/i, 'Balance Range'],
  [/reliab/i, 'Reliability'], [/mechanical|setup|set-up/i, 'Mechanical Setup'], [/structur|robust|stiff/i, 'Structural Improvement'],
  [/correlation/i, 'Correlation'], [/weight|mass/i, 'Weight'],
];
export function classify(text) {
  const t = String(text || '');
  const type = /circuit/i.test(t) ? 'Circuit specific' : /reliab/i.test(t) ? 'Reliability' : /structur/i.test(t) ? 'Structural Improvement'
    : /perform|local load|flow|drag reduction|correlation|mechanical/i.test(t) ? 'Performance'
      : /balance range|cooling range|drag range/i.test(t) ? 'Circuit specific' : null;
  const reason = REASONS.find(([re]) => re.test(t.replace(/^.*?(performance|circuit specific|reliability)\s*[-–]?\s*/i, '') || t))?.[1] || REASONS.find(([re]) => re.test(t))?.[1] || null;
  return { type, reason };
}
const cleanComponent = (c) => c.replace(/\bPerformance\b|[–-]\s*$/gi, '').replace(/^\d+\s+/, '').replace(/\s+/g, ' ').trim();

const ELEMENT = (s) => s.toUpperCase().replace(/^PU-/, '').replace(/^EXH$/, 'EX').replace(/\s+/g, '');

// « PU Elements used per Driver up to now » : { elements: ['ICE', …], drivers: [{ num, team, driver, used: { ICE: 4, … } }] }
export function parsePuUsed(pages) {
  for (const items of pages) {
    const rows = lines(items);
    const head = rows.find((r) => r.items.some((i) => i.s.trim() === 'Driver') && r.items.some((i) => /^ICE$/.test(i.s.trim())));
    if (!head) continue;
    const driverX = head.items.find((i) => i.s.trim() === 'Driver').x;
    // Libellés des colonnes, parfois sur plusieurs lignes (« MGU » / « -K », « PU- » / « CE »)
    const headItems = items.filter((i) => Math.abs(i.y - head.y) <= 14 && i.x > driverX + 40 && !/^\d+$/.test(i.s.trim())).sort((a, b) => b.y - a.y);
    const clusters = [];
    for (const it of headItems) {
      const c = clusters.find((k) => Math.abs(k.x - it.x) <= 14);
      if (c) { c.parts.push(it); c.x = Math.min(c.x, it.x); } else clusters.push({ x: it.x, parts: [it] });
    }
    const colsX = clusters.map((c) => ({ x: c.x + 6, code: ELEMENT(c.parts.sort((a, b) => b.y - a.y).map((p) => p.s.trim()).join('')) })).sort((a, b) => a.x - b.x);
    const drivers = [];
    for (const r of rows) {
      if (r.y >= head.y - 8) continue;
      const first = r.items[0];
      if (!first || first.x > 70 || !/^\d{1,2}$/.test(first.s.trim())) continue;
      const nums = r.items.filter((i) => i.x > driverX + 40 && /^\d+$/.test(i.s.trim()));
      if (nums.length < 3) continue;
      const used = {};
      for (const n of nums) {
        const c = colsX.reduce((best, k) => (Math.abs(k.x - n.x) < Math.abs(best.x - n.x) ? k : best), colsX[0]);
        used[c.code] = Number(n.s);
      }
      drivers.push({
        num: String(Number(first.s)),
        team: joinText(r.items.filter((i) => i !== first && i.x < driverX - 4)),
        driver: joinText(r.items.filter((i) => i.x >= driverX - 4 && i.x < driverX + 40 && !/^\d+$/.test(i.s.trim()))),
        used,
      });
    }
    if (drivers.length) return { elements: colsX.map((c) => c.code), drivers };
  }
  return { elements: [], drivers: [] };
}

// « New PU Elements for this Competition » : [{ num, driver, element, previous }]
export function parsePuNew(pages) {
  const out = [];
  for (const items of pages) {
    let element = null;
    for (const r of lines(items)) {
      const m = /Previously used\s+([A-Z][A-Z0-9-]*)/.exec(r.text);
      if (m) { element = ELEMENT(m[1]); continue; }
      const first = r.items[0];
      if (element && first && /^\d{1,2}$/.test(first.s.trim()) && first.x < 70) {
        const prev = [...r.items].reverse().find((i) => /^\d+$/.test(i.s.trim()) && i !== first);
        const driver = joinText(r.items.filter((i) => i !== first && i !== prev && i.x > 250));
        out.push({ num: String(Number(first.s)), driver, element, previous: prev ? Number(prev.s) : null });
      } else if (element && first && first.x < 70 && /^[A-Za-z]/.test(first.s)) {
        element = null;   // fin du tableau (paragraphe)
      }
    }
  }
  return out;
}

// Décision des commissaires sur des éléments moteur : { num, driver, fact, decision }
export function parsePuPenalty(pages) {
  const rows = pages.flatMap((p) => lines(p));
  const field = (label) => {
    const i = rows.findIndex((r) => new RegExp(`^${label}\\b`).test(r.text));
    if (i < 0) return '';
    const txt = [rows[i].text.replace(new RegExp(`^${label}\\s*`), '')];
    for (let k = i + 1; k < rows.length && rows[k].items[0].x > 90; k++) txt.push(rows[k].text);
    return txt.join(' ').trim();
  };
  const who = /(\d{1,2})\s*-\s*(.+)/.exec(field('No / Driver'));
  return { num: who ? String(Number(who[1])) : null, driver: who?.[2] || '', fact: field('Fact'), decision: field('Decision') };
}

// ---------------- Équipes ----------------
const TEAMS = [
  [/racing bulls|visa cash|alphatauri|toro rosso|\brb f1/i, 'Racing Bulls', 'rb'],
  [/red bull/i, 'Red Bull Racing', 'red_bull'],
  [/mclaren/i, 'McLaren', 'mclaren'],
  [/mercedes-amg|^mercedes\b/i, 'Mercedes', 'mercedes'],
  [/ferrari/i, 'Ferrari', 'ferrari'],
  [/aston/i, 'Aston Martin', 'aston_martin'],
  [/williams/i, 'Williams', 'williams'],
  [/alpine/i, 'Alpine', 'alpine'],
  [/haas/i, 'Haas F1 Team', 'haas'],
  [/sauber|kick/i, 'Kick Sauber', 'sauber'],
  [/audi/i, 'Audi', 'audi'],
  [/cadillac/i, 'Cadillac', 'cadillac'],
];
// Nom d'écurie normalisé (« Haas Ferrari » -> Haas : l'écurie d'abord, le motoriste ensuite)
export function teamOf(name) {
  const raw = String(name || '');
  // Texte parfois coupé au milieu d'un mot dans les PDF (« C adillac ») : on essaie aussi sans espaces
  const n = TEAMS.some(([re]) => re.test(raw)) ? raw : raw.replace(/\s+/g, '');
  const order = [...TEAMS].sort((a, b) => (n.search(a[0]) < 0 ? 1e9 : n.search(a[0])) - (n.search(b[0]) < 0 ? 1e9 : n.search(b[0])));
  const hit = order.find(([re]) => re.test(n));
  return hit ? { team: hit[1], teamId: hit[2] } : { team: raw, teamId: '' };
}

// Données d'une épreuve d'après ses documents. documents(page) : liste des documents de la page de l'épreuve ;
// parsed(url, lecteur) : PDF lu par le lecteur (gardé par l'appelant)
export async function eventData(ev, { documents, parsed }) {
  const docs = await documents(ev.page);
  if (!docs.length) return null;
  const dates = docs.map((d) => d.published).filter(Boolean);
  const out = { name: ev.name, page: ev.page, first: Math.min(...dates), last: Math.max(...dates), tech: null, noUpdates: [], used: null, fresh: [], penalties: [], docs: {} };
  const cps = docs.find((d) => /Car Presentation Submissions/i.test(d.title));
  if (cps) {
    const t = await parsed(cps.url, parseTechUpdates);
    out.tech = t.updates.map((u) => ({ ...u, ...teamOf(u.team) }));
    out.noUpdates = t.noUpdates.map((n) => teamOf(n).team);
    out.docs.tech = cps.url;
  }
  const used = docs.find((d) => /PU Elements used per Driver/i.test(d.title));
  if (used) {
    const u = await parsed(used.url, parsePuUsed);
    out.used = { elements: u.elements, drivers: u.drivers.map((d) => ({ ...d, car: d.team, engine: (/(Honda RBPT|Mercedes|Ferrari|Honda|Ford|Audi|Renault)\s*$/i.exec(d.team) || [])[1] || '', ...teamOf(d.team) })) };
    out.docs.used = used.url;
  }
  for (const d of docs.filter((x) => /New PU Elements/i.test(x.title))) {
    for (const e of await parsed(d.url, parsePuNew)) if (!out.fresh.some((f) => f.num === e.num && f.element === e.element && f.previous === e.previous)) out.fresh.push(e);
  }
  for (const d of docs.filter((x) => /Infringement|Decision/i.test(x.title) && /\bPU\b|power unit/i.test(x.title))) {
    const p = await parsed(d.url, parsePuPenalty);
    out.penalties.push({ ...p, title: d.title, url: d.url, published: d.published });
  }
  return out;
}
