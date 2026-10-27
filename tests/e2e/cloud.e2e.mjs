// Cloud save against a stand-in Firebase REST server: the phone's existing squad uploads on first
// launch, a brand-new phone downloads it, and later changes are uploaded.
import http from 'node:http';
import { createRequire } from 'node:module';
import { check } from './harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

let db = null, puts = 0;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(db)); }
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => { db = JSON.parse(body); puts++; res.end(body); });
}).listen(8129);
const URL_ = 'http://localhost:8129/superball27/main.json';

const b = await chromium.launch();
const open = async seed => {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.addInitScript(([u, s]) => { window.SB27_CLOUD_URL = u; if (s && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } }, [URL_, seed]);
  await p.goto('http://localhost:8127/index.html');
  await p.waitForFunction(() => window.__sb27 && window.__sb27.state === 'title', null, { timeout: 90000 });
  await p.waitForTimeout(3500);
  return { ctx, p };
};
const res = [];
// phone A already has a big squad and a made-up player
const profile = JSON.stringify({ v: 1, coins: 3000, owned: ['zorlov', 'okafor', 'brennan', 'halvorsen', 'tanaka', 'duarte', 'mbeki', 'vexley', 'silver', 'ronaldo', 'lindqvist', 'kairo', 'zorp', 'maldini', 'hazard', 'cgee'], lineup: ['zorlov', 'okafor', 'brennan', 'halvorsen', 'tanaka', 'duarte', 'mbeki', 'vexley', 'silver', 'ronaldo', 'lindqvist'], formation: '3-5-2', upgrades: {}, record: { w: 4, d: 1, l: 0 }, lastDaily: '', custom: { cgee: { id: 'cgee', name: 'Gee Silver', pos: 'ST', num: 7, skin: 5, hair: 0, style: 1, a: { pac: 99, sho: 99, pas: 90, dri: 99, def: 40, phy: 90, gk: 20 }, base: 98, card: 'toty', star: false } }, edits: {} });
const A = await open({ 'sb27.profile': profile, 'sb27.difficulty': '"legend"' });
check(res, 'first launch uploads the existing squad', db && db.data && db.data.sb27_profile === profile, { puts, keys: db && Object.keys(db.data || {}) });

// a brand-new phone gets everything
const B = await open(null);
const got = await B.p.evaluate(() => [localStorage.getItem('sb27.profile'), localStorage.getItem('sb27.difficulty')]);
check(res, 'a new phone downloads the squad and settings', got[0] === profile && got[1] === '"legend"', { difficulty: got[1] });
const shown = await B.p.evaluate(async () => { const S = await import('./js/squad.js'); return [S.profile().formation, S.DB.cgee && S.DB.cgee.name]; });
check(res, 'the game on the new phone is using it (formation + made-up player)', shown[0] === '3-5-2' && shown[1] === 'Gee Silver', shown);

// a change on phone B is uploaded
await B.p.evaluate(() => localStorage.setItem('sb27.difficulty', '"pro"'));
await B.p.waitForTimeout(3500);
check(res, 'changes upload a few seconds later', db.data.sb27_difficulty === '"pro"', db.data.sb27_difficulty);
check(res, 'no page errors', !A.p.errors.length && !B.p.errors.length, [...A.p.errors, ...B.p.errors]);
await b.close(); server.close();
const bad = res.filter(r => !r.ok).length;
console.log(`${res.length - bad}/${res.length} passed`);
process.exit(bad ? 1 : 0);
