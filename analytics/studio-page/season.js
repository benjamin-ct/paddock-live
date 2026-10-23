// Studio : posts de la saison (Race Week, programme, records, notes, duels, course tour par tour),
// d'après l'API publique Jolpica, les archives de la F1 et la météo. Chargé à l'ouverture de l'onglet.
import { builtinNomination } from '/shared/tyres.js';
import { raceWeekData, weekendData, recordsData, ratingsData, teamDuelsData, titleData, titleSide, raceLapsData, seasonCaptions } from '/shared/social-season.js';
import { raceFrame, raceVideoTiming } from '/shared/social-draw-season.js';
import { parseRaceLaps } from '/shared/race-laps.js';
import { circuitInfo } from '/shared/circuits-info.js';
import { recordsOf, recordYears, editionFromResults } from '/shared/circuit-records.js';
import { parseRaceControl, raceSessionPath } from '/shared/race-story.js';
import { makeAnimation, unlockAudio } from '/shared/social-video.js';
import { videoCover } from '/shared/social-draw.js';
import { $, $$, esc, api, icon, store, skeleton, toast, state, glide, SIG, musicField, bindMusic, clipFile, shareClip } from './ui.js';
import { latestDrivers } from './data.js';
import { weekendPlan } from '/shared/post-history.js';
import { editor, assets } from './editor.js';

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
// 4 demandes par seconde au plus : chaque demande réserve son créneau avant d'attendre (demandes
// lancées en parallèle comprises)
let nextSlot = 0;
async function slot(gap) {
  const at = Math.max(Date.now(), nextSlot);
  nextSlot = at + gap;
  if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()));
}
async function jolpica(pathname) {
  const out = [];
  for (let offset = 0, total = 1; offset < total; offset += 100) {
    let j = null;
    for (let attempt = 0; attempt < 3 && !j; attempt++) {
      await slot(300 * (attempt + 1));
      const r = await fetch(`${JOLPICA}/${pathname}.json?limit=100&offset=${offset}`).catch(() => null);
      if (r?.ok) j = await r.json();
      else if (r && r.status !== 429 && r.status < 500) throw new Error(`Résultats indisponibles (erreur ${r.status})`);
    }
    if (!j) throw new Error('Serveur des résultats (Jolpica) injoignable, réessayez dans un instant');
    total = Number(j.MRData?.total) || 0;
    out.push(j.MRData);
    if (!total) break;
  }
  return out;
}
// Gardées sur le téléphone (saison : 30 min ; tours d'une course terminée : toujours)
const seasonMemo = new Map();
const memoOf = (k, fn, ttl = Infinity) => {
  if (!seasonMemo.has(k)) {
    const hit = store.get(k, ttl);
    seasonMemo.set(k, hit ? Promise.resolve(hit.v) : fn().then((v) => { store.set(k, v); return v; }).catch((err) => { seasonMemo.delete(k); throw err; }));
  }
  return seasonMemo.get(k);
};
// Saison résumée par le serveur (lue chez Jolpica et tenue à jour toutes les 30 minutes) : une seule demande
const seasonOf = (year) => memoOf(`s4-${year}`, async () => (await api(`season?year=${year}`)).v, 10 * 60e3);
const readArchive = async (p) => JSON.parse((await (await api(`archive?p=${encodeURIComponent(p)}`, { raw: true })).text()).replace(/^﻿/, ''));
// Records du circuit : pole et meilleur tour en course des éditions précédentes, d'après les résultats
// officiels publics (Jolpica : sans connexion F1 TV, que la F1 refuse depuis un serveur) ; gardés sur le téléphone
async function editionJolpica(y, circuitId) {
  const races = (path) => jolpica(`${y}/circuits/${circuitId}/${path}`).then((l) => l.flatMap((m) => m?.RaceTable?.Races || []));
  const [res, quali] = await Promise.all([races('results'), races('qualifying')]);
  return editionFromResults(y, res, quali);
}
async function recordsFor(year, key, circuitId) {
  let failed = null;
  const editions = await Promise.all(recordYears(year).map((y) => memoOf(`rj${circuitId}-${y}`, () => editionJolpica(y, circuitId)).catch((err) => { failed ||= err; return null; })));
  const rec = recordsOf(key, editions);
  if (!rec.editions.length && failed) throw failed;
  return rec;
}
const lapsOf = (year, round) => memoOf(`l2${year}-${round}`, async () => {
  const [pages, res, pits] = await Promise.all([
    jolpica(`${year}/${round}/laps`).then((l) => l.flatMap((m) => m?.RaceTable?.Races || [])),
    jolpica(`${year}/${round}/results`).then((l) => l.flatMap((m) => m?.RaceTable?.Races || []).flatMap((r) => r.Results || [])),
    jolpica(`${year}/${round}/pitstops`).then((l) => l.flatMap((m) => m?.RaceTable?.Races || [])).catch(() => []),
  ]);
  return parseRaceLaps(pages, res, pits);
});
// Tracé du circuit (API MultiViewer) et direction de course (archives de la F1 : safety car, VSC, drapeaux)
const trackOf = (year, key) => memoOf(`c${key}-${year}`, async () => {
  for (const y of [year, year - 1]) {
    const r = await fetch(`https://api.multiviewer.app/api/v1/circuits/${key}/${y}`).catch(() => null);
    if (r?.ok) return r.json();
  }
  return null;
});
const raceControlOf = (year, race) => memoOf(`rc${year}-${race.round}`, async () => {
  const p = raceSessionPath(await readArchive(`${year}/Index.json`), { name: race.name, circuitKey: circuitInfo(race.circuitId)?.key });
  if (!p) throw new Error('Course introuvable dans les archives');
  return parseRaceControl(await readArchive(`${p}RaceControlMessages.json`));
});
async function forecastOf(lat, lon) {
  const q = new URLSearchParams({ latitude: Number(lat).toFixed(4), longitude: Number(lon).toFixed(4), daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: '16' });
  const j = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then((r) => r.json()).catch(() => null);
  const d = j?.daily || {};
  return (d.time || []).map((date, i) => ({ date, tmax: d.temperature_2m_max?.[i] ?? null, tmin: d.temperature_2m_min?.[i] ?? null, rain: d.precipitation_probability_max?.[i] ?? null })).filter((x) => x.tmax !== null);
}

const STYPES = [['raceweek', 'Race Week'], ['weekend', 'Programme'], ['records', 'Le saviez-vous'], ['ratings', 'Notes'], ['teamduels', 'Duels'], ['title', 'Course au titre'], ['racelaps', 'Tour par tour']];
const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
// Grands Prix : le prochain (ou la dernière course) en tête et mis en avant, puis les suivants dans
// l'ordre du calendrier, et les courses passées de la plus récente à la plus ancienne
function raceList(races, def, upcoming) {
  const row = (r) => `<button class="row-item" data-r="${r.round}"><span class="num">${r.round}</span><span class="grow"><b>${esc(r.name)}</b><small>${esc(dateFr(r.date))}</small></span>${icon('next')}</button>`;
  const later = races.filter((r) => r.round > def.round);
  const before = races.filter((r) => r.round < def.round).reverse();
  return `<button class="card hero" data-r="${def.round}"><span class="eyebrow">${upcoming ? 'Prochain Grand Prix' : 'Dernière course'}</span><div class="t">${esc(def.name)}</div><div class="meta">Manche ${def.round} · ${esc(dateFr(def.date))}</div>${icon('next', 'go')}</button>
    ${upcoming && later.length ? `<h3 class="section">Ensuite</h3><div class="group">${later.map(row).join('')}</div>` : ''}
    ${before.length ? `<h3 class="section">${upcoming ? 'Déjà courus' : 'Courses précédentes'}</h3><div class="group">${before.map(row).join('')}</div>` : ''}`;
}

// Plan du week-end : le Grand Prix des 8 prochains jours (ou d'il y a moins de 2 jours), ses posts publiés
// (journal des publications) ou à faire, avec leur moment
function planCard(year, races) {
  const r = races.find((x) => Date.parse(x.date) > Date.now() - 2 * 86400e3);
  if (!r || Date.parse(r.date) - Date.now() > 8 * 86400e3) return '';
  const keys = (store.get('history')?.v || []).map((e) => e.key);
  const when = (p) => (p.at ? `${p.after ? 'après, ' : ''}${new Date(p.at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '');
  return `<div class="card plan"><span class="eyebrow">Plan du week-end</span><div class="t">${esc(r.name)}</div>
    ${weekendPlan(r, year, keys).map((p) => `<div class="plan-row ${p.done ? 'done' : ''}">${icon(p.done ? 'check' : 'clock')}<span>${esc(p.label)}</span><small>${esc(p.done ? 'publié' : when(p))}</small></div>`).join('')}</div>`;
}

export async function seasonTab(body, back) {
  const year = new Date().getUTCFullYear();
  const bar = `<div class="chips wrap" id="stypes">${STYPES.map(([k, v]) => `<button data-st="${k}" class="${state.stype === k ? 'on' : ''}">${v}</button>`).join('')}</div>`;
  body.innerHTML = `${bar}${skeleton(5)}<p class="hint center">Lecture de la saison…</p>`;
  // Journal des posts relu à chaque affichage : le plan du week-end marque aussi ce qui vient d'être publié
  // (ici, depuis l'appli ou par une programmation)
  const [data] = await Promise.all([seasonOf(year), api('history').then((r) => store.set('history', r.items || [])).catch(() => {})]);
  if (!body.isConnected) return;
  const upcoming = ['raceweek', 'weekend', 'records'].includes(state.stype);
  const races = upcoming ? data.races : data.races.filter((r) => r.results.length);
  const def = upcoming ? (races.find((r) => Date.parse(r.date) > Date.now() - 12 * 3600e3) || races.at(-1)) : races.at(-1);
  // Course au titre : le championnat tel qu'il est, après la dernière course (pas de Grand Prix à choisir)
  const standings = (r) => `<button class="card hero" data-r="${r.round}"><span class="eyebrow">Classement actuel</span><div class="t">Pilotes et constructeurs</div><div class="meta">Après la manche ${r.round} sur ${data.races.length} · ${esc(r.name)}</div>${icon('next', 'go')}</button>`;
  body.innerHTML = `${bar}${planCard(year, data.races)}${!def ? '<p class="hint">Aucune course terminée pour le moment.</p>' : state.stype === 'title' ? standings(def) : raceList(races, def, upcoming)}`;
  // Type choisi visible dans la barre (qui défile sur téléphone)
  const on = $('#stypes .on');
  if (on) $('#stypes').scrollLeft = on.offsetLeft - ($('#stypes').clientWidth - on.offsetWidth) / 2;
  $$('[data-st]', body).forEach((b) => { b.onclick = () => { state.stype = b.dataset.st; state.round = null; seasonTab(body, back); }; });
  $$('[data-r]', body).forEach((b) => {
    b.onclick = async () => {
      state.round = Number(b.dataset.r);
      b.classList.add('busy');
      try { await seasonEditor(year, data, races.find((r) => r.round === state.round), back); } catch (err) { toast(err.message, 'bad'); } finally { b.classList.remove('busy'); }
    };
  });
}

async function seasonEditor(year, data, race, back) {
  const live = Object.fromEntries(Object.values(await latestDrivers()).filter((x) => x?.Tla && x.TeamColour).map((x) => [x.Tla, `#${String(x.TeamColour).replace('#', '')}`]));
  let d;
  let note = '';
  let full = null;   // course au titre : les deux championnats (un post chacun)
  if (state.stype === 'raceweek') {
    const info = circuitInfo(race.circuitId);
    const [fc, track, winners] = await Promise.all([
      Number.isFinite(race.lat) ? forecastOf(race.lat, race.lon) : [],
      info ? trackOf(year, info.key).catch(() => null) : null,
      memoOf(`w${year - 1}`, async () => (await jolpica(`${year - 1}/results/1`)).flatMap((m) => m?.RaceTable?.Races || [])).catch(() => []),
    ]);
    const w = winners.find((r) => r.Circuit?.circuitId === race.circuitId || r.raceName === race.name)?.Results?.[0];
    const prev = w ? { name: `${w.Driver?.givenName || ''} ${w.Driver?.familyName || ''}`.trim(), team: w.Constructor?.name || '', teamId: w.Constructor?.constructorId || '', laps: Number(w.laps) || null } : null;
    d = raceWeekData(race, { year, rounds: data.races.length, tyres: builtinNomination(year, { name: race.name, location: race.locality, country: race.country }), forecast: fc, track, prev });
    if (!track) note = 'Tracé du circuit indisponible pour ce Grand Prix : visuel sans le circuit.';
  } else if (state.stype === 'weekend') {
    const fc = Number.isFinite(race.lat) ? await forecastOf(race.lat, race.lon) : [];
    d = weekendData(race, { year, tyres: builtinNomination(year, { name: race.name, location: race.locality, country: race.country }), forecast: fc });
    if (!d.forecast.length) note = 'Météo prévue disponible environ 2 semaines avant le week-end.';
  } else if (state.stype === 'records') {
    const key = circuitInfo(race.circuitId)?.key;
    if (!key) throw new Error('Circuit inconnu : records indisponibles pour ce Grand Prix');
    d = recordsData(race, await recordsFor(year, key, race.circuitId), { year, names: Object.fromEntries((data.drivers || []).map((x) => [x.code, x.name])) });
    if (!d.facts.length) throw new Error('Pas encore de records connus pour ce circuit (résultats depuis 2018).');
  } else if (state.stype === 'ratings') {
    const laps = await lapsOf(year, race.round).catch(() => null);
    d = ratingsData(race, { year, laps, live });
    note = `Note sur 10 : résultat, ${d.withPace ? 'rythme, ' : ''}places gagnées, duel avec le coéquipier.`;
  } else if (state.stype === 'teamduels') {
    d = teamDuelsData(data, { year, upTo: race.round, live });
  } else if (state.stype === 'title') {
    full = titleData(data, { year, upTo: race.round, live });
    d = titleSide(full, state.titleSide);
    note = 'Éliminés grisés.';
  } else {
    const [laps, rcm] = await Promise.all([lapsOf(year, race.round), raceControlOf(year, race).catch(() => null)]);
    if (!laps.total) throw new Error('Tours de cette course pas encore publiés');
    d = raceLapsData(race, laps, { year, live, rcm: rcm?.length ? rcm : null });
    if (d.story.estimated) note = 'Direction de course indisponible : neutralisations estimées.';
  }
  const video = state.stype === 'racelaps';
  const typeName = STYPES.find(([k]) => k === state.stype)[1];
  let clip = null;
  let file = null;   // vidéo prête en MP4, jointe au post
  // Course au titre : pilotes ou constructeurs, l'autre championnat publié en même temps (au choix)
  const SIDES = { drivers: 'Pilotes', teams: 'Constructeurs' };
  const side = () => (state.titleSide === 'teams' ? 'teams' : 'drivers');
  const other = () => (side() === 'teams' ? 'drivers' : 'teams');
  const recordOf = (k) => (full ? { key: `title:${year}-${race.round}:${k}`, kind: 'title', title: `Titre ${SIDES[k].toLowerCase()} · ${d.gp}` }
    : { key: `${state.stype}:${year}-${race.round}`, kind: state.stype, title: `${typeName} · ${d.gp}` });
  editor({
    back,
    title: typeName,
    subtitle: state.stype === 'title' ? `Classement après la manche ${race.round} · ${d.gp}` : `${d.gp} · manche ${race.round}`,
    note,
    head: full ? `<h3 class="section">Championnat</h3><div class="seg wide" id="tside">${Object.entries(SIDES).map(([k, v]) => `<button data-side="${k}" class="${side() === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <p class="hint">Un post par championnat ; l'autre peut partir en même temps (étape Publier).</p>` : '',
    vhead: `${video ? `<h3 class="section">Vidéo de la course</h3>${musicField('race', 'depart')}<div class="row"><button class="btn" id="mkvid">${icon('video')}Créer la vidéo (${Math.round(raceVideoTiming(d).duration)} s)</button><button class="btn" id="sharevid" disabled title="Zone sûre : Reels, TikTok, Shorts">${icon('share')}Partager</button><button class="btn" id="sharefull" disabled title="X, Bluesky, Facebook, Threads…">${icon('share')}Plein écran</button></div>
        <p class="hint" id="vidst">Garder l'écran allumé pendant l'enregistrement.</p>
        <video id="vid" controls playsinline hidden></video>` : ''}`,
    data: () => d, caps: (dd) => seasonCaptions(dd, SIG),
    record: () => recordOf(side()),
    twin: full ? { label: () => `Titre ${SIDES[other()].toLowerCase()}`, data: () => titleSide(full, other()), record: () => recordOf(other()) } : null,
    video: () => file,
    bind: (redraw) => {
      $$('[data-side]').forEach((b) => {
        b.onclick = () => {
          state.titleSide = b.dataset.side;
          d = titleSide(full, side());
          $$('[data-side]').forEach((x) => x.classList.toggle('on', x === b));
          glide();
          redraw(true);
        };
      });
      if (!video) return;
      const track = bindMusic('race');
      $('#mkvid').onclick = async () => {
        unlockAudio();   // pendant le toucher, avant toute attente (sinon vidéo muette sur iPhone)
        $('#mkvid').disabled = true;
        try {
          const o = await assets(d);
          clip = await makeAnimation((ctx, t, w, h) => raceFrame(ctx, w, h, d, o, t), raceVideoTiming(d).duration, { box: true, cover: (ctx) => videoCover(ctx, 1080, 1920, d, o), music: 'gen', track: track(), onProgress: (p) => { $('#vidst').textContent = `Enregistrement… ${Math.round(p * 100)} %`; } });
          $('#vid').src = URL.createObjectURL(clip.blob); $('#vid').hidden = false;
          $('#sharevid').disabled = false; $('#sharefull').disabled = false;
          $('#vidst').textContent = `Vidéo prête (${(clip.blob.size / 1e6).toFixed(1).replace('.', ',')} Mo)${clip.silent ? ' · sans son : le navigateur a bloqué la musique, recommencez' : ''}${(file = clipFile(clip, `course-${race.round}`)) ? ' · jointe au post (à décocher à l\'étape Publier pour garder les visuels)' : ' · format WebM : à partager seulement (publication en MP4)'}`;
          state.noVideo = false;
          redraw();
        } catch (err) { $('#vidst').textContent = err.message; } finally { $('#mkvid').disabled = false; }
      };
      $('#sharevid').onclick = () => clip && shareClip(clip, `course-${race.round}`);
      $('#sharefull').onclick = () => clip && shareClip(clip, `course-${race.round}`, true);
    },
  });
}
