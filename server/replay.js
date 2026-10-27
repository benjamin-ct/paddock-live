// Replay d'une session passée à partir des archives publiques F1 Live Timing
// (livetiming.formula1.com/static/...). Les messages sont réinjectés dans le hub
// exactement comme en live : le délai, les duels, la carte... fonctionnent pareil.
import { HttpError, withRetry } from './net.js';
import { archiveGet, archiveJSON } from './archive.js';
import { ARCHIVE_TOPICS, topicName } from '../shared/f1.js';
import { sessionLabel } from './live.js';
import { readRecording, recordingPath } from './recorder.js';
import { keyMoments } from '../shared/moments.js';
import { parseStream, indexMeetings } from '../shared/race-stats.js';

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function loadArchive(path, onProgress = () => {}, topics = ARCHIVE_TOPICS, get = archiveGet) {   // get : tests
  let done = 0;
  const parts = await mapLimit(topics, 4, async (rawTopic) => {
    try {
      const text = await get(`${path}${rawTopic}.jsonStream`, { timeout: 120000 });
      return parseStream(text, rawTopic);
    } catch (err) {
      if (!(err instanceof HttpError)) console.warn(`[replay] ${rawTopic}: ${err.message}`);
      return [];
    } finally {
      onProgress(++done / topics.length);
    }
  });

  const events = [];
  const stream = [];
  for (const list of parts) {
    for (const e of list) {
      const topic = topicName(e.topic);
      if (e.topic.endsWith('.z')) stream.push({ off: e.off, topic, raw: e.data });
      else events.push({ off: e.off, topic, data: e.data });
    }
  }
  if (!events.length) throw new Error('Archive introuvable ou vide pour cette session (pas encore publiée ?)');
  const byOff = (a, b) => a.off - b.off;
  events.sort(byOff);
  stream.sort(byOff);
  const duration = Math.max(events[events.length - 1].off, stream.length ? stream[stream.length - 1].off : 0);

  // Début réel de la session (extinction des feux / feu vert en qualif).
  const started = events.find((e) => e.topic === 'SessionStatus' && e.data?.Status === 'Started');
  const info = events.find((e) => e.topic === 'SessionInfo')?.data;
  // Radios d'équipe absentes de l'archive (la F1 ne les a pas publiées pour les premières séances de 2026)
  const noRadio = topics.includes('TeamRadio') && !parts[topics.indexOf('TeamRadio')].length;
  return { events, stream, duration, startOff: started ? started.off : 0, info, noRadio };
}

// Périodes de drapeau rouge, en ms depuis le début : du drapeau (TrackStatus 5) à la reprise
// de la séance (SessionStatus « Started » après « Aborted »), sinon au statut de piste suivant
// Périodes de voiture de sécurité (4) et de VSC (6 ; 7 = fin de VSC), en ms depuis le début
export function neutralPeriods(events, duration) {
  const out = [];
  let cur = null;
  for (const e of events) {
    if (e.topic !== 'TrackStatus' || e.data?.Status === undefined) continue;
    const st = String(e.data.Status);
    const kind = st === '4' ? 'sc' : st === '6' || st === '7' ? 'vsc' : null;
    if (cur && kind !== cur.kind) { out.push({ ...cur, end: e.off }); cur = null; }
    if (kind && !cur) cur = { kind, start: e.off };
  }
  if (cur) out.push({ ...cur, end: duration });
  return out;
}

// Parties de la séance (Q1, Q2, Q3, course, reprise après drapeau rouge…) : du feu vert
// (SessionStatus « Started ») au drapeau à damier (« Finished ») ou à l'interruption.
// part = numéro de partie des qualifications (TimingData.SessionPart), sinon null.
// Vitesses de lecture possibles
export const SPEEDS = [0.5, 1, 2, 4, 5, 8, 10, 20, 30];

export function sessionPhases(events, duration) {
  const out = [];
  let cur = null;
  let part = null;
  for (const e of events) {
    if (e.topic === 'TimingData' && e.data?.SessionPart !== undefined) part = Number(e.data.SessionPart) || null;
    if (e.topic !== 'SessionStatus' || !e.data?.Status) continue;
    const st = e.data.Status;
    if (st === 'Started' && !cur) cur = { start: e.off, part };
    else if (cur && ['Finished', 'Aborted', 'Inactive', 'Ends', 'Finalised'].includes(st)) { out.push({ ...cur, end: e.off }); cur = null; }
  }
  if (cur) out.push({ ...cur, end: duration });
  return out;
}

// Drapeaux jaunes (piste entière ou secteur signalé par TrackStatus = 2)
export function yellowPeriods(events, duration) {
  const out = [];
  let cur = null;
  for (const e of events) {
    if (e.topic !== 'TrackStatus' || e.data?.Status === undefined) continue;
    const y = String(e.data.Status) === '2';
    if (y && !cur) cur = { start: e.off };
    else if (!y && cur) { out.push({ start: cur.start, end: e.off }); cur = null; }
  }
  if (cur) out.push({ start: cur.start, end: duration });
  return out;
}

export function redFlagPeriods(events, duration) {
  const out = [];
  let cur = null;
  for (const e of events) {
    if (e.topic !== 'TrackStatus' || e.data?.Status === undefined) continue;
    const red = String(e.data.Status) === '5';
    if (red && !cur) cur = { start: e.off };
    else if (!red && cur) { out.push({ start: cur.start, end: e.off }); cur = null; }
  }
  if (cur) out.push({ start: cur.start, end: duration });
  const restarts = events.filter((e) => e.topic === 'SessionStatus' && e.data?.Status === 'Started').map((e) => e.off);
  out.forEach((r, i) => {
    const next = out[i + 1]?.start ?? Infinity;
    const restart = restarts.find((t) => t > r.start && t < next);
    if (restart !== undefined && restart > r.end) r.end = restart;
  });
  return out;
}

// Enregistrement local -> même format qu'une archive officielle.
async function loadLocal(id) {
  const file = recordingPath(id);
  if (!file) throw new Error('Enregistrement introuvable');
  const rec = await readRecording(file);
  if (!rec.events.length) throw new Error('Enregistrement vide');
  const t0 = Math.min(rec.events[0].t, rec.stream.length ? rec.stream[0].t : Infinity);
  const events = rec.events.map((e) => ({ off: e.t - t0, topic: e.topic, data: e.data }));
  const stream = rec.stream.map((e) => ({ off: e.t - t0, topic: e.topic, raw: e.raw }));
  const duration = Math.max(events.at(-1).off, stream.length ? stream.at(-1).off : 0);
  const started = events.find((e) => (e.topic === 'SessionStatus' && e.data?.Status === 'Started'));
  const snap = events.find((e) => e.topic === '__snapshot' && e.data?.SessionInfo);
  const info = snap?.data.SessionInfo || events.find((e) => e.topic === 'SessionInfo')?.data;
  return { events, stream, duration, startOff: started ? started.off : 0, info };
}

export class ReplaySource {
  constructor(hub) {
    this.hub = hub;
    this.anchor = 0;
    this.speed = 1;
    this.duration = 0;
    this.loadId = 0;
  }

  // source : chemin d'archive officielle ("2026/…/") ou {local: id} pour un enregistrement.
  async start(source, startOffsetMs) {
    const id = ++this.loadId;
    const local = typeof source === 'object' && source?.local;
    const path = local ? `local:${local}` : source;
    this.hub.reset({ mode: 'replay', label: 'Replay', path, loading: true, progress: 0 });
    let archive;
    try {
      archive = local
        ? await loadLocal(local)
        : await loadArchive(source, (p) => { if (id === this.loadId) this.hub.source.progress = p; });
    } catch (err) {
      if (id === this.loadId) Object.assign(this.hub.source, { loading: false, error: err.message });
      throw err;
    }
    if (id !== this.loadId) return;

    const start = Number.isFinite(startOffsetMs) ? startOffsetMs : Math.max(0, archive.startOff - 60000);
    this.duration = archive.duration;
    this.startOff = archive.startOff;
    // Moments clés (liste du replay) : servis à part (GET /api/replay/moments)
    const t = archive.info?.Type, n = archive.info?.Name || '';
    const kind = t === 'Race' ? 'race' : t === 'Qualifying' || /qualif|shootout/i.test(n) ? 'quali' : 'practice';
    try {
      this.moments = keyMoments(archive.events, { kind });
      this.momentsEn = keyMoments(archive.events, { kind, lang: 'en' });
    } catch (err) { this.moments = []; this.momentsEn = []; console.warn('[moments]', err.message); }
    this.speed = 1;
    this.anchor = Date.now() - start;
    const events = archive.events.map((e) => ({ off: e.off, t: this.anchor + e.off, topic: e.topic, data: e.data }));
    const stream = archive.stream.map((s) => ({ off: s.off, t: this.anchor + s.off, topic: s.topic, raw: s.raw }));
    this.hub.load(events, stream);
    this.hub.source = {
      mode: 'replay',
      label: 'Replay',
      path,
      local: !!local,
      session: sessionLabel(archive.info),
      loading: false,
      connected: true,
      duration: this.duration,
      sessionStart: this.startOff,
      redFlags: redFlagPeriods(archive.events, archive.duration),
      neutralized: neutralPeriods(archive.events, archive.duration),
      phases: sessionPhases(archive.events, archive.duration),
      yellows: yellowPeriods(archive.events, archive.duration),
      anchor: this.anchor,
      speed: this.speed,
      noRadio: !!archive.noRadio,
    };
  }

  isActive() {
    return this.hub.source.mode === 'replay' && !this.hub.source.loading;
  }

  // Position dans l'enregistrement au bord "live" (sans délai), en ms.
  position() {
    return (this.hub.clock() - this.anchor) * this.speed;
  }

  apply() {
    this.hub.retime(this.anchor, this.speed);
    Object.assign(this.hub.source, { anchor: this.anchor, speed: this.speed });
  }

  seek(toMs) {
    if (!this.isActive()) return;
    const to = Math.max(0, Math.min(this.duration, toMs));
    this.anchor = this.hub.clock() - to / this.speed;
    this.apply();
  }

  setSpeed(speed) {
    if (!this.isActive() || !SPEEDS.includes(speed)) return;
    const pos = this.position();
    this.speed = speed;
    this.anchor = this.hub.clock() - pos / speed;
    this.apply();
  }

  pause() {
    if (!this.isActive() || this.hub.pausedAt !== null) return;
    this.hub.pausedAt = Date.now();
  }

  resume() {
    if (!this.isActive() || this.hub.pausedAt === null) return;
    const delta = Date.now() - this.hub.pausedAt;
    this.hub.pausedAt = null;
    this.hub.shift(delta);
    this.anchor += delta;
    this.hub.source.anchor = this.anchor;
  }

  stop() {
    this.loadId++;
  }
}

// ---- Index des sessions archivées ----
const indexCache = new Map();

export async function seasonIndex(year) {
  const cached = indexCache.get(year);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const raw = await withRetry(() => archiveJSON(`${year}/Index.json`), { tries: 3 });
  const data = indexMeetings(raw);
  indexCache.set(year, { at: Date.now(), data });
  return data;
}
