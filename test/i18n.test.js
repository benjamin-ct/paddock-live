import test from 'node:test';
import assert from 'node:assert/strict';
import EN_DICT from '../public/js/i18n-en.js';
import { buildSummary } from '../shared/summary.js';
import { keyMoments } from '../shared/moments.js';
import { buildIcs } from '../shared/ics.js';

// Interface en anglais : le module lit la langue dans les préférences du navigateur
globalThis.localStorage = { getItem: () => JSON.stringify({ lang: 'en' }) };
const i18n = await import('../public/js/i18n.js');

test('anglais : chaque traduction garde ses valeurs dynamiques', () => {
  for (const [fr, en] of Object.entries(EN_DICT)) {
    assert.ok(en.trim(), `traduction vide : ${fr}`);
    const n = (fr.match(/\{\}/g) || []).length;
    const numbered = en.match(/\{\d+\}/g);
    // {} dans l'ordre : autant qu'en français ; {0}, {1}… : uniquement des valeurs existantes
    if (numbered) assert.ok(numbered.every((x) => Number(x.slice(1, -1)) < n), `${fr} -> ${en}`);
    else assert.equal((en.match(/\{\}/g) || []).length, n, `${fr} -> ${en}`);
  }
});

test('anglais : un texte déjà en anglais ne change pas une seconde fois', () => {
  // La page retraduit ce qu'elle affiche : un gabarit trop court (« T{} ») happait tout texte en T
  for (const s of ['Teammates', 'Title possible at the earliest', 'The title cannot be decided', 'Lap 12', 'Pit stops']) {
    assert.equal(i18n.translate(s), null, s);
  }
});

test('anglais : textes exacts, gabarits et valeurs elles-mêmes traduites', () => {
  assert.equal(i18n.LANG, 'en');
  assert.equal(i18n.DEC, '.');
  assert.equal(i18n.t('Tour {}', 12), 'Lap 12');
  assert.equal(i18n.translate('Réglages'), 'Settings');
  assert.equal(i18n.translate('Il y a 3.2 s en live'), '3.2 s ago live');
  assert.equal(i18n.translate('  Classement  '), 'Standings', 'espaces ignorés');
  assert.equal(i18n.translate('Drapeau Jaune (secteur 4)'), 'Yellow flag (sector 4)');
  assert.equal(i18n.translate('Repris par 2 autres sources'), 'Covered by 2 other sources', 'ordre des valeurs changé');
  assert.equal(i18n.translate('Verstappen'), null, 'nom propre laissé tel quel');
  assert.equal(i18n.tx('Max Verstappen'), 'Max Verstappen');
});

const race = {
  SessionInfo: { Type: 'Race', Name: 'Race', Meeting: { Name: 'Italian Grand Prix' } },
  SessionStatus: { Status: 'Finished' },
  LapCount: { CurrentLap: 53, TotalLaps: 53 },
  DriverList: { 1: { Tla: 'NOR', LastName: 'Norris', TeamName: 'McLaren' }, 16: { Tla: 'LEC', LastName: 'Leclerc' }, 44: { Tla: 'HAM', LastName: 'Hamilton' }, 14: { Tla: 'ALO', LastName: 'Alonso' } },
  TimingData: { Lines: { 1: { Position: '1', NumberOfLaps: 53 }, 16: { Position: '2', GapToLeader: '+2.5', NumberOfLaps: 53 }, 44: { Position: '3', NumberOfLaps: 53 }, 14: { Position: '4', NumberOfLaps: 20, Retired: true } } },
  TimingAppData: { Lines: { 1: { GridPos: '2', Stints: [{ Compound: 'MEDIUM' }, { Compound: 'HARD' }] }, 16: { GridPos: '1' }, 44: { GridPos: '10' }, 14: { GridPos: '6' } } },
  TimingStats: { Lines: { 44: { PersonalBestLapTime: { Value: '1:21.000', Position: 1, Lap: 50 } } } },
  RaceControlMessages: { Messages: [{ Message: 'SAFETY CAR DEPLOYED', Lap: 12 }] },
};

test('anglais : résumé de la séance rédigé en anglais', () => {
  const s = buildSummary(race, { lang: 'en' });
  assert.equal(s.title, 'Norris wins the Italian Grand Prix');
  const t = s.paragraphs.join('\n');
  assert.match(t, /Norris \(McLaren\) wins ahead of Leclerc and Hamilton, 2\.5 s clear of second place, having started 2nd\./);
  assert.match(t, /Great comebacks: Hamilton \(10th → 3rd, \+7\)/);
  assert.match(t, /Norris's strategy: 1 stop \(medium → hard\)/);
  assert.match(t, /A race marked by a safety car \(lap 12\)/);
  assert.match(t, /Retirement: Alonso\./);
  assert.match(t, /Fastest lap: Hamilton in 1:21\.000 \(lap 50\)/);
  assert.equal(buildSummary(race).title, "Norris remporte le Grand Prix d'Italie", 'français par défaut');
});

test('anglais : moments clés et calendrier', () => {
  const ev = [
    { off: 0, topic: 'DriverList', data: { 1: { Tla: 'NOR' }, 16: { Tla: 'LEC' } } },
    { off: 1000, topic: 'TimingData', data: { Lines: { 16: { Position: '1' }, 1: { Position: '2' } } } },
    { off: 2000, topic: 'SessionStatus', data: { Status: 'Started' } },
    { off: 60000, topic: 'TimingData', data: { Lines: { 1: { Position: '1' }, 16: { Position: '2' } } } },
  ];
  const texts = keyMoments(ev, { kind: 'race', lang: 'en' }).map((m) => m.text);
  assert.deepEqual(texts, ['Lights out', 'NOR takes the lead from LEC']);
  const ics = buildIcs([{ round: 3, name: 'Japanese Grand Prix', sessions: [{ label: 'Course', t: '2026-04-05T05:00:00Z' }] }], { year: 2026, lang: 'en', now: 0 });
  assert.match(ics, /SUMMARY:F1 Japanese GP — Race/);
  assert.match(ics, /in 15 min/);
});

// Italien et espagnol : un module par langue (la langue est lue au chargement)
const OTHER = {};
for (const lang of ['it', 'es']) {
  globalThis.localStorage = { getItem: () => JSON.stringify({ lang }) };
  OTHER[lang] = { dict: (await import(`../public/js/i18n-${lang}.js`)).default, i18n: await import(`../public/js/i18n.js?${lang}`) };
}

test('italien et espagnol : mêmes textes que l\'anglais, valeurs dynamiques gardées', () => {
  for (const [lang, { dict }] of Object.entries(OTHER)) {
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(EN_DICT).sort(), `${lang} : clés différentes de l'anglais`);
    for (const [fr, tr] of Object.entries(dict)) {
      assert.ok(tr.trim(), `${lang} : traduction vide : ${fr}`);
      const n = (fr.match(/\{\}/g) || []).length;
      const numbered = tr.match(/\{\d+\}/g);
      if (numbered) assert.ok(!/\{\}/.test(tr) && numbered.every((x) => Number(x.slice(1, -1)) < n), `${lang} : ${fr} -> ${tr}`);
      else assert.equal((tr.match(/\{\}/g) || []).length, n, `${lang} : ${fr} -> ${tr}`);
    }
  }
});

test('italien et espagnol : un texte déjà traduit ne change pas une seconde fois', () => {
  // La page retraduit ce qu'elle affiche : « Fin de la sesión » ne doit pas repasser par le gabarit « Fin {} »
  for (const [lang, { dict, i18n: l }] of Object.entries(OTHER)) {
    for (const tr of Object.values(dict)) {
      const shown = tr.replace(/\{\d*\}/g, 'NOR').replace(/\s+/g, ' ').trim();
      const again = l.translate(shown);
      assert.ok(again === null || again === shown, `${lang} : ${shown} -> ${again}`);
    }
  }
});

test('italien et espagnol : textes, gabarits, nombres et rangs', () => {
  const { i18n: it } = OTHER.it, { i18n: es } = OTHER.es;
  assert.equal(it.LANG, 'it');
  assert.equal(it.LOCALE, 'it-IT');
  assert.equal(it.DEC, ',');
  assert.equal(it.t('Tour {}', 12), 'Giro 12');
  assert.equal(it.translate('Réglages'), 'Impostazioni');
  assert.equal(it.translate('Drapeau rouge — séance arrêtée'), 'Bandiera rossa — sessione interrotta');
  assert.equal(it.translate('Il y a 3,2 s en live'), '3,2 s fa in diretta');
  assert.equal(it.ord(2), '2º');
  assert.equal(es.LANG, 'es');
  assert.equal(es.LOCALE, 'es-ES');
  assert.equal(es.DEC, ',');
  assert.equal(es.t('Tour {}', 12), 'Vuelta 12');
  assert.equal(es.translate('Réglages'), 'Ajustes');
  assert.equal(es.translate('Repris par 2 autres sources'), 'Recogido por 2 otras fuentes');
  assert.equal(es.ord(2), '2.º');
  assert.equal(es.translate('Verstappen'), null, 'nom propre laissé tel quel');
});
