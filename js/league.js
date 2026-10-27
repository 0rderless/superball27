// Season mode: fixtures, simulated results for the other games, the table and the top scorers.
// Pure data so it saves straight into the profile (and so to the cloud).

// circle method; legs = 2 plays everyone home and away
export function roundRobin(ids, legs = 1) {
  const t = ids.length % 2 ? [...ids, null] : [...ids];
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const x = t[i], y = t[n - 1 - i];
      if (x && y) round.push(r % 2 && i === 0 ? { h: y, a: x } : { h: x, a: y });
    }
    rounds.push(round);
    t.splice(1, 0, t.pop());
  }
  if (legs === 2) return [...rounds, ...rounds.map(r => r.map(f => ({ h: f.a, a: f.h })))];
  return rounds;
}

function poisson(lambda, rnd) {
  let k = 0, p = Math.exp(-lambda), s = p;
  const u = rnd();
  while (u > s && k < 9) { k++; p *= lambda / k; s += p; }
  return k;
}
// goals for a game between two ratings (home side gets a small edge)
export function simScore(hOvr, aOvr, rnd = Math.random) {
  const d = (hOvr - aOvr) / 10;
  return [poisson(Math.max(0.25, 1.45 + d * 0.55 + 0.15), rnd), poisson(Math.max(0.25, 1.2 - d * 0.55), rnd)];
}

export function newTable(ids) { return Object.fromEntries(ids.map(id => [id, { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }])); }
export function applyResult(t, h, a, hg, ag) {
  const H = t[h], A = t[a];
  H.p++; A.p++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
  if (hg > ag) { H.w++; A.l++; H.pts += 3; } else if (ag > hg) { A.w++; H.l++; A.pts += 3; } else { H.d++; A.d++; H.pts++; A.pts++; }
}
export const sortTable = t => Object.values(t).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.id.localeCompare(y.id));

// teams: [{ id, ovr }], user: the user's id
export function newSeason(teams, user, legs = 1) {
  const ids = teams.map(t => t.id);
  return { v: 1, user, legs, round: 0, rounds: roundRobin(ids, legs), results: [], table: newTable(ids), scorers: {} };
}
export const seasonOver = s => s.round >= s.rounds.length;
export const userFixture = s => seasonOver(s) ? null : s.rounds[s.round].find(f => f.h === s.user || f.a === s.user);

// weighted by position: strikers score most
const W = { ST: 6, CF: 6, LW: 4, RW: 4, CAM: 3.5, LM: 2.5, RM: 2.5, CM: 2, DM: 1, LB: 0.7, RB: 0.7, CB: 0.9, GK: 0.02 };
export function pickScorers(squad, n, rnd = Math.random) {
  const tot = squad.reduce((s, p) => s + (W[p.pos] || 1), 0), out = [];
  for (let i = 0; i < n; i++) {
    let u = rnd() * tot;
    const p = squad.find(q => (u -= W[q.pos] || 1) <= 0) || squad[squad.length - 1];
    out.push(p.name);
  }
  return out;
}
function addScorer(s, name, team) { const k = `${team}|${name}`; (s.scorers[k] ||= { name, team, goals: 0 }).goals++; }

// record your game and simulate the rest of the round.
// mine: { hg, ag, scorers: [{ name, team }] }; ctx: { ovr(id), squad(id) -> [{ name, pos }], rnd }
export function finishRound(s, mine, ctx) {
  const rnd = ctx.rnd || Math.random, round = s.rounds[s.round], res = [];
  for (const f of round) {
    let hg, ag;
    if (f.h === s.user || f.a === s.user) {
      ({ hg, ag } = mine);
      for (const g of mine.scorers || []) addScorer(s, g.name, g.team);
    } else {
      [hg, ag] = simScore(ctx.ovr(f.h), ctx.ovr(f.a), rnd);
      for (const n of pickScorers(ctx.squad(f.h), hg, rnd)) addScorer(s, n, f.h);
      for (const n of pickScorers(ctx.squad(f.a), ag, rnd)) addScorer(s, n, f.a);
    }
    applyResult(s.table, f.h, f.a, hg, ag);
    res.push({ ...f, hg, ag });
  }
  s.results.push(res);
  s.round++;
  return res;
}

export const topScorers = (s, n = 5) => Object.values(s.scorers).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, n);
