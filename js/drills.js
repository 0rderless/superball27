// Skill games: definitions, scoring and the cone course. The drills run on the real match engine
// (drill-run.js), so shooting, curl, keepers and dribbling all behave exactly as in a match.
import { F } from './config.js';

export const DRILLS = [
  { key: 'shooting', name: 'Shooting practice', desc: '60 seconds. Shots from around the box: 100 a goal, 150 in the top corner.', time: 60, better: 'high', icon: 'i-ball' },
  { key: 'freekicks', name: 'Free kicks', desc: '10 free kicks over the wall. Aim, hold SHOOT, curl it in.', attempts: 10, better: 'high', icon: 'i-target' },
  { key: 'penalties', name: 'Penalties', desc: '10 penalties against a keeper who guesses. Pick your corner.', attempts: 10, better: 'high', icon: 'i-flag' },
  { key: 'cones', name: 'Dribbling cones', desc: 'Weave through every gate with the ball, then score. Fastest time wins.', better: 'low', icon: 'i-cone' },
];
export const DRILL = Object.fromEntries(DRILLS.map(d => [d.key, d]));

export function shotPoints({ goal, saved = false, y = 0, z = 0 }) {
  if (goal) return 100 + (y > 1.5 && Math.abs(z) > F.GW - 1 ? 50 : 0);
  return saved ? 10 : 0;
}

export function isBetter(kind, score, best) {
  if (best == null) return score != null;
  return DRILL[kind].better === 'low' ? score < best : score > best;
}

export function fmtScore(kind, score) {
  if (score == null) return '—';
  return DRILL[kind].better === 'low' ? `${score.toFixed(1)}s` : String(Math.round(score));
}

// did a move from p0 to p1 pass between the gate's two cones?
export function crossedGate(p0, p1, g) {
  const d = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const s1 = d(g.a.x, g.a.z, g.b.x, g.b.z, p0.x, p0.z), s2 = d(g.a.x, g.a.z, g.b.x, g.b.z, p1.x, p1.z);
  const s3 = d(p0.x, p0.z, p1.x, p1.z, g.a.x, g.a.z), s4 = d(p0.x, p0.z, p1.x, p1.z, g.b.x, g.b.z);
  return s1 * s2 <= 0 && s3 * s4 < 0;
}

// a zig-zag of gates (two cones 2.6 m apart) from midfield towards the goal at x = dir * HL
export function coneCourse(dir) {
  const xs = [-8, -1, 6, 13, 20, 27], zs = [0, 5, -5, 5, -5, 0], half = 1.3;
  return {
    start: { x: dir * -16, z: 0 },
    gates: xs.map((x, i) => ({ a: { x: dir * x, z: zs[i] - half }, b: { x: dir * x, z: zs[i] + half } })),
  };
}
