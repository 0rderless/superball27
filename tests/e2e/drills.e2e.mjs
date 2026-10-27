// Skill games played through the real controls: scores add up, the run ends with a result card,
// and the best score is saved in the profile.
import { createRequire } from 'node:module';
import { check } from './harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const SHOTS = process.env.SHOTS || '/tmp';

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 844, height: 390 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('sb27.graphics', '"low"'));
await page.goto('http://localhost:8127/index.html');
await page.waitForFunction(() => window.__sb27 && window.__sb27.state === 'title', null, { timeout: 90000 });
await page.evaluate(() => window.__sb27.skipBoot());
await page.waitForTimeout(600);
const res = [];

// open the skill games from the home screen
await page.click('#drills-tile');
await page.waitForTimeout(300);
const listed = await page.$$eval('#drill-list .drill', els => els.map(e => e.dataset.drill));
await page.screenshot({ path: `${SHOTS}/drills-list.png` });
check(res, 'four skill games listed', listed.join() === 'shooting,freekicks,penalties,cones', listed);

const COMMON = `
  const S = window.__sb27, I = S.input; let m = S.match, d = m.drill;
  const press = (k, v) => { const st = I.b[k]; st.pressed = v && !st.down; st.released = !v && st.down; st.fire = st.released && k !== 'shoot'; st.fireType = 'tap'; st.down = v; };
  const step = n => { for (let i = 0; i < n; i++) m.update(1 / 60, I); };
  const stickTo = (wx, wz) => { const cf = m.camFwd || { x: 0, z: -1 }, L = Math.hypot(wx, wz) || 1; wx /= L; wz /= L;
    I.move.x = -cf.z * wx + cf.x * wz; I.move.y = cf.x * wx + cf.z * wz; I.mag = 1; };
  const still = () => { I.move.x = 0; I.move.y = 0; I.mag = 0; };
  const shoot = (frames = 30) => { press('shoot', true); step(1); press('shoot', true); step(frames); press('shoot', false); step(1); press('shoot', false); };
`;
async function startDrill(kind) {
  await page.evaluate(k => window.__sb27.startDrill(k), kind);
  await page.waitForFunction(k => window.__sb27.state === 'game' && window.__sb27.match.drill && window.__sb27.match.drill.kind === k, kind, { timeout: 30000 });
  await page.keyboard.press('KeyP'); // pause the loop; the test steps the match itself
  await page.waitForTimeout(500);   // let the opening fade finish, then make fades instant
  await page.evaluate(() => { window.__sb27.match.hooks.fade = cb => cb(); });
}
async function endCard(kind) {
  await page.evaluate(() => window.__sb27.match.drill.done || null);
  await page.waitForSelector('#drill-result:not(.hidden)', { timeout: 8000 }).catch(() => {});
  return page.evaluate(k => ({ open: !document.getElementById('drill-result').classList.contains('hidden'), score: document.getElementById('dr-score').textContent,
    best: JSON.parse(localStorage.getItem('sb27.profile')).drills[k] }), kind);
}

// ---- penalties: 10 kicks into alternating corners
await startDrill('penalties');
let r = await page.evaluate(`(() => { ${COMMON}
  for (let k = 0; k < 10 && !d.done; k++) {
    for (let i = 0; i < 200 && !(m.restart && m.restart.ready && d.state === 'ready'); i++) step(1);
    const rs = m.restart, gx = m.home.attackX; rs.wait = 1;
    rs.aim.set(gx - rs.spot.x, 0, (k % 2 ? 1 : -1) * 2.8).normalize();
    shoot(28);
    for (let i = 0; i < 400 && d.state !== 'between' && !d.done; i++) step(1);
    for (let i = 0; i < 120 && d.state === 'between'; i++) step(1);
  }
  return { done: d.done, score: d.score, goals: d.goals, attempts: d.attempt };
})()`);
check(res, 'penalties: 10 kicks, score = 100 a goal (+10 a save)', r.done && r.attempts === 10 && r.goals >= 5 && r.score >= r.goals * 100 && r.score <= r.goals * 100 + (10 - r.goals) * 10, r);
let card = await endCard('penalties');
await page.screenshot({ path: `${SHOTS}/drills-result.png` });
check(res, 'penalties: result card shown and best saved', card.open && +card.score === r.score && card.best === r.score, card);

// ---- free kicks
await page.click('#dr-again').catch(() => {});
await page.evaluate(() => { for (const id of ['drill-result']) document.getElementById(id).classList.add('hidden'); });
await startDrill('freekicks');
r = await page.evaluate(`(() => { ${COMMON}
  let walls = 0;
  for (let k = 0; k < 10 && !d.done; k++) {
    for (let i = 0; i < 300 && !(m.restart && m.restart.ready && d.state === 'ready'); i++) step(1);
    walls += m.away.players.filter(q => q.wall).length >= 3 ? 1 : 0;
    const rs = m.restart, gx = m.home.attackX; rs.wait = 1;
    rs.aim.set(gx - rs.spot.x, 0, -Math.sign(rs.spot.z || 1) * 2.6 - rs.spot.z).normalize();
    shoot(20);
    for (let i = 0; i < 400 && d.state !== 'between' && !d.done; i++) step(1);
    for (let i = 0; i < 120 && d.state === 'between'; i++) step(1);
  }
  return { done: d.done, score: d.score, goals: d.goals, attempts: d.attempt, walls };
})()`);
check(res, 'free kicks: 10 kicks with a wall each time, some go in', r.done && r.attempts === 10 && r.walls === 10 && r.goals >= 1, r);
card = await endCard('freekicks');
check(res, 'free kicks: result and best saved', card.open && card.best === r.score, card);
await page.evaluate(() => document.getElementById('drill-result').classList.add('hidden'));

// ---- shooting practice: 60 s of shots from around the box
await startDrill('shooting');
r = await page.evaluate(`(() => { ${COMMON}
  let shots = 0;
  for (let guard = 0; guard < 200 && !d.done; guard++) {
    for (let i = 0; i < 200 && d.state !== 'ready' && !d.done; i++) step(1);
    if (d.done) break;
    const p = d.taker, gx = m.home.attackX;
    stickTo(gx - p.pos.x, (Math.random() < 0.5 ? 2.5 : -2.5) - p.pos.z); step(8); shots++;
    shoot(18); still();
    for (let i = 0; i < 400 && d.state !== 'between' && !d.done; i++) step(1);
  }
  return { done: d.done, score: d.score, goals: d.goals, shots, t: +d.t.toFixed(1) };
})()`);
check(res, 'shooting: the 60 s run ends, goals score 100+', r.done && r.t >= 59.9 && r.shots >= 6 && r.score >= r.goals * 100, r);
card = await endCard('shooting');
check(res, 'shooting: best saved', card.open && card.best === r.score, card);
await page.evaluate(() => document.getElementById('drill-result').classList.add('hidden'));

// ---- dribbling cones: a bot weaves through each gate, then scores
await startDrill('cones');
await page.keyboard.press('KeyP'); await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/drills-cones.png` }); await page.keyboard.press('KeyP');
r = await page.evaluate(`(() => { ${COMMON}
  const s = m.home.dir, gates = d.course.gates;
  let frames = 0, shot = false;
  while (!d.done && frames < 60 * 90) {
    const p = d.taker;
    if (d.state === 'between') { still(); step(1); frames++; continue; }
    if (d.gate < gates.length) {
      const g = gates[d.gate], cz = (g.a.z + g.b.z) / 2;
      // line up a few metres before the gate, then drive through it
      const before = (g.a.x - p.pos.x) * s > 2.5;
      const tx = before ? g.a.x - s * 2 : g.a.x + s * 3, tz = cz;
      stickTo(tx - p.pos.x, tz - p.pos.z);
    } else {
      const gx = m.home.attackX;
      if (Math.abs(gx - p.pos.x) > 15) stickTo(gx - p.pos.x, -p.pos.z);
      else if (m.ball.owner === p && !shot) { stickTo(gx - p.pos.x, 2.6 - p.pos.z); step(4); shoot(14); shot = true; frames += 20; continue; }
      else if (m.ball.owner !== p && d.state === 'ready') { shot = false; stickTo(m.ball.pos.x - p.pos.x, m.ball.pos.z - p.pos.z); }
    }
    step(1); frames++;
    if (d.state === 'between') shot = false;
  }
  still();
  return { done: d.done, gates: d.gate, total: gates.length, t: +d.t.toFixed(1), frames };
})()`);
check(res, 'cones: every gate in order, then a goal stops the clock', r.done && r.gates === r.total && r.t > 5 && r.t < 60, r);
card = await endCard('cones');
check(res, 'cones: time shown and saved as best', card.open && /s$/.test(card.score) && card.best === r.t, card);

check(res, 'no page errors', errors.length === 0, errors.slice(0, 3));
await b.close();
const bad = res.filter(x => !x.ok).length;
console.log(`${res.length - bad}/${res.length} passed`);
process.exit(bad ? 1 : 0);
