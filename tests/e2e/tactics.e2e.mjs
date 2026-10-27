// Match tactics (attacking, defensive line, pressing, width) move your team; Stay onside keeps
// your team-mates level with the last defender until the ball is past it.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch();
const res = [];
const run = body => page.evaluate(`(() => { ${isolateSnippet}
  m.hooks.fade = cb => cb(); m.phase = 'play'; m.restart = null;
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const shape = (attacking, aB) => { const out = new m.ball.pos.constructor(); return m.home.players.filter(p => !p.isGK).map(p => { m.formationTarget(p, attacking, aB, 0, out); return { along: m.home.along(out), z: Math.abs(out.z), def: ['CB','LB','RB','LWB','RWB'].includes(p.role) }; }); };
  ${body} })()`);

let r = await run(`
  const ST = m.settings, at = v => { ST.tacAttack = v; return avg(shape(true, 0.6).map(t => t.along)); };
  const ln = v => { ST.tacLine = v; return avg(shape(false, 0.5).filter(t => t.def).map(t => t.along)); };
  const wd = v => { ST.tacWidth = v; return avg(shape(true, 0.6).map(t => t.z)); };
  const o = { attLow: at(10), attHigh: at(90), lineLow: ln(10), lineHigh: ln(90), widthLow: wd(10), widthHigh: wd(90) };
  ST.tacAttack = ST.tacLine = ST.tacWidth = 50;
  return o;`);
check(res, 'attacking slider pushes the team up', r.attHigh > r.attLow + 0.04, r);
check(res, 'defensive line slider moves the back line', r.lineHigh > r.lineLow + 0.06, r);
check(res, 'width slider spreads the team', r.widthHigh > r.widthLow * 1.25, r);

const onside = on => run(`
  m.settings.stayOnside = ${on}; m.settings.offside = true; m.settings.tacAttack = 90;
  const s = m.home.dir, c = m.home.players[7];
  for (const q of m.players) { q.busy = 0; q.stun = 0; q.pending = null; q.recv = null; q.vel.set(0, 0, 0); }
  m.home.players.forEach((q, i) => q.pos.set(s * (i * 1.6), 0, i * 4 - 20));
  // their back line holds at x = 18, keeper on his line; they don't move
  m.away.players.forEach((q, i) => q.pos.set(s * (q.isGK ? 51 : 18 + (i % 2) * 0.5), 0, i * 5 - 25));
  c.pos.set(s * 2, 0, 0); m.ball.owner = null; m.ball.pos.set(s * 2.4, 0.11, 0); m.gainBall(c, false, true); m.setControlled(c);
  let worst = -99, beyond = 0;
  for (let i = 0; i < 60 * 12; i++) {
    for (const q of m.away.players) { q.vel.set(0, 0, 0); q.desired.set(0, 0, 0); q.busy = 1; q.tackleCD = 9; }
    stick(0, 0); step(1);
    if (m.ball.owner !== c) { m.ball.owner = null; m.ball.pos.set(c.pos.x + s * 0.4, 0.11, c.pos.z); m.gainBall(c, false, true); }
    for (const q of m.home.players) { if (q === c || q.isGK) continue; const ahead = q.pos.x * s - 18.5; worst = Math.max(worst, ahead); if (ahead > 0.3) beyond++; }
  }
  m.settings.tacAttack = 50; m.settings.stayOnside = false;
  return { worst: +worst.toFixed(2), beyondFrames: beyond };`);
const off = await onside(false), on = await onside(true);
check(res, 'without it, attackers wander offside', off.beyondFrames > 60, off);
check(res, 'with Stay onside, nobody goes past the line', on.worst < 0.5 && on.beyondFrames < 10, on);
await finish(browser, page, res);
