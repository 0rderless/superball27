import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, progressScore, decide } from '../js/cloud.js';

const store = obj => ({ length: Object.keys(obj).length, key: i => Object.keys(obj)[i], getItem: k => (k in obj ? obj[k] : null) });
const prof = (owned, custom = 0, games = 0) => JSON.stringify({ v: 1, owned: Array.from({ length: owned }, (_, i) => 'p' + i), custom: Object.fromEntries(Array.from({ length: custom }, (_, i) => ['c' + i, {}])), record: { w: games, d: 0, l: 0 } });

test('snapshot takes every sb27.* key (dots made Firebase-safe) except the cloud bookkeeping', () => {
  const s = snapshot(store({ 'sb27.profile': 'P', 'sb27.layout': 'L', 'sb27.cloud': 'X', other: 'no' }));
  assert.deepEqual(s, { sb27_profile: 'P', sb27_layout: 'L' });
});

test('progressScore counts owned, created players and games played', () => {
  assert.equal(progressScore({}), 0);
  assert.ok(progressScore({ sb27_profile: prof(30, 2, 5) }) > progressScore({ sb27_profile: prof(13) }));
});

test('empty cloud: this device uploads what it has (existing data is kept)', () => {
  assert.equal(decide({ local: { sb27_profile: prof(30) }, remote: null, meta: {} }), 'upload');
});

test('first sync on a fresh device downloads the cloud save', () => {
  assert.equal(decide({ local: {}, remote: { updatedAt: 5, data: { sb27_profile: prof(30) } }, meta: {} }), 'download');
});

test('first sync never throws away a device with more progress than the cloud', () => {
  assert.equal(decide({ local: { sb27_profile: prof(40, 3, 9) }, remote: { updatedAt: 5, data: { sb27_profile: prof(13) } }, meta: {} }), 'upload');
});

test('after syncing: newer cloud downloads, local changes upload, nothing new does nothing', () => {
  const remote = { updatedAt: 100, data: { sb27_profile: prof(30) } };
  assert.equal(decide({ local: { sb27_profile: prof(30) }, remote, meta: { syncedAt: 50 } }), 'download');
  assert.equal(decide({ local: { sb27_profile: prof(31) }, remote, meta: { syncedAt: 100, dirty: true } }), 'upload');
  assert.equal(decide({ local: { sb27_profile: prof(30) }, remote, meta: { syncedAt: 100 } }), 'none');
});
