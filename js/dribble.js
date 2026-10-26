// Footstep dribbling maths. Pure functions on plain {x, z} objects so they can be unit-tested
// without the browser. Touches happen when a foot lands; each one rolls the ball to a "slot"
// in front of the next footfall.

// gait phases (0..1 per two-step cycle) where the right / left foot lands
export const STRIKES = [0.51, 0]; // measured with tools/measure-strikes.mjs
// constant rolling deceleration of a dribbled ball (m/s²)
export const ROLL_DECEL = 3.0;
// how far in front of his centre the landing foot meets the ball
export const FOOT_REACH = 0.3;

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

// strike: a foot landing this frame. swing: the other foot passing under the body mid-step
// (a quarter cycle after a landing) — only used for quick cuts.
export function advanceGait(phase, sp, dt) {
  if (sp < 0.15) return { phase, strike: null, swing: null };
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
  let swing = null;
  if (step < 1) {
    if (crossed(phase, next, (STRIKES[0] + 0.25) % 1)) swing = 'L';
    else if (crossed(phase, next, (STRIKES[1] + 0.25) % 1)) swing = 'R';
  }
  return { phase: next, strike, swing };
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

// A touch pushes the ball out and lets it roll back onto a later footfall, like a real dribble:
// it runs about one slot ahead of him mid-way and meets the landing foot after a whole number
// of steps. Returns the ball velocity and the time T until that footfall.
// scale < 1 shortens the touch (a sharp cut keeps it tight).
export function planTouch({ ball, pos, vel, dir, sp, dri, phase, scale = 1 }) {
  const slot = Math.max(FOOT_REACH + 0.05, slotDistance(sp, dri) * scale);
  const first = timeToNextStrike(phase, sp);
  let T;
  if (!isFinite(first)) T = 0.4;
  else {
    const half = strideLength(sp) / sp / 2;
    const ideal = Math.sqrt(8 * Math.max(0.05, slot - FOOT_REACH) / ROLL_DECEL);
    T = first + Math.max(1, Math.round((ideal - first) / half)) * half;
  }
  const tx = pos.x + vel.x * T + dir.x * FOOT_REACH, tz = pos.z + vel.z * T + dir.z * FOOT_REACH;
  const dx = tx - ball.x, dz = tz - ball.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return { v: { x: 0, z: 0 }, T };
  // v·T − ½aT² = d, but never so slow that the ball would stop short and roll backwards
  let v = (d + 0.5 * ROLL_DECEL * T * T) / T;
  if (v < ROLL_DECEL * T) v = Math.sqrt(2 * ROLL_DECEL * d);
  return { v: { x: dx / d * v, z: dz / d * v }, T };
}

// How winnable the ball is for a defender: 0 at the feet, 1 when it's out at 1.1m. Zero when
// the dribbler's body is between the defender and the ball (shielding).
export function exposure({ ball, body, defender }) {
  const bx = ball.x - body.x, bz = ball.z - body.z, bd = Math.hypot(bx, bz);
  const e = Math.min(1, Math.max(0, (bd - 0.35) / (1.1 - 0.35)));
  if (e === 0) return 0;
  // defender → body direction vs body → ball direction: lined up means the body is in the way
  const dx = body.x - defender.x, dz = body.z - defender.z, dd = Math.hypot(dx, dz);
  if (dd > 1e-6 && (dx * bx + dz * bz) / (dd * bd) > Math.cos(Math.PI / 3)) return 0;
  return e;
}

// Result of a tackle or poke. rnd ∈ [0, 1) is passed in so tests are deterministic.
export function tackleOutcome({ exposure: e, def, dri, phy, slide, rnd }) {
  const score = e + 0.15 * (def - dri) + (slide ? 0.1 : 0) + (rnd - 0.5) * 0.2;
  if (score >= 0.55) return score - 0.55 >= 0.1 * phy ? 'win' : 'loose'; // strong dribblers keep it alive
  if (score >= 0.35) return 'loose';
  return 'miss';
}
