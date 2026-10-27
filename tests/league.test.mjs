import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundRobin, simScore, newTable, applyResult, sortTable, newSeason, userFixture, finishRound, seasonOver, topScorers, pickScorers } from '../js/league.js';

const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

test('round robin: everyone plays everyone once, one game a round', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const rounds = roundRobin(ids);
  assert.equal(rounds.length, 5);
  const seen = new Set();
  for (const r of rounds) {
    assert.equal(r.length, 3);
    const inRound = r.flatMap(f => [f.h, f.a]);
    assert.equal(new Set(inRound).size, 6);
    for (const f of r) seen.add([f.h, f.a].sort().join('-'));
  }
  assert.equal(seen.size, 15);
});

test('double round robin swaps home and away', () => {
  const r = roundRobin(['a', 'b', 'c', 'd'], 2);
  assert.equal(r.length, 6);
  const first = r[0][0], mirror = r[3].find(f => f.h === first.a && f.a === first.h);
  assert.ok(mirror);
});

test('simulated scores: stronger sides win more, scores are sane', () => {
  let strong = 0, weak = 0;
  let rnd = 1; const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let i = 0; i < 400; i++) { const [h, a] = simScore(88, 78, R); if (h > a) strong++; else if (a > h) weak++; assert.ok(h <= 9 && a <= 9); }
  assert.ok(strong > weak * 1.6, `${strong} vs ${weak}`);
});

test('table: 3 for a win, 1 for a draw, sorted by points, goal difference, goals', () => {
  let t = newTable(['a', 'b', 'c']);
  applyResult(t, 'a', 'b', 2, 0);
  applyResult(t, 'c', 'a', 1, 1);
  applyResult(t, 'b', 'c', 3, 3);
  const s = sortTable(t);
  assert.deepEqual(s.map(r => r.id), ['a', 'c', 'b']);
  assert.deepEqual([s[0].p, s[0].w, s[0].d, s[0].l, s[0].gf, s[0].ga, s[0].pts], [2, 1, 1, 0, 3, 1, 4]);
});

test('a season: user fixture each round, others simulated, finishes', () => {
  const teams = [{ id: 'zorp', ovr: 85 }, { id: 'x', ovr: 88 }, { id: 'y', ovr: 80 }, { id: 'z', ovr: 82 }];
  let s = newSeason(teams, 'zorp');
  assert.equal(s.rounds.length, 3);
  for (let r = 0; r < 3; r++) {
    const f = userFixture(s);
    assert.ok(f.h === 'zorp' || f.a === 'zorp');
    finishRound(s, { hg: 2, ag: 1, scorers: [{ name: 'Zorp', team: 'zorp' }] }, { ovr: id => teams.find(t => t.id === id).ovr, squad: () => [{ name: 'Striker', pos: 'ST' }, { name: 'Mid', pos: 'CM' }], rnd: seq(0.3, 0.6, 0.9, 0.1) });
  }
  assert.ok(seasonOver(s));
  const t = sortTable(s.table);
  assert.equal(t.reduce((n, r) => n + r.p, 0), 12); // 6 games, 2 sides each
  assert.ok(topScorers(s)[0].goals >= 1);
});

test('pickScorers favours strikers', () => {
  const sq = [{ name: 'GK', pos: 'GK' }, { name: 'CB', pos: 'CB' }, { name: 'ST', pos: 'ST' }];
  let st = 0; let rnd = 7; const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let i = 0; i < 200; i++) st += pickScorers(sq, 1, R)[0] === 'ST' ? 1 : 0;
  assert.ok(st > 120);
});
