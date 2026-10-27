// Traduction (actualités, radios, documents FIA : Claude d'Anthropic) et transcription des radios d'équipe
// (Workers AI) par le serveur Paddock Live, via le serveur de l'appli. Rien n'est calculé sur l'ordinateur ; chaque
// texte est traduit et chaque radio transcrite une fois pour tous. Serveur injoignable ou plafond du jour
// atteint : pause de 10 minutes, les textes attendent.

const LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh'];
let pending = [];
let timer = 0;
let offUntil = 0;
let asrOffUntil = 0;

export const cloudOn = () => Date.now() >= offUntil;
export const cloudAsrOn = () => Date.now() >= asrOffUntil;

// Transcription d'une radio d'équipe (adresse d'archive F1) : { text, d } (texte vide : radio sans
// parole), ou null (indisponible)
export async function cloudTranscribe(url) {
  if (!cloudAsrOn()) return null;
  try {
    const res = await fetch(`/api/radio-text?u=${encodeURIComponent(url)}`);
    if (res.ok) {
      const r = await res.json();
      return typeof r?.text === 'string' ? r : null;
    }
    if (res.status >= 500 || res.status === 429) asrOffUntil = Date.now() + 10 * 60e3;   // 502 (archive F1 lente)… : pas « sans parole »
  } catch { asrOffUntil = Date.now() + 10 * 60e3; }
  return null;
}

async function flush() {
  timer = 0;
  const list = pending;
  pending = [];
  const byLang = new Map();
  for (const p of list) byLang.set(p.to, [...(byLang.get(p.to) || []), p]);
  for (const [to, part] of byLang) {
    let out = [];
    try {
      const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, items: part.map(({ text, from, kind }) => ({ text, from, kind })) }) });
      if (res.ok) out = (await res.json()).out || [];
      else offUntil = Date.now() + 10 * 60e3;
    } catch { offUntil = Date.now() + 10 * 60e3; }
    part.forEach((p, i) => p.resolve(typeof out[i] === 'string' && out[i].trim() ? out[i] : null));
  }
}

// Traduction d'un texte, ou null (indisponible, langue non prise en charge). kind : 'news', 'radio' ou 'tech'
// (le serveur choisit le modèle)
export function cloudTranslate(text, from, to, kind) {
  if (!text || !cloudOn() || !LANGS.includes(to)) return Promise.resolve(null);
  return new Promise((resolve) => {
    pending.push({ text, from: LANGS.includes(from) ? from : 'en', to, kind, resolve });
    if (pending.length >= 40) { clearTimeout(timer); flush(); } else timer ||= setTimeout(flush, 60);
  });
}

