import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rating, playerOfMatch, summary } from '../js/ratings.js';

const ms = o => ({ goals: 0, assists: 0, shots: 0, onTarget: 0, passes: 0, tackles: 0, saves: 0, conceded: 0, yellow: 0, red: 0, ...o });

test('a quiet game is about a 6; goals and assists lift it; capped at 10', () => {
  assert.ok(Math.abs(rating(ms({}), { role: 'CM', won: false, lost: false }) - 6.0) < 0.3);
  assert.ok(rating(ms({ goals: 2, assists: 1 }), { role: 'ST' }) > 8);
  assert.equal(rating(ms({ goals: 6 }), { role: 'ST' }), 10);
});

test('a red card hurts, keepers are judged on saves and goals conceded', () => {
  assert.ok(rating(ms({ red: 1 }), { role: 'CB' }) < 5);
  assert.ok(rating(ms({ saves: 6 }), { role: 'GK' }) > rating(ms({ conceded: 3 }), { role: 'GK' }) + 1);
});

test('player of the match: the best rating, a winner on a tie', () => {
  const ps = [
    { name: 'A', role: 'ST', team: 'home', ms: ms({ goals: 1 }) },
    { name: 'B', role: 'ST', team: 'away', ms: ms({ goals: 1 }) },
    { name: 'C', role: 'CM', team: 'home', ms: ms({ passes: 3 }) },
  ];
  assert.equal(playerOfMatch(ps, { winner: 'away' }).name, 'B');
  assert.equal(playerOfMatch(ps, { winner: 'home' }).name, 'A');
});

test('summary line', () => {
  assert.equal(summary(ms({ goals: 2, assists: 1 }), 'ST'), '2 goals · 1 assist');
  assert.equal(summary(ms({ saves: 4 }), 'GK'), '4 saves');
  assert.equal(summary(ms({ tackles: 3, passes: 12 }), 'CB'), '3 tackles · 12 passes');
});
