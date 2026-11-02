// Noms des Grands Prix et des séances pour l'affichage en français (les données de la F1 et de Jolpica
// sont en anglais) : « Australian Grand Prix » -> « Australie » ou « GP d'Australie », « Race » -> « Course ».
// En anglais (en = true ou 'en'), les noms d'origine sont gardés ; 'it' et 'es' : noms italiens et espagnols
// (« Gran Premio d'Australia », « Gran Premio de Australia »).

// Nom du pays ou de la ville, et préposition du nom complet (« Grand Prix d'Australie »)
const GP = {
  Australian: ['Australie', "d'"], Chinese: ['Chine', 'de '], Japanese: ['Japon', 'du '], Bahrain: ['Bahreïn', 'de '],
  'Saudi Arabian': ['Arabie saoudite', "d'"], Miami: ['Miami', 'de '], 'Emilia Romagna': ['Émilie-Romagne', "d'"],
  Monaco: ['Monaco', 'de '], Spanish: ['Espagne', "d'"], Barcelona: ['Barcelone', 'de '], 'Barcelona-Catalunya': ['Barcelone', 'de '],
  Madrid: ['Madrid', 'de '], Canadian: ['Canada', 'du '], Austrian: ['Autriche', "d'"], British: ['Grande-Bretagne', 'de '],
  Belgian: ['Belgique', 'de '], Hungarian: ['Hongrie', 'de '], Dutch: ['Pays-Bas', 'des '], Italian: ['Italie', "d'"],
  Azerbaijan: ['Azerbaïdjan', "d'"], Singapore: ['Singapour', 'de '], 'United States': ['États-Unis', 'des '],
  'Mexico City': ['Mexico', 'de '], Mexican: ['Mexique', 'du '], 'São Paulo': ['São Paulo', 'de '], 'Sao Paulo': ['São Paulo', 'de '],
  Brazilian: ['Brésil', 'du '], 'Las Vegas': ['Las Vegas', 'de '], Qatar: ['Qatar', 'du '], 'Abu Dhabi': ['Abou Dabi', "d'"],
  Portuguese: ['Portugal', 'du '], French: ['France', 'de '], German: ['Allemagne', "d'"], Turkish: ['Turquie', 'de '],
  Russian: ['Russie', 'de '], Styrian: ['Styrie', 'de '], Tuscan: ['Toscane', 'de '], Eifel: ['Eifel', "de l'"],
  Sakhir: ['Sakhir', 'de '], '70th Anniversary': ['70e anniversaire', 'du '], Malaysian: ['Malaisie', 'de '],
  Korean: ['Corée', 'de '], Indian: ['Inde', "d'"], European: ['Europe', "d'"],
};
const GP_IT = {
  Australian: ['Australia', "d'"], Chinese: ['Cina', 'di '], Japanese: ['Giappone', 'del '], Bahrain: ['Bahrein', 'del '],
  'Saudi Arabian': ['Arabia Saudita', "dell'"], Miami: ['Miami', 'di '], 'Emilia Romagna': ['Emilia-Romagna', "dell'"],
  Monaco: ['Monaco', 'di '], Spanish: ['Spagna', 'di '], Barcelona: ['Barcellona', 'di '], 'Barcelona-Catalunya': ['Barcellona', 'di '],
  Madrid: ['Madrid', 'di '], Canadian: ['Canada', 'del '], Austrian: ['Austria', "d'"], British: ['Gran Bretagna', 'di '],
  Belgian: ['Belgio', 'del '], Hungarian: ['Ungheria', "d'"], Dutch: ['Olanda', "d'"], Italian: ['Italia', "d'"],
  Azerbaijan: ['Azerbaigian', "dell'"], Singapore: ['Singapore', 'di '], 'United States': ['Stati Uniti', 'degli '],
  'Mexico City': ['Città del Messico', 'di '], Mexican: ['Messico', 'del '], 'São Paulo': ['San Paolo', 'di '], 'Sao Paulo': ['San Paolo', 'di '],
  Brazilian: ['Brasile', 'del '], 'Las Vegas': ['Las Vegas', 'di '], Qatar: ['Qatar', 'del '], 'Abu Dhabi': ['Abu Dhabi', 'di '],
  Portuguese: ['Portogallo', 'del '], French: ['Francia', 'di '], German: ['Germania', 'di '], Turkish: ['Turchia', 'di '],
  Russian: ['Russia', 'di '], Styrian: ['Stiria', 'di '], Tuscan: ['Toscana', 'di '], Eifel: ['Eifel', "dell'"],
  Sakhir: ['Sakhir', 'di '], '70th Anniversary': ['70º Anniversario', 'del '], Malaysian: ['Malesia', 'di '],
  Korean: ['Corea', 'di '], Indian: ['India', "dell'"], European: ['Europa', "d'"],
};
const GP_ES = {
  Australian: ['Australia', 'de '], Chinese: ['China', 'de '], Japanese: ['Japón', 'de '], Bahrain: ['Baréin', 'de '],
  'Saudi Arabian': ['Arabia Saudí', 'de '], Miami: ['Miami', 'de '], 'Emilia Romagna': ['Emilia-Romaña', 'de '],
  Monaco: ['Mónaco', 'de '], Spanish: ['España', 'de '], Barcelona: ['Barcelona', 'de '], 'Barcelona-Catalunya': ['Barcelona', 'de '],
  Madrid: ['Madrid', 'de '], Canadian: ['Canadá', 'de '], Austrian: ['Austria', 'de '], British: ['Gran Bretaña', 'de '],
  Belgian: ['Bélgica', 'de '], Hungarian: ['Hungría', 'de '], Dutch: ['Países Bajos', 'de los '], Italian: ['Italia', 'de '],
  Azerbaijan: ['Azerbaiyán', 'de '], Singapore: ['Singapur', 'de '], 'United States': ['Estados Unidos', 'de '],
  'Mexico City': ['Ciudad de México', 'de la '], Mexican: ['México', 'de '], 'São Paulo': ['São Paulo', 'de '], 'Sao Paulo': ['São Paulo', 'de '],
  Brazilian: ['Brasil', 'de '], 'Las Vegas': ['Las Vegas', 'de '], Qatar: ['Catar', 'de '], 'Abu Dhabi': ['Abu Dabi', 'de '],
  Portuguese: ['Portugal', 'de '], French: ['Francia', 'de '], German: ['Alemania', 'de '], Turkish: ['Turquía', 'de '],
  Russian: ['Rusia', 'de '], Styrian: ['Estiria', 'de '], Tuscan: ['Toscana', 'de la '], Eifel: ['Eifel', 'de '],
  Sakhir: ['Sakhir', 'de '], '70th Anniversary': ['70.º Aniversario', 'del '], Malaysian: ['Malasia', 'de '],
  Korean: ['Corea', 'de '], Indian: ['India', 'de la '], European: ['Europa', 'de '],
};
// Par langue : noms, « Grand Prix » complet, préposition d'un nom inconnu, pays d'accueil et sa préposition
const LANGS = {
  fr: { names: GP, full: 'Grand Prix', de: (b) => (/^[AEIOUÉÂ]/i.test(b) ? "d'" : 'de '), in: { Malaysia: ['Malaisie', 'en '] }, at: 'à ' },
  it: { names: GP_IT, full: 'Gran Premio', de: (b) => (/^[AEIOU]/i.test(b) ? "d'" : 'di '), in: { Malaysia: ['Malesia', 'in '] }, at: 'a ' },
  es: { names: GP_ES, full: 'Gran Premio', de: () => 'de ', in: { Malaysia: ['Malasia', 'en '] }, at: 'en ' },
};
// Langue demandée : true ou 'en' = anglais (noms d'origine), 'it', 'es', sinon français
const langOf = (en) => (en === true ? 'en' : ['en', 'it', 'es'].includes(en) ? en : 'fr');
const baseOf = (name) => String(name || '').replace(/ Grand Prix$/i, '').replace(/^(Formula 1 )?Grand Prix (of|de) /i, '').trim();

// Grand Prix couru dans un autre pays (« Bahrain Grand Prix in Malaysia », 2026, à Sepang)
const ABROAD = /^(.+?) Grand Prix in (.+)$/i;

// « Australie » (en : « Australian ») ; « Bahreïn (Malaisie) »
export function gpShort(name, en = false) {
  const lang = langOf(en);
  const base = baseOf(name);
  const abroad = ABROAD.exec(base);
  if (lang === 'en') return abroad ? `${abroad[1]} (${abroad[2]})` : base;
  const L = LANGS[lang];
  if (abroad) return `${L.names[abroad[1]]?.[0] || abroad[1]} (${L.in[abroad[2]]?.[0] || abroad[2]})`;
  return L.names[base]?.[0] || base;
}

// « Grand Prix d'Australie » (prefix 'GP' : « GP d'Australie ») ; en : nom d'origine (« Australian GP »)
export function gpFull(name, en = false, prefix = 'Grand Prix') {
  const lang = langOf(en);
  const base = baseOf(name);
  const L = LANGS[lang];
  const pre = L && prefix === 'Grand Prix' ? L.full : prefix;
  // « Grand Prix de Bahreïn en Malaisie » ; autre nom hors du commun : gardé tel quel
  const abroad = ABROAD.exec(base);
  if (abroad && L?.names[abroad[1]]) {
    const [where, inside] = L.in[abroad[2]] || [abroad[2], L.at];
    return `${pre} ${L.names[abroad[1]][1]}${L.names[abroad[1]][0]} ${inside}${where}`;
  }
  if (!base || /grand prix/i.test(base)) return String(name || '');
  if (lang === 'en') return prefix === 'GP' ? `${base} GP` : `${base} Grand Prix`;
  const [local, de] = L.names[base] || [base, L.de(base)];
  return `${pre} ${de}${local}`;
}

// Nom d'une séance (« Race », « Practice 1 », « Sprint Qualifying »…)
const SESSIONS = {
  fr: {
    Race: 'Course', Qualifying: 'Qualifications', Sprint: 'Sprint', 'Sprint Qualifying': 'Qualifications sprint',
    'Sprint Shootout': 'Qualifications sprint', 'Practice 1': 'Essais libres 1', 'Practice 2': 'Essais libres 2', 'Practice 3': 'Essais libres 3',
    'Day 1': 'Jour 1', 'Day 2': 'Jour 2', 'Day 3': 'Jour 3',
  },
  it: {
    Race: 'Gara', Qualifying: 'Qualifiche', Sprint: 'Sprint', 'Sprint Qualifying': 'Qualifiche sprint',
    'Sprint Shootout': 'Qualifiche sprint', 'Practice 1': 'Prove libere 1', 'Practice 2': 'Prove libere 2', 'Practice 3': 'Prove libere 3',
    'Day 1': 'Giorno 1', 'Day 2': 'Giorno 2', 'Day 3': 'Giorno 3',
  },
  es: {
    Race: 'Carrera', Qualifying: 'Clasificación', Sprint: 'Sprint', 'Sprint Qualifying': 'Clasificación sprint',
    'Sprint Shootout': 'Clasificación sprint', 'Practice 1': 'Libres 1', 'Practice 2': 'Libres 2', 'Practice 3': 'Libres 3',
    'Day 1': 'Día 1', 'Day 2': 'Día 2', 'Day 3': 'Día 3',
  },
};
export function sessionLabel(name, en = false) {
  const lang = langOf(en);
  return lang === 'en' ? String(name || '') : SESSIONS[lang][name] || String(name || '');
}
