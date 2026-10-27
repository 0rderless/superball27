// Match facts: expected goals and the full stats list shown in the pause menu.
import { F } from './config.js';

// chance a shot from (x, z) at the goal on x = goalX goes in
export function xg(pos, goalX, { penalty = false, header = false } = {}) {
  if (penalty) return 0.76;
  const dx = Math.abs(goalX - pos.x), z = Math.abs(pos.z), d = Math.hypot(dx, z);
  // angle the goal mouth subtends from the shot
  const ang = Math.max(0, Math.atan2(2 * F.GW * dx, dx * dx + z * z - F.GW * F.GW));
  const a = ang < 0 ? ang + Math.PI : ang;
  let p = 1 / (1 + Math.exp(-(0.4 + 1.1 * a - 0.17 * d)));
  if (header) p *= 0.6;
  return Math.round(Math.min(0.95, p) * 1000) / 1000;
}

const pct = (x, t) => (t ? Math.round(x / t * 100) : 0) + '%';
// rows of { label, h, a, hv, av } (hv/av: numbers for the bars)
export function teamFacts(h, a) {
  const n = (s, k) => s[k] || 0;
  const pt = h.poss + a.poss || 1;
  const row = (label, k, fmt = v => v) => ({ label, h: fmt(n(h, k), h), a: fmt(n(a, k), a), hv: n(h, k), av: n(a, k) });
  const derived = (label, f, fmt = v => v) => ({ label, h: fmt(f(h)), a: fmt(f(a)), hv: f(h), av: f(a) });
  return [
    { label: 'Possession', h: pct(h.poss, pt), a: pct(a.poss, pt), hv: h.poss, av: a.poss },
    row('Expected goals (xG)', 'xg', v => v.toFixed(2)),
    row('Shots', 'shots'),
    row('Shots on target', 'on'),
    derived('Shots off target', s => Math.max(0, n(s, 'shots') - n(s, 'on') - n(s, 'blocked'))),
    row('Blocked shots', 'blocked'),
    row('Big chances', 'big'),
    row('Hit the woodwork', 'woodwork'),
    row('Saves', 'saves'),
    row('Headers', 'headers'),
    row('Passes', 'passes'),
    row('Passes completed', 'passCmp'),
    derived('Pass accuracy', s => (n(s, 'passes') ? Math.round(n(s, 'passCmp') / n(s, 'passes') * 100) : 0), v => v + '%'),
    row('Through balls', 'through'),
    row('Long balls', 'long'),
    row('Skill moves', 'skills'),
    row('Tackles won', 'tackles'),
    row('Interceptions', 'intercepts'),
    row('Fouls', 'fouls'),
    row('Yellow cards', 'yellows'),
    row('Red cards', 'reds'),
    row('Offsides', 'offsides'),
    row('Corners', 'corner'),
    row('Free kicks', 'freekick'),
    row('Penalties', 'penalty'),
    row('Throw-ins', 'throw'),
    row('Goal kicks', 'goalkick'),
    row('Distance covered', 'dist', v => (v / 1000).toFixed(1) + ' km'),
    row('Top speed', 'topSpd', v => (v * 3.6).toFixed(1) + ' km/h'),
  ];
}
