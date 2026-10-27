// Player stats feed ratings and the player of the match on the full-time screen; celebrations play.
import { openMatch, isolateSnippet, check, finish } from './harness.mjs';

const { page, browser } = await openMatch();
const res = [];
const SHOTS = process.env.SHOTS || '/tmp';
let r = await page.evaluate(`(() => { ${isolateSnippet}
  m.hooks.fade = cb => cb();
  m.phase = 'play'; m.restart = null; m.offside = null; m.settings.celebration = 'siu'; m.settings.offside = false;
  const s = m.home.dir;
  m.away.players.forEach((q, i) => q.pos.set(-s * 30, 0, i * 4 - 20));
  m.away.gk.pos.set(s * 52, 0, 25); // keeper caught out
  const cm = m.home.players[7], st = m.home.striker;
  m.home.players.forEach((q, i) => { if (q !== cm && q !== st) q.pos.set(-s * 20, 0, i * 3 - 15); });
  cm.pos.set(s * 33, 0, 0); st.pos.set(s * 44, 0, 1);
  m.ball.pos.set(s * 33.5, 0.11, 0); m.gainBall(cm, false, true);
  // the pass arrives (the flight itself is covered elsewhere): it counts as a completed pass
  st.pos.set(s * 47, 0, 0.5);
  m.lastKick = { kind: 'pass', team: m.home, id: ++m.kickId, by: cm };
  m.ball.owner = null; m.ball.pos.set(s * 47.4, 0.11, 0.5); m.gainBall(st, false, true);
  const got = m.ball.owner === st; const diag = { owner: m.ball.owner && m.ball.owner.name, lk: m.lastKick.kind, by: m.lastKick.by && m.lastKick.by.name, phase: m.phase, restart: m.restart && m.restart.type, bx: +m.ball.pos.x.toFixed(1), bz: +m.ball.pos.z.toFixed(1), cm: cm.name, st: st.name };
  m.shoot(st, 0.6, null);
  const h0 = m.home.score;
  for (let i = 0; i < 200 && m.home.score === h0; i++) step(1);
  const celeb = m.celeb && m.celeb.kind;
  for (let i = 0; i < 60 * 4; i++) step(1);
  return { diag, got, scored: m.home.score > h0, st: st.ms, cm: cm.ms, celeb, kind: st.a.celebKind };
})()`);
check(res, 'goal and assist credited', r.got && r.scored && r.st.goals === 1 && r.cm.assists === 1 && r.cm.passes >= 1, r);
check(res, 'scorer does the chosen celebration (Siu)', r.celeb === 'siu' && r.kind === 'siu', r);

await page.evaluate(() => { const m = window.__sb27.match; m.phase = 'fulltime'; m.hooks.fullTime(); });
await page.waitForTimeout(3600);
r = await page.evaluate(() => ({
  potm: document.querySelector('#ft-potm b') && document.querySelector('#ft-potm b').textContent,
  rt: document.querySelector('#ft-potm .potm-rt') && document.querySelector('#ft-potm .potm-rt').textContent,
  line: document.querySelector('#ft-potm span') && document.querySelector('#ft-potm span').textContent,
  ratings: document.querySelectorAll('#ft-ratings .rt').length,
  striker: window.__sb27.match.home.striker.name,
}));
await page.screenshot({ path: `${SHOTS}/potm.png` });
check(res, 'the scorer is player of the match', r.potm === r.striker && +r.rt > 7 && /1 goal/.test(r.line), r);
check(res, 'your XI rated on the full-time screen', r.ratings === 11, r.ratings);
await finish(browser, page, res);
