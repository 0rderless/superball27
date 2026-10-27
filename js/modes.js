// Season and cup state for ZorpFC, kept in the profile (so it saves to the cloud like everything else).
import * as SQ from './squad.js';
import { CLUBS, clubSquad } from './clubs.js';
import * as L from './league.js';

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
