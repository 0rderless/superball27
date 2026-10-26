// The simulation owns the gait clock and the animation follows it.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch();
const r = await page.evaluate(src => {
  eval(src + `
    const c = m.home.players.find(q => q.role === 'CM');
    iso(c); m.home.controlled = c; c.pos.set(0, 0, 10); c.vel.set(0, 0, 0);
    stick(0.65, 0); step(60);
    let strikes = 0, g0 = c.a.gait, t = 0; const speeds = [];
    for (let i = 0; i < 180; i++) { step(); m.animate(1 / 60); if (c.a.strike) strikes++; speeds.push(Math.hypot(c.vel.x, c.vel.z)); }
    const sp = speeds.reduce((a, b) => a + b) / speeds.length;
    const act = c.model.actions && c.model.actions['Jog_Fwd_Loop'];
    window.__r = { hasGait: typeof g0 === 'number', strikes, sp,
      animPhase: act ? act.time / act.getClip().duration : null, gait: c.a.gait };
  `);
  return window.__r;
}, isolateSnippet);

const res = [];
check(res, 'sim exposes a.gait', r.hasGait, r.gait);
const expected = 3 * r.sp / (r.sp <= 5.5 ? 1.9 + (3.6 - 1.9) * (r.sp - 2) / 3.5 : 3.6 + 1.8 * (r.sp - 5.5) / 3) * 2;
check(res, 'two strikes per stride', Math.abs(r.strikes - expected) <= 1.5, { strikes: r.strikes, expected: +expected.toFixed(1), sp: +r.sp.toFixed(2) });
check(res, 'animation reads the sim gait', r.animPhase !== null && Math.abs(r.animPhase - r.gait) < 0.02, { anim: r.animPhase, gait: r.gait });
await finish(browser, page, res);
