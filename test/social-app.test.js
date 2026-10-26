import test from 'node:test';
import assert from 'node:assert/strict';
import { richWords, plain, appPost, appCaptions } from '../shared/social-app.js';
import { slidesFor, keptData, drawSlide, slideAlt } from '../shared/social-draw.js';
import { captionsFor } from '../shared/post-draft.js';
import { xLength } from '../shared/social.js';

test('post Paddock Live : mots en rouge entre astérisques, pages vides écartées', () => {
  assert.deepEqual(richWords('Les radios, *en français.*'), [{ w: 'Les', red: false }, { w: 'radios,', red: false }, { w: 'en', red: true }, { w: 'français.', red: true }]);
  assert.equal(plain('Les radios, *en  français.*'), 'Les radios, en français.');
  const d = appPost([{ title: 'Un *titre*' }, { title: '', text: '' }, { title: '', text: 'Texte seul' }]);
  assert.equal(d.title, 'Un titre');
  assert.equal(d.pages.length, 2);
  assert.equal(appPost([{ title: '' }]).pages.length, 1, 'une page au moins');
});

test('post Paddock Live : une image par page, ni question ni « Abonnez-vous », pages écartées hors des textes', () => {
  const d = appPost([{ kicker: 'Radios', title: 'Un', text: 'Premier' }, { title: 'Deux' }, { title: 'Trois' }]);
  assert.deepEqual(slidesFor(d, { follow: true, question: true }), ['app-1', 'app-2', 'app-3']);
  assert.deepEqual(keptData(d, new Set(['app-2']), 'ig').pages.map((p) => p.title), ['Un', 'Trois']);
  assert.equal(slideAlt(d, 'app-1'), 'Un. Premier');
});

test('post Paddock Live : textes dans les limites de chaque réseau, site et « gratuit »', () => {
  const long = 'mot '.repeat(120).trim();
  const d = appPost([{ title: `Ce qu'ils se disent à la radio, *en français.* ${long}`, text: long }, { title: 'Les radios traduites' }]);
  const c = appCaptions(d);
  assert.ok(xLength(c.x) <= 280, c.x);
  assert.ok([...c.bsky].length <= 300);
  assert.ok(c.threads.length <= 500);
  assert.ok([...c.youtube.split('\n')[0]].length <= 100);
  for (const k of ['instagram', 'facebook', 'threads', 'x', 'bsky', 'tiktok', 'youtube']) assert.match(c[k], /Gratuit/, k);
  assert.match(c.facebook, /https:\/\/paddocklive\.app/);
  assert.match(c.instagram, /▸ Les radios traduites/);
  assert.ok(!/\*/.test(c.instagram), 'pas d\'astérisques');
  assert.equal(captionsFor(d, '@BenjyPaddock').x, c.x, 'brouillon repris : mêmes textes');
});

test('post Paddock Live : visuel dessiné (logo, mots du titre, numéro de page, pied)', () => {
  const texts = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : k === 'fillText' ? (s) => texts.push(String(s))
      : ['createLinearGradient', 'createRadialGradient'].includes(k) ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const d = appPost([{ kicker: "Radios d'équipe", title: 'Les radios *en français.*' }, { title: 'Deux' }]);
  drawSlide({ getContext: () => ctx }, 'app-1', 'ig', d, { slides: ['app-1', 'app-2'] });
  for (const t of ['PL', 'Paddock', 'Live', "RADIOS D'ÉQUIPE", 'radios', 'français.', '1 / 2', 'paddocklive.app']) assert.ok(texts.includes(t), `${t} : ${texts.join(' | ')}`);
});
