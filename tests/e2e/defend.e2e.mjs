// Body contact goes to the stronger player. Also prints how often Legend / Beginner defenders win
// 1v1s against a sprinting, cutting dribbler (informational: single duels vary too much between runs
// to assert an ordering reliably).
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const duelsSnippet = `
  const c = m.home.players.find(q => q.role === 'ST');
  const cb = m.away.players.find(q => q.role === 'CB');
  let starts = 0, good = 0, won = 0;
  const tackle0 = m.tackle.bind(m);
  m.tackle = (p, slide) => { const was = p.action; tackle0(p, slide); if (p === cb && p.action === 'tackle' && was !== 'tackle') { starts++; cb._tk = m.time; } };
  for (let k = 0; k < 40; k++) {
    giveBall(c); c.pos.set(-12, 0, 0); m.ball.pos.set(-11.55, 0.11, 0);
    cb.busy = 0; cb.stun = 0; cb.tackleCD = 0; cb.pokeCD = 0; cb.pos.set(4, 0, 0); cb.vel.set(0, 0, 0); cb._tk = null;
    m.possTeam = m.home;
    // the dribbler drives at goal like a player would: sprint, and cut away when he's in the way
    let cutT = 0, side = 1;
    for (let i = 0; i < 240; i++) {
      const ox = cb.pos.x - c.pos.x, oz = cb.pos.z - c.pos.z, od = Math.hypot(ox, oz);
      if (cutT > 0) cutT--;
      else if (od < 3.5 && ox > 0 && Math.abs(oz) < 1.5) { cutT = 25; side = oz > 0 ? -1 : 1; }
      if (cutT > 0) stick(0.45, -side * 0.9, true); else stick(1, 0, true);
      step();
      if (m.ball.owner === cb || (m.ball.owner !== c && m.lastKick.by === cb)) { won++; if (cb._tk !== null) good++; break; }
      if (m.ball.owner !== c) break;
      if (c.pos.x > cb.pos.x + 2.5) break;
    }
  }
  window.__r = { duels: 40, won, winRate: won / 40, tackles: starts, tacklesWon: good };
`;

// a carrier standing on the ball with a defender in front keeps it: nothing is running into him
const standSnippet = `
  const c = m.home.players.find(q => q.role === 'ST'), cb = m.away.players.find(q => q.role === 'CB');
  let lost = 0;
  for (let k = 0; k < 10; k++) {
    giveBall(c); stick(0, 0); step(30);
    cb.busy = 0; cb.stun = 0; cb.tackleCD = 0; cb.pokeCD = 0; cb.pos.set(c.pos.x + 4, 0, c.pos.z); cb.vel.set(0, 0, 0);
    m.possTeam = m.home;
    for (let i = 0; i < 360; i++) { stick(0, 0); step(); if (m.ball.owner !== c) { lost++; break; } }
  }
  // reaction timers don't carry over to a new possession
  cb.exposedT = 0.3; cb.tkSeen = 0.3; cb.containT = 1.2;
  m.gainBall(m.home.players.find(q => q.role === 'CM'), false);
  window.__s = { lost, timers: [cb.exposedT, cb.tkSeen, cb.containT] };
`;

const res = [];
{
  const { page, browser } = await openMatch({ difficulty: 'legend' });
  const contact = await page.evaluate(src => {
    eval(src + `
      const a = m.home.players.find(q => q.role === 'ST'), d = m.away.players.find(q => q.role === 'CB');
      iso(a); m.ball.owner = null; m.ball.pos.set(30, 0.11, 20); m.ball.vel.set(0, 0, 0);
      a.busy = 1e6; d.busy = 1e6; // frozen in place: only the separation push moves them
      a.st.phy = 0.9; d.st.phy = 0.5;
      a.pos.set(0, 0, 0); d.pos.set(0.4, 0, 0); a.vel.set(0, 0, 0); d.vel.set(0, 0, 0);
      step();
      window.__c = { a: Math.abs(a.pos.x), d: Math.abs(d.pos.x - 0.4) };
    `);
    return window.__c;
  }, isolateSnippet);
  check(res, 'stronger player holds his line on contact', contact.d > 2 * contact.a, contact);
  const stand = await page.evaluate(src => { eval(src); return window.__s; }, isolateSnippet + standSnippet);
  check(res, 'legend: standing on the ball with a defender in front: kept ≥ 8/10', stand.lost <= 2, stand);
  check(res, 'defender reaction timers reset when possession changes', stand.timers.every(v => !v), stand.timers);
  const legend = await page.evaluate(src => { eval(src); return window.__r; }, isolateSnippet + duelsSnippet);
  console.log('legend', JSON.stringify(legend));
  if (page.errors.length) check(res, 'no page errors (legend)', false, page.errors.slice(0, 3));
  await browser.close();
  globalThis.legend = legend;
}
const legend = globalThis.legend;
const { page, browser } = await openMatch({ difficulty: 'beginner' });
const standB = await page.evaluate(src => { eval(src); return window.__s; }, isolateSnippet + standSnippet);
check(res, 'beginner: standing on the ball with a defender in front: kept ≥ 8/10', standB.lost <= 2, standB);
const beginner = await page.evaluate(src => { eval(src); return window.__r; }, isolateSnippet + duelsSnippet);
console.log('beginner', JSON.stringify(beginner));

await finish(browser, page, res);
