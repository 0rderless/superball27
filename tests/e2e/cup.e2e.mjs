// Cup mode: a quarter-final level after 90 goes to extra time, then a real penalty shootout
// (we take ours with the shoot key); the result fills the bracket; winning the final lifts the cup.
import { createRequire } from 'node:module';
import { check } from './harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const SHOTS = process.env.SHOTS || '/tmp';

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 844, height: 390 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { localStorage.setItem('sb27.graphics', '"low"'); localStorage.setItem('sb27.commentary', 'false'); });
await page.goto('http://localhost:8127/index.html');
await page.waitForFunction(() => window.__sb27 && window.__sb27.state === 'title', null, { timeout: 90000 });
await page.evaluate(() => window.__sb27.skipBoot());
await page.waitForTimeout(600);
const res = [];

await page.click('#cup-tile');
await page.click('#cup-body [data-cup-new]');
let r = await page.evaluate(() => ({ ties: document.querySelectorAll('.cup-col:first-child .tie:not(.tbd)').length, play: !!document.getElementById('cup-play'), tile: document.getElementById('cup-tile-sub').textContent }));
await page.screenshot({ path: `${SHOTS}/cup-draw.png` });
check(res, 'cup draw: four quarter-finals, ours ready to play', r.ties === 4 && r.play && /Quarter-final/.test(r.tile), r);

await page.click('#cup-play');
await page.waitForFunction(() => window.__sb27.state === 'prematch' && document.getElementById('prematch').classList.contains('ready'), null, { timeout: 60000 });
r = await page.evaluate(() => document.querySelector('#prematch .pm-head b').textContent);
check(res, 'prematch says cup quarter-final', r === 'CUP · QUARTER-FINAL', r);
await page.mouse.click(420, 200);
await page.waitForFunction(() => ['intro', 'game'].includes(window.__sb27.state), null, { timeout: 30000 });
await page.evaluate(() => window.__sb27.skipIntro());
await page.waitForFunction(() => window.__sb27.state === 'game', null, { timeout: 30000 });

// the headless renderer is slow: pause the loop and step the match ourselves
await page.keyboard.press('KeyP');
await page.waitForTimeout(400);
r = await page.evaluate(() => {
  const S = window.__sb27, I = S.input, m = S.match;
  m.hooks.fade = cb => cb();
  const step = n => { for (let i = 0; i < n; i++) m.update(1 / 60, I); };
  const press = (k, v) => { const st = I.b[k]; st.pressed = v && !st.down; st.released = !v && st.down; st.fire = st.released && k !== 'shoot'; st.fireType = 'tap'; st.down = v; };
  // 1-1 going into the last second of the second half
  m.phase = 'play'; m.restart = null; m.home.score = 1; m.away.score = 1; m.half = 2; m.clock = m.halfLen - 0.05;
  m.ball.owner = null; m.ball.pos.set(0, 0.11, 0); m.ball.vel.set(0, 0, 0);
  for (let i = 0; i < 60 * 12 && m.half !== 3; i++) step(1);
  const et = { half: m.half, minute: Math.round(m.minute), knockout: m.knockout };
  // still level at the end of extra time
  m.phase = 'play'; m.restart = null; m.clock = m.halfLen * 0.5 - 0.05; m.ball.owner = null; m.ball.pos.set(0, 0.11, 0); m.ball.vel.set(0, 0, 0);
  for (let i = 0; i < 60 * 3 && !(m.drill && m.drill.kind === 'shootout'); i++) step(1);
  const so = !!(m.drill && m.drill.kind === 'shootout');
  // the shootout: we aim at alternate corners; their kicks are automatic
  let ours = 0, theirs = 0;
  for (let guard = 0; guard < 60 * 120 && m.phase !== 'fulltime'; guard++) {
    const r = m.restart;
    if (r && r.type === 'penalty' && r.ready && m.phase === 'restart') {
      if (r.team === m.home) {
        r.aim.set(m.home.attackX - r.spot.x, 0, (ours % 2 ? 1 : -1) * 2.7).normalize(); ours++;
        press('shoot', true); step(1); press('shoot', true); step(26); press('shoot', false); step(1); press('shoot', false);
        continue;
      } else if (r.wait < 0.05) theirs++;
    }
    step(1);
  }
  return { et, so, ours, theirs, phase: m.phase };
});
check(res, 'level after 90: extra time', r.et.half === 3 && r.et.knockout && r.et.minute >= 90, r.et);
check(res, 'still level after extra time: penalty shootout', r.so, r);
let ours = r.ours;
await page.keyboard.press('KeyP');
await page.waitForFunction(() => window.__sb27.state === 'result', null, { timeout: 15000 }).catch(() => {});
r = await page.evaluate(async () => {
  const MD = await import('/js/modes.js'), so = window.__sb27.match.shootoutResult, c = MD.cup();
  const tie = c.rounds[0].find(t => t.h === 'zorp' || t.a === 'zorp');
  return { so, msg: document.getElementById('ft-msg').textContent, again: document.getElementById('again-btn').textContent, tie, round: c.round, out: c.out };
});
await page.screenshot({ path: `${SHOTS}/cup-result.png` });
check(res, 'shootout decided and shown on the result screen', r.so && r.so.home !== r.so.away && /ON PENS/.test(r.msg) && ours >= 3, { ...r, ours });
check(res, 'tie recorded 1-1 with the shootout score; the bracket moves on', r.tie.hg === 1 && r.tie.ag === 1 && r.tie.pens && (r.out ? /Out in the quarter-final/.test(r.msg) : r.round === 1 && /semi-final/.test(r.msg)), r);

// win the rest of it
r = await page.evaluate(async () => {
  const MD = await import('/js/modes.js');
  if (MD.cup().out) { MD.startCup(); }
  let out; while (MD.nextCupGame()) out = MD.recordCupGame(2, 0);
  return { out, cups: MD.trophies().cup, winner: MD.cup().winner };
});
check(res, 'win every tie: cup winners, trophy counted', r.out.won && r.winner === 'zorp' && r.cups === 1, r);
await page.evaluate(() => { document.getElementById('result').classList.add('hidden'); });
await page.evaluate(() => window.__sb27.state = 'menu');
await page.evaluate(() => document.getElementById('cup-tile').click());
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/cup-won.png` });

check(res, 'no page errors', errors.length === 0, errors.slice(0, 3));
await b.close();
const bad = res.filter(x => !x.ok).length;
console.log(`${res.length - bad}/${res.length} passed`);
process.exit(bad ? 1 : 0);
