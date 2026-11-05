// Chiffres de la Saison partagés par l'Accueil (cartes du tableau de bord) et par les rubriques de la Saison : mêmes
// calculs des deux côtés. Petit module chargé par l'Accueil après son premier affichage (la Saison et ses modules restent
// chargés à la demande) ; les réponses du serveur lues par l'Accueil sont reprises par la Saison au lieu d'être relues.
import { api } from '../util.js';
import { DEC, EN, LANG } from '../i18n.js';
import { gpShort } from '/shared/gp-names.js';
import { shortTeams } from '/shared/season-calc.js';
import { destructors } from '/shared/destructors.js';

export { standingsAfter, teamShort } from '/shared/season-calc.js';

// Réponses demandées par l'Accueil, gardées 10 minutes : la Saison ouverte entre-temps les reprend une fois (takeEarly)
const KEEP = 10 * 60e3;
const early = new Map();   // adresse -> { at, p }
export function seasonGet(path) {
  const e = early.get(path);
  if (e && Date.now() - e.at < KEEP) return e.p;
  const p = api(path).then(shortTeams);
  p.catch(() => early.delete(path));
  early.set(path, { at: Date.now(), p });
  return p;
}
export function takeEarly(path) {
  const e = early.get(path);
  early.delete(path);
  return e && Date.now() - e.at < KEEP ? e.p : null;
}

// Immobilisation : au centième avec le relevé DHL, sinon au dixième (chronos de la F1)
export const stopTxt = (s) => `${s?.stop === null || s?.stop === undefined || Number.isNaN(s.stop) ? '—' : s.stop.toFixed(s.dhl ? 2 : 1).replace('.', DEC)} s`;
// Montants arrondis : 2,24 M$ ou 960 k$ (anglais : $2.24M, $960k)
export const usd = (v) => {
  const n = v >= 1e6 ? `${(v / 1e6).toFixed(v % 1e6 ? 2 : 0).replace('.', DEC)} M` : `${Math.round(v / 1e3)} k`;
  return EN ? `$${n.replace(' ', '')}` : `${n}$`;
};

// Arrêts aux stands des courses analysées, avec leur pilote et leur manche ; immobilisation plausible : entre 0 et 15 s
export const pitStops = (stats) => (stats?.races || []).flatMap((race) => race.drivers.flatMap((d) => d.stops.map((s) => ({ ...s, d, round: race.round }))));
export const validStop = (s) => s.stop > 0 && s.stop < 15;

// Épreuves des documents FIA (hors essais) rattachées à une manche du calendrier
export function fiaEvents(races, fia) {
  return (fia?.events || []).filter((e) => e.tech || e.used).map((e) => {
    const race = races.find((r) => {
      const d = Date.parse(r.date);
      return d >= e.first - 2 * 86400e3 && d <= e.first + 10 * 86400e3;
    });
    return { ...e, round: race?.round || null, label: race ? `R${race.round}` : gpShort(e.name, LANG).slice(0, 3) };
  }).sort((a, b) => (a.round ?? 99) - (b.round ?? 99) || a.first - b.first);
}

// Éléments moteur de chaque pilote d'après le relevé FIA d'un Grand Prix, plus les éléments neufs montés pendant ce Grand Prix
export const elementsUsed = (ev) => ev.used.drivers.map((d) => {
  const used = { ...d.used };
  for (const f of ev.fresh.filter((x) => x.num === d.num)) used[f.element] = Math.max(used[f.element] || 0, (f.previous || 0) + 1);
  return { ...d, used, total: ev.used.elements.reduce((n, e) => n + (used[e] || 0), 0) };
});

// ---------- Cartes de l'Accueil : chiffre de la saison et sa part due à la dernière manche comptée ----------
// upTo : dernière manche comptée (manche dont le résultat reste masqué exclue), sinon toutes
export function fastestStop(stats, upTo = Infinity) {
  return pitStops(stats).filter((s) => validStop(s) && s.round <= upTo).sort((a, b) => a.stop - b.stop)[0] || null;
}
export function damage(rows = [], upTo = Infinity) {
  const kept = rows.filter((r) => r.round <= upTo);
  if (!kept.length) return null;
  const round = Math.max(...kept.map((r) => r.round));
  const total = destructors(kept).total;
  return { total, delta: total - destructors(kept.filter((r) => r.round < round)).total, round };
}
export function elementsTotal(races, fia) {
  const evs = fiaEvents(races, fia).filter((e) => e.used);
  const sum = (ev) => elementsUsed(ev).reduce((n, d) => n + d.total, 0);
  const [prev, cur] = evs.slice(-2).length === 2 ? evs.slice(-2) : [null, evs.at(-1)];
  return cur ? { total: sum(cur), delta: prev ? sum(cur) - sum(prev) : null, ev: cur } : null;
}
export function techTotal(races, fia) {
  const evs = fiaEvents(races, fia).filter((e) => e.tech);
  return evs.length ? { total: evs.reduce((n, e) => n + e.tech.length, 0), delta: evs.at(-1).tech.length, ev: evs.at(-1) } : null;
}
