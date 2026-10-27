// The player editor's text boxes take every key: game shortcuts (O, N, M, B, J, K, Space, Shift…)
// must not swallow letters while you're typing a name.
import { createRequire } from 'node:module';
import { check } from './harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 844, height: 390 } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => localStorage.setItem('sb27.graphics', '"low"'));
await p.goto('http://localhost:8127/index.html');
await p.waitForFunction(() => window.__sb27 && window.__sb27.state === 'title', null, { timeout: 90000 });
await p.evaluate(() => window.__sb27.skipBoot());
await p.waitForTimeout(600);
await p.click('[data-tab="shop"]');
await p.click('#editor-btn');
const name = 'Bobo Jinks Ouzo';
await p.fill('#ed-name', '');
await p.click('#ed-name');
await p.keyboard.type(name, { delay: 15 }); // real key events, one at a time
const typed = await p.inputValue('#ed-name');
await p.click('#shop-search', { force: true }).catch(() => {});
await p.click('#ed-save');
const saved = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('sb27.profile')).custom || {}).map(x => x.name));
const res = [];
check(res, 'every letter of the name is typed', typed === name, { typed });
check(res, 'the player is saved with that name', saved.includes(name), saved);
check(res, 'no page errors', errors.length === 0, errors);
await b.close();
const bad = res.filter(r => !r.ok).length;
console.log(`${res.length - bad}/${res.length} passed`);
process.exit(bad ? 1 : 0);
