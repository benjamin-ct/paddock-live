import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseDecisionDoc, penaltyFr, factFr, turnsOf, docDecisions, rcmDecisions, mergeDecisions, decisionData, sameSession } from '../shared/social-decision.js';
import { moreCaptions } from '../shared/social-more.js';
import { slidesFor, slideAlt, slideName } from '../shared/social-draw.js';
import { captionsFor } from '../shared/post-draft.js';
import { creditCaptions, questionFor } from '../shared/social-follow.js';
import { xLength } from '../shared/social.js';

// Documents 33 et 34 du Grand Prix de Mexico 2026 (texte positionné du PDF, comme pdf.js le rend)
const pages = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/fia-decision-mexico-${n}.json`, import.meta.url)));
const entries = [{ doc: { published: 2 }, num: 34, p: parseDecisionDoc(pages('car30')) }, { doc: { published: 1 }, num: 33, p: parseDecisionDoc(pages('car3')) }];
const state = {
  SessionInfo: { Type: 'Practice', Name: 'Practice 2', StartDate: '2026-10-30T14:00:00', Meeting: { Name: 'Mexico City Grand Prix', Location: 'Mexico City', Country: { Code: 'MEX', Name: 'Mexico' }, Circuit: { Key: 65, ShortName: 'Mexico City' } } },
  DriverList: {
    3: { Tla: 'VER', FirstName: 'Max', LastName: 'Verstappen', TeamName: 'Red Bull Racing', TeamColour: '4781D7' },
    30: { Tla: 'LAW', FirstName: 'Liam', LastName: 'Lawson', TeamName: 'Racing Bulls', TeamColour: '6C98FF' },
    44: { Tla: 'HAM', FirstName: 'Lewis', LastName: 'Hamilton', TeamName: 'Ferrari', TeamColour: 'ED1131' },
  },
  TimingData: { Lines: { 3: { Position: '1' }, 44: { Position: '2' } } },
  RaceControlMessages: { Messages: [
    { Utc: '2026-10-30T22:45:00', Message: 'FIA STEWARDS: TURN 7 INCIDENT INVOLVING CAR 44 (HAM) NOTED - CAUSING A COLLISION' },
    { Utc: '2026-10-30T22:50:00', Message: 'FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 44 (HAM) - CAUSING A COLLISION' },
    { Utc: '2026-10-30T22:55:00', Message: 'FIA STEWARDS: 3 PLACE GRID PENALTY FOR CAR 3 (VER) - IMPEDING' },
    { Utc: '2026-10-30T23:10:00', Message: 'FIA STEWARDS: PENALTY SERVED - 5 SECOND TIME PENALTY FOR CAR 44 (HAM) - CAUSING A COLLISION' },
  ] },
};

test('décision des commissaires : lecture du document de la FIA', () => {
  const p = parseDecisionDoc(pages('car3'));
  assert.equal(p.num, '3');
  assert.equal(p.name, 'Max Verstappen');
  assert.equal(p.team, 'Oracle Red Bull Racing');
  assert.equal(p.session, 'Free Practice 2');
  assert.equal(p.fact, 'Cars 3 and 30 engaged in a series of moves on the entry to turn 12 through to the apex of turn 14.');
  assert.match(p.decision, /^A drop of one grid position for the next race in which the driver competes\. One penalty point is imposed, making a total of 1 for the 12 month period\.$/);
  assert.match(p.reason, /^The Stewards heard from the driver of Car 3 .*Free Practice in previous years\.$/);   // rappel du droit d'appel et signatures exclus
  assert.equal(parseDecisionDoc([[]]), null);
});

test('décision des commissaires : sanction en français', () => {
  const grid = penaltyFr('A drop of one grid position for the next race in which the driver competes. One penalty point is imposed, making a total of 4 for the 12 month period.');
  assert.deepEqual(grid, { kind: 'grid', band: '1 PLACE DE PÉNALITÉ SUR LA GRILLE', short: '1 place de pénalité sur la grille', next: true, points: 1, total: 4, fine: null });
  assert.equal(penaltyFr('Drop of 50 grid positions for the next Race in which the driver participates.').band, '50 PLACES DE PÉNALITÉ SUR LA GRILLE');
  assert.equal(penaltyFr('3 PLACE GRID PENALTY').short, '3 places de pénalité sur la grille');
  assert.equal(penaltyFr('5 SECOND TIME PENALTY').band, '5 SECONDES DE PÉNALITÉ');
  const time = penaltyFr('10 second time penalty. 2 penalty points (Total 6 points for the 12-month period)');
  assert.deepEqual([time.band, time.points, time.total], ['10 SECONDES DE PÉNALITÉ', 2, 6]);
  assert.equal(penaltyFr('Drive through penalty').band, 'DRIVE-THROUGH');
  assert.equal(penaltyFr('10 SECOND STOP/GO PENALTY').band, 'STOP & GO DE 10 SECONDES');
  assert.equal(penaltyFr('Competitor: Warning. Driver: Warning').band, 'AVERTISSEMENT');
  assert.equal(penaltyFr('Reprimand (Driving)').band, 'RÉPRIMANDE');
  assert.equal(penaltyFr('Disqualified from the Qualifying session').band, 'DISQUALIFICATION');
  assert.equal(penaltyFr('Car 23 is required to start the race from the pit lane.').band, 'DÉPART DES STANDS');
  assert.equal(penaltyFr('No further action.').band, 'AUCUNE SANCTION');
  assert.equal(penaltyFr('The competitor (Audi Revolut F1 Team) is fined €7,500.').band, 'AMENDE DE 7 500 €');
  // Amende en plus d'une autre sanction : gardée à part
  assert.deepEqual([penaltyFr('Reprimand and a fine of €5,000').kind, penaltyFr('Reprimand and a fine of €5,000').fine], ['reprimand', 5000]);
});

test('décision des commissaires : motif et virages', () => {
  assert.equal(factFr('Alleged Causing a collision with Car 1 at turn 1.'), 'Accrochage présumé avec la voiture 1 au virage 1.');
  assert.equal(factFr('Car 44 left the track and gained a lasting advantage.'), 'La voiture 44 est sortie de la piste et en a tiré un avantage durable.');
  assert.equal(factFr('Pit lane speeding – 80.2 km/h'), 'Excès de vitesse dans la voie des stands : 80,2 km/h.');
  assert.equal(factFr('Car 36 impeded Car 89 in turn 9.'), 'La voiture 36 a gêné la voiture 89 au virage 9.');
  assert.equal(factFr('CAUSING A COLLISION'), 'Accrochage provoqué.');
  assert.equal(factFr('Cars 3 and 30 engaged in a series of moves on the entry to turn 12 through to the apex of turn 14.'), null);   // texte libre : traduit par le serveur
  assert.deepEqual(turnsOf('Cars 3 and 30 engaged in a series of moves on the entry to turn 12 through to the apex of turn 14.'), { from: 12, to: 14 });
  assert.deepEqual(turnsOf('Virage 7'), { from: 7, to: 7 });
  assert.equal(turnsOf('Pit lane speeding'), null);
  assert.ok(sameSession('Free Practice 2', 'Practice 2') && sameSession('Sprint Shootout', 'Sprint Qualifying') && !sameSession('Race', 'Practice 2'));
});

test('décision des commissaires : décisions de la séance (documents puis direction de course)', () => {
  const docs = docDecisions(entries, 'Practice 2');
  assert.equal(docs.length, 1);   // même faits, même sanction : un seul post pour les deux pilotes
  assert.deepEqual(docs[0].drivers.map((x) => [x.num, x.points, x.total]), [['3', 1, 1], ['30', 1, 4]]);
  assert.deepEqual(docs[0].docs, [33, 34]);
  assert.deepEqual(docs[0].turns, { from: 12, to: 14 });
  assert.equal(docDecisions(entries, 'Qualifying').length, 0);
  const rcm = rcmDecisions(state.RaceControlMessages.Messages);
  assert.deepEqual(rcm.map((x) => [x.penalty.band, x.drivers[0].num, x.factFr]), [['3 PLACES DE PÉNALITÉ SUR LA GRILLE', '3', 'Gêne d\'un autre pilote.'], ['5 SECONDES DE PÉNALITÉ', '44', 'Accrochage provoqué au virage 7.']]);
  assert.deepEqual(rcm[1].turns, { from: 7, to: 7 });
  // Message déjà couvert par un document (même pilote, même sanction) écarté
  const all = mergeDecisions(docs, rcm);
  assert.deepEqual(all.map((x) => x.source), ['fia', 'rcm']);
  assert.equal(all[1].drivers[0].num, '44');
});

test('décision des commissaires : visuel, texte alternatif et textes du post', () => {
  const [dec] = docDecisions(entries, 'Practice 2');
  const motif = 'Les voitures 3 et 30 se sont livrées à une série de manœuvres de l\'entrée du virage 12 jusqu\'à la corde du virage 14.';
  const d = decisionData(state, dec, { motif });
  assert.equal(d.post, 'decision');
  assert.deepEqual(d.rows.map((r) => [r.num, r.last, r.team, r.color]), [['3', 'Verstappen', 'Red Bull Racing', '#4781D7'], ['30', 'Lawson', 'Racing Bulls', '#6C98FF']]);
  assert.match(d.rows[1].headshot, /lialaw01/);   // pilote absent du classement : portrait d'après la liste des pilotes
  for (const fmt of ['ig', 'story', 'x']) assert.deepEqual(slidesFor(d, { fmt, follow: true, question: true }), ['decision']);
  assert.equal(slideName('decision'), 'Décision des commissaires');
  assert.equal(slideAlt(d, 'decision'), `Décision des commissaires — Grand Prix de Mexico · Essais libres 2 : 1 place de pénalité sur la grille pour Max Verstappen (n° 3, Red Bull Racing) et Liam Lawson (n° 30, Racing Bulls). Motif : ${motif}`);
  assert.deepEqual(slidesFor(decisionData(state, null)), []);

  const c = moreCaptions(d, '@sig');
  assert.equal(c.instagram.split('\n')[0], '⚖️ DÉCISION DES COMMISSAIRES | Grand Prix de Mexico 🇲🇽');
  assert.match(c.instagram, /\n🔴 1 place de pénalité sur la grille pour la prochaine course : Max Verstappen \(Red Bull Racing\) et Liam Lawson \(Racing Bulls\)\.\n/);
  assert.match(c.instagram, /\n📍 Les voitures 3 et 30 .* corde du virage 14 \(essais libres 2\)\.\n/);
  assert.match(c.instagram, /\n🪪 \+1 point de pénalité sur la licence chacun \(Verstappen : 1 sur 12 mois, Lawson : 4 sur 12 mois\)\.\n📄 Documents 33 et 34 de la FIA\./);
  assert.match(c.instagram, /#F1 #MexicoGP #MaxVerstappen #LiamLawson/);
  assert.ok(!/#/.test(c.facebook));
  assert.ok(xLength(c.x) <= 280 && /Verstappen et Lawson/.test(c.x));
  assert.ok(c.threads.length <= 500);
  // Ligne « Fait par IA » ajoutée par l'éditeur, brouillon repris avec les mêmes textes, question adaptée
  assert.match(creditCaptions(c).instagram, /🤖 Fait par IA avec l'appli @paddockliveapp/);
  assert.equal(captionsFor(d, '@sig').instagram, c.instagram);
  assert.equal(questionFor(d), 'Sanction méritée selon toi ? Dis-le en commentaire.');

  // Décision de la direction de course : source citée, emoji de l'avertissement
  const warn = decisionData(state, { ...rcmDecisions(state.RaceControlMessages.Messages)[1], penalty: penaltyFr('WARNING') });
  assert.match(moreCaptions(warn).instagram, /🟡 Avertissement : Lewis Hamilton \(Ferrari\)\.\n📍 Accrochage provoqué au virage 7 \(essais libres 2\)\.\n📄 D'après la direction de course\./);
});
