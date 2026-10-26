// Arrêts aux stands au centième : DHL Fastest Pit Stop Award (inmotion.dhl), publié après chaque Grand Prix de la
// saison en cours. La F1 ne donne l'immobilisation qu'au dixième ; DHL la donne au centième pour chaque arrêt
// (écurie, nom du pilote, tour). Reprise à titre d'information, sans but commercial, avec la mention demandée
// par les conditions d'utilisation de DHL (dhl.com → Terms of use).
export const DHL_PAGE = 'https://inmotion.dhl/en/formula-1/fastest-pit-stop-award';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const ENT = { amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const text = (s) => s.replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-zA-Z])(uml|acute|grave|circ|tilde|cedil|ring);/g, '$1')
  .replace(/&(\w+);/g, (m, k) => ENT[k] ?? m).trim();
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// Adresses des données de la page (elles changent à chaque saison) : { event, average } ou null
export function dhlElements(html) {
  const url = (id) => new RegExp(`id="${id}"[^>]*data-url="(/api/[^"]+)"`).exec(html || '')?.[1];
  const event = url('element_event'), average = url('element_average');
  return event && average ? { event, average } : null;
}

// Grands Prix de la saison (bloc « moyennes ») : [{ id, date: 'AAAA-MM-JJ' }]
export const dhlEvents = (json) => (json?.data?.chart?.events || [])
  .map((e) => ({ id: e.id, date: String(e.date?.date || '').slice(0, 10) })).filter((e) => e.id && e.date);

// Grand Prix DHL d'une course (date de la course, à 3 jours près : DHL date parfois le jeudi ou le vendredi)
export function dhlEventFor(events, date) {
  const t = Date.parse(String(date || '').slice(0, 10));
  let best = null, gap = 3 * 86400e3;
  for (const e of events) {
    const g = Math.abs(Date.parse(e.date) - t);
    if (g <= gap) { gap = g; best = e; }
  }
  return best;
}

// Tableau de tous les arrêts d'un Grand Prix (htmlList.table) : [{ team, last, time, lap }]
export function parseDhlTable(html) {
  const out = [];
  for (const row of String(html || '').split(/<tr[^>]*>/).slice(1)) {
    const td = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    const time = Number(td[3]), lap = Number(td[4]);
    if (td.length >= 5 && td[2] && time > 0 && Number.isInteger(lap) && lap > 0) out.push({ team: td[1], last: td[2], time, lap });
  }
  return out;
}

// Arrêts DHL des courses demandées ([{ round, date }]) : Map(manche -> lignes). get(url, json) lit une adresse
// (texte, ou JSON si json est vrai). Grand Prix pas encore publié par DHL : absent de la réponse.
export async function fetchDhl(races, get, page = DHL_PAGE) {
  const out = new Map();
  if (!races.length) return out;
  const site = new URL(page).origin;
  const el = dhlElements(await get(page, false));
  if (!el) return out;
  const events = dhlEvents(await get(site + el.average, true));
  for (const r of races) {
    const e = dhlEventFor(events, r.date);
    if (!e) continue;
    const j = await get(`${site}${el.event}?event=${e.id}`, true).catch(() => null);
    const rows = parseDhlTable(j?.htmlList?.table);
    if (rows.length) out.set(r.round, rows);
  }
  return out;
}

// Statistiques d'une course (summarizeRace) avec les arrêts DHL : immobilisation au centième (dhl: true) pour les
// arrêts retrouvés (même pilote, même tour, sinon à un tour près) ; arrêt absent des données F1 : ajouté.
export function withDhl(race, rows) {
  if (!race || !rows?.length) return race;
  const drivers = race.drivers.map((d) => {
    const mine = rows.filter((r) => norm(r.last) === norm(d.last || String(d.name || '').split(' ').pop()));
    if (!mine.length) return d;
    const stops = d.stops.map((s) => ({ ...s }));
    for (const r of mine) {
      const s = stops.find((x) => !x.dhl && x.lap === r.lap) || stops.find((x) => !x.dhl && Math.abs(x.lap - r.lap) === 1);
      if (s) Object.assign(s, { stop: r.time, dhl: true });
      else stops.push({ lap: r.lap, stop: r.time, lane: null, dhl: true });
    }
    stops.sort((a, b) => (a.lap ?? 0) - (b.lap ?? 0));
    return { ...d, stops, stopCount: Math.max(d.stopCount ?? 0, stops.length) };
  });
  const all = drivers.flatMap((d) => d.stops);
  const med = median(all.map((s) => s.stop).filter((v) => v > 0 && v < 30));
  return { ...race, drivers, dhl: true, profile: { ...race.profile, stops: all.length, stopMedian: med === null ? null : Math.round(med * 100) / 100 } };
}
