// ZorpFC's kits (home / away / third / keeper) and picking the match kits so the teams never clash.
export const PATTERNS = ['plain', 'stripes', 'hoops', 'sash', 'halves'];
export const KIT_SLOTS = ['home', 'away', 'third', 'gk'];

export const DEFAULT_KITS = {
  home: { shirt: '#1557ff', shirt2: '#0a2a8f', trim: '#ffffff', shorts: '#ffffff', socks: '#1557ff', sockTop: '#ffffff', boots: '#ffd21f', number: '#ffffff', pattern: 'sash' },
  away: { shirt: '#f4f6fa', shirt2: '#d9dee8', trim: '#1557ff', shorts: '#0a2a8f', socks: '#f4f6fa', sockTop: '#1557ff', boots: '#ffd21f', number: '#0a2a8f', pattern: 'plain' },
  third: { shirt: '#111318', shirt2: '#2a2d36', trim: '#ffd21f', shorts: '#111318', socks: '#111318', sockTop: '#ffd21f', boots: '#ffd21f', number: '#ffd21f', pattern: 'hoops' },
  gk: { shirt: '#14d36a', shirt2: '#0a6a35', trim: '#0a3d22', shorts: '#0a3d22', socks: '#14d36a', sockTop: '#0a3d22', boots: '#111111', number: '#0a3d22', gloves: '#ffffff', pattern: 'plain', longSleeve: true },
};

const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
// perceptual-ish distance between two colours (0 = same, ~765 = black vs white)
export function colourDist(a, b) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b), rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}
const CLASH = 150;

// choice: 'auto' | 'home' | 'away' | 'third'. Returns { home: our kit, away: their kit }.
export function chooseKits({ kits, choice, club }) {
  let ours;
  if (choice && choice !== 'auto' && kits[choice]) ours = kits[choice];
  else {
    ours = kits.home;
    if (colourDist(ours.shirt, club.home.shirt) < CLASH) {
      ours = ['away', 'third', 'home'].map(k => kits[k]).sort((a, b) => colourDist(b.shirt, club.home.shirt) - colourDist(a.shirt, club.home.shirt))[0];
    }
  }
  const theirs = colourDist(ours.shirt, club.home.shirt) < CLASH ? club.away : club.home;
  return { home: ours, away: theirs };
}
