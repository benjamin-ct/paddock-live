// Chiffres du tableau de bord des statistiques d'utilisation (page /stats) et bilan des fonctions
// (Studio) : compteurs anonymes de la base D1, sur une période.
import { LABELS, FEATURE_GROUPS } from '../shared/stats.js';

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const TIMELINE = { 'app.active': 'active', 'app.open': 'open', 'app.install': 'install', 'session.live': 'live', 'session.replay': 'replay' };
const OS_NAMES = { win: 'Windows', mac: 'macOS', linux: 'Linux', other: 'Autre' };
const DEVICE_NAMES = { desktop: 'Ordinateur (appli)', phone: 'Téléphone / tablette', browser: 'Navigateur' };

// Chiffres du tableau de bord pour les `days` derniers jours (et la période d'avant, pour comparer)
export async function summary(env, days, now = Date.now()) {
  const until = dayOf(now);
  const since = dayOf(now - (days - 1) * 86400e3);
  const prevSince = dayOf(now - (2 * days - 1) * 86400e3);
  const q = (sql, ...p) => env.DB.prepare(sql).bind(...p).all().then((r) => r.results || []);
  const [daily, events, versions, systems, errDetails, errCounts] = await Promise.all([
    q("/*daily*/ SELECT day, event, SUM(n) AS n FROM counts WHERE day >= ?1 AND (event IN ('app.active', 'app.open', 'app.install', 'session.live', 'session.replay') OR event LIKE 'error.%') GROUP BY day, event", prevSince),
    q('/*events*/ SELECT event, device, SUM(n) AS n FROM counts WHERE day >= ?1 GROUP BY event, device', since),
    q("/*versions*/ SELECT version, SUM(n) AS n FROM counts WHERE day >= ?1 AND event = 'app.active' GROUP BY version ORDER BY n DESC", since),
    q("/*systems*/ SELECT os, SUM(n) AS n FROM counts WHERE day >= ?1 AND event = 'app.active' GROUP BY os ORDER BY n DESC", since),
    q('/*errdetails*/ SELECT place, kind, msg, stack, version, device, SUM(n) AS n, MAX(day) AS last FROM error_details WHERE day >= ?1 GROUP BY place, kind, msg, stack, version, device', since).catch(() => []),
    q("/*errcounts*/ SELECT event, version, device, SUM(n) AS n, MAX(day) AS last FROM counts WHERE day >= ?1 AND event LIKE 'error.%' GROUP BY event, version, device", since),
  ]);

  // Séries jour par jour (jours sans données = 0) et totaux de la période précédente
  const dates = Array.from({ length: days }, (_, i) => dayOf(now - (days - 1 - i) * 86400e3));
  const idx = new Map(dates.map((d, i) => [d, i]));
  const keys = ['active', 'open', 'install', 'live', 'replay', 'errors'];
  const series = { dates, ...Object.fromEntries(keys.map((k) => [k, Array(days).fill(0)])) };
  const prev = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of daily) {
    const k = TIMELINE[r.event] || (r.event.startsWith('error.') ? 'errors' : null);
    if (!k) continue;
    if (idx.has(r.day)) series[k][idx.get(r.day)] += r.n;
    else if (r.day < since) prev[k] += r.n;
  }
  prev.activeAvg = prev.active / days;

  const byEvent = new Map();
  for (const r of events) {
    const e = byEvent.get(r.event) || { event: r.event, total: 0, desktop: 0, phone: 0, browser: 0 };
    e.total += r.n;
    if (r.device in e) e[r.device] += r.n;
    byEvent.set(r.event, e);
  }
  const all = [...byEvent.values()].sort((a, b) => b.total - a.total || a.event.localeCompare(b.event));
  const groupOf = (ev) => (ev.split('.')[0] in FEATURE_GROUPS ? ev.split('.')[0] : null);
  const features = all.filter((e) => groupOf(e.event)).map((e) => ({ ...e, group: groupOf(e.event), label: LABELS[e.event] || e.event }));
  const used = new Set(features.map((f) => f.event));
  const unused = Object.keys(LABELS).filter((k) => ['rail', 'tab', 'season', 'tool', 'feature'].includes(k.split('.')[0]) && !used.has(k)).map((k) => LABELS[k]);
  const devices = Object.entries(byEvent.get('app.open') || {}).filter(([k, n]) => k in DEVICE_NAMES && n > 0)
    .map(([k, n]) => ({ label: DEVICE_NAMES[k], n })).sort((a, b) => b.n - a.n);
  const langs = [['lang.fr', 'Français'], ['lang.en', 'Anglais'], ['lang.it', 'Italien'], ['lang.es', 'Espagnol']].map(([k, label]) => ({ label, n: byEvent.get(k)?.total || 0 })).filter((r) => r.n).sort((a, b) => b.n - a.n);

  return {
    days, since, until, series, prev,
    usage: usageReport(byEvent),
    groups: FEATURE_GROUPS,
    features, unused,
    versions: versions.map((r) => ({ label: r.version === 'dev' ? 'dev (développement)' : `v${r.version}`, n: r.n })),
    systems: systems.map((r) => ({ label: OS_NAMES[r.os] || r.os, n: r.n })),
    devices, langs,
    errors: errorRows(errDetails, errCounts),
  };
}

// Erreurs regroupées (endroit, type, message, chemin d'appel) avec versions, appareils et dernier jour.
// Versions d'avant le détail des erreurs (1.27.4 et avant) : compteur seul, « sans détail ».
export const DETAIL_SINCE = [1, 27, 5];
const olderThanDetail = (v) => {
  const p = String(v).split('.').map(Number);
  if (p.length !== 3 || p.some((x) => !Number.isFinite(x))) return false;   // « dev »
  for (let i = 0; i < 3; i++) if (p[i] !== DETAIL_SINCE[i]) return p[i] < DETAIL_SINCE[i];
  return false;
};
function errorRows(details, counts) {
  const rows = new Map();
  const row = (key, base) => rows.get(key) || rows.set(key, { ...base, versions: {}, desktop: 0, phone: 0, browser: 0, total: 0, last: '' }).get(key);
  const addTo = (r, version, device, n, last) => {
    r.versions[version] = (r.versions[version] || 0) + n;
    if (device in r && device !== 'total') r[device] += n;
    r.total += n;
    if (last > r.last) r.last = last;
  };
  for (const d of details) {
    addTo(row(['d', d.place, d.kind, d.msg, d.stack].join('\u0001'), { place: d.place, kind: d.kind, msg: d.msg, stack: d.stack }), d.version, d.device, d.n, d.last);
  }
  for (const c of counts) {
    if (!olderThanDetail(c.version)) continue;
    const place = c.event.replace(/^error\./, '');
    addTo(row(`c\u0001${place}`, { place, kind: place === 'server' ? 'server' : '', msg: '', stack: '', legacy: true }), c.version, c.device, c.n, c.last);
  }
  return [...rows.values()].map((r) => ({ ...r, versions: Object.entries(r.versions).sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n })) }))
    .sort((a, b) => b.total - a.total || b.last.localeCompare(a.last)).slice(0, 60);
}

// Bilan des fonctions (Studio) : utilisations pour 100 ouvertures de l'interface, des plus utilisées aux
// jamais utilisées. Seuils : « souvent » à partir de 20, « rarement » sous 2 (mais pas jamais).
export const USAGE_OFTEN = 20;
export const USAGE_RARE = 2;
const USAGE_GROUPS = ['rail', 'tab', 'season', 'tool', 'feature'];
export function usageReport(byEvent) {
  const total = (k) => byEvent.get(k)?.total || 0;
  const opens = total('app.open');
  const rows = Object.keys(LABELS).filter((k) => USAGE_GROUPS.includes(k.split('.')[0])).map((k) => {
    const n = total(k);
    const per100 = opens ? Math.round((n * 1000) / opens) / 10 : 0;
    const level = !n ? 'never' : per100 >= USAGE_OFTEN ? 'often' : per100 < USAGE_RARE ? 'rare' : 'some';
    return { event: k, label: LABELS[k], group: FEATURE_GROUPS[k.split('.')[0]], n, per100, level };
  }).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  return {
    opens, rows,
    modes: { essential: total('mode.essential'), full: total('mode.full') },
    welcome: { done: total('welcome.done'), skip: total('welcome.skip'), f1tv: total('welcome.f1tv') },
  };
}
