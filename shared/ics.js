// Calendrier des séances au format iCalendar (.ics), importable dans Google Agenda, Apple
// Calendrier, Outlook… avec une alarme avant chaque séance (l'agenda prévient même quand
// Paddock Live est fermé).

// Durée prévue de chaque séance (minutes) : l'agenda affiche un créneau réaliste
export function sessionMinutes(label) {
  if (/^EL\d/.test(label)) return 60;
  if (/qualif\. sprint/i.test(label)) return 45;
  if (/^sprint$/i.test(label)) return 45;
  if (/qualif/i.test(label)) return 60;
  return 120;   // course
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };
const text = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

// Lignes de plus de 75 octets repliées (norme iCalendar)
const enc = new TextEncoder();
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// races : [{ round, name, circuit, locality, country, sessions: [{ label, t }] }]
// Textes dans la langue de l'interface (fr, en, it, es ; autre : français)
const LANG = {
  en: { cal: 'Formula 1', round: 'round', alarm: 'in', desc: 'Follow the session live in Paddock Live.',
    labels: { EL1: 'FP1', EL2: 'FP2', EL3: 'FP3', 'Qualif. sprint': 'Sprint qualifying', Sprint: 'Sprint', Qualifications: 'Qualifying', Course: 'Race' } },
  it: { cal: 'Formula 1', round: 'round', alarm: 'tra', desc: 'Segui la sessione in diretta su Paddock Live.',
    labels: { EL1: 'PL1', EL2: 'PL2', EL3: 'PL3', 'Qualif. sprint': 'Qualifiche sprint', Sprint: 'Sprint', Qualifications: 'Qualifiche', Course: 'Gara' } },
  es: { cal: 'Fórmula 1', round: 'ronda', alarm: 'en', desc: 'Sigue la sesión en directo en Paddock Live.',
    labels: { EL1: 'Libres 1', EL2: 'Libres 2', EL3: 'Libres 3', 'Qualif. sprint': 'Clasificación sprint', Sprint: 'Sprint', Qualifications: 'Clasificación', Course: 'Carrera' } },
  fr: { cal: 'Formule 1', round: 'manche', alarm: 'dans', desc: 'Suivez la séance en direct dans Paddock Live.', labels: {} },
};

// subscribe : calendrier auquel on s'abonne (adresse fixe, relue par l'agenda toutes les 6 h)
export function buildIcs(races, { year, round = null, alarmMin = 15, now = Date.now(), lang = 'fr', subscribe = false } = {}) {
  const L = Object.hasOwn(LANG, lang) ? LANG[lang] : LANG.fr;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paddock Live//Calendrier F1//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(subscribe ? `${L.cal} (Paddock Live)` : round ? `F1 ${year} — ${L.round} ${round}` : `F1 ${year}`)}`,
    ...(subscribe ? ['REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'] : [])];
  for (const r of races) {
    if (round && r.round !== round) continue;
    for (const s of r.sessions || []) {
      const start = Date.parse(s.t);
      if (!Number.isFinite(start)) continue;
      const end = start + sessionMinutes(s.label) * 60e3;
      const gp = String(r.name || '').replace(/ Grand Prix$/, '');
      const label = L.labels[s.label] || s.label;
      const slug = String(s.label).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');
      lines.push('BEGIN:VEVENT',
        `UID:paddock-${year}-${r.round}-${slug}@paddock-live`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${text(`F1 ${gp} GP — ${label}`)}`,
        `LOCATION:${text([r.circuit, r.locality, r.country].filter(Boolean).join(', '))}`,
        `DESCRIPTION:${text(`${r.name} (${L.round} ${r.round}). ${L.desc}`)}`);
      if (alarmMin > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(`${gp} — ${label} ${L.alarm} ${alarmMin} min`)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

// Dates sans heure (agenda de l'intersaison) : une journée entière, ou plusieurs jusqu'à « end » compris.
// events : [{ date: 'AAAA-MM-JJ', end?, title (déjà dans la langue de l'interface), key? (identifiant, sinon le titre), link? }]
const ymd = (s) => s.replace(/-/g, '');
const nextDay = (s) => new Date(Date.parse(`${s}T00:00:00Z`) + 86400e3).toISOString().slice(0, 10);
export function buildDayIcs(events, { name = 'F1', now = Date.now() } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paddock Live//Calendrier F1//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(name)}`];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) continue;
    const slug = String(e.key ?? e.title).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    lines.push('BEGIN:VEVENT', `UID:paddock-${ymd(e.date)}-${slug}@paddock-live`, `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.end || e.date))}`, `SUMMARY:${text(e.title)}`,
      ...(e.link ? [`URL:${e.link}`, `DESCRIPTION:${text(e.link)}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

// Rappels à faire : séances qui commencent dans les « beforeMin » prochaines minutes et pas encore
// rappelées (done : clés « début|séance »)
export function dueReminders(list, now, beforeMin, done) {
  if (!beforeMin) return [];
  return list.filter((s) => s.t > now && s.t - now <= beforeMin * 60e3 && !done.includes(`${s.t}|${s.label}`));
}
