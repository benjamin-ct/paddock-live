import test from 'node:test';
import assert from 'node:assert/strict';
import * as draw from '../shared/social-draw.js';

const { styled, C, MEDAL } = draw;

test('style « Télémétrie » des visuels : polices et palette le temps du dessin, remises ensuite', () => {
  const before = { C: { ...C }, MEDAL: [...MEDAL], TITLE: draw.TITLE, BODY: draw.BODY };
  const seen = styled({ style: 'v3' }, () => ({ v3: draw.v3, tv: draw.tv, TITLE: draw.TITLE, BODY: draw.BODY, bg: C.bg, red: C.red }));
  assert.equal(seen.v3, true);
  assert.equal(seen.tv, false);
  assert.match(seen.TITLE, /Archivo Cond/);
  assert.match(seen.BODY, /Archivo/);
  assert.equal(seen.bg, '#0B0F15');
  assert.equal(seen.red, '#E10600');
  const back = () => assert.deepEqual({ C: { ...C }, MEDAL: [...MEDAL], TITLE: draw.TITLE, BODY: draw.BODY, v3: draw.v3 }, { ...before, v3: false });
  back();
  // Remis en place aussi après une erreur, et après un dessin imbriqué (couverture d'une vidéo)
  assert.throws(() => styled({ style: 'v3' }, () => { throw new Error('dessin'); }));
  back();
  styled({ style: 'v3' }, () => { styled({ style: 'v3' }, () => {}); assert.equal(C.bg, '#0B0F15'); assert.equal(draw.v3, true); });
  back();
  // Télé premium et Classique : palette de base
  styled({ style: 'tv' }, () => { assert.equal(draw.tv, true); assert.deepEqual({ ...C }, before.C); });
  styled({}, () => assert.equal(draw.TITLE, before.TITLE));
  back();
});
