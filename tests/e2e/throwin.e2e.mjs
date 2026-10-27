// Throw-ins: you always take yours (control goes to the thrower and stays there), and a throw
// down the line stays in play instead of flipping the throw to the other side.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch();
const res = [];
const run = body => page.evaluate(`(() => { ${isolateSnippet}
  m.hooks.fade = cb => cb();
  const press = (k, v) => { const st = I.b[k]; st.pressed = v && !st.down; st.released = !v && st.down; st.fire = st.released && k !== 'shoot'; st.fireType = 'tap'; st.down = v; };
  const tap = k => { press(k, true); step(1); press(k, true); step(1); press(k, false); step(1); press(k, false); };
  const throwIn = (x, side) => { m.phase = 'play'; m.restart = null; for (const q of m.players) { q.busy = 0; q.pending = null; q.stun = 0; }
    m.ball.owner = null; m.lastTouch = m.away.players[5]; m.startRestart('throw', m.home, new m.ball.pos.constructor(x, 0.11, side * 34.3)); };
  ${body} })()`);

let r = await run(`
  const out = [];
  for (const [x, side, ax, az] of [[10, 1, 1, 0], [-20, -1, -1, 0.05], [30, 1, 1, -0.1], [0, -1, 0.3, 1], [15, 1, -1, 0]]) {
    throwIn(x * m.home.dir, side); step(5);
    const t = m.restart.taker; m.restart.aim.set(ax * m.home.dir, 0, az).normalize();
    tap('pass');
    let flipped = false, k0 = m.kickId;
    for (let i = 0; i < 120; i++) { step(1); if (m.restart && m.restart.type === 'throw' && m.restart.team === m.away) { flipped = true; break; } }
    out.push({ flipped, phase: m.phase, ctl: m.home.controlled && m.home.controlled.name, taker: t.name, thrown: m.kickId > k0 });
  }
  return out;`);
check(res, 'a throw down the line stays in play (never handed to the other team)', r.every(o => o.thrown && !o.flipped), r);

r = await run(`
  const out = [];
  for (let k = 0; k < 6; k++) {
    throwIn((k * 12 - 30) * m.home.dir, k % 2 ? 1 : -1);
    // you were controlling someone else, pushing the stick and pressing buttons while it was set up
    m.home.controlled = m.home.players[2]; stick(0.7, 0.4); step(20); stick(0, 0);
    const r = m.restart, ok = !!r && m.home.controlled === r.taker;
    let auto = false; for (let i = 0; i < 60 * 12; i++) { step(1); if (!m.restart) { auto = true; break; } }
    const k0 = m.kickId; tap('pass'); step(30);
    out.push({ ctlIsTaker: ok, takenWithoutYou: auto, yourTapThrew: !m.restart && m.kickId > k0 });
  }
  return out;`);
check(res, 'control goes to the thrower and the game never throws it for you', r.every(o => o.ctlIsTaker && !o.takenWithoutYou && o.yourTapThrew), r);
await finish(browser, page, res);
