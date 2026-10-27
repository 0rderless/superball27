// Cup mode: an 8-club knockout (quarter-finals, semi-finals, final). Your ties are played; the rest
// are simulated, with penalties when they finish level. Plus the penalty shootout rules.
import { simScore } from './league.js';

export const ROUND_NAMES = ['Quarter-final', 'Semi-final', 'Final'];

function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function newCup(ids, user, rnd = Math.random) {
  const others = shuffle(ids.filter(id => id !== user), rnd).slice(0, 7);
  const draw = shuffle([user, ...others], rnd);
  const qf = [];
  for (let i = 0; i < 8; i += 2) qf.push({ h: draw[i], a: draw[i + 1] });
  return { v: 1, user, round: 0, rounds: [qf], winner: null, out: false };
}

export const cupTie = c => (c.winner || c.out) ? null : c.rounds[c.round].find(t => t.h === c.user || t.a === c.user) || null;

// AI tie: a score, and a coin-flip-ish shootout (better side slightly favoured) when level
function simTie(t, ovr, rnd) {
  const [hg, ag] = simScore(ovr(t.h), ovr(t.a), rnd);
  t.hg = hg; t.ag = ag;
  if (hg === ag) {
    const pH = 0.5 + (ovr(t.h) - ovr(t.a)) * 0.01;
    const hp = 3 + Math.floor(rnd() * 3); const ap = rnd() < pH ? hp - 1 : hp + 1;
    t.pens = [hp, Math.max(0, ap)];
  }
  t.winner = hg > ag ? t.h : ag > hg ? t.a : (t.pens[0] > t.pens[1] ? t.h : t.a);
}

function nextRound(c) {
  const w = c.rounds[c.round].map(t => t.winner);
  if (w.length === 1) { c.winner = w[0]; return; }
  const r = [];
  for (let i = 0; i < w.length; i += 2) r.push({ h: w[i], a: w[i + 1] });
  c.rounds.push(r);
  c.round++;
}

// mine: { us, them, pens?: { us, them } }; ctx: { ovr(id), rnd }
export function recordCupTie(c, mine, ctx) {
  const rnd = ctx.rnd || Math.random;
  const t = cupTie(c), home = t.h === c.user;
  t.hg = home ? mine.us : mine.them; t.ag = home ? mine.them : mine.us;
  if (mine.pens) t.pens = home ? [mine.pens.us, mine.pens.them] : [mine.pens.them, mine.pens.us];
  const usWin = mine.us > mine.them || (mine.us === mine.them && mine.pens && mine.pens.us > mine.pens.them);
  t.winner = usWin ? c.user : (home ? t.a : t.h);
  for (const o of c.rounds[c.round]) if (o !== t) simTie(o, ctx.ovr, rnd);
  if (!usWin) {
    c.out = true;
    // play the rest of the cup out
    nextRound(c);
    while (!c.winner) { for (const o of c.rounds[c.round]) simTie(o, ctx.ovr, rnd); nextRound(c); }
    return { won: false, out: true, round: ROUND_NAMES[c.rounds.indexOf(c.rounds.find(r => r.includes(t)))] };
  }
  nextRound(c);
  return { won: c.winner === c.user, out: false };
}

// kicks so far for each side (true = scored), home kicking first. 'home' | 'away' | null
export function shootoutWinner(h, a) {
  const sh = h.filter(Boolean).length, sa = a.filter(Boolean).length;
  if (h.length <= 5 && a.length <= 5) {
    if (sh > sa + (5 - a.length)) return 'home';
    if (sa > sh + (5 - h.length)) return 'away';
    if (h.length === 5 && a.length === 5 && sh !== sa) return sh > sa ? 'home' : 'away';
    return null;
  }
  // sudden death: after each full pair
  if (h.length === a.length && sh !== sa) return sh > sa ? 'home' : 'away';
  return null;
}
