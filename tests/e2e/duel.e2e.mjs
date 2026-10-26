// 1v1s against a live AI centre-back: sprinting straight at him should lose it, a late cut should beat him.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch({ difficulty: 'pro' });
const r = await page.evaluate(src => {
  eval(src + `
    const c = m.home.players.find(q => q.role === 'ST');
    const cb = m.away.players.find(q => q.role === 'CB');
    const duel = cut => {
      giveBall(c); c.pos.set(-12, 0, 0); m.ball.pos.set(-11.55, 0.11, 0);
      cb.busy = 0; cb.stun = 0; cb.tackleCD = 0; cb.pos.set(4, 0, 0); cb.vel.set(0, 0, 0);
      m.possTeam = m.home;
      stick(1, 0, true); let turned = false;
      for (let i = 0; i < 240; i++) {
        if (cut && !turned && Math.hypot(cb.pos.x - c.pos.x, cb.pos.z - c.pos.z) < 3.5) { turned = true; stick(0.35, Math.random() < 0.5 ? 0.94 : -0.94, true); }
        step();
        if (m.ball.owner !== c) return true; // lost: won, poked loose or blocked
        if (c.pos.x > cb.pos.x + 2.5) return false; // got past him with it
      }
      return m.ball.owner !== c;
    };
    let straight = 0, cuts = 0;
    for (let k = 0; k < 20; k++) { if (duel(false)) straight++; if (duel(true)) cuts++; }
    window.__r = { straightLost: straight, cutLost: cuts };
  `);
  return window.__r;
}, isolateSnippet);

const res = [];
check(res, 'sprinting straight at a CB loses it ≥ 12/20', r.straightLost >= 12, r);
check(res, 'a late cut beats him ≥ 12/20', 20 - r.cutLost >= 12, r);
await finish(browser, page, res);
