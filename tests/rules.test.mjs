import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foulChance, cardFor, fromBehind, restartForFoul, wallSpots, isDogso } from '../js/rules.js';

test('a clean tackle is never a foul; a mistimed one that hits the man often is', () => {
  assert.equal(foulChance({ slide: true, missed: false, bodyContact: true, behind: false }), 0);
  assert.equal(foulChance({ slide: true, missed: true, bodyContact: false, behind: false }), 0);
  assert.ok(foulChance({ slide: true, missed: true, bodyContact: true, behind: false }) > foulChance({ slide: false, missed: true, bodyContact: true, behind: false }));
  assert.ok(foulChance({ slide: true, missed: false, bodyContact: true, behind: true }) > 0);
});

test('fromBehind: defender chasing the dribbler is behind him', () => {
  const owner = { pos: { x: 0, z: 0 }, fwd: { x: 1, z: 0 } };
  assert.equal(fromBehind(owner, { x: -1, z: 0.2 }), true);
  assert.equal(fromBehind(owner, { x: 1, z: 0 }), false);
  assert.equal(fromBehind(owner, { x: 0, z: 1 }), false);
});

test('cards: denying a clear chance is a red, reckless slides from behind are often yellow', () => {
  assert.equal(cardFor({ slide: false, behind: false, dogso: true, rnd: 0.9 }), 'red');
  assert.equal(cardFor({ slide: false, behind: false, dogso: false, rnd: 0.5 }), null);
  assert.equal(cardFor({ slide: true, behind: true, dogso: false, rnd: 0.3 }), 'yellow');
  assert.equal(cardFor({ slide: true, behind: true, dogso: false, rnd: 0.01 }), 'red');
});

test('a foul inside the box is a penalty, outside a free kick', () => {
  // fouled team attacks +x (goal at x = 52.5)
  assert.equal(restartForFoul({ x: 45, z: 3 }, 52.5), 'penalty');
  assert.equal(restartForFoul({ x: 30, z: 3 }, 52.5), 'freekick');
  assert.equal(restartForFoul({ x: 45, z: 25 }, 52.5), 'freekick');
  assert.equal(restartForFoul({ x: -45, z: 0 }, 52.5), 'freekick'); // in their own box
});

test('the wall stands 9.15 m from the ball, between it and the goal', () => {
  const ball = { x: 30, z: 5 }, w = wallSpots(ball, 52.5, 4);
  assert.equal(w.length, 4);
  for (const s of w) assert.ok(Math.abs(Math.hypot(s.x - ball.x, s.z - ball.z) - 9.15) < 0.6);
  const mid = w.reduce((a, s) => ({ x: a.x + s.x / 4, z: a.z + s.z / 4 }), { x: 0, z: 0 });
  // middle of the wall is on the line from the ball to the goal centre
  const gx = 52.5 - ball.x, gz = -ball.z, cross = Math.abs((mid.x - ball.x) * gz - (mid.z - ball.z) * gx) / Math.hypot(gx, gz);
  assert.ok(cross < 1.2, 'wall covers the near side of goal, not miles off');
});

test('DOGSO: last man, through on goal, in range', () => {
  const att = { x: 35, z: 0 }, attackX = 52.5;
  assert.equal(isDogso({ spot: att, attackX, defendersBetween: 0 }), true);
  assert.equal(isDogso({ spot: att, attackX, defendersBetween: 1 }), false);
  assert.equal(isDogso({ spot: { x: 5, z: 0 }, attackX, defendersBetween: 0 }), false);
});
