// Footstep dribbling in the real match engine: touches on footfalls, ball in the slot, never lost alone.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch();
const r = await page.evaluate(src => {
  eval(src + `
    const c = m.home.players.find(q => q.role === 'ST');
    const out = {};
    // distance of the ball ahead of / beside the body, along his run
    const rel = () => { const s = Math.hypot(c.vel.x, c.vel.z) || 1, hx = c.vel.x / s, hz = c.vel.z / s;
      const dx = m.ball.pos.x - c.pos.x, dz = m.ball.pos.z - c.pos.z; return [dx * hx + dz * hz, -dx * hz + dz * hx]; };
    const touchLog = () => { const D = c.drib; return D ? D.lastTouchT : undefined; };

    for (const [label, mag, spr] of [['jog', 0.65, false], ['sprint', 1, true]]) {
      giveBall(c); stick(mag, 0, spr);
      step(); // the first touch is the reception, not a footfall
      let lo = 9, hi = -9, touches = 0, offStrike = 0, last = touchLog();
      for (let i = 0; i < 300; i++) {
        step();
        const lt = touchLog();
        if (lt !== last) { touches++; if (!c.a.strike) offStrike++; }
        last = lt;
        if (i > 120) { const [a] = rel(); lo = Math.min(lo, a); hi = Math.max(hi, a); }
      }
      out[label] = { lo: +lo.toFixed(2), hi: +hi.toFixed(2), touches, offStrike, kept: m.ball.owner === c };
    }

    let lost = 0;
    for (let trial = 0; trial < 3; trial++) { giveBall(c);
    for (let i = 0; i < 600; i++) {
      if (i % 30 === 0) { const a = Math.random() * Math.PI * 2; stick(Math.cos(a), Math.sin(a), Math.random() < 0.5); }
      step();
      if (m.ball.owner !== c) { lost++; out.lostTo = m.ball.owner ? m.ball.owner.name : m.phase + ' ' + (m.restart && m.restart.type); break; }
      // keep him on the pitch
      if (Math.abs(c.pos.x) > 40 || Math.abs(c.pos.z) > 25) { stick(-Math.sign(c.pos.x) * 0.7, Math.sign(c.pos.z) * 0.7); }
    } }
    out.random = { lost };

    // gentle steer (30°) at a jog: the ball follows within 0.35s, staying close
    giveBall(c); stick(0.65, 0); step(120);
    const h0 = Math.atan2(c.vel.x, c.vel.z);
    stick(0.65 * Math.cos(0.52), -0.65 * Math.sin(0.52)); step(21);
    const h1 = Math.atan2(c.vel.x, c.vel.z), hb = Math.atan2(m.ball.vel.x, m.ball.vel.z);
    out.steer = { turned: +Math.abs(h1 - h0).toFixed(2), ballVsRun: +Math.abs(Math.atan2(Math.sin(hb - h1), Math.cos(hb - h1))).toFixed(2), d: +Math.hypot(m.ball.pos.x - c.pos.x, m.ball.pos.z - c.pos.z).toFixed(2) };

    giveBall(c); stick(1, 0, true); step(120); stick(0, 1, true); step(60);
    out.cut90 = { kept: m.ball.owner === c };
    giveBall(c); stick(1, 0, true); step(120); stick(-1, 0, true); step(100);
    out.turnBack = { kept: m.ball.owner === c };

    giveBall(c); stick(0.65, 0); step(90); stick(0, 0); let maxD = 0;
    for (let i = 0; i < 180; i++) { step(); if (i > 40) maxD = Math.max(maxD, Math.hypot(m.ball.pos.x - c.pos.x, m.ball.pos.z - c.pos.z)); }
    out.idle = { maxD: +maxD.toFixed(2), kept: m.ball.owner === c };

    iso(c); c.pos.set(0, 0, 0); c.vel.set(0, 0, 0); c.facing = -Math.PI / 2; c.fwd.set(-1, 0, 0); m.home.controlled = c;
    m.ball.owner = null; m.ball.pos.set(-14, 0.11, 0); m.ball.vel.set(18, 0, 0);
    m.kickId++; m.lastKick = { kind: 'pass', team: m.home, id: m.kickId, by: m.home.players[5] };
    stick(0, 0); let got = false;
    for (let i = 0; i < 120 && !got; i++) { step(); got = m.ball.owner === c; }
    stick(-0.6, 0); step(120);
    out.reception = { got, kept: m.ball.owner === c };

    // knocked long, then he turns his back on it: he must go and collect it, never leave it behind
    giveBall(c); stick(1, 0, true); step(90);
    c.drib.v.set(c.vel.x + 4, 0, c.vel.z); m.ball.vel.copy(c.drib.v); c.drib.nextT = m.time + 2; step(10);
    stick(-1, 0, true); let maxAway = 0;
    for (let i = 0; i < 180; i++) { step(); maxAway = Math.max(maxAway, Math.hypot(m.ball.pos.x - c.pos.x, m.ball.pos.z - c.pos.z)); }
    out.abandon = { maxAway: +maxAway.toFixed(2), kept: m.ball.owner === c, endD: +Math.hypot(m.ball.pos.x - c.pos.x, m.ball.pos.z - c.pos.z).toFixed(2) };

    giveBall(c); stick(0.65, 0); step(90); m.shoot(c, 0.8, null); let lastD = null;
    for (let i = 0; i < 90 && m.ball.owner === c; i++) { step(); lastD = Math.hypot(m.ball.pos.x - (c.pos.x + c.fwd.x * 0.5), m.ball.pos.z - (c.pos.z + c.fwd.z * 0.5)); }
    out.windup = { lastD: lastD && +lastD.toFixed(2), released: m.ball.owner !== c };
    window.__r = out;
  `);
  return window.__r;
}, isolateSnippet);

const res = [];
check(res, 'jog: ball rolls out to ~0.6m and back to the foot', r.jog.lo >= 0.15 && r.jog.hi >= 0.4 && r.jog.hi <= 0.8 && r.jog.kept, r.jog);
check(res, 'jog: every touch on a footfall', r.jog.touches > 0 && r.jog.offStrike === 0, r.jog);
check(res, 'sprint: ball pushed out to ~1m and back', r.sprint.lo >= 0.15 && r.sprint.hi >= 0.7 && r.sprint.hi <= 1.3 && r.sprint.kept, r.sprint);
check(res, 'sprint: every touch on a footfall', r.sprint.touches > 0 && r.sprint.offStrike === 0, r.sprint);
check(res, 'random stick 3×10s: never lost alone', r.random.lost === 0, { ...r.random, to: r.lostTo });
check(res, 'gentle steer: ball follows the run within 0.35s (≤ 0.2 rad off), stays ≤ 0.9m', r.steer.ballVsRun <= 0.2 && r.steer.d <= 0.9, r.steer);
check(res, 'cut 90° at sprint keeps it', r.cut90.kept);
check(res, 'turn-back at sprint keeps it', r.turnBack.kept);
check(res, 'idle keeps ball under the feet', r.idle.kept && r.idle.maxD <= 0.55, r.idle);
check(res, 'fast reception (18 m/s) controlled and kept', r.reception.got && r.reception.kept, r.reception);
check(res, 'turning away from a long touch: he collects it (never > 3.5m, back at the feet)', r.abandon.kept && r.abandon.maxAway <= 3.5 && r.abandon.endD <= 1.2, r.abandon);
check(res, 'wind-up draws ball to the kicking foot', r.windup.released && r.windup.lastD !== null && r.windup.lastD <= 0.6, r.windup);
await finish(browser, page, res);
