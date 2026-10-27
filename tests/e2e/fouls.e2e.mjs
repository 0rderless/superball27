// Fouls, cards, advantage, free kicks and penalties, driven through the real match engine.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch();
const res = [];
const run = body => page.evaluate(`(() => { ${isolateSnippet}
  const fade = m.hooks.fade; m.hooks.fade = cb => cb();
  const press = (k, v) => { const st = I.b[k]; st.pressed = v && !st.down; st.released = !v && st.down; st.fire = st.released && k !== 'shoot'; st.fireType = 'tap'; st.down = v; };
  const reset = () => { m.adv = null; m.restart = null; m.phase = 'play'; for (const q of m.players) { q.busy = 0; q.stun = 0; q.pending = null; } };
  const foul = (def, vic, opts, rnd) => { const R = Math.random; let i = 0; Math.random = () => rnd[i++] ?? 0.99; try { return m.maybeFoul(def, vic, opts); } finally { Math.random = R; } };
  ${body} })()`);

// 1. a reckless slide from behind in midfield: free kick to us, no wall (too far out)
let r = await run(`
  reset(); const a = m.home.players[6], d = m.away.players[5];
  a.pos.set(-10, 0, 3); a.fwd.set(1, 0, 0); d.pos.set(-11, 0, 3); m.ball.pos.set(-9.5, 0.11, 3); m.gainBall(a, false, true);
  const blown = foul(d, a, { slide: true, missed: true, bodyContact: true }, [0.1, 0.9]);
  return { blown, phase: m.phase, type: m.restart && m.restart.type, team: m.restart && m.restart.team.key, shooting: m.restart && m.restart.shooting, fouls: m.stats.away.fouls };`);
check(res, 'mistimed slide from behind is a foul → free kick to the fouled side', r.blown && r.type === 'freekick' && r.team === 'home' && r.fouls === 1, r);

// 2. a foul 22 m out: the specialist takes it, a wall stands 9.15 m away
r = await run(`
  reset(); const s = m.home.dir, a = m.home.players[9], d = m.away.players[3];
  a.pos.set(s * 30, 0, 2); a.fwd.set(s, 0, 0); d.pos.set(s * 29, 0, 2); m.ball.pos.set(s * 30.4, 0.11, 2); m.gainBall(a, false, true);
  foul(d, a, { slide: false, missed: true, bodyContact: true }, [0.1, 0.99]);
  step(2);
  const r = m.restart, wall = m.away.players.filter(q => q.wall);
  const best = Math.max(...m.home.players.filter(q => !q.isGK).map(q => q.st.sho));
  return { type: r.type, shooting: r.shooting, takerSho: r.taker.st.sho, best, wall: wall.length,
    dists: wall.map(q => +Math.hypot(q.pos.x - r.spot.x, q.pos.z - r.spot.z).toFixed(2)),
    nearest: Math.min(...m.away.players.filter(q => !q.isGK).map(q => Math.hypot(q.pos.x - r.spot.x, q.pos.z - r.spot.z))) };`);
check(res, 'free kick in range: best shooter takes it, 4-5 man wall at 9.15 m', r.type === 'freekick' && r.shooting && r.takerSho === r.best && r.wall >= 4 && r.dists.every(x => Math.abs(x - 9.15) < 0.7) && r.nearest > 8.4, r);

// 3. user curls it: hold and release SHOOT aiming at the far corner, 12 times from 22-28 m
r = await run(`
  const out = { cleared: 0, onTarget: 0, goals: 0, wall: 0, n: 12, heights: [] };
  for (let k = 0; k < out.n; k++) {
    reset(); const s = m.home.dir, gx = m.home.attackX;
    m.startRestart('freekick', m.home, new m.ball.pos.constructor(gx - s * (22 + (k % 4) * 2), 0.11, (k % 3 - 1) * 5)); step(2);
    const rs = m.restart;
    const aimZ = -Math.sign(rs.spot.z || 1) * 2.6;
    rs.aim.set(gx - rs.spot.x, 0, aimZ - rs.spot.z).normalize();
    press('shoot', true); step(1); press('shoot', true); for (let i = 0; i < 24; i++) step(1); press('shoot', false); step(1); press('shoot', false);
    const wx = rs.spot.x + (gx - rs.spot.x) / Math.hypot(gx - rs.spot.x, rs.spot.z) * 9.15, sc = m.home.score, k0 = m.kickId;
    let wallY = null, end = null;
    for (let i = 0; i < 200; i++) {
      step(1); const b = m.ball.pos;
      if (wallY === null && (b.x - wx) * s >= 0) wallY = b.y;
      if (m.lastKick.kind === 'block' && m.kickId > k0) { end = 'wall'; break; }
      if (m.home.score > sc) { end = 'goal'; break; }
      if (m.lastKick.kind === 'save' && m.kickId > k0) { end = 'save'; break; }
      if (b.x * s >= 52.5) { end = Math.abs(b.z) < 3.66 && b.y < 2.44 ? 'goal' : 'off'; break; }
    }
    if (wallY !== null) { out.cleared++; out.heights.push(+wallY.toFixed(2)); }
    if (end === 'wall') out.wall++;
    if (end === 'goal' || end === 'save') out.onTarget++;
    if (end === 'goal') { out.goals++; m.phase = 'play'; }
  }
  return out;`);
check(res, 'free kicks clear the wall most of the time', r.cleared >= 9 && r.heights.every(h => h > 2.0), r);
check(res, 'free kicks curled at the corner are mostly on target, some go in', r.onTarget >= 6 && r.goals >= 1, r);

// 4. foul in the box → penalty; everyone else out of the box; keeper on his line
r = await run(`
  reset(); const s = m.home.dir, a = m.home.players[10], d = m.away.players[2];
  a.pos.set(s * 44, 0, 1); a.fwd.set(s, 0, 0); d.pos.set(s * 43, 0, 1); m.ball.pos.set(s * 44.4, 0.11, 1); m.gainBall(a, false, true);
  foul(d, a, { slide: true, missed: true, bodyContact: true }, [0.1, 0.99]);
  step(3);
  const r = m.restart, gx = m.home.attackX;
  const inBox = m.players.filter(q => q !== r.taker && q !== m.away.gk && Math.abs(gx - q.pos.x) < 16.5 && Math.abs(q.pos.z) < 20.16).length;
  return { type: r.type, spot: +Math.abs(r.spot.x).toFixed(2), inBox, gk: +(Math.abs(gx - m.away.gk.pos.x)).toFixed(2) };`);
check(res, 'foul in the box is a penalty, others outside the box', r.type === 'penalty' && r.inBox === 0 && r.gk < 1.5, r);

// 5. many penalties: user aims at corners; a fair share go in, and some are saved
r = await run(`
  let goals = 0, saves = 0, misses = 0; const N = 30;
  const goal0 = m.home.score;
  for (let k = 0; k < N; k++) {
    reset(); const s = m.home.dir, gx = m.home.attackX, spot = new m.ball.pos.constructor(gx - s * 11, 0.11, 0);
    m.startRestart('penalty', m.home, spot); step(2);
    const rs = m.restart; rs.wait = 0.5;
    const z = (k % 2 ? 1 : -1) * 2.7; rs.aim.set(gx - spot.x, 0, z).normalize();
    press('shoot', true); step(1); press('shoot', true); for (let i = 0; i < 30; i++) step(1); press('shoot', false); step(1); press('shoot', false);
    const sc = m.home.score, k0 = m.kickId; let outcome = 'miss';
    for (let i = 0; i < 120; i++) { step(1); if (m.home.score > sc) { outcome = 'goal'; break; } if (m.lastKick.kind === 'save' && m.kickId > k0) { outcome = 'save'; break; } if (m.phase === 'restart' && m.restart.type !== 'penalty') break; }
    if (outcome === 'goal') { goals++; m.phase = 'play'; } else if (outcome === 'save') saves++; else misses++;
  }
  return { goals, saves, misses };`);
check(res, 'penalties: mostly scored, some saved', r.goals >= 15 && r.goals <= 28 && r.saves >= 1, r);

// 6. AI penalty against us
r = await run(`
  let goals = 0, saves = 0, other = 0;
  for (let k = 0; k < 20; k++) {
    reset(); const s = m.away.dir, gx = m.away.attackX, spot = new m.ball.pos.constructor(gx - s * 11, 0.11, 0);
    m.startRestart('penalty', m.away, spot); step(2);
    const sa = m.away.score, k0 = m.kickId; let o = 'other';
    for (let i = 0; i < 400; i++) { step(1); if (m.away.score > sa) { o = 'goal'; break; } if (m.lastKick.kind === 'save' && m.kickId > k0) { o = 'save'; break; } }
    if (o === 'goal') { goals++; m.phase = 'play'; } else if (o === 'save') saves++; else other++;
  }
  return { goals, saves, other };`);
check(res, 'AI takes its penalties and our keeper can save some', r.goals >= 8 && r.goals + r.saves + r.other === 20 && r.other <= 4, r);

// 7. a red card: player goes off, team plays on with 10, the match keeps running
r = await run(`
  reset(); const s = m.home.dir, a = m.home.players[10], d = m.away.players[3];
  a.pos.set(s * 25, 0, 0); a.fwd.set(s, 0, 0); m.ball.pos.set(s * 25.4, 0.11, 0); m.gainBall(a, false, true);
  // last man: everyone else on his side is behind the play
  for (const q of m.away.players) if (!q.isGK && q !== d) q.pos.set(-s * 10, 0, q.idx * 3 - 15);
  d.pos.set(s * 24, 0, 0);
  const n0 = m.away.players.length;
  foul(d, a, { slide: true, missed: true, bodyContact: true }, [0.1, 0.99]);
  const n = n0 - m.away.players.length, onPitch = m.players.includes(d);
  let err = null; try { for (let i = 0; i < 60 * 20; i++) step(1); } catch (e) { err = e.message; }
  return { n, onPitch, visible: d.model.root.visible, err, total: m.players.length };`);
check(res, 'last-man foul is a red: sent off, 10 men, play goes on', r.n === 1 && !r.onPitch && !r.visible && !r.err, r);

// 8. second yellow = red
r = await run(`
  reset(); const d = m.away.players[4]; d.yellows = 1; const n0 = m.away.players.length;
  m.giveCard(d, 'yellow'); return { off: !m.away.players.includes(d), n0, n: m.away.players.length, yellows: d.yellows };`);
check(res, 'a second yellow is a red', r.off && r.n === r.n0 - 1, r);

// 9. advantage: fouled in their half, a teammate picks up the loose ball → play on, no restart
r = await run(`
  reset(); const s = m.home.dir, a = m.home.players[9], b = m.home.players[8], d = m.away.players[5];
  for (const q of m.players) if (![a, b, d].includes(q) && !q.isGK) q.pos.set(-s * 20, 0, q.idx * 4 - 20);
  a.pos.set(s * 15, 0, 0); a.fwd.set(s, 0, 0); d.pos.set(s * 14, 0, 0); b.pos.set(s * 17, 0, 1);
  m.ball.owner = null; m.ball.pos.set(s * 16.8, 0.11, 0.9); m.ball.vel.set(0, 0, 0);
  const blown = foul(d, a, { slide: true, missed: true, bodyContact: true }, [0.1, 0.99]);
  const adv = !!m.adv, phase = m.phase;
  for (let i = 0; i < 60 * 3; i++) step(1);
  return { blown, adv, phase, after: m.phase, advAfter: m.adv };`);
check(res, 'advantage played when the fouled side keeps it', r.blown && r.adv && r.phase === 'play' && r.advAfter === null, r);

// 10. AI free kicks happen without a hitch (shot or pass), and the restart ends
r = await run(`
  let ok = 0;
  for (let k = 0; k < 6; k++) {
    reset(); const s = m.away.dir, spot = new m.ball.pos.constructor(m.away.attackX - s * 24, 0.11, (k - 3) * 2);
    m.startRestart('freekick', m.away, spot); step(2);
    for (let i = 0; i < 60 * 5 && m.restart && m.restart.type === 'freekick'; i++) step(1);
    if (!m.restart || m.restart.type !== 'freekick') ok++;
  }
  return { ok };`);
check(res, 'AI takes its free kicks', r.ok === 6, r);

await finish(browser, page, res);
