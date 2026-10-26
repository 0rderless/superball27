// Visual check: a close side-on strip of a jogging dribbler (does the touching foot meet the ball?)
// and an off-ball runner (do his legs animate from the shared gait clock?).
// Writes tests/e2e/out/strip.png — look at it; this script only fails on page errors.
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const { page, browser } = await openMatch();
await page.addStyleTag({ content: '.screen, #hud, .hud, #controls, .overlay, .modal { display: none !important; }' });

await page.evaluate(src => {
  eval(src + `
    window.__c = m.home.players.find(q => q.role === 'ST');
    window.__r = m.home.players.find(q => q.role === 'CM');
    giveBall(__c); stick(0.65, 0); step(150);
    // the stick is camera-relative: pin its reference so moving the debug camera doesn't steer him
    const camFwd = (m.camFwd || { clone: () => null }).clone();
    window.__r.busy = 0; window.__r.pos.set(__c.pos.x - 6, 0, __c.pos.z + 4);
    window.__shot = (who, frames) => {
      for (let i = 0; i < frames; i++) { if (camFwd) m.camFwd = camFwd; m.home.controlled = window.__c; stick(0.65, 0); const w = window.__r; w.desired.set(5, 0, 0); step(); m.animate(1 / 60); }
      const p = who.pos, v = who.vel, s = Math.hypot(v.x, v.z) || 1;
      // side-on: 3.4m to his left, looking just ahead of him
      S.debugCam = { pos: [p.x - v.z / s * 3.4, 1.0, p.z + v.x / s * 3.4], look: [p.x + v.x / s * 0.4, 0.45, p.z + v.z / s * 0.4] };
      return { touch: who.a.touchT >= 0 && who.a.touchT < 0.25, foot: who.a.touchFoot, strike: who.a.strike, sp: +Math.hypot(v.x, v.z).toFixed(1), x: +p.x.toFixed(1), owner: m.ball.owner === who, phase: m.phase, bd: +Math.hypot(m.ball.pos.x - p.x, m.ball.pos.z - p.z).toFixed(2) };
    };
  `);
}, isolateSnippet);

const files = [], notes = [];
for (const [label, who] of [['dribble', '__c'], ['runner', '__r']]) {
  for (let k = 0; k < 12; k++) {
    const info = await page.evaluate(w => window.__shot(window[w], 5), who);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const f = `${OUT}${label}-${String(k).padStart(2, '0')}.png`;
    await page.locator('canvas').first().screenshot({ path: f });
    files.push(f); notes.push(`${label} ${k}: ${info.touch ? 'TOUCH ' + info.foot : ''} ${JSON.stringify(info)}`);
  }
}
await page.evaluate(() => { window.__sb27.debugCam = null; });
// 12 frames per row: dribbler on top, runner below
execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs = sys.argv[1:]
ims = [Image.open(f).convert('RGB') for f in fs]
w, h = ims[0].size
s = 0.5
tw, th = int(w * s), int(h * s)
sheet = Image.new('RGB', (tw * 12, th * 2))
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th)), ((i % 12) * tw, (i // 12) * th))
sheet.save('${OUT}strip.png')
`, ...files]);
console.log(notes.filter(n => n.startsWith('dribble')).map(n => n.replace(/\"(owner|phase)\":[^,]*,/g, '')).join('\n'));
const res = [];
check(res, 'strip written', true, `${OUT}strip.png`);
await finish(browser, page, res);
