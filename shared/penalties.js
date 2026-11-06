// Permis à points des pilotes et sanctions de la saison, d'après les décisions des commissaires publiées par la FIA
// (champ « Decision » des PDF, lu par shared/fia-tech.js). Fonctions pures : serveur (analytics/fia-tech.js) et tests.
// Règle (FIA 2026 F1 Regulations, Section A, article A3.3.1 b) : des points de pénalité peuvent accompagner une
// sanction autre qu'une réprimande ou une amende ; un pilote qui atteint 12 points est suspendu pour la compétition
// suivante, puis 12 points lui sont retirés ; chaque point est retiré au 12e mois anniversaire de son imposition.

export const LIMIT = 12;
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

// « 10 second time penalty. 2 penalty points (total of 6 for the 12 month period). » -> { points: 2, total: 6 } ;
// « One penalty point is imposed, making a total of 1… » ; « (7 points in total) » ; null sans point
export function pointsOf(decision) {
  const m = /\b(\d+|one|two|three|four|five|six)\s+penalty points?\b/i.exec(String(decision || ''));
  if (!m) return null;
  const points = Number(m[1]) || WORDS[m[1].toLowerCase()];
  const t = /total of (\d+)|(\d+) points in total/i.exec(decision);
  return { points, total: t ? Number(t[1] || t[2]) : null };
}

// Sanction d'une décision : { kind, n } (n : secondes, places, euros) ; null si aucune sanction (« No further action »,
// « No penalty… ») ou décision illisible
export function sanctionOf(decision) {
  const d = String(decision || '');
  let m;
  if (!d || /^no (further action|penalty)/i.test(d)) return null;
  if (/disqualif/i.test(d)) return { kind: 'dsq' };
  if (/licence .*suspended|suspended for the next/i.test(d)) return { kind: 'ban' };
  if (/stop[\s-]*and[\s-]*go/i.test(d)) return { kind: 'stopgo' };
  if (/drive[\s-]*through/i.test(d)) return { kind: 'drive' };
  if ((m = /(\d+)\s*seconds? time penalty/i.exec(d))) return { kind: 'time', n: Number(m[1]) };
  if ((m = /drop of (\d+|one|two|three|four|five|six)\s+grid positions?/i.exec(d))) return { kind: 'grid', n: Number(m[1]) || WORDS[m[1].toLowerCase()] };
  if (/pit ?lane/i.test(d) && /start/i.test(d)) return { kind: 'pitlane' };
  if (/back of the (starting )?grid/i.test(d)) return { kind: 'back' };
  if ((m = /fined €\s?([\d,. ]+)/i.exec(d))) return { kind: 'fine', n: Number(m[1].replace(/[^\d]/g, '')) };
  if (/reprimand/i.test(d)) return { kind: 'reprimand' };
  if (/warning/i.test(d)) return { kind: 'warning' };
  return { kind: 'other' };
}

// Date du retrait d'un point : le même jour, un an plus tard (UTC)
export function expiry(at) {
  const d = new Date(at);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.getTime();
}

const key = (name) => String(name || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

// Points de chaque pilote à la date `at` : decisions [{ driver, num, competitor, published, decision, … }] (toutes les
// épreuves des 12 derniers mois au moins) -> [{ driver, num, competitor, total, points: [{ n, at, expires, … }],
// bans: [date] }], les plus chargés d'abord. Pilote reconnu par son nom (le numéro peut changer d'une saison à l'autre)
export function licencePoints(decisions, at) {
  const by = new Map();
  for (const d of [...decisions].filter((x) => x.published <= at).sort((a, b) => a.published - b.published)) {
    const p = pointsOf(d.decision);
    if (!p) continue;
    const k = key(d.driver);
    if (!by.has(k)) by.set(k, { driver: d.driver, num: d.num, competitor: d.competitor, active: [], bans: [] });
    const x = by.get(k);
    Object.assign(x, { driver: d.driver, num: d.num, competitor: d.competitor });
    x.active = x.active.filter((e) => e.expires > d.published);
    x.active.push({ n: p.points, total: p.total, at: d.published, expires: expiry(d.published), event: d.event, title: d.title, url: d.url, decision: d.decision });
    // 12 points atteints : suspension, puis 12 points retirés (les plus anciens d'abord)
    if (x.active.reduce((s, e) => s + e.n, 0) >= LIMIT) {
      x.bans.push(d.published);
      let left = LIMIT;
      for (const e of x.active) { const r = Math.min(e.n, left); e.n -= r; left -= r; }
      x.active = x.active.filter((e) => e.n > 0);
    }
  }
  return [...by.values()].map(({ active, bans, ...x }) => {
    const points = active.filter((e) => e.expires > at);
    return { ...x, total: points.reduce((s, e) => s + e.n, 0), points, bans: bans.filter((b) => expiry(b) > at) };
  }).filter((x) => x.total || x.bans.length).sort((a, b) => b.total - a.total || a.driver.localeCompare(b.driver));
}
