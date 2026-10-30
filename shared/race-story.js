// Déroulé d'une course pour la vidéo animée : état de la piste à chaque tour (vert, drapeaux jaunes,
// voiture de sécurité, VSC, drapeau rouge) et moments forts (neutralisations, relances, nouveau
// leader, abandons, pénalités, meilleur tour). Messages de la direction de course (archives de la
// F1) quand ils sont disponibles, sinon estimation d'après les temps au tour. Code pur, partagé par
// l'appli et la page web du créateur.

// RaceControlMessages.json (état final, tableau ou objet numéroté) -> messages triés
export function parseRaceControl(json) {
  const raw = json?.Messages;
  const list = Array.isArray(raw) ? raw : Object.values(raw || {});
  return list.filter((m) => m && typeof m === 'object').map((m) => ({
    lap: Number(m.Lap) || null, utc: m.Utc || '', cat: m.Category || '', flag: m.Flag || '', mode: m.Mode || '',
    status: m.Status || '', scope: m.Scope || '', text: String(m.Message || ''),
  })).sort((a, b) => (a.utc < b.utc ? -1 : a.utc > b.utc ? 1 : 0));
}

// Session de la course dans l'Index.json d'une saison : même nom de Grand Prix, sinon même circuit
export function raceSessionPath(index, { name = '', circuitKey = null } = {}) {
  const meetings = index?.Meetings || [];
  const m = meetings.find((x) => name && x.Name === name) || meetings.find((x) => circuitKey && Number(x.Circuit?.Key) === Number(circuitKey));
  return (m?.Sessions || []).find((s) => s.Type === 'Race' && s.Path && !/sprint/i.test(s.Name || ''))?.Path || null;
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
// Gravité des états (le plus grave l'emporte sur un même tour)
const LEVEL = { green: 0, yellow: 1, vsc: 2, sc: 3, red: 4 };

// État de la piste tour par tour d'après la direction de course
function statusFromControl(msgs, total) {
  const status = Array(total).fill('green');
  let cur = 'green';
  let from = 1;
  const fill = (to, s) => { for (let l = Math.max(1, from); l <= Math.min(total, to); l++) if (LEVEL[s] > LEVEL[status[l - 1]]) status[l - 1] = s; };
  const events = [];
  let ended = false;
  for (const m of msgs) {
    const lap = Math.min(total, Math.max(1, m.lap || from));
    const t = m.text.toUpperCase();
    let next = null;
    // Après le drapeau à damier : seulement les pénalités (drapeaux d'après-course ignorés)
    if (m.flag === 'CHEQUERED' || /\bCHEQUERED FLAG\b/.test(t)) ended = true;
    if (ended && !/PENALTY/.test(t)) continue;
    if (m.cat === 'SafetyCar' || /SAFETY CAR|\bVSC\b/.test(t)) {
      const vsc = /VIRTUAL|\bVSC\b/.test(`${m.mode} ${t}`);   // « VSC DEPLOYED » depuis 2026
      if (/DEPLOYED/.test(`${m.status} ${t}`)) { next = vsc ? 'vsc' : 'sc'; events.push({ lap, kind: next }); }
      else if (/ENDING|IN THIS LAP/.test(`${m.status} ${t}`) && cur !== 'green' && cur !== 'red') { fill(lap, cur); from = lap + 1; cur = 'green'; events.push({ lap: Math.min(total, lap + (vsc ? 0 : 1)), kind: 'restart' }); continue; }
    } else if (m.flag === 'RED' || /(^|[^A-Z])RED FLAG/.test(t)) { next = 'red'; events.push({ lap, kind: 'red' }); }
    else if (cur === 'red' && (m.flag === 'GREEN' || /RESUME|TRACK CLEAR|GREEN LIGHT/.test(t))) { fill(lap, cur); from = lap + 1; cur = 'green'; events.push({ lap: Math.min(total, lap + 1), kind: 'restart' }); continue; }
    else if (/DOUBLE YELLOW/.test(`${m.flag} ${t}`) && cur === 'green' && lap > 1) { if (status[lap - 1] === 'green') status[lap - 1] = 'yellow'; }
    else if (/PENALTY/.test(t) && /STEWARDS/.test(t) && !/PENALTY SERVED/.test(t)) {   // purgée : déjà montrée
      const code = /\(([A-Z]{3})\)/.exec(t)?.[1];
      const what = /(\d+) SECOND/.exec(t) ? `${/(\d+) SECOND/.exec(t)[1]} S` : /DRIVE THROUGH/.test(t) ? 'DRIVE-THROUGH' : /STOP AND GO/.test(t) ? 'STOP & GO' : 'PÉNALITÉ';
      if (code) events.push({ lap, kind: 'penalty', code, text: what });
    }
    if (next && next !== cur) { fill(lap - 1, cur); from = lap; cur = next; }
  }
  fill(total, cur);
  return { status, events };
}

// Estimation sans la direction de course : tours où tout le peloton roule nettement moins vite
function statusFromTimes(laps) {
  const total = laps.total;
  const per = [];
  for (let l = 1; l <= total; l++) per.push(median(laps.drivers.map((x) => x.times[l - 1]).filter((t) => t > 0)));
  const ref = median(per.slice(1).filter(Boolean));
  const status = per.map((t, i) => (!ref || !t || i === 0 ? 'green' : t > ref * 3 ? 'red' : t > ref * 1.22 ? 'neutral' : 'green'));
  // Safety car ou VSC : sous safety car le peloton se regroupe derrière la voiture (écart du leader au 5e
  // fondu), sous VSC chacun garde son écart
  const cum = (x, l) => { let t = 0; for (let i = 0; i < l; i++) { if (!(x.times[i] > 0)) return null; t += x.times[i]; } return t; };
  const spread = (l) => {
    const at = laps.drivers.map((x) => ({ p: x.pos[l - 1], t: cum(x, l) })).filter((x) => x.p && x.t != null).sort((a, b) => a.p - b.p);
    return at.length >= 3 ? at[Math.min(4, at.length - 1)].t - at[0].t : null;
  };
  for (let i = 0; i < total; i++) {
    if (status[i] !== 'neutral' || status[i - 1] === 'neutral') continue;
    let j = i;
    while (status[j + 1] === 'neutral') j++;
    const before = spread(i); const after = spread(j + 1);
    const kind = before == null || after == null || before < 4 ? 'neutral' : after < before * 0.5 ? 'sc' : 'vsc';
    for (let k = i; k <= j; k++) status[k] = kind;
  }
  const events = [];
  status.forEach((s, i) => {
    if (s !== 'green' && status[i - 1] !== s) events.push({ lap: i + 1, kind: s });
    if (s === 'green' && i > 0 && status[i - 1] !== 'green') events.push({ lap: i + 1, kind: 'restart' });
  });
  return { status, events };
}

// laps : parseRaceLaps (tours, positions, temps, arrêts) ; rcm : parseRaceControl ou null
export function raceStory(laps, rcm = null) {
  const total = laps.total;
  const fromRc = rcm?.length ? statusFromControl(rcm, total) : null;
  const { status, events } = fromRc || statusFromTimes(laps);
  const out = [...events];
  // Nouveau leader (hors 1er tour)
  let prev = null;
  for (let l = 1; l <= total; l++) {
    const lead = laps.drivers.find((x) => x.pos[l - 1] === 1);
    if (lead && prev && lead.code !== prev && l > 1) out.push({ lap: l, kind: 'lead', code: lead.code });
    if (lead) prev = lead.code;
  }
  // Abandons
  for (const x of laps.drivers) if (!x.classified && x.laps < total) out.push({ lap: Math.max(1, x.laps + 1), kind: 'out', code: x.code });
  // Meilleur tour de la course
  let best = null;
  for (const x of laps.drivers) x.times.forEach((t, i) => { if (t > 0 && i > 0 && (!best || t < best.time)) best = { time: t, lap: i + 1, code: x.code }; });
  if (best) out.push({ lap: best.lap, kind: 'fastest', code: best.code, time: best.time });
  // Même tour : direction de course dans l'ordre des messages, puis leader, abandons, meilleur tour
  const order = { lead: 1, out: 2, fastest: 3 };
  out.forEach((e, i) => { e.seq = (order[e.kind] || 0) * 1000 + i; });
  out.sort((a, b) => a.lap - b.lap || a.seq - b.seq);
  out.forEach((e) => { delete e.seq; });
  const count = (k) => out.filter((e) => e.kind === k).length;
  return {
    status, events: out, estimated: !fromRc, best,
    counts: { sc: count('sc'), vsc: count('vsc'), red: count('red'), neutral: count('neutral'), lead: count('lead') },
  };
}
