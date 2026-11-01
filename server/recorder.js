// Enregistrement local du flux live (un fichier par session, format JSON lignes).
// - Au redémarrage du serveur pendant une session, l'historique est rechargé :
//   le délai TV reste exact.
// - Chaque session enregistrée peut être rejouée immédiatement (« Mes enregistrements »),
//   sans attendre la publication de l'archive officielle.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { DATA_DIR } from './config.js';
import { sessionStartUtc } from '../shared/f1.js';

export const REC_DIR = process.env.RECORDINGS_DIR || path.join(DATA_DIR, 'recordings');

function safeName(s) {
  return String(s).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 120);
}

export class Recorder {
  constructor() {
    this.stream = null;
    this.file = null;
    fs.mkdirSync(REC_DIR, { recursive: true });
  }

  fileFor(info) {
    const date = (info?.StartDate || '').slice(0, 10);
    const name = safeName(`${date}_${info?.Meeting?.Name || 'Session'}_${info?.Name || info?.Key}_${info?.Key}`);
    return path.join(REC_DIR, `${name}.jsonl`);
  }

  // Ouvre (ou reprend) le fichier de la session. Renvoie le chemin.
  open(info) {
    const file = this.fileFor(info);
    if (file === this.file) return file;
    this.close();
    // Fichier écrit bien avant le début de la séance (répétition de la F1 la veille, même numéro de séance) :
    // remplacé, sinon le replay commencerait par la répétition
    const start = sessionStartUtc(info);
    let fresh = !fs.existsSync(file);
    if (!fresh && start - fs.statSync(file).mtimeMs > 6 * 3600e3) { fs.writeFileSync(file, ''); fresh = true; }
    if (fresh) try { fs.closeSync(fs.openSync(file, 'a')); } catch { /* erreur signalée par le flux */ }   // créé tout de suite : compté parmi les plus récents
    this.file = file;
    this.stream = fs.createWriteStream(file, { flags: 'a' });
    this.stream.on('error', (err) => { console.warn('[enregistrement]', err.message); this.stream = null; });
    if (fresh) pruneRecordings(KEEP_RECORDINGS, file);
    return file;
  }

  write(t, topic, data, isStream = false) {
    if (!this.stream) return;
    this.stream.write(JSON.stringify(isStream ? [t, topic, data, 1] : [t, topic, data]) + '\n');
  }

  close() {
    if (this.stream) this.stream.end();
    this.stream = null;
    this.file = null;
  }
}

// Relit un enregistrement : {events: [{t, topic, data}], stream: [{t, topic, raw}]}
export async function readRecording(file) {
  const events = [];
  const stream = [];
  if (!fs.existsSync(file)) return { events, stream };
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; } // ligne tronquée (arrêt brutal)
    const [t, topic, data, isStream] = row;
    if (isStream) stream.push({ t, topic, raw: data });
    else events.push({ t, topic, data });
  }
  const byT = (a, b) => a.t - b.t;
  events.sort(byT);
  stream.sort(byT);
  return { events, stream };
}

// Enregistrements gardés : les plus récents (environ 3 week-ends de 5 séances), les plus anciens effacés à
// chaque nouvelle séance (avec F1 TV, plusieurs Go par saison s'accumulaient sans qu'on le sache)
export const KEEP_RECORDINGS = 15;
export function pruneRecordings(keep = KEEP_RECORDINGS, current = null) {
  const list = listRecordings().sort((a, b) => b.modified - a.modified);
  for (const r of list.slice(keep)) {
    const f = path.join(REC_DIR, `${r.id}.jsonl`);
    if (f !== current) try { fs.unlinkSync(f); } catch { /* déjà effacé */ }
  }
}

export function listRecordings() {
  if (!fs.existsSync(REC_DIR)) return [];
  return fs.readdirSync(REC_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const st = fs.statSync(path.join(REC_DIR, f));
      return { id: f.replace(/\.jsonl$/, ''), name: f.replace(/\.jsonl$/, '').replace(/_/g, ' '), size: st.size, modified: st.mtimeMs };
    })
    .sort((a, b) => b.modified - a.modified);
}

export function recordingPath(id) {
  const clean = safeName(id);
  if (clean !== id) return null;
  const file = path.join(REC_DIR, `${clean}.jsonl`);
  return fs.existsSync(file) ? file : null;
}
