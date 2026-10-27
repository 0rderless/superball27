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
// edit one of your own players from the Team page
await p.click('#ed-save').catch(() => {});
await p.evaluate(() => document.getElementById('editor').classList.add('hidden'));
await p.click('[data-tab="squad"]');
await p.waitForTimeout(300);
await p.click('#pitch .slot[data-slot="9"]');
await p.click('#squad-detail [data-edit]');
const editing = await p.evaluate(() => ({ open: !document.getElementById('editor').classList.contains('hidden'), hint: document.querySelector('.ed-hint').textContent, pick: document.getElementById('ed-pick').value }));
await p.fill('#ed-num', '88');
await p.evaluate(() => { const r = document.querySelector('#ed-form [data-stat="pac"]'); r.value = 97; r.dispatchEvent(new Event('input', { bubbles: true })); });
await p.click('#ed-form [data-k="card"][data-v="toty"]');
await p.screenshot({ path: (process.env.SHOTS || '/tmp') + '/editor-own.png' });
await p.click('#ed-save');
await p.waitForTimeout(200);
const after = await p.evaluate(id => {
  const pr = JSON.parse(localStorage.getItem('sb27.profile'));
  return { edit: pr.edits[id], sub: document.querySelector('#squad-detail .sub') && document.querySelector('#squad-detail .sub').textContent };
}, editing.pick);
check(res, 'Edit on the Team page opens the editor on that player', editing.open && editing.pick && /Editing/.test(editing.hint), editing);
check(res, 'number, card and pace saved for your own player', after.edit && after.edit.num === 88 && after.edit.card === 'toty' && after.edit.a.pac === 97 && /#88/.test(after.sub), after);
await p.evaluate(() => document.getElementById('editor').classList.add('hidden'));
await p.evaluate(() => window.__sb27.startGame());
await p.waitForFunction(() => ['intro', 'game'].includes(window.__sb27.state) && window.__sb27.match, null, { timeout: 60000 });
const inMatch = await p.evaluate(() => { const q = window.__sb27.match.home.players.find(x => x.num === 88); return q && { num: q.num, spd: q.st.spd }; });
check(res, 'the edited player plays with his new number and pace', inMatch && inMatch.num === 88 && Math.abs(inMatch.spd - 0.97) < 0.011, inMatch);
check(res, 'no page errors', errors.length === 0, errors);
await b.close();
const bad = res.filter(r => !r.ok).length;
console.log(`${res.length - bad}/${res.length} passed`);
process.exit(bad ? 1 : 0);
