// Kit editor: a saved kit is what ZorpFC wear in the next match, and the two teams never clash.
import { createRequire } from 'node:module';
import { check } from './harness.mjs';
import { colourDist } from '../../js/kits.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const SHOTS = process.env.SHOTS || '/tmp';

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 844, height: 390 } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => localStorage.setItem('sb27.graphics', '"low"'));
await p.goto('http://localhost:8127/index.html');
await p.waitForFunction(() => window.__sb27 && window.__sb27.state === 'title', null, { timeout: 90000 });
await p.evaluate(() => window.__sb27.skipBoot());
await p.waitForTimeout(600);
await p.click('[data-tab="squad"]');
await p.click('#kits-btn');
const setCol = (k, v) => p.evaluate(([k, v]) => { const i = document.querySelector(`#kit-form [data-col="${k}"]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]);
await setCol('shirt', '#ff7a00'); await setCol('shirt2', '#000000');
await p.click('#kit-form [data-pattern="hoops"]');
await p.click('#kit-form [data-choice="home"]');
await p.click('#kit-save');
await p.screenshot({ path: `${SHOTS}/kits-editor.png` });
const preview = await p.$eval('#kit-preview', el => el.innerHTML);
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('sb27.profile')));
await p.click('#kit-editor [data-close]');

await p.evaluate(() => window.__sb27.startGame());
await p.waitForFunction(() => ['intro', 'game'].includes(window.__sb27.state), null, { timeout: 60000 });
await p.evaluate(() => window.__sb27.skipIntro());
await p.waitForFunction(() => window.__sb27.state === 'game', null, { timeout: 30000 });
await p.waitForTimeout(800);
await p.screenshot({ path: `${SHOTS}/kits-match.png` });
const m = await p.evaluate(() => {
  const m = window.__sb27.match, out = m.home.players.find(x => !x.isGK);
  const u = [];
  out.group?.traverse?.(o => { const sh = o.material?.userData?.shader || o.material?.uniforms && o.material; if (o.material?.userData?.shader) u.push(o.material.userData.shader.uniforms.uPattern.value); });
  return { home: m.home.cfg.kit, away: m.away.cfg.kit, gk: m.home.players.find(x => x.isGK) && window.__sb27.match.home.cfg.gkKit.shirt, pattern: u };
});
const res = [];
check(res, 'kit saved to the profile', stored.kits.home.shirt === '#ff7a00' && stored.kits.home.pattern === 'hoops' && stored.kitChoice === 'home', stored.kits.home);
check(res, 'preview shows the new colours', preview.includes('#ff7a00') && preview.includes('#000000'));
check(res, 'ZorpFC wear the saved kit in the match', m.home.shirt === '#ff7a00' && m.home.pattern === 'hoops', m.home);
check(res, 'opponent shirt does not clash with ours', colourDist(m.home.shirt, m.away.shirt) >= 150, { ours: m.home.shirt, theirs: m.away.shirt });
check(res, 'no page errors', errors.length === 0, errors);
await b.close();
const bad = res.filter(r => !r.ok).length;
console.log(`${res.length - bad}/${res.length} passed`);
process.exit(bad ? 1 : 0);
