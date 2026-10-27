// Traduction en français des évolutions techniques déclarées par les écuries (textes FIA en
// anglais). Les traductions sont faites par le serveur Paddock Live, puis gardées par le serveur de l'appli :
// elles ne sont demandées qu'une fois et servent aussi au téléphone.
import { api } from '../util.js';
import { store, on } from '../store.js';
import { translateText, transcribeStatus } from './transcribe.js';
import { EN } from '../i18n.js';

const LANG = 'fr';
let cache = null;            // anglais -> { t, q }
let loading = null;
const queued = new Set();
const subscribers = new Set();
let error = null;
let pendingSave = [];
let saveTimer = null;
let reloadTimer = null;

function load(force = false) {
  if (force) loading = null;
  loading ||= api(`/api/translations?lang=${LANG}`).then((d) => { cache = { ...(cache || {}), ...(d || {}) }; }).catch(() => { cache ||= {}; });
  return loading;
}

const notify = (en) => { for (const fn of subscribers) fn(en); };

export function onTranslation(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function translated(en) {
  if (EN) return null;
  return (en && cache?.[en]?.t) || null;
}

export function translationState() {
  const s = transcribeStatus();
  return { left: queued.size, error, loading: s.state === 'loading' ? s.msg : '' };
}

function save(item) {
  pendingSave.push(item);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const items = pendingSave;
    pendingSave = [];
    api('/api/translations', { method: 'POST', body: { lang: LANG, items } }).catch(() => {});
  }, 1500);
}

// Textes à afficher : ceux qui manquent sont traduits (ordinateur) ou relus plus tard (téléphone)
export async function requestTranslations(texts) {
  if (EN) return;                 // interface en anglais : textes FIA laissés tels quels
  await load();
  notify(null);                   // traductions gardées, arrivées après l'affichage : mises en place
  const missing = [...new Set(texts.filter((t) => t && !cache[t] && !queued.has(t)))];
  if (!missing.length) return;
  if (store.isHost === false) {
    // Téléphone / tablette : l'ordinateur s'en charge ; on relit son cache dans un moment
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      await load(true);
      for (const t of missing) if (cache[t]) notify(t);
    }, 20000);
    return;
  }
  error = null;
  for (const en of missing) {
    queued.add(en);
    translateText(en, LANG, 'tech').then(({ text, q }) => {
      if (!text) return;
      cache[en] = { t: text, q };
      save({ en, t: text, q });
    }).catch((err) => { error = err.message; }).finally(() => {
      queued.delete(en);
      notify(en);
    });
  }
  notify(null);
}

on('radioText', () => { if (queued.size) notify(null); });
on('radioStatus', () => { if (queued.size) notify(null); });
