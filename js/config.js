// Pitch dimensions (metres). x runs along the length, z across the width, y is up.
export const F = {
  HL: 52.5,      // half length
  HW: 34,        // half width
  GW: 3.66,      // half goal width
  GH: 2.44,      // goal height
  GD: 2.0,       // net depth
  BOX_L: 16.5,
  BOX_W: 20.16,  // half width of penalty box
  SIX_L: 5.5,
  SIX_W: 9.16,
  CIRCLE: 9.15,
  PEN: 11,
};

export const BALL_R = 0.11;
export const GRAVITY = 9.81;

export const DIFFICULTY = {
  beginner: { label: 'Beginner', react: 0.55, tackle: 0.35, passErr: 0.14, speed: 0.85, gk: 0.45, think: 0.8, press: 0.6, shootErr: 1.6, reward: 0.6 },
  amateur:  { label: 'Amateur',  react: 0.40, tackle: 0.55, passErr: 0.10, speed: 0.90, gk: 0.55, think: 0.60, press: 0.75, shootErr: 1.35, reward: 0.8 },
  pro:      { label: 'Pro',      react: 0.27, tackle: 0.85, passErr: 0.06, speed: 0.97, gk: 0.70, think: 0.40, press: 0.92, shootErr: 1.0, reward: 1 },
  elite:    { label: 'Elite',    react: 0.18, tackle: 1.12, passErr: 0.035, speed: 1.03, gk: 0.82, think: 0.26, press: 1.05, shootErr: 0.78, reward: 1.3 },
  legend:   { label: 'Legend',   react: 0.11, tackle: 1.4, passErr: 0.02, speed: 1.08, gk: 0.9, think: 0.17, press: 1.18, shootErr: 0.6, reward: 1.7 },
};
export const DIFF_KEYS = ['beginner', 'amateur', 'pro', 'elite', 'legend'];

// Formations. a = 0 own goal line .. 1 opponent goal line, c = -1 left .. +1 right (facing attack).
// Slot 0 is always the goalkeeper.
const S = (role, a, c) => ({ role, a, c });
const GK = S('GK', 0.02, 0);
const BACK4 = [S('LB', 0.24, -0.70), S('CB', 0.19, -0.25), S('CB', 0.19, 0.25), S('RB', 0.24, 0.70)];
const BACK3 = [S('CB', 0.18, -0.42), S('CB', 0.16, 0), S('CB', 0.18, 0.42)];
export const FORMATIONS = {
  '4-3-3': [GK, ...BACK4, S('CM', 0.42, -0.38), S('DM', 0.34, 0), S('CM', 0.42, 0.38), S('LW', 0.64, -0.72), S('ST', 0.68, 0), S('RW', 0.64, 0.72)],
  '4-4-2': [GK, ...BACK4, S('LM', 0.45, -0.74), S('CM', 0.40, -0.22), S('CM', 0.40, 0.22), S('RM', 0.45, 0.74), S('ST', 0.67, -0.18), S('ST', 0.67, 0.18)],
  '4-2-3-1': [GK, ...BACK4, S('DM', 0.33, -0.22), S('DM', 0.33, 0.22), S('LW', 0.56, -0.70), S('CAM', 0.53, 0), S('RW', 0.56, 0.70), S('ST', 0.69, 0)],
  '4-1-2-1-2': [GK, ...BACK4, S('DM', 0.31, 0), S('CM', 0.42, -0.34), S('CM', 0.42, 0.34), S('CAM', 0.53, 0), S('ST', 0.67, -0.17), S('ST', 0.67, 0.17)],
  '3-5-2': [GK, ...BACK3, S('LWB', 0.40, -0.82), S('CM', 0.39, -0.26), S('DM', 0.31, 0), S('CM', 0.39, 0.26), S('RWB', 0.40, 0.82), S('ST', 0.67, -0.18), S('ST', 0.67, 0.18)],
  '3-4-3': [GK, ...BACK3, S('LM', 0.43, -0.76), S('CM', 0.38, -0.22), S('CM', 0.38, 0.22), S('RM', 0.43, 0.76), S('LW', 0.64, -0.62), S('ST', 0.69, 0), S('RW', 0.64, 0.62)],
  '5-3-2': [GK, S('LWB', 0.27, -0.80), S('CB', 0.17, -0.40), S('CB', 0.15, 0), S('CB', 0.17, 0.40), S('RWB', 0.27, 0.80), S('CM', 0.40, -0.32), S('DM', 0.35, 0), S('CM', 0.40, 0.32), S('ST', 0.65, -0.18), S('ST', 0.65, 0.18)],
};
export const FORMATION = FORMATIONS['4-3-3'];

// kick-off shape for any formation: everyone back inside their own half
export const kickoffShape = f => f.map(s => ({ a: s.role === 'GK' ? 0.02 : Math.min(0.47, 0.05 + s.a * 0.66), c: s.c }));
export const KICKOFF = kickoffShape(FORMATION);

// role groups
export const ROLE_GROUP = {
  GK: 'gk', CB: 'def', LB: 'def', RB: 'def', LWB: 'def', RWB: 'def',
  DM: 'mid', CM: 'mid', CAM: 'mid', LM: 'mid', RM: 'mid', LW: 'att', RW: 'att', ST: 'att',
};
// positions a player can cover without a big drop-off
export const POS_COMPAT = {
  GK: [], CB: ['DM'], LB: ['LWB', 'LM'], RB: ['RWB', 'RM'], LWB: ['LB', 'LM'], RWB: ['RB', 'RM'],
  DM: ['CM', 'CB'], CM: ['DM', 'CAM'], CAM: ['CM', 'ST'], LM: ['LW', 'LWB', 'LB'], RM: ['RW', 'RWB', 'RB'],
  LW: ['LM', 'ST', 'RW'], RW: ['RM', 'ST', 'LW'], ST: ['CAM', 'LW', 'RW'],
};
// rating penalty for playing someone in a slot
export function posPenalty(natural, slot) {
  if (natural === slot) return 0;
  if (natural === 'GK' || slot === 'GK') return 45;
  return (POS_COMPAT[natural] || []).includes(slot) ? 3 : 10;
}

const s = (spd, pas, sho, dri, def, gk = 0.3) => ({ spd, pas, sho, dri, def, gk });

export const TEAMS = {
  home: {
    name: 'ZorpFC',
    short: 'ZFC',
    color: '#1d5cff',
    kit: { shirt: '#1557ff', shirt2: '#0a2a8f', trim: '#ffffff', shorts: '#ffffff', socks: '#1557ff', sockTop: '#ffffff', boots: '#ffd21f', number: '#ffffff', pattern: 'sash' },
    gkKit: { shirt: '#14d36a', shirt2: '#0a6a35', trim: '#0a3d22', shorts: '#0a3d22', socks: '#14d36a', sockTop: '#0a3d22', boots: '#111111', number: '#0a3d22', gloves: '#ffffff', pattern: 'plain', longSleeve: true },
    players: [
      { name: 'Zorlov',    num: 1,  skin: 1, hair: 0, style: 0, st: s(0.55, 0.62, 0.30, 0.40, 0.50, 0.80) },
      { name: 'Okafor',    num: 3,  skin: 4, hair: 5, style: 1, st: s(0.84, 0.68, 0.45, 0.66, 0.76) },
      { name: 'Brennan',   num: 4,  skin: 0, hair: 3, style: 0, st: s(0.66, 0.62, 0.40, 0.50, 0.86) },
      { name: 'Halvorsen', num: 5,  skin: 0, hair: 4, style: 4, st: s(0.70, 0.66, 0.42, 0.52, 0.84) },
      { name: 'Tanaka',    num: 2,  skin: 1, hair: 0, style: 2, st: s(0.86, 0.70, 0.48, 0.70, 0.74) },
      { name: 'Duarte',    num: 8,  skin: 2, hair: 1, style: 0, st: s(0.74, 0.86, 0.70, 0.80, 0.62) },
      { name: 'Mbeki',     num: 6,  skin: 5, hair: 5, style: 3, st: s(0.70, 0.82, 0.60, 0.72, 0.80) },
      { name: 'Vexley',    num: 10, skin: 0, hair: 2, style: 2, st: s(0.80, 0.91, 0.82, 0.90, 0.45) },
      { name: 'Kairo',     num: 11, skin: 3, hair: 0, style: 1, st: s(0.93, 0.76, 0.78, 0.90, 0.35) },
      { name: 'Z. Zorp',   num: 9,  skin: 2, hair: 0, style: 2, st: s(0.88, 0.75, 0.93, 0.87, 0.38) },
      { name: 'Lindqvist', num: 7,  skin: 0, hair: 4, style: 4, st: s(0.91, 0.79, 0.81, 0.88, 0.36) },
    ],
  },
  // opponent is chosen by matchmaking (see clubs.js) and set before each match
  away: null,
};
