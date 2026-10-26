// Footstep dribbling maths. Pure functions on plain {x, z} objects so they can be unit-tested
// without the browser. Touches happen when a foot lands; each one rolls the ball to a "slot"
// in front of the next footfall.

// gait phases (0..1 per two-step cycle) where the right / left foot lands
export const STRIKES = [0.51, 0]; // measured with tools/measure-strikes.mjs
// constant rolling deceleration of a dribbled ball (m/s²)
export const ROLL_DECEL = 2.0;

const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

// metres per full gait cycle (two steps)
export function strideLength(sp) {
  if (sp <= 2) return 1.9;
  if (sp <= 5.5) return lerp(1.9, 3.6, (sp - 2) / 3.5);
  return lerp(3.6, 5.4, (sp - 5.5) / 3);
}

// did the phase move from a (exclusive) to b (inclusive), going forward and maybe wrapping?
function crossed(a, b, s) {
  return a <= b ? s > a && s <= b : s > a || s <= b;
}

export function advanceGait(phase, sp, dt) {
  if (sp < 0.15) return { phase, strike: null };
  const step = dt * sp / strideLength(sp);
  const next = (phase + step) % 1;
  let strike = null;
  if (step >= 1) strike = 'R';
  else {
    // the later of the two strikes crossed this frame wins
    const r = crossed(phase, next, STRIKES[0]), l = crossed(phase, next, STRIKES[1]);
    if (r && l) strike = ((STRIKES[0] - phase + 1) % 1) > ((STRIKES[1] - phase + 1) % 1) ? 'R' : 'L';
    else strike = r ? 'R' : l ? 'L' : null;
  }
  return { phase: next, strike };
}

export function timeToNextStrike(phase, sp) {
  if (sp < 0.15) return Infinity;
  let gap = 1;
  for (const s of STRIKES) { const g = (s - phase + 1) % 1 || 1; if (g < gap) gap = g; }
  return gap * strideLength(sp) / sp;
}

// how far in front of the landing foot the ball sits
export function slotDistance(sp, dri) {
  const base = sp <= 1.5 ? 0.4 : sp <= 5.5 ? lerp(0.4, 0.6, (sp - 1.5) / 4) : lerp(0.6, 1.0, (sp - 5.5) / 3);
  return base * (1 - 0.2 * dri);
}

// ball velocity that rolls it (under ROLL_DECEL) onto the slot in front of the next footfall
export function planTouch({ ball, pos, vel, dir, sp, dri, T }) {
  T = Math.max(0.12, T);
  const sd = slotDistance(sp, dri);
  const tx = pos.x + vel.x * T + dir.x * sd, tz = pos.z + vel.z * T + dir.z * sd;
  const dx = tx - ball.x, dz = tz - ball.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return { x: 0, z: 0 };
  // v·T − ½aT² = d, but never so slow that the ball would stop short and roll backwards
  let v = (d + 0.5 * ROLL_DECEL * T * T) / T;
  if (v < ROLL_DECEL * T) v = Math.sqrt(2 * ROLL_DECEL * d);
  return { x: dx / d * v, z: dz / d * v };
}
