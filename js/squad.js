// Squad, economy and progression for ZorpFC: player database, the player's profile (coins, owned
// players, starting XI, training levels), the transfer shop and match rewards. Saved in localStorage.
import { FORMATIONS, posPenalty } from './config.js';

// a: attributes 0..99 — pac, sho, pas, dri, def, phy, gk.  look: skin/hair indices + hair style.
const P = (id, name, pos, num, look, a, extra = {}) => ({ id, name, pos, num, skin: look[0], hair: look[1], style: look[2], a, ...extra });
const A = (pac, sho, pas, dri, def, phy, gk = 30) => ({ pac, sho, pas, dri, def, phy, gk });

export const DB = {
  // ---- ZorpFC squad
  zorlov: P('zorlov', 'Zorlov', 'GK', 1, [1, 0, 0], A(55, 30, 62, 40, 50, 70, 80)),
  okafor: P('okafor', 'Okafor', 'LB', 3, [4, 5, 1], A(84, 45, 68, 66, 76, 72)),
  brennan: P('brennan', 'Brennan', 'CB', 4, [0, 3, 0], A(66, 40, 62, 50, 86, 84)),
  halvorsen: P('halvorsen', 'Halvorsen', 'CB', 5, [0, 4, 4], A(70, 42, 66, 52, 84, 82)),
  tanaka: P('tanaka', 'Tanaka', 'RB', 2, [1, 0, 2], A(86, 48, 70, 70, 74, 68)),
  duarte: P('duarte', 'Duarte', 'CM', 8, [2, 1, 0], A(74, 70, 86, 80, 62, 70)),
  mbeki: P('mbeki', 'Mbeki', 'DM', 6, [5, 5, 3], A(70, 60, 82, 72, 80, 82)),
  vexley: P('vexley', 'Vexley', 'CM', 10, [0, 2, 2], A(80, 82, 91, 90, 45, 66)),
  kairo: P('kairo', 'Kairo', 'LW', 11, [3, 0, 1], A(93, 78, 76, 90, 35, 64)),
  zorp: P('zorp', 'Z. Zorp', 'ST', 9, [2, 0, 2], A(88, 93, 75, 87, 38, 80)),
  lindqvist: P('lindqvist', 'Lindqvist', 'RW', 17, [0, 4, 4], A(91, 81, 79, 88, 36, 66)),
  // ---- superstars
  ronaldo: P('ronaldo', 'Ronaldo', 'ST', 7, [2, 0, 2], A(97, 99, 95, 98, 45, 99), { base: 99, star: true }),
  silver: P('silver', 'Germain Silver', 'LW', 27, [5, 5, 1], A(99, 96, 94, 99, 48, 92), { base: 99, star: true }),
  // ---- transfer market
  vandrecht: P('vandrecht', 'Van Drecht', 'GK', 13, [0, 3, 0], A(58, 30, 70, 45, 50, 80, 87), { price: 11000 }),
  petrov: P('petrov', 'Petrov', 'ST', 19, [0, 2, 0], A(74, 70, 58, 64, 30, 72), { price: 900 }),
  kowal: P('kowal', 'Kowal', 'RW', 23, [0, 3, 2], A(84, 66, 68, 74, 32, 60), { price: 1800 }),
  nakamura: P('nakamura', 'Nakamura-Ruiz', 'CM', 14, [1, 0, 0], A(70, 66, 80, 78, 60, 64), { price: 3200 }),
  kessler: P('kessler', 'Kessler', 'CB', 15, [0, 4, 1], A(68, 38, 64, 54, 81, 84), { price: 4200 }),
  ijeoma: P('ijeoma', 'Ijeoma', 'RB', 22, [4, 5, 3], A(88, 50, 74, 76, 79, 76), { price: 5200 }),
  rocha: P('rocha', 'Rocha', 'LB', 16, [2, 0, 4], A(87, 52, 78, 80, 80, 70), { price: 6800 }),
  diallo: P('diallo', 'Diallo-Price', 'ST', 20, [5, 5, 3], A(90, 85, 70, 82, 35, 84), { price: 7800 }),
  sorensen: P('sorensen', 'Sørensen', 'DM', 18, [0, 4, 0], A(72, 66, 86, 76, 87, 86), { price: 11500 }),
  benedetti: P('benedetti', 'Benedetti', 'LW', 21, [1, 1, 2], A(93, 84, 82, 91, 38, 66), { price: 15500 }),
  lavelle: P('lavelle', 'Lavelle', 'CM', 24, [0, 3, 0], A(78, 84, 92, 89, 66, 74), { price: 17000 }),
  abernathy: P('abernathy', 'Abernathy', 'CB', 26, [4, 5, 1], A(80, 45, 72, 62, 90, 91), { price: 14000 }),
  osei: P('osei', 'Osei', 'CM', 25, [5, 5, 3], A(84, 86, 93, 92, 60, 78), { price: 23000 }),
  ferreira: P('ferreira', 'Ferreira-Lunn', 'RW', 30, [2, 2, 2], A(96, 88, 86, 94, 40, 70), { price: 26000 }),
  hallstrom: P('hallstrom', 'Hallström', 'ST', 29, [0, 4, 4], A(89, 95, 80, 88, 42, 90), { price: 32000 }),
  maestro: P('maestro', 'El Maestro', 'CM', 88, [2, 0, 0], A(80, 90, 98, 96, 70, 76), { price: 60000, icon: true }),
  okoro: P('okoro', 'Titan Okoro', 'CB', 44, [5, 5, 1], A(86, 55, 80, 70, 97, 98), { price: 52000, icon: true }),
};

export const SHOP = ['petrov', 'kowal', 'nakamura', 'kessler', 'ijeoma', 'rocha', 'diallo', 'vandrecht', 'sorensen', 'abernathy',
  'benedetti', 'lavelle', 'osei', 'ferreira', 'hallstrom', 'okoro', 'maestro'];

const START = ['zorlov', 'okafor', 'brennan', 'halvorsen', 'tanaka', 'duarte', 'mbeki', 'vexley', 'silver', 'ronaldo', 'lindqvist'];
const START_OWNED = [...START, 'kairo', 'zorp'];

const WEIGHTS = {
  GK: { gk: 1 },
  CB: { def: 0.55, phy: 0.2, pas: 0.15, pac: 0.1 },
  LB: { def: 0.4, pac: 0.3, pas: 0.2, dri: 0.1 }, RB: { def: 0.4, pac: 0.3, pas: 0.2, dri: 0.1 },
  DM: { def: 0.4, pas: 0.35, phy: 0.15, dri: 0.1 },
  CM: { pas: 0.4, dri: 0.25, def: 0.1, sho: 0.15, pac: 0.1 },
  LW: { pac: 0.3, dri: 0.35, sho: 0.2, pas: 0.15 }, RW: { pac: 0.3, dri: 0.35, sho: 0.2, pas: 0.15 },
  ST: { sho: 0.45, pac: 0.2, dri: 0.2, phy: 0.1, pas: 0.05 },
};

// ---------------------------------------------------------------- profile
const KEY = 'sb27.profile';
let prof = null;

function fresh() {
  return { v: 1, coins: 3000, owned: START_OWNED.slice(), lineup: START.slice(), formation: '4-3-3', upgrades: {}, record: { w: 0, d: 0, l: 0 }, lastDaily: '' };
}
export function profile() {
  if (prof) return prof;
  try { prof = JSON.parse(localStorage.getItem(KEY)); } catch (_) { prof = null; }
  if (!prof || prof.v !== 1) prof = fresh();
  // keep the superstars in the club even on old saves
  for (const id of START_OWNED) if (!prof.owned.includes(id)) prof.owned.push(id);
  prof.lineup = prof.lineup.filter(id => DB[id]);
  if (prof.lineup.length !== 11) prof.lineup = START.slice();
  return prof;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(prof)); } catch (_) { /* private mode */ } }

// upgrades[id] = { pac: n, sho: n, ... } — each attribute trains separately, up to +MAX_LEVEL
export const MAX_LEVEL = 10;
export const UPGRADABLE = { field: ['pac', 'sho', 'pas', 'dri', 'def', 'phy'], gk: ['gk', 'pas', 'pac', 'phy'] };
export const ATTR_NAME = { pac: 'Pace', sho: 'Shooting', pas: 'Passing', dri: 'Dribbling', def: 'Defending', phy: 'Physical', gk: 'Goalkeeping' };
function ups(id) {
  const pr = profile();
  let u = pr.upgrades[id];
  if (typeof u === 'number') { const n = u; u = {}; for (const k of ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'gk']) u[k] = n; pr.upgrades[id] = u; }
  return u || {};
}
export const attrLevel = (id, k) => ups(id)[k] || 0;
export const level = id => Object.values(ups(id)).reduce((a, b) => a + b, 0);
export function attrs(id) {
  const p = DB[id], u = ups(id);
  const out = {};
  for (const k in p.a) out[k] = Math.min(99, p.a[k] + (u[k] || 0));
  return out;
}
export function ovr(id) {
  const p = DB[id], a = attrs(id);
  if (p.base) return p.base;
  let v = 0;
  for (const [k, w] of Object.entries(WEIGHTS[p.pos])) v += a[k] * w;
  return Math.min(99, Math.round(v + 2));
}
export function tier(id) {
  const p = DB[id], o = ovr(id);
  if (p.star) return 'star';
  if (p.icon) return 'icon';
  return o >= 88 ? 'rare' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';
}
export const formationName = () => (FORMATIONS[profile().formation] ? profile().formation : '4-3-3');
export const formation = () => FORMATIONS[formationName()];
export const slotPos = i => formation()[i].role;
// rating in a given slot (out of position costs points)
export const slotOvr = (id, i) => Math.max(1, ovr(id) - posPenalty(DB[id].pos, slotPos(i)));
export const teamOvr = () => Math.round(profile().lineup.reduce((s, id, i) => s + slotOvr(id, i), 0) / 11);

// best-fit: put the current XI into the slots of a formation (natural positions first)
function arrange(ids, f, pool = ids) {
  const pairs = [];
  const cur = new Set(ids);
  // natural position first, then current starters, then rating
  pool.forEach(id => f.forEach((sl, i) => pairs.push({ id, i, pen: posPenalty(DB[id].pos, sl.role), o: ovr(id) + (cur.has(id) ? 4 : 0) })));
  pairs.sort((x, y) => x.pen - y.pen || y.o - x.o);
  const out = new Array(f.length).fill(null), used = new Set();
  for (const pr of pairs) if (!out[pr.i] && !used.has(pr.id)) { out[pr.i] = pr.id; used.add(pr.id); }
  return out;
}
export function setFormation(name) {
  if (!FORMATIONS[name]) return;
  const pr = profile();
  pr.formation = name;
  pr.lineup = arrange(pr.lineup, FORMATIONS[name], pr.owned);
  save();
}

// the starting XI in the format the match engine uses
export function lineupForMatch() {
  return profile().lineup.map((id, i) => {
    const p = DB[id], a0 = attrs(id);
    // out of position: everything a little worse
    const k = slotOvr(id, i) / ovr(id), a = {};
    for (const key in a0) a[key] = a0[key] * k;
    return { name: p.name, num: p.num, skin: p.skin, hair: p.hair, style: p.style, st: { spd: a.pac / 100, pas: a.pas / 100, sho: a.sho / 100, dri: a.dri / 100, def: a.def / 100, gk: a.gk / 100, phy: a.phy / 100 }, id };
  });
}

// ---------------------------------------------------------------- actions
export function swap(slotA, idOrSlotB) {
  const pr = profile();
  if (typeof idOrSlotB === 'number') {
    [pr.lineup[slotA], pr.lineup[idOrSlotB]] = [pr.lineup[idOrSlotB], pr.lineup[slotA]];
  } else {
    if (!pr.owned.includes(idOrSlotB) || pr.lineup.includes(idOrSlotB)) return false;
    pr.lineup[slotA] = idOrSlotB;
  }
  save();
  return true;
}

export const trainCost = (id, k) => {
  const v = attrs(id)[k];
  return Math.round((220 + Math.max(0, v - 50) * 24 + attrLevel(id, k) * 90) / 50) * 50;
};
export function canTrain(id, k) { return attrLevel(id, k) < MAX_LEVEL && attrs(id)[k] < 99; }
export function train(id, k) {
  const pr = profile();
  const cost = trainCost(id, k);
  if (!canTrain(id, k) || pr.coins < cost) return false;
  pr.coins -= cost;
  const u = ups(id);
  u[k] = (u[k] || 0) + 1;
  pr.upgrades[id] = u;
  save();
  return true;
}

export function buy(id) {
  const pr = profile(), p = DB[id];
  if (!p || !p.price || pr.owned.includes(id) || pr.coins < p.price) return false;
  pr.coins -= p.price;
  pr.owned.push(id);
  save();
  return true;
}

const today = () => new Date().toISOString().slice(0, 10);
export const dailyReady = () => profile().lastDaily !== today();
export function claimDaily() {
  if (!dailyReady()) return 0;
  const pr = profile();
  pr.lastDaily = today();
  pr.coins += 750;
  save();
  return 750;
}

// coins for a finished match
export function matchRewards(home, away, difficulty, oppOvr = 84) {
  const pr = profile();
  const mult = { beginner: 0.6, amateur: 0.8, pro: 1, elite: 1.3, legend: 1.7 }[difficulty] || 1;
  const lines = [];
  const res = home > away ? 'w' : home < away ? 'l' : 'd';
  lines.push([res === 'w' ? 'Win' : res === 'd' ? 'Draw' : 'Played', res === 'w' ? 400 : res === 'd' ? 200 : 100]);
  if (home) lines.push([`Goals (${home})`, home * 60]);
  if (!away) lines.push(['Clean sheet', 100]);
  if (res === 'w' && oppOvr >= 86) lines.push(['Big-club win', 150]);
  let total = 0;
  for (const l of lines) { l[1] = Math.round(l[1] * mult); total += l[1]; }
  pr.coins += total;
  pr.record[res]++;
  save();
  return { lines, total, mult };
}
