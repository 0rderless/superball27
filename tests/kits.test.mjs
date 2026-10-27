import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KITS, colourDist, chooseKits, PATTERNS } from '../js/kits.js';

const club = (home, away) => ({ home: { ...DEFAULT_KITS.home, shirt: home }, away: { ...DEFAULT_KITS.away, shirt: away } });

test('colourDist: same colour 0, black vs white large', () => {
  assert.equal(colourDist('#123456', '#123456'), 0);
  assert.ok(colourDist('#000000', '#ffffff') > colourDist('#1557ff', '#1d5cff') * 10);
});

test('patterns include plain, stripes, hoops, sash and halves', () => {
  for (const p of ['plain', 'stripes', 'hoops', 'sash', 'halves']) assert.ok(PATTERNS.includes(p));
});

test('auto: wear home when it does not clash', () => {
  const r = chooseKits({ kits: DEFAULT_KITS, choice: 'auto', club: club('#c8102e', '#ffffff') });
  assert.equal(r.home.shirt, DEFAULT_KITS.home.shirt);
  assert.equal(r.away.shirt, '#c8102e');
});

test('auto: a clashing home kit switches to the most different of ours', () => {
  const r = chooseKits({ kits: DEFAULT_KITS, choice: 'auto', club: club(DEFAULT_KITS.home.shirt, '#ffffff') });
  assert.notEqual(r.home.shirt, DEFAULT_KITS.home.shirt);
  assert.ok(colourDist(r.home.shirt, r.away.shirt) > 120);
});

test('a chosen kit is kept and the opponent changes instead', () => {
  const r = chooseKits({ kits: DEFAULT_KITS, choice: 'home', club: club(DEFAULT_KITS.home.shirt, '#f2f2f2') });
  assert.equal(r.home.shirt, DEFAULT_KITS.home.shirt);
  assert.equal(r.away.shirt, '#f2f2f2');
});
