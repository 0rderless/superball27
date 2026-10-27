import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCup, cupTie, recordCupTie, ROUND_NAMES, shootoutWinner } from '../js/cup.js';

let seed = 3; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const ids = ['zorp', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
const ovr = id => (id === 'zorp' ? 85 : 80 + ids.indexOf(id));

test('cup: 8 teams including ZorpFC, quarter-finals first', () => {
  const c = newCup(ids, 'zorp', R);
  assert.equal(c.rounds[0].length, 4);
  const teams = c.rounds[0].flatMap(t => [t.h, t.a]);
  assert.equal(new Set(teams).size, 8);
  assert.ok(teams.includes('zorp'));
  assert.deepEqual(ROUND_NAMES, ['Quarter-final', 'Semi-final', 'Final']);
  assert.ok(cupTie(c).h === 'zorp' || cupTie(c).a === 'zorp');
});

test('winning every tie lifts the cup; the bracket fills in', () => {
  const c = newCup(ids, 'zorp', R);
  recordCupTie(c, { us: 2, them: 0 }, { ovr, rnd: R });
  assert.equal(c.rounds[1].length, 2);
  recordCupTie(c, { us: 1, them: 1, pens: { us: 5, them: 4 } }, { ovr, rnd: R });
  assert.equal(c.rounds[2].length, 1);
  const out = recordCupTie(c, { us: 3, them: 2 }, { ovr, rnd: R });
  assert.equal(c.winner, 'zorp');
  assert.equal(out.won, true);
  assert.equal(cupTie(c), null);
  // a drawn AI tie still produces a winner
  for (const r of c.rounds) for (const t of r) assert.ok(t.winner === t.h || t.winner === t.a);
});

test('losing a tie knocks ZorpFC out and the cup is played to a winner', () => {
  const c = newCup(ids, 'zorp', R);
  const out = recordCupTie(c, { us: 0, them: 1 }, { ovr, rnd: R });
  assert.equal(out.out, true);
  assert.ok(c.winner && c.winner !== 'zorp');
  assert.equal(c.rounds.length, 3);
});

test('shootout: best of five, then sudden death', () => {
  assert.equal(shootoutWinner([true, true, true], [false, false, false]), 'home'); // 3-0 with two each left: can't be caught
  assert.equal(shootoutWinner([true, true, true], [false, false]), null); // away still to take their third
  assert.equal(shootoutWinner([true, true, true, true, true], [true, true, true, true, true]), null);
  assert.equal(shootoutWinner([true, true, true, true, true, true], [true, true, true, true, true, false]), 'home');
  assert.equal(shootoutWinner([true, true, true, true, true, false], [true, true, true, true, true, true]), 'away');
  assert.equal(shootoutWinner([false, true, true, true, true], [true, true, true, true]), null);
  assert.equal(shootoutWinner([true, true, true, true, false], [true, true, true, true, true]), 'away');
});
