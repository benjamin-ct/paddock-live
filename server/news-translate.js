// Actualités traduites d'avance : dès qu'un article arrive (et au démarrage pour ceux des derniers
// jours), son titre et son résumé sont traduits par le serveur Paddock Live et gardés avec les autres
// traductions. La page Actu les affiche donc déjà traduits, sans rien calculer sur l'ordinateur.
// Langue choisie par l'interface de l'ordinateur (vide = traduction des actualités désactivée).
const TITLE_DAYS = 3;
const SUMMARY_DAYS = 2;
const MAX_SUMMARIES = 150;
const RETRY_MS = 15 * 60e3;
const FAILED_MS = 60 * 60e3;   // texte refusé : nouvel essai une heure plus tard

export function createNewsTranslator({ cloud, snapshot, known, store, lang = () => null, now = Date.now }) {
  const failed = new Map();   // texte refusé -> heure du refus
  let running = null;
  let again = false;

  // Textes à traduire : titres des 3 derniers jours, résumés des 2 derniers (les plus récents d'abord)
  function todo(to) {
    const have = known(to);
    const items = snapshot().filter((it) => it.lang !== to && it.t >= now() - TITLE_DAYS * 86400e3).sort((a, b) => b.t - a.t);
    const out = new Map();
    const want = (text, from) => {
      if (text && !Object.hasOwn(have, text) && !(now() - (failed.get(text) ?? -Infinity) < FAILED_MS) && !out.has(text)) out.set(text, from);
    };
    for (const it of items) want(it.title, it.lang);
    for (const it of items.filter((x) => x.summary && x.t >= now() - SUMMARY_DAYS * 86400e3).slice(0, MAX_SUMMARIES)) want(it.summary, it.lang);
    return [...out];
  }

  async function run() {
    const to = lang();
    if (!to || !cloud.available()) return 0;
    let n = 0;
    const list = todo(to);
    for (let i = 0; i < list.length && cloud.available(); i += 40) {
      const part = list.slice(i, i + 40);
      const res = await Promise.all(part.map(([text, from]) => cloud.translate(text, from, to, 'news')));
      const done = [];
      part.forEach(([text], j) => {
        if (res[j]) done.push({ en: text, t: res[j], q: 'light' });
        else if (cloud.available()) failed.set(text, now());   // texte refusé : nouvel essai plus tard
      });
      n += store(to, done);
    }
    return n;
  }

  // Un seul passage à la fois ; une demande pendant un passage en relance un juste après
  function sweep() {
    if (running) { again = true; return running; }
    running = run().catch(() => 0).finally(() => {
      running = null;
      if (again) { again = false; sweep(); }
    });
    return running;
  }

  return { sweep, todo };
}

// Branchement sur les actualités du serveur : nouveaux articles, démarrage, nouvel essai régulier
export function startNewsTranslation(t, onNews) {
  onNews(() => t.sweep());
  setTimeout(() => t.sweep(), 20000).unref?.();
  setInterval(() => t.sweep(), RETRY_MS).unref?.();
}
