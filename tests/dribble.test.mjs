import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRIKES, ROLL_DECEL, strideLength, advanceGait, timeToNextStrike, slotDistance, planTouch } from '../js/dribble.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b} ±${eps}, got ${a}`);

test('strideLength matches walk / jog / sprint anchors and rises in between', () => {
  assert.equal(strideLength(2), 1.9);
  assert.equal(strideLength(5.5), 3.6);
  assert.equal(strideLength(9), 5.4);
  let prev = 0;
  for (let s = 0; s <= 10; s += 0.25) { const L = strideLength(s); assert.ok(L >= prev); prev = L; }
});

test('advanceGait reports the left strike when crossing it', () => {
  const from = STRIKES[1] - 0.05;
  const r = advanceGait(from, 5.5, 0.05);
  assert.equal(r.strike, 'L');
  near(r.phase, from + 0.05 * 5.5 / 3.6, 1e-9);
});

test('advanceGait catches strikes inside a long frame (phone lag spike)', () => {
  const r1 = advanceGait((STRIKES[0] + 0.95) % 1, 9, 0.1); // crosses the right strike through the wrap
  assert.equal(r1.strike, 'R');
  const r2 = advanceGait(STRIKES[1] - 0.1, 9, 0.1);
  assert.equal(r2.strike, 'L');
});

test('advanceGait fires two strikes per cycle at 60fps', () => {
  let ph = 0.13, n = 0, cycles = 0;
  for (let i = 0; i < 600; i++) { const r = advanceGait(ph, 5.5, 1 / 60); if (r.phase < ph) cycles++; ph = r.phase; if (r.strike) n++; }
  near(n, 2 * cycles, 1.5);
});

test('advanceGait does not advance when standing', () => {
  const r = advanceGait(0.3, 0.1, 0.1);
  assert.equal(r.phase, 0.3);
  assert.equal(r.strike, null);
  assert.equal(timeToNextStrike(0.3, 0.1), Infinity);
});

test('slotDistance: walk 0.4, jog 0.6, sprint 1.0, tighter for good dribblers', () => {
  near(slotDistance(1.5, 0), 0.4, 0.01);
  near(slotDistance(5.5, 0), 0.6, 0.01);
  near(slotDistance(8.5, 0), 1.0, 0.01);
  near(slotDistance(5.5, 1), 0.48, 0.01);
});

function roll(b, v, T) {
  const s = Math.hypot(v.x, v.z); if (s === 0) return { ...b };
  const tStop = s / ROLL_DECEL, t = Math.min(T, tStop);
  const d = s * t - 0.5 * ROLL_DECEL * t * t;
  return { x: b.x + v.x / s * d, z: b.z + v.z / s * d };
}

for (const [label, sp, T, ang] of [['jog straight', 5.5, 0.33, 0], ['sprint 60° turn', 8.5, 0.3, Math.PI / 3]]) {
  test(`planTouch lands the ball on the slot (${label})`, () => {
    const pos = { x: 0, z: 0 }, vel = { x: sp, z: 0 }, dir = { x: Math.cos(ang), z: Math.sin(ang) };
    const ball = { x: 0.35, z: 0.05 };
    const v = planTouch({ ball, pos, vel, dir, sp, dri: 0.5, T });
    const end = roll(ball, v, T);
    const sd = slotDistance(sp, 0.5);
    const slot = { x: pos.x + vel.x * T + dir.x * sd, z: pos.z + vel.z * T + dir.z * sd };
    near(Math.hypot(end.x - slot.x, end.z - slot.z), 0, 0.05, 'miss distance');
  });
}

test('timeToNextStrike at jog is under half a cycle', () => {
  const t = timeToNextStrike(STRIKES[0] + 0.01, 5.5);
  assert.ok(t > 0 && t <= 0.5 * 3.6 / 5.5 + 1e-9);
});
