// Pilote du jour (« Driver of the Day », vote des fans pendant chaque Grand Prix) : les 5 premiers et leurs pourcentages,
// lus sur la page des résultats de formula1.com (données de la page, comme les affiche le site en dépliant un Grand
// Prix). Ajoutés aux courses de la saison gardée (season:<année>, race.dotd = [{ code, pct }]) : une lecture de la page
// pour tout le monde, seulement tant qu'une course terminée n'a pas encore son vote (3 jours au plus ensuite).

export const DOTD_URL = (year) => `https://www.formula1.com/en/results/${year}/awards/driver-of-the-day`;
const GIVE_UP = 3 * 86400e3;   // course sans vote publié 3 jours après : plus cherché (tableau vide)

// { 'AAAA-MM-JJ' (fin du week-end) : [{ code, pct }] triés par place } ; {} si la page a changé de forme
export function parseDotd(html) {
  const s = String(html || '').replace(/\\"/g, '"');
  const out = {};
  const parts = s.split('"votePosition":').slice(1);
  for (const p of parts) {
    const pos = Number(/^(\d+)/.exec(p)?.[1]);
    const pct = Number(/"votePercentage":([\d.]+)/.exec(p)?.[1]);
    const date = /"meetingEndDate":"(\d{4}-\d{2}-\d{2})"/.exec(p)?.[1];
    const code = /"driverTLA":"([A-Z]{3})"/.exec(p)?.[1];
    if (!pos || !Number.isFinite(pct) || !date || !code) continue;
    const list = (out[date] ||= []);
    if (!list.some((x) => x.pos === pos)) list.push({ pos, code, pct });
  }
  for (const d of Object.keys(out)) out[d] = out[d].sort((a, b) => a.pos - b.pos).slice(0, 5).map(({ code, pct }) => ({ code, pct }));
  return out;
}

const day = (iso) => String(iso || '').slice(0, 10);
const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) <= 86400e3;   // dimanche de la course, à un jour près

// Saison reconstruite (v) : votes déjà trouvés repris de la précédente (old) ; page relue seulement s'il en manque pour
// une course terminée. Page injoignable : rien ne change, nouvel essai à la reconstruction suivante (30 min)
export async function withDotd(year, v, old, { fetchFn = fetch, now = Date.now() } = {}) {
  if (!v?.races) return v;
  for (const r of v.races) {
    const was = old?.races?.find((x) => x.round === r.round && day(x.date) === day(r.date));
    if (Array.isArray(was?.dotd)) r.dotd = was.dotd;
  }
  const need = v.races.filter((r) => r.results?.length && !Array.isArray(r.dotd));
  if (!need.length) return v;
  let found = null;
  try {
    const res = await fetchFn(DOTD_URL(year), { headers: { 'User-Agent': 'Mozilla/5.0 (Paddock Live)', Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
    if (res.ok) found = parseDotd(await res.text());
  } catch { /* nouvel essai plus tard */ }
  if (!found) return v;
  for (const r of need) {
    const key = Object.keys(found).find((d) => near(d, day(r.date)));
    if (key) r.dotd = found[key];
    else if (now - Date.parse(r.date) > GIVE_UP) r.dotd = [];
  }
  return v;
}
