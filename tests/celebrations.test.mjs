import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELEBS, pickCeleb, celebLength } from '../js/celebrations.js';

test('the Siu, the knee slide and at least three more', () => {
  const keys = CELEBS.map(c => c.key);
  assert.ok(keys.includes('siu') && keys.includes('slide'));
  assert.ok(keys.length >= 5);
});

test('a chosen celebration is kept; random picks every one of them', () => {
  assert.equal(pickCeleb('slide'), 'slide');
  const seen = new Set(CELEBS.map((_, i) => pickCeleb('random', (i + 0.5) / CELEBS.length)));
  assert.equal(seen.size, CELEBS.length);
  assert.ok(CELEBS.some(c => c.key === pickCeleb('random', 0.9999)));
});

test('celebrations get time to finish before the replay, within reason', () => {
  for (const c of CELEBS) { const L = celebLength(c.key); assert.ok(L >= 3.4 && L <= 6); assert.ok(L >= c.run + c.dur || L === 6); }
});
