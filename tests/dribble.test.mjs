import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRIKES, ROLL_DECEL, FOOT_REACH, strideLength, advanceGait, timeToNextStrike, slotDistance, planTouch, exposure, tackleOutcome } from '../js/dribble.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b} ±${eps}, got ${a}`);

test('strideLength matches walk / jog / sprint anchors and rises in between', () => {
  assert.equal(strideLength(2), 1.9);
  assert.equal(strideLength(5.5), 3.6);
  assert.equal(strideLength(9), 5.4);
  let prev = 0;
  for (let s = 0; s <= 10; s += 0.25) { const L = strideLength(s); assert.ok(L >= prev); prev = L; }
});

test('advanceGait reports the left strike when crossing it', () => {
  const from = (STRIKES[1] - 0.05 + 1) % 1;
  const r = advanceGait(from, 5.5, 0.05);
  assert.equal(r.strike, 'L');
  near(r.phase, (from + 0.05 * 5.5 / 3.6) % 1, 1e-9);
});

test('advanceGait catches strikes inside a long frame (phone lag spike)', () => {
  const r1 = advanceGait((STRIKES[0] + 0.95) % 1, 9, 0.1); // crosses the right strike through the wrap
  assert.equal(r1.strike, 'R');
  const r2 = advanceGait((STRIKES[1] - 0.1 + 1) % 1, 9, 0.1);
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

for (const [label, sp, ang] of [['jog straight', 5.5, 0], ['sprint straight', 8.5, 0], ['sprint 60° turn', 8.5, Math.PI / 3]]) {
  test(`planTouch rolls the ball out to the slot and back onto a later footfall (${label})`, () => {
    const pos = { x: 0, z: 0 }, vel = { x: sp, z: 0 }, dir = { x: Math.cos(ang), z: Math.sin(ang) };
    const ball = { x: 0.35, z: 0.05 }, phase = STRIKES[0];
    const { v, T } = planTouch({ ball, pos, vel, dir, sp, dri: 0.5, phase });
    // T lands exactly on a footfall: next strike plus whole half-cycles
    const half = strideLength(sp) / sp / 2, first = timeToNextStrike(phase, sp);
    const k = (T - first) / half;
    near(k, Math.round(k), 1e-6, 'whole steps');
    assert.ok(Math.round(k) >= 1, 'not the very next step');
    // arrives at the landing foot
    const end = roll(ball, v, T);
    near(Math.hypot(end.x - (vel.x * T + dir.x * FOOT_REACH), end.z - (vel.z * T + dir.z * FOOT_REACH)), 0, 0.05, 'end at foot');
    // and on the way it runs out about one slot ahead of where the player would be
    // (on a straight run) and on the way it runs out about one slot ahead of him
    if (ang === 0) {
      let peak = 0;
      for (let t = 0; t <= T; t += T / 50) { const p = roll(ball, v, t); peak = Math.max(peak, p.x - vel.x * t); }
      near(peak, slotDistance(sp, 0.5), 0.15, 'peak');
    }
  });
}

test('timeToNextStrike at jog is under half a cycle', () => {
  const t = timeToNextStrike(STRIKES[0] + 0.01, 5.5);
  assert.ok(t > 0 && t <= 0.5 * 3.6 / 5.5 + 1e-9);
});

test('exposure: ball at the feet is safe', () => {
  assert.equal(exposure({ ball: { x: 0.2, z: 0 }, body: { x: 0, z: 0 }, heading: { x: 1, z: 0 }, defender: { x: 2, z: 0 }, sp: 5 }), 0);
});

test('exposure: ball out ahead with the defender in front is exposed', () => {
  assert.ok(exposure({ ball: { x: 1.0, z: 0 }, body: { x: 0, z: 0 }, heading: { x: 1, z: 0 }, defender: { x: 1.8, z: 0.3 }, sp: 8 }) > 0.8);
});

test('exposure: shielding (body between defender and ball) protects it', () => {
  assert.equal(exposure({ ball: { x: 1.0, z: 0 }, body: { x: 0, z: 0 }, heading: { x: 1, z: 0 }, defender: { x: -0.8, z: 0.1 }, sp: 3 }), 0);
});

test('tackleOutcome: exposed ball is won', () => {
  assert.equal(tackleOutcome({ exposure: 0.9, def: 0.8, dri: 0.8, phy: 0.7, slide: false, rnd: 0.5 }), 'win');
});

test('tackleOutcome: ball at the feet is a miss', () => {
  assert.equal(tackleOutcome({ exposure: 0.05, def: 0.8, dri: 0.8, phy: 0.7, slide: false, rnd: 0.5 }), 'miss');
});

test('tackleOutcome: half-exposed ball is poked loose', () => {
  assert.equal(tackleOutcome({ exposure: 0.4, def: 0.8, dri: 0.8, phy: 0.7, slide: false, rnd: 0.5 }), 'loose');
});

test('planTouch with scale 0.45 (a cut) keeps the ball much closer', () => {
  const pos = { x: 0, z: 0 }, vel = { x: 8.5, z: 0 }, dir = { x: 1, z: 0 }, ball = { x: 0.35, z: 0 };
  const { v, T } = planTouch({ ball, pos, vel, dir, sp: 8.5, dri: 0.5, phase: STRIKES[0], scale: 0.45 });
  let peak = 0;
  for (let t = 0; t <= T; t += T / 50) { const p = roll(ball, v, t); peak = Math.max(peak, p.x - vel.x * t); }
  assert.ok(peak <= 0.45 * slotDistance(8.5, 0.5) + 0.15, `peak ${peak}`);
});

test('advanceGait reports the swinging foot passing the body mid-step', () => {
  // the left foot swings through a quarter cycle after the right foot lands
  const r = advanceGait((STRIKES[0] + 0.2) % 1, 8, 0.05);
  assert.equal(r.swing, 'L');
  const q = advanceGait((STRIKES[1] + 0.2) % 1, 8, 0.05);
  assert.equal(q.swing, 'R');
  const none = advanceGait((STRIKES[0] + 0.05) % 1, 8, 0.01);
  assert.equal(none.swing, null);
});
