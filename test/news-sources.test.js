import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SOURCES } from '../shared/news-sources.js';
import { feedItems } from '../shared/news-collect.js';

const feed = (titles) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${titles.map((t, i) => `<entry><title>${t}</title><link href="https://www.youtube.com/watch?v=abcdefghij${i}"/><published>2026-10-16T10:00:00Z</published></entry>`).join('')}</feed>`;

test('sources : identifiants uniques, chaînes des 11 écuries', () => {
  const ids = DEFAULT_SOURCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(DEFAULT_SOURCES.filter((s) => s.cat === 'team').length, 11);
});

test('chaîne qui parle d\'autre chose (Ferrari) : seules les vidéos F1 gardées', () => {
  const ferrari = DEFAULT_SOURCES.find((s) => s.name === 'Scuderia Ferrari');
  const list = feedItems(ferrari, feed(['Lewis Hamilton &amp; Charles Leclerc Take Over', 'Which #FerrariF12tdf are you taking?', 'Singapore GP | Race highlights']), Date.parse('2026-10-16T12:00:00Z'));
  assert.deepEqual(list.map((it) => it.title), ['Lewis Hamilton & Charles Leclerc Take Over', 'Singapore GP | Race highlights']);
  // Écurie sans filtre : tout est gardé
  const williams = DEFAULT_SOURCES.find((s) => s.name === 'Williams');
  assert.equal(feedItems(williams, feed(['Factory tour', 'Behind the scenes']), Date.parse('2026-10-16T12:00:00Z')).length, 2);
});

test('CANAL+ Sport : seules les vidéos F1 gardées (pas le foot ni la F1 Academy)', () => {
  const canal = DEFAULT_SOURCES.find((s) => s.name === 'CANAL+ Sport');
  const list = feedItems(canal, feed(['Le résumé de Bayern Munich / Arsenal', '🏎️ 🔴 F1 ACADEMY : Grand Prix des États-Unis (Course 3)', 'Le résumé du Grand Prix des États-Unis - F1', 'Formule 1 : le debrief de Canal+', 'MotoGP : Grand Prix de Malaisie']), Date.parse('2026-10-16T12:00:00Z'));
  assert.deepEqual(list.map((it) => it.title), ['Le résumé du Grand Prix des États-Unis - F1', 'Formule 1: le debrief de Canal+']);
});
