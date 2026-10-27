// Season mode: start from Home, play a matchday through the normal match flow, the result goes
// into the table (other games simulated), and finishing top crowns ZorpFC champions.
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

await page.click('#season-tile');
await page.click('#ssn-body [data-new="1"]');
let r = await page.evaluate(() => ({ rows: document.querySelectorAll('.ssn-table tbody tr').length, play: !!document.getElementById('ssn-play'), sub: document.getElementById('ssn-sub').textContent, tile: document.getElementById('season-tile-sub').textContent }));
await page.screenshot({ path: `${SHOTS}/season-start.png` });
check(res, 'new season: 12-club table and matchday 1 ready', r.rows === 12 && r.play && /matchday 1 of 11/.test(r.sub) && /Matchday 1\/11/.test(r.tile), r);

const opp = await page.evaluate(() => document.querySelector('.ssn-opp').textContent);
await page.click('#ssn-play');
await page.waitForFunction(() => window.__sb27.state === 'prematch' && document.getElementById('prematch').classList.contains('ready'), null, { timeout: 60000 });
r = await page.evaluate(() => ({ head: document.querySelector('#prematch .pm-head b').textContent, away: document.getElementById('pm-away-name').textContent }));
check(res, 'prematch shows the season fixture', r.head === 'SEASON · MATCHDAY 1' && r.away === opp, { ...r, opp });
await page.mouse.click(420, 200);
await page.waitForFunction(() => ['intro', 'game'].includes(window.__sb27.state), null, { timeout: 30000 });
await page.evaluate(() => window.__sb27.skipIntro());
await page.waitForFunction(() => window.__sb27.state === 'game', null, { timeout: 30000 });
// a 2-1 win, then the final whistle
await page.evaluate(() => {
  const m = window.__sb27.match;
  m.home.score = 2; m.away.score = 1; m.home.striker.ms.goals = 2; m.away.striker.ms.goals = 1;
  m.phase = 'fulltime'; m.hooks.fullTime();
});
await page.waitForFunction(() => window.__sb27.state === 'result', null, { timeout: 10000 });
r = await page.evaluate(async () => {
  const MD = await import('/js/modes.js'), L = await import('/js/league.js');
  const s = MD.season(), t = L.sortTable(s.table);
  return { msg: document.getElementById('ft-msg').textContent, again: document.getElementById('again-btn').textContent, round: s.round,
    played: t.every(x => x.p === 1), zorp: s.table.zorp, scorers: L.topScorers(s, 20).filter(x => x.team === 'zorp').map(x => x.goals) };
});
await page.screenshot({ path: `${SHOTS}/season-result.png` });
check(res, 'result recorded: everyone played once, ZorpFC on 3 points', r.round === 1 && r.played && r.zorp.pts === 3 && r.zorp.gf === 2 && r.zorp.ga === 1, r);
check(res, 'scorers counted and result screen points to the next matchday', r.scorers.includes(2) && /in the table/.test(r.msg) && r.again === 'Next matchday', r);

await page.click('#again-btn');
await page.waitForSelector('#season:not(.hidden)', { timeout: 5000 });
r = await page.evaluate(() => document.getElementById('ssn-sub').textContent);
check(res, 'back to the season hub on matchday 2', /matchday 2 of 11/.test(r), r);

// the rest of the season: ZorpFC win every game
r = await page.evaluate(async () => {
  const MD = await import('/js/modes.js');
  let out = null;
  while (MD.nextSeasonGame()) out = MD.recordSeasonGame(3, 0, [{ name: 'Z. Zorp', team: 'zorp' }]);
  return { out, trophies: MD.trophies().league, saved: JSON.parse(localStorage.getItem('sb27.profile')).season.champion };
});
await page.evaluate(() => { document.getElementById('season').classList.add('hidden'); document.getElementById('season-tile').click(); });
await page.waitForTimeout(300);
const champ = await page.evaluate(() => document.querySelector('.ssn-next.champ .ssn-opp') && document.querySelector('.ssn-next.champ .ssn-opp').textContent);
await page.screenshot({ path: `${SHOTS}/season-champ.png` });
check(res, 'win the league: champions, trophy counted and saved', r.out.champion === 'zorp' && r.trophies === 1 && r.saved === 'zorp' && champ === 'CHAMPIONS!', { ...r, champ });

check(res, 'no page errors', errors.length === 0, errors.slice(0, 3));
await b.close();
const bad = res.filter(x => !x.ok).length;
console.log(`${res.length - bad}/${res.length} passed`);
process.exit(bad ? 1 : 0);
