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

// 4-3-3. a = 0 own goal line .. 1 opponent goal line, c = -1 left .. +1 right (facing attack).
export const FORMATION = [
  { role: 'GK', a: 0.02, c: 0 },
  { role: 'LB', a: 0.24, c: -0.70 },
  { role: 'CB', a: 0.19, c: -0.25 },
  { role: 'CB', a: 0.19, c: 0.25 },
  { role: 'RB', a: 0.24, c: 0.70 },
  { role: 'CM', a: 0.42, c: -0.38 },
  { role: 'DM', a: 0.34, c: 0 },
  { role: 'CM', a: 0.42, c: 0.38 },
  { role: 'LW', a: 0.64, c: -0.72 },
  { role: 'ST', a: 0.68, c: 0 },
  { role: 'RW', a: 0.64, c: 0.72 },
];

// Kick-off shape (all inside own half).
export const KICKOFF = [
  { a: 0.02, c: 0 },
  { a: 0.20, c: -0.70 }, { a: 0.16, c: -0.25 }, { a: 0.16, c: 0.25 }, { a: 0.20, c: 0.70 },
  { a: 0.34, c: -0.38 }, { a: 0.28, c: 0 }, { a: 0.34, c: 0.38 },
  { a: 0.45, c: -0.70 }, { a: 0.47, c: 0 }, { a: 0.45, c: 0.70 },
];

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
