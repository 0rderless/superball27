import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRILLS, DRILL, shotPoints, isBetter, crossedGate, coneCourse, fmtScore } from '../js/drills.js';

test('four skill games: shooting, free kicks, penalties, dribbling cones', () => {
  assert.deepEqual(DRILLS.map(d => d.key), ['shooting', 'freekicks', 'penalties', 'cones']);
  assert.equal(DRILL.cones.better, 'low');
  assert.equal(DRILL.penalties.attempts, 10);
});

test('shot points: goal 100, top corner bonus, on target 10, miss 0', () => {
  assert.equal(shotPoints({ goal: true, y: 0.5, z: 0 }), 100);
  assert.equal(shotPoints({ goal: true, y: 2.0, z: 3.1 }), 150);
  assert.equal(shotPoints({ goal: false, saved: true }), 10);
  assert.equal(shotPoints({ goal: false }), 0);
});

test('better: high scores for shooting, low times for cones; anything beats no score', () => {
  assert.equal(isBetter('shooting', 500, 400), true);
  assert.equal(isBetter('cones', 21.3, 24), true);
  assert.equal(isBetter('cones', 30, 24), false);
  assert.equal(isBetter('cones', 30, null), true);
});

test('gate crossing: moving through the gap counts, going round it does not', () => {
  const g = { a: { x: 10, z: -1.4 }, b: { x: 10, z: 1.4 } };
  assert.equal(crossedGate({ x: 9.8, z: 0 }, { x: 10.2, z: 0.2 }, g), true);
  assert.equal(crossedGate({ x: 9.8, z: 2 }, { x: 10.2, z: 2 }, g), false);
  assert.equal(crossedGate({ x: 9, z: 0 }, { x: 9.5, z: 0 }, g), false);
});

test('cone course: gates in order towards goal, inside the pitch, zig-zagging', () => {
  const c = coneCourse(1);
  assert.ok(c.gates.length >= 6);
  for (let i = 1; i < c.gates.length; i++) assert.ok(c.gates[i].a.x > c.gates[i - 1].a.x);
  assert.ok(c.gates.every(g => Math.abs(g.a.z) < 30 && Math.abs(g.a.x) < 45));
  assert.ok(c.gates.some(g => g.a.z > 1) && c.gates.some(g => g.a.z < -1));
  const m = coneCourse(-1);
  assert.ok(m.gates[1].a.x < m.gates[0].a.x);
});

test('score formats', () => {
  assert.equal(fmtScore('cones', 21.34), '21.3s');
  assert.equal(fmtScore('shooting', 450), '450');
  assert.equal(fmtScore('cones', null), '—');
});
