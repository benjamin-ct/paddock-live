// Essais d'hiver : journées d'essais d'une saison (Accueil hors saison : compte à rebours et programme jour par jour).
// Jolpica ne les a pas. Deux sources :
// - le calendrier d'OpenF1 (/v1/sessions?year=…) : les journées « Day 1 », « Day 2 »… dès la publication du calendrier,
//   mais avec des heures provisoires (horaires « à confirmer » chez la F1) : on n'en garde que le jour sur place ;
// - l'index des archives de la F1 (Index.json, comme les replays) : heures officielles, dès que la F1 y inscrit les
//   essais ; elles remplacent alors celles du jour.
// Journée : { day: 'AAAA-MM-JJ' (sur place), n (numéro), place, country (nom anglais), start, end (ms UTC ; null tant
// que l'heure n'est pas connue) }
import { sessionStartUtc } from './f1.js';
import { localDay } from './agenda.js';

const DAY = /^day (\d+)$/i;
const offsetMs = (gmt) => { const m = /^(-)?(\d{1,2}):(\d{2})/.exec(gmt || ''); return m ? (m[1] ? -1 : 1) * (Number(m[2]) * 3600e3 + Number(m[3]) * 60e3) : 0; };

export function openf1TestDays(sessions) {
  return (Array.isArray(sessions) ? sessions : []).filter((s) => DAY.test(s.session_name || '') && !s.is_cancelled && Date.parse(s.date_start))
    .map((s) => ({ day: new Date(Date.parse(s.date_start) + offsetMs(s.gmt_offset)).toISOString().slice(0, 10), n: Number(DAY.exec(s.session_name)[1]), place: s.circuit_short_name || s.location || '', country: s.country_name || '', start: null, end: null }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// Index.json brut (toutes les séances, y compris celles à venir)
export function indexTestDays(raw) {
  const out = [];
  for (const m of raw?.Meetings || []) {
    if (!/testing/i.test(m.Name || '')) continue;
    for (const s of m.Sessions || []) {
      const start = sessionStartUtc(s);
      if (!DAY.test(s.Name || '') || Number.isNaN(start)) continue;
      const end = sessionStartUtc({ StartDate: s.EndDate, GmtOffset: s.GmtOffset });
      out.push({ day: s.StartDate.slice(0, 10), n: Number(DAY.exec(s.Name)[1]), place: m.Circuit?.ShortName || m.Location || '', country: m.Country?.Name || '', start, end: Number.isNaN(end) ? null : end });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

// Journées des deux sources : celles de l'index (heures officielles) l'emportent, jour par jour
export function mergeTestDays(openf1, index) {
  const byDay = new Map(openf1.map((d) => [d.day, d]));
  for (const d of index) byDay.set(d.day, d);
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Où en sont les essais : journée en cours (de 10 min avant son début à sa fin ; heure pas encore connue : tout le
// jour, d'après la date de l'appareil) et prochaine journée
export function testState(days, now = Date.now()) {
  const today = localDay(now);
  const current = days.find((d) => (d.start ? now >= d.start - 10 * 60e3 && now <= (d.end ?? d.start + 9 * 3600e3) : d.day === today)) || null;
  const next = days.find((d) => (d.start ? d.start > now : d.day > today)) || null;
  return { current, next };
}
