import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSets, setSummary, dryAllocation } from '../shared/tyres.js';
import { parseFeed, isF1Article, findNominations, adviceSentences, nominationFor, previousSessions, weekendBest } from '../analytics/tyres.js';

const st = (Compound, New, StartLaps, TotalLaps, TyresNotChanged = '0') => ({ Compound, New: String(New), StartLaps, TotalLaps, TyresNotChanged });

test('jeux de pneus : neufs, réutilisés d\'une séance à l\'autre, arrêts sans changement', () => {
  const sessions = [
    { name: 'Practice 1', stints: { 1: [st('MEDIUM', true, 0, 8), st('MEDIUM', false, 8, 11, '1'), st('SOFT', true, 0, 4)] } },
    { name: 'Qualifying', stints: { 1: { 0: st('SOFT', false, 4, 7), 1: st('SOFT', true, 0, 3) } } },
    { name: 'Race', stints: { 1: [st('MEDIUM', false, 11, 30), st('HARD', true, 0, 20)] } },
  ];
  const sets = buildSets(sessions)[1];
  assert.equal(sets.length, 4);
  const med = sets.filter((s) => s.compound === 'MEDIUM');
  assert.equal(med.length, 1, 'le medium de l\'EL1 est le même jeu en course');
  assert.equal(med[0].laps, 30);
  assert.deepEqual(med[0].sessions, ['Practice 1', 'Race']);
  const soft = sets.filter((s) => s.compound === 'SOFT').map((s) => s.laps).sort();
  assert.deepEqual(soft, [3, 7]);

  const sum = setSummary(sets, dryAllocation(false), true);
  assert.equal(sum.SOFT.allocated, 9);
  assert.equal(sum.SOFT.newLeft, 7);
  assert.equal(sum.MEDIUM.newLeft, 2);
  assert.equal(sum.HARD.newLeft, 1);
  assert.deepEqual(sum.HARD.used, [20]);
  assert.equal(sum.INTERMEDIATE.newLeft, null);
});

test('allocation : 13 jeux, 12 en week-end sprint', () => {
  assert.deepEqual(dryAllocation(false), { HARD: 2, MEDIUM: 3, SOFT: 8 });
  assert.deepEqual(dryAllocation(true), { HARD: 2, MEDIUM: 4, SOFT: 6 });
});

const FEED = `<rss><channel>
<item><title>Spotlight on Singapore</title><link>https://press.pirelli.com/spotlight-on-singapore/</link><pubDate>Tue, 06 Oct 2026 10:00:00 +0200</pubDate>
<description><![CDATA[<p>For the Marina Bay circuit, Pirelli will bring the same tyre allocation used twelve months ago: C3 as Hard, C4 as Medium and C5 as Soft.</p><p>“A one-stop strategy should be the quickest on paper.”</p><p>In 2025 Medium and Soft were the two compounds chosen, a one-stop for everyone.</p>]]></description></item>
<item><title>Bulega crowned World Champion</title><link>https://press.pirelli.com/x/</link><pubDate>Sun, 27 Sep 2026 10:00:00 +0200</pubDate>
<description><![CDATA[<p>The Superbike World Championship &amp; Pirelli: pole and race on the SCX.</p>]]></description></item>
</channel></rss>`;

test('flux Pirelli : articles F1, choix de composés, préconisations', () => {
  const items = parseFeed(FEED);
  assert.equal(items.length, 2);
  assert.equal(items[1].paras[0], 'The Superbike World Championship & Pirelli: pole and race on the SCX.');
  const f1 = items.filter(isF1Article);
  assert.deepEqual(f1.map((a) => a.title), ['Spotlight on Singapore']);
  const noms = findNominations(f1[0].paras.join(' '));
  assert.deepEqual(noms.map((n) => n.c), [[3, 4, 5]]);
  assert.deepEqual(findNominations('For Melbourne, the nominations are C3, C4, and C5.').map((n) => n.c), [[3, 4, 5]]);
  // Les rappels de l'an passé ne sont pas des préconisations
  assert.deepEqual(adviceSentences(f1[0].paras), ['A one-stop strategy should be the quickest on paper.']);
});

test('choix Pirelli : table intégrée puis annonces du flux', () => {
  assert.deepEqual(nominationFor(2026, { name: 'Azerbaijan Grand Prix', location: 'Baku' }).hard, 3);
  const found = [{ text: 'For the Las Vegas Grand Prix, C3 as Hard, C4 as Medium and C5 as Soft.', c: [3, 4, 5], url: 'u', date: Date.parse('2026-10-20') }];
  const lv = nominationFor(2026, { name: 'Las Vegas Grand Prix', location: 'Las Vegas', start: Date.parse('2026-11-19') }, found);
  assert.deepEqual([lv.hard, lv.medium, lv.soft, lv.url], [3, 4, 5, 'u']);
  assert.equal(nominationFor(2026, { name: 'Qatar Grand Prix', location: 'Lusail', start: Date.parse('2026-11-27') }, found), null);
});

test('choix Pirelli : un Grand Prix aux États-Unis ne prend pas la ligne d\'un autre', () => {
  assert.equal(nominationFor(2026, { name: 'Las Vegas Grand Prix', location: 'Las Vegas', country: 'United States' }), null);
  assert.equal(nominationFor(2026, { name: 'United States Grand Prix', location: 'Austin', country: 'United States' }).hard, 2);
  assert.equal(nominationFor(2026, { name: 'Miami Grand Prix', location: 'Miami Gardens', country: 'United States' }).hard, 3);
});

test('choix Pirelli : l\'annonce d\'Austin ne vaut pas pour Las Vegas', () => {
  const found = [{ text: 'For the United States Grand Prix in Austin (23-25 October), the compounds will be C2 as Hard, C3 as Medium and C4 as Soft.', c: [2, 3, 4], url: 'u', date: Date.parse('2026-10-09') }];
  assert.equal(nominationFor(2027, { name: 'Las Vegas Grand Prix', location: 'Las Vegas', country: 'United States', start: Date.parse('2026-11-19') }, found), null);
  assert.equal(nominationFor(2027, { name: 'United States Grand Prix', location: 'Austin', country: 'United States', start: Date.parse('2026-10-23') }, found).hard, 2);
});

test('meilleur du week-end : le plus rapide des séances déjà courues, séance affichée exclue', () => {
  const lap = (time, tla) => ({ time, tla, team: '', color: '3671C6', lap: 5 });
  const meeting = [
    { name: 'Pre-Season Testing', path: '2026/t/', best: lap(80.1, 'ALB') },
    { name: 'Practice 1', path: '2026/a/', best: lap(91.2, 'VER') },
    { name: 'Practice 2', path: '2026/b/', best: lap(90.4, 'NOR') },
    { name: 'Practice 3', path: '2026/c/', best: null },
    { name: 'Qualifying', path: '2026/d/', best: lap(89.7, 'LEC') },
    { name: 'Race', path: '2026/e/', best: lap(92.0, 'HAM') },
  ];
  const done = previousSessions(meeting, '2026/d/');
  assert.deepEqual(done.map((s) => s.name), ['Practice 1', 'Practice 2', 'Practice 3'], 'tests et séance affichée exclus');
  assert.deepEqual(weekendBest(done), { ...lap(90.4, 'NOR'), session: 'Practice 2' });
  assert.equal(weekendBest(previousSessions(meeting, '2026/e/')).tla, 'LEC');
  assert.equal(weekendBest(previousSessions(meeting, '2026/a/')), null, 'première séance : rien');
  assert.equal(weekendBest(previousSessions(meeting, '2026/x/')), null, 'séance inconnue : rien');
});
