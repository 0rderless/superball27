// Full matches on Amateur / Pro / Legend with a simple bot on the user's side: no errors, no stalls,
// and possession only changes hands through challenges, passes, shots and restarts — never a
// dribbler losing it on his own.
import { openMatch, check, finish } from './harness.mjs';

const BOT = `
  const S = window.__sb27, I = S.input; S.match.hooks.fullTime = () => {};
  let stallT = 0, maxStall = 0, lastBall = null, shootHold = 0, t = 0;
  const ends = { won: 0, kick: 0, out: 0, selfLoss: 0, released: 0 };
  let owner = null, kickAtGain = 0, phaseAtGain = 'play';
  const set = (k, v) => { const st = I.b[k]; st.pressed = v && !st.down; st.released = !v && st.down; st.fire = st.released && k !== 'shoot'; st.fireType = 'tap'; st.down = v; };
  while (t < 420) {
    const m = S.match; if (m.phase === 'fulltime') break;
    const c = m.home.controlled, ball = m.ball;
    let x = 0, y = 0, sh = false, pa = false, sp = false;
    if (c) {
      if (ball.owner === c) {
        const dx = m.home.attackX - c.pos.x, dz = -c.pos.z, d = Math.hypot(dx, dz);
        x = dx / d; y = -dz / d; sp = Math.random() < 0.7;
        if (d < 22 && shootHold === 0) shootHold = 0.01; else if (Math.random() < 0.008) pa = true;
      } else if (m.phase === 'restart' && m.restart && m.restart.taker === c) { if (Math.random() < 0.05) pa = true; }
      else if (!(ball.owner && ball.owner.team === m.home)) {
        const tx = (ball.owner ? ball.owner.pos.x : ball.pos.x) - c.pos.x, tz = (ball.owner ? ball.owner.pos.z : ball.pos.z) - c.pos.z;
        const d = Math.hypot(tx, tz) || 1; x = tx / d; y = -tz / d; sp = d > 5;
        if (d < 1.8 && Math.random() < 0.03) sh = true;
      }
    }
    if (shootHold > 0) { shootHold += 1 / 60; sh = shootHold < 0.45; if (!sh) shootHold = 0; }
    I.move.x = x; I.move.y = y; I.mag = Math.min(1, Math.hypot(x, y));
    set('shoot', sh); set('pass', pa); set('through', false); set('sprint', sp); set('skill', false);
    m.update(1 / 60, I); t += 1 / 60;
    // how did the last owner's possession end?
    if (ball.owner !== owner) {
      if (owner && phaseAtGain === 'play') {
        if (ball.owner && ball.owner.team !== owner.team && m.kickId === kickAtGain) ends.won++;
        else if (m.kickId !== kickAtGain && m.lastKick.kind === 'loose') ends.released++; // safety-net release: a self-loss too
        else if (m.kickId !== kickAtGain) ends.kick++;
        else if (m.phase !== 'play') ends.out++;
        else ends.selfLoss++;
      }
      owner = ball.owner; kickAtGain = m.kickId; phaseAtGain = m.phase;
    }
    if (m.phase === 'play') {
      if (lastBall && Math.hypot(ball.pos.x - lastBall[0], ball.pos.z - lastBall[1]) < 3) { stallT += 1 / 60; maxStall = Math.max(maxStall, stallT); }
      else { stallT = 0; lastBall = [ball.pos.x, ball.pos.z]; }
    } else { stallT = 0; lastBall = null; }
  }
  const m = S.match;
  window.__r = { score: [m.home.score, m.away.score], shots: [m.stats.home.shots, m.stats.away.shots], maxStall: +maxStall.toFixed(1), ends,
    fouls: [m.stats.home.fouls, m.stats.away.fouls], cards: [m.stats.home.yellows + m.stats.away.yellows, m.stats.home.reds + m.stats.away.reds], players: m.players.length, offsides: [m.stats.home.offsides || 0, m.stats.away.offsides || 0] };
`;

const res = [];
let last;
for (const difficulty of ['amateur', 'pro', 'legend']) {
  const { page, browser } = await openMatch({ difficulty });
  await page.evaluate(() => { localStorage.setItem('sb27.minutes', '6'); });
  const r = await page.evaluate(src => { eval(src); return window.__r; }, BOT);
  const total = r.ends.won + r.ends.kick + r.ends.out + r.ends.selfLoss + r.ends.released;
  check(res, `${difficulty}: no page errors`, page.errors.length === 0, page.errors.slice(0, 3));
  check(res, `${difficulty}: no stall > 6s`, r.maxStall <= 6, r.maxStall);
  check(res, `${difficulty}: no self-loss (< 2% of possessions)`, r.ends.selfLoss + r.ends.released <= total * 0.02, { ...r.ends, score: r.score, shots: r.shots });
  console.log(`     ${difficulty}: score ${r.score} · fouls ${r.fouls} · yellows/reds ${r.cards} · players ${r.players} · offsides ${r.offsides}`);
  check(res, `${difficulty}: fouls happen but don't wreck the game (≤ 14 in 7 minutes)`, r.fouls[0] + r.fouls[1] <= 14, r.fouls);
  if (last) await last.close();
  last = browser; last.page = page;
}
await finish(last, last.page, res);
