import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validHeadshot } from '../shared/portraits.js';

test('photos des pilotes : seules les images du site de la F1 sont relayées', () => {
  assert.equal(validHeadshot('https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LANNOR01_Lando_Norris/lannor01.png.transform/1col/image.png'), true);
  assert.equal(validHeadshot('http://media.formula1.com/x.png'), false, 'https uniquement');
  assert.equal(validHeadshot('https://evil.example/x.png'), false);
  assert.equal(validHeadshot('https://media.formula1.com.evil.example/x.png'), false);
  assert.equal(validHeadshot('https://media.formula1.com/content/page.html'), false, 'images seulement');
  assert.equal(validHeadshot('pas une adresse'), false);
});
