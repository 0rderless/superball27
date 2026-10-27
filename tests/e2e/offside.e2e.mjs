// Offside: flagged when the ball reaches a runner who was beyond the second-last defender when it
// was played; never from a throw-in; pass assist prefers onside team-mates; can be switched off.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch();
const res = [];
const run = body => page.evaluate(`(() => { ${isolateSnippet}
  m.hooks.fade = cb => cb();
  // a clean scene: our passer at x=10, their back line at x=30, keeper on his line
  const scene = () => {
    m.phase = 'play'; m.restart = null; m.guarantee = null; m.offside = null; m.adv = null;
    const s = m.home.dir;
    for (const q of m.players) { q.busy = 0; q.stun = 0; q.pending = null; q.recv = null; q.vel.set(0, 0, 0); q.desired.set(0, 0, 0); q.cool = 0; }
    m.home.players.forEach((q, i) => q.pos.set(-s * 30, 0, i * 3 - 15));
    m.away.players.forEach((q, i) => q.pos.set(s * 30, 0, i * 4 - 20));
    m.away.gk.pos.set(s * 51, 0, 0);
    const passer = m.home.players[6]; passer.pos.set(s * 10, 0, 0); passer.fwd.set(s, 0, 0); passer.facing = Math.atan2(s, 0);
    m.ball.pos.set(s * 10.5, 0.11, 0); m.ball.vel.set(0, 0, 0); m.gainBall(passer, false, true);
    return { s, passer };
  };
  const passTo = (p, m2) => { m.passTo(p, m2, m2.pos.clone().sub(p.pos).setY(0).normalize(), 'ground'); };
  const run = n => { for (let i = 0; i < n && m.phase === 'play'; i++) step(1); };
  ${body} })()`);

let r = await run(`
  const { s, passer } = scene(); const st = m.home.players[10]; st.pos.set(s * 33, 0, 3);
  passTo(passer, st); run(240);
  return { phase: m.phase, type: m.restart && m.restart.type, team: m.restart && m.restart.team.key, shooting: m.restart && m.restart.shooting, offsides: m.stats.home.offsides };`);
check(res, 'runner beyond the last defender is flagged → indirect free kick to them', r.phase === 'restart' && r.type === 'freekick' && r.team === 'away' && r.shooting === false && r.offsides >= 1, r);

r = await run(`
  const { s, passer } = scene(); const st = m.home.players[10]; st.pos.set(s * 29, 0, 3);
  passTo(passer, st); for (let i = 0; i < 150 && m.phase === 'play' && m.ball.owner !== st; i++) step(1);
  return { phase: m.phase, owner: m.ball.owner && m.ball.owner.name, st: st.name };`);
check(res, 'runner behind the line is onside', r.phase === 'play' && r.owner === r.st, r);

r = await run(`
  const { s, passer } = scene(); const st = m.home.players[10], cm = m.home.players[7];
  st.pos.set(s * 34, 0, -6); cm.pos.set(s * 20, 0, 4);
  passTo(passer, cm); run(150);
  return { phase: m.phase, owner: m.ball.owner && m.ball.owner.name, cm: cm.name, flag: m.offside };`);
check(res, 'a team-mate standing offside but not involved is fine', r.phase === 'play' && r.owner === r.cm && r.flag === null, r);

r = await run(`
  const { s, passer } = scene(); const st = m.home.players[10]; st.pos.set(s * 33, 0, 3);
  m.ball.owner = null; m.startRestart('throw', m.home, new m.ball.pos.constructor(s * 25, 0.11, 34.3)); step(2);
  const t = m.restart.taker; st.pos.set(s * 33, 0, 26); m.restart.aim.copy(st.pos.clone().sub(t.pos).setY(0).normalize());
  m.takeRestart('ground', st); run(200);
  return { phase: m.phase, offsides: m.stats.home.offsides, owner: m.ball.owner && m.ball.owner.name, st: st.name };`);
check(res, 'no offside from a throw-in', r.phase === 'play' && r.offsides === 1, r);

r = await run(`
  const { s, passer } = scene(); const st = m.home.players[10], cm = m.home.players[7];
  st.pos.set(s * 34, 0, 1); cm.pos.set(s * 27, 0, -3);
  const aim = st.pos.clone().sub(passer.pos).setY(0).normalize();
  const pick = m.passTarget(passer, aim, 'ground');
  return { pick: pick && pick.name, st: st.name, cm: cm.name };`);
check(res, 'pass assist prefers the onside man when the aim is between them', r.pick === r.cm, r);

r = await run(`
  m.settings.offside = false;
  const { s, passer } = scene(); const st = m.home.players[10]; st.pos.set(s * 33, 0, 3);
  passTo(passer, st); for (let i = 0; i < 150 && m.phase === 'play' && m.ball.owner !== st; i++) step(1); m.settings.offside = true;
  return { phase: m.phase, owner: m.ball.owner && m.ball.owner.name, st: st.name };`);
check(res, 'offside off in settings: play on', r.phase === 'play' && r.owner === r.st, r);

await finish(browser, page, res);
