// Defending like FC Mobile: run into the ball and you win it; a loose ball inside your ring is
// yours; with the ball loose or in the air the buttons are PASS/SHOOT, not SWITCH.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch();
const res = [];
const run = body => page.evaluate(`(() => { ${isolateSnippet}
  m.hooks.fade = cb => cb();
  const press = (k, v) => { const st = I.b[k]; st.pressed = v && !st.down; st.released = !v && st.down; st.fire = st.released && k !== 'shoot'; st.fireType = 'tap'; st.down = v; };
  const scene = () => { m.phase = 'play'; m.restart = null; m.guarantee = null; m.offside = null; m.adv = null; m.settings.offside = false;
    for (const q of m.players) { q.busy = 0; q.stun = 0; q.cool = 0; q.pending = null; q.recv = null; q.skill = null; q.vel.set(0, 0, 0); q.desired.set(0, 0, 0); }
    m.home.players.forEach((q, i) => q.pos.set(-40, 0, i * 3 - 15)); m.away.players.forEach((q, i) => q.pos.set(40, 0, i * 3 - 15)); };
  ${body} })()`);

let r = await run(`
  let won = 0, N = 20;
  for (let k = 0; k < N; k++) {
    scene();
    const q = m.home.players[5], o = m.away.players[9];
    q.pos.set(0, 0, 0); m.home.controlled = q; m.setControlled(q);
    o.pos.set(8, 0, (k % 5 - 2) * 0.3); o.facing = -Math.PI / 2; o.fwd.set(-1, 0, 0);
    m.ball.owner = null; m.ball.pos.set(7.5, 0.11, o.pos.z); m.gainBall(o, false, true);
    // you run straight at him; he dribbles at you
    for (let i = 0; i < 150; i++) {
      const dx = m.ball.pos.x - q.pos.x, dz = m.ball.pos.z - q.pos.z, L = Math.hypot(dx, dz) || 1;
      const cf = m.camFwd || { x: 0, z: -1 }; I.move.x = -cf.z * dx / L + cf.x * dz / L; I.move.y = cf.x * dx / L + cf.z * dz / L; I.mag = 1;
      o.desired.set(-4, 0, 0);
      step(1);
      if (m.ball.owner === q) { won++; break; }
    }
    I.move.x = 0; I.move.y = 0; I.mag = 0;
  }
  return { won, N, fouls: m.stats.home.fouls };`);
check(res, 'run into the dribbler and you win it (most of the time, no foul)', r.won >= 13 && r.fouls === 0, r);

r = await run(`
  scene();
  const q = m.home.players[6]; q.pos.set(0, 0, 0); m.setControlled(q);
  m.ball.owner = null; m.ball.pos.set(6, 0.11, 0.3); m.ball.vel.set(-7, 0, 0); m.ball.spin = 0;
  m.lastKick = { kind: 'pass', team: m.away, id: ++m.kickId, by: m.away.players[4] }; m.kickAge = 0;
  let got = false; for (let i = 0; i < 90; i++) { step(1); if (m.ball.owner === q) { got = true; break; } }
  return { got, owner: m.ball.owner && m.ball.owner.name };`);
check(res, 'a loose ball rolling into your ring is yours without pressing anything', r.got, r);

r = await run(`
  scene();
  const q = m.home.players[6], mate = m.home.players[8]; q.pos.set(0, 0, 0); m.setControlled(q); mate.pos.set(-15, 0, 10);
  // their pass is in the air, heading your way
  m.ball.owner = null; m.ball.pos.set(14, 1.6, 0); m.ball.vel.set(-11, 3, 0);
  m.lastKick = { kind: 'pass', team: m.away, id: ++m.kickId, by: m.away.players[4] };
  step(2);
  const mode = m.uiMode();
  const before = m.home.controlled;
  press('pass', true); step(1); press('pass', true); step(1); press('pass', false); step(1); press('pass', false);
  const switched = m.home.controlled !== before, queued = !!(before.queued);
  let passed = false; const k0 = m.kickId;
  for (let i = 0; i < 120; i++) { step(1); if (m.lastKick.kind === 'pass' && m.lastKick.team === m.home && m.kickId > k0) { passed = true; break; } }
  return { mode, switched, queued, passed };`);
check(res, 'ball in the air: buttons say PASS, pressing it queues a first-time pass (no switch)', r.mode === 'attack' && !r.switched && r.queued && r.passed, r);

r = await run(`
  scene();
  const q = m.home.players[6], o = m.away.players[9]; q.pos.set(0, 0, 0); m.setControlled(q);
  o.pos.set(10, 0, 0); m.ball.owner = null; m.ball.pos.set(9.6, 0.11, 0); m.gainBall(o, false, true); step(1);
  return { mode: m.uiMode() };`);
check(res, 'they have it: defending buttons (SWITCH / TACKLE)', r.mode === 'defend', r);
await finish(browser, page, res);
