// The referee: which challenges are fouls, which earn a card, and where the restart is taken.
// Pure functions (random numbers passed in) so the laws can be unit tested.
import { F } from './config.js';

// chance a challenge is given as a foul
export function foulChance({ slide, missed, bodyContact, behind }) {
  if (missed) return bodyContact ? (slide ? 0.8 : 0.3) + (behind ? 0.15 : 0) : 0;
  // got the ball, but went through the back of him to do it
  return slide && behind && bodyContact ? 0.35 : 0;
}

// the defender came from behind the dribbler (the dribbler is running away from him)
export function fromBehind(owner, def) {
  const dx = owner.pos.x - def.x, dz = owner.pos.z - def.z, d = Math.hypot(dx, dz) || 1;
  return (dx * owner.fwd.x + dz * owner.fwd.z) / d > 0.55;
}

// denying an obvious goal-scoring opportunity: last man, in the attacking half, within range of goal
export function isDogso({ spot, attackX, defendersBetween }) {
  return defendersBetween === 0 && Math.hypot(attackX - spot.x, spot.z) < 32;
}

// null | 'yellow' | 'red'
export function cardFor({ slide, behind, dogso, rnd }) {
  if (dogso) return 'red';
  if (slide && behind && rnd < 0.05) return 'red';
  const yellow = (slide ? 0.3 : 0.08) + (behind ? 0.3 : 0);
  return rnd < yellow ? 'yellow' : null;
}

// the fouled team attacks the goal at attackX
export function restartForFoul(spot, attackX) {
  const inBox = Math.abs(attackX - spot.x) < F.BOX_L && Math.abs(spot.z) < F.BOX_W;
  return inBox ? 'penalty' : 'freekick';
}

// n wall players 9.15 m from the ball, shoulder to shoulder, covering the near-post side of goal
export function wallSpots(ball, attackX, n) {
  const gx = attackX - ball.x, gz = 0.8 * Math.sign(ball.z || 1) * Math.min(1, Math.abs(ball.z) / 10) - ball.z;
  const L = Math.hypot(gx, gz), ux = gx / L, uz = gz / L;
  const cx = ball.x + ux * 9.15, cz = ball.z + uz * 9.15;
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 0.62;
    out.push({ x: cx - uz * o, z: cz + ux * o });
  }
  return out;
}

// x of the second-last defender of the goal the attackers (direction dir) are attacking
export function secondLastX(defXs, dir) {
  const s = [...defXs].sort((a, b) => (b - a) * dir);
  return s.length > 1 ? s[1] : s.length ? s[0] : 0;
}

// at the moment a team-mate plays the ball: in the opponents' half, ahead of the ball and of the
// second-last defender (level is onside). A small margin keeps the very tight ones onside.
export function offsidePosition({ x, ballX, line, dir, margin = 0.15 }) {
  return x * dir > 0 && (x - ballX) * dir > 0 && (x - line) * dir > margin;
}
