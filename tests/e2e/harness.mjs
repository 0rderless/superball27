// Shared Playwright setup for the in-game tests. Needs the site served at
// http://localhost:8127 (python3 -m http.server 8127).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

export async function openMatch({ difficulty = 'pro' } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 320 } });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.addInitScript(d => {
    localStorage.setItem('sb27.difficulty', JSON.stringify(d));
    localStorage.setItem('sb27.graphics', '"low"');
  }, difficulty);
  await page.goto('http://localhost:8127/index.html');
  await page.waitForFunction(() => window.__sb27 && window.__sb27.state === 'title', null, { timeout: 90000 });
  await page.evaluate(() => window.__sb27.skipBoot());
  await page.waitForFunction(() => window.__sb27.state === 'menu', null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__sb27.startGame());
  await page.waitForFunction(() => ['intro', 'game'].includes(window.__sb27.state), null, { timeout: 60000 });
  await page.evaluate(() => window.__sb27.skipIntro());
  await page.waitForFunction(() => window.__sb27.state === 'game', null, { timeout: 30000 });
  await page.keyboard.press('KeyP'); // pause the render loop; tests step the match by hand
  await page.evaluate(() => { window.__sb27.match.hooks.fade = cb => cb(); });
  return { page, browser };
}

// JS source evaluated inside the page: helpers for driving one player in isolation.
export const isolateSnippet = `
  const S = window.__sb27, I = S.input, m = S.match;
  const iso = c => { m.phase = 'play'; m.restart = null; m.guarantee = null;
    for (const q of m.players) if (q !== c) { q.pos.set(-45, 0, q.idx * 3 - 15); q.vel.set(0, 0, 0); } };
  const stick = (x, y, spr = false) => { I.move.x = x; I.move.y = y; I.mag = Math.min(1, Math.hypot(x, y)); I.b.sprint.down = spr; };
  const giveBall = c => { iso(c); c.pos.set(0, 0, 0); c.vel.set(0, 0, 0); c.facing = Math.PI / 2; c.fwd.set(1, 0, 0);
    m.ball.pos.set(0.45, 0.11, 0); m.ball.vel.set(0, 0, 0); m.home.controlled = c; m.gainBall(c, false, true); };
  const step = (n = 1) => { for (let i = 0; i < n; i++) m.update(1 / 60, I); };
`;

export function check(results, name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
}

export async function finish(browser, page, results) {
  if (page.errors.length) check(results, 'no page errors', false, page.errors.slice(0, 3));
  await browser.close();
  const bad = results.filter(r => !r.ok).length;
  console.log(`${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
}
