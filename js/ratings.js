// Match ratings (out of 10) from what each player did, and the player of the match.
const DEF = new Set(['CB', 'LB', 'RB', 'DM']);

// ms: the player's match stats. ctx: { role, won, lost }
export function rating(ms, { role, won = false, lost = false } = {}) {
  let r = 6.0 + ms.goals * 1.1 + ms.assists * 0.7 + ms.onTarget * 0.12 + Math.min(ms.passes, 40) * 0.025 + ms.tackles * 0.18
    - ms.yellow * 0.3 - ms.red * 1.8 + (won ? 0.3 : 0) - (lost ? 0.2 : 0);
  if (role === 'GK') r += ms.saves * 0.35 - ms.conceded * 0.35 + (ms.conceded === 0 ? 0.5 : 0);
  else if (DEF.has(role)) r -= ms.conceded * 0.15 - (ms.conceded === 0 ? 0.3 : 0);
  return Math.round(Math.max(3, Math.min(10, r)) * 10) / 10;
}

// players: [{ name, role, team: 'home'|'away', ms }]
export function playerOfMatch(players, { winner = null } = {}) {
  let best = null, bs = -1;
  for (const p of players) {
    const r = rating(p.ms, { role: p.role, won: winner === p.team, lost: !!winner && winner !== p.team });
    const sc = r + (winner === p.team ? 0.01 : 0);
    if (sc > bs) { bs = sc; best = { ...p, rating: r }; }
  }
  return best;
}

const n = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
export function summary(ms, role) {
  const parts = [];
  if (ms.goals) parts.push(n(ms.goals, 'goal'));
  if (ms.assists) parts.push(n(ms.assists, 'assist'));
  if (role === 'GK' && ms.saves) parts.push(n(ms.saves, 'save'));
  if (ms.tackles) parts.push(n(ms.tackles, 'tackle'));
  if (ms.passes && parts.length < 2) parts.push(n(ms.passes, 'pass').replace('passs', 'passes'));
  return parts.slice(0, 2).join(' · ') || 'Solid game';
}
