// Season and cup state for ZorpFC, kept in the profile (so it saves to the cloud like everything else).
import * as SQ from './squad.js';
import { CLUBS, clubSquad } from './clubs.js';
import * as L from './league.js';
import * as C from './cup.js';

export const USER = 'zorp';
export const clubById = id => CLUBS.find(c => c.id === id) || null;
export const teamName = id => id === USER ? 'ZorpFC' : (clubById(id) || { name: id }).name;
export const teamShort = id => id === USER ? 'ZFC' : (clubById(id) || { short: id }).short;
const ovrOf = id => id === USER ? SQ.teamOvr() : clubById(id).ovr;
const squadOf = id => clubSquad(clubById(id)).map(p => ({ name: p.name, pos: p.pos }));

export function trophies() { const p = SQ.profile(); return (p.trophies ||= { league: 0, cup: 0 }); }

// ---------------------------------------------------------------- season
export const season = () => SQ.profile().season || null;
export function startSeason(legs = 1) {
  SQ.profile().season = L.newSeason([{ id: USER }, ...CLUBS.map(c => ({ id: c.id }))], USER, legs);
  SQ.save();
  return season();
}
export function nextSeasonGame() {
  const s = season();
  if (!s || L.seasonOver(s)) return null;
  const f = L.userFixture(s);
  return { round: s.round + 1, rounds: s.rounds.length, home: f.h === USER, opp: f.h === USER ? f.a : f.h };
}
// our score / theirs from the match, our scorers and theirs ([{ name, team }])
export function recordSeasonGame(us, them, scorers) {
  const s = season(), f = L.userFixture(s);
  const homeIsUs = f.h === USER;
  L.finishRound(s, { hg: homeIsUs ? us : them, ag: homeIsUs ? them : us, scorers }, { ovr: ovrOf, squad: squadOf });
  let champion = null;
  if (L.seasonOver(s)) {
    champion = L.sortTable(s.table)[0].id;
    s.champion = champion;
    if (champion === USER) trophies().league++;
  }
  SQ.save();
  return { champion, pos: L.sortTable(s.table).findIndex(r => r.id === USER) + 1 };
}
export function abandonSeason() { delete SQ.profile().season; SQ.save(); }

// ---------------------------------------------------------------- cup
export const cup = () => SQ.profile().cup || null;
export function startCup() {
  SQ.profile().cup = C.newCup([USER, ...CLUBS.map(c => c.id)], USER);
  SQ.save();
  return cup();
}
export function nextCupGame() {
  const c = cup(), t = c && C.cupTie(c);
  if (!t) return null;
  return { round: C.ROUND_NAMES[c.round], home: t.h === USER, opp: t.h === USER ? t.a : t.h };
}
export function recordCupGame(us, them, pens) {
  const c = cup();
  const roundName = C.ROUND_NAMES[c.round];
  const r = C.recordCupTie(c, { us, them, pens }, { ovr: ovrOf });
  if (r.won) trophies().cup++;
  SQ.save();
  return { ...r, roundName, next: c.winner ? null : C.ROUND_NAMES[c.round], winner: c.winner };
}
export function abandonCup() { delete SQ.profile().cup; SQ.save(); }
