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
// Noms des séances en anglais (le calendrier suit la langue de l'interface)
const LABEL_EN = { EL1: 'FP1', EL2: 'FP2', EL3: 'FP3', 'Qualif. sprint': 'Sprint qualifying', Sprint: 'Sprint', Qualifications: 'Qualifying', Course: 'Race' };

// subscribe : calendrier auquel on s'abonne (adresse fixe, relue par l'agenda toutes les 6 h)
export function buildIcs(races, { year, round = null, alarmMin = 15, now = Date.now(), lang = 'fr', subscribe = false } = {}) {
  const en = lang === 'en';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paddock Live//Calendrier F1//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(subscribe ? `${en ? 'Formula 1' : 'Formule 1'} (Paddock Live)` : round ? `F1 ${year} — ${en ? 'round' : 'manche'} ${round}` : `F1 ${year}`)}`,
    ...(subscribe ? ['REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'] : [])];
  for (const r of races) {
    if (round && r.round !== round) continue;
    for (const s of r.sessions || []) {
      const start = Date.parse(s.t);
      if (!Number.isFinite(start)) continue;
      const end = start + sessionMinutes(s.label) * 60e3;
      const gp = String(r.name || '').replace(/ Grand Prix$/, '');
      const label = en ? LABEL_EN[s.label] || s.label : s.label;
      const slug = String(s.label).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');
      lines.push('BEGIN:VEVENT',
        `UID:paddock-${year}-${r.round}-${slug}@paddock-live`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${text(`F1 ${gp} GP — ${label}`)}`,
        `LOCATION:${text([r.circuit, r.locality, r.country].filter(Boolean).join(', '))}`,
        `DESCRIPTION:${text(en ? `${r.name} (round ${r.round}). Follow the session live in Paddock Live.` : `${r.name} (manche ${r.round}). Suivez la séance en direct dans Paddock Live.`)}`);
      if (alarmMin > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(en ? `${gp} — ${label} in ${alarmMin} min` : `${gp} — ${label} dans ${alarmMin} min`)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
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
