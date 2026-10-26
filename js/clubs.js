// Opponent clubs for matchmaking. Club names, kit colours and squads (real players) are real; crests are
// simple generic shields, not the official badges. Ratings are approximate.
import { FORMATIONS } from './config.js';

const kit = (shirt, shirt2, trim, shorts, socks, sockTop, number, pattern = 'plain', boots = '#ffffff') =>
  ({ shirt, shirt2, trim, shorts, socks, sockTop, number, pattern, boots });

export const CLUBS = [
  { id: 'rma', formation: '4-3-3', name: 'Real Madrid', short: 'RMA', ovr: 88, color: '#e8e8e8', accent: '#d4af37', initials: 'RM', names: 'es',
    home: kit('#f4f4f4', '#dcdcdc', '#d4af37', '#f4f4f4', '#f4f4f4', '#d4af37', '#1b2a4a'), away: kit('#1b2a4a', '#0f1a33', '#d4af37', '#1b2a4a', '#1b2a4a', '#d4af37', '#d4af37') },
  { id: 'mci', formation: '4-3-3', name: 'Manchester City', short: 'MCI', ovr: 88, color: '#6cabdd', accent: '#1c2c5b', initials: 'MC', names: 'en',
    home: kit('#6cabdd', '#4f93c9', '#ffffff', '#ffffff', '#6cabdd', '#ffffff', '#ffffff'), away: kit('#1d1d1f', '#2d2d33', '#6cabdd', '#1d1d1f', '#1d1d1f', '#6cabdd', '#6cabdd') },
  { id: 'bay', formation: '4-2-3-1', name: 'Bayern Munich', short: 'BAY', ovr: 87, color: '#dc052d', accent: '#ffffff', initials: 'FCB', names: 'de',
    home: kit('#dc052d', '#a8031f', '#ffffff', '#dc052d', '#dc052d', '#ffffff', '#ffffff'), away: kit('#ffffff', '#e8e8e8', '#dc052d', '#ffffff', '#ffffff', '#dc052d', '#dc052d') },
  { id: 'liv', formation: '4-3-3', name: 'Liverpool', short: 'LIV', ovr: 86, color: '#c8102e', accent: '#f6eb61', initials: 'LFC', names: 'en',
    home: kit('#c8102e', '#9d0b22', '#f6eb61', '#c8102e', '#c8102e', '#f6eb61', '#ffffff'), away: kit('#f2efe6', '#dedad0', '#c8102e', '#f2efe6', '#f2efe6', '#c8102e', '#c8102e') },
  { id: 'psg', formation: '4-3-3', name: 'Paris Saint-Germain', short: 'PSG', ovr: 86, color: '#004170', accent: '#da291c', initials: 'PSG', names: 'fr',
    home: kit('#0b2a5b', '#da291c', '#ffffff', '#0b2a5b', '#0b2a5b', '#da291c', '#ffffff', 'sash'), away: kit('#ffffff', '#da291c', '#0b2a5b', '#ffffff', '#ffffff', '#0b2a5b', '#0b2a5b', 'sash') },
  { id: 'ars', formation: '4-3-3', name: 'Arsenal', short: 'ARS', ovr: 85, color: '#ef0107', accent: '#ffffff', initials: 'AFC', names: 'en',
    home: kit('#ef0107', '#c40006', '#ffffff', '#ffffff', '#ef0107', '#ffffff', '#ffffff'), away: kit('#f2d24b', '#d9b730', '#023474', '#023474', '#f2d24b', '#023474', '#023474') },
  { id: 'int', formation: '3-5-2', name: 'Inter Milan', short: 'INT', ovr: 84, color: '#0068a8', accent: '#000000', initials: 'IM', names: 'it',
    home: kit('#0068a8', '#111111', '#d4af37', '#111111', '#111111', '#0068a8', '#ffffff', 'stripes'), away: kit('#ffffff', '#e6e6e6', '#0068a8', '#ffffff', '#ffffff', '#0068a8', '#0068a8') },
  { id: 'che', formation: '4-2-3-1', name: 'Chelsea', short: 'CHE', ovr: 83, color: '#034694', accent: '#dba111', initials: 'CFC', names: 'en',
    home: kit('#034694', '#02356f', '#dba111', '#034694', '#ffffff', '#034694', '#ffffff'), away: kit('#f2f2f2', '#dadada', '#034694', '#f2f2f2', '#f2f2f2', '#034694', '#034694') },
  { id: 'juv', formation: '3-5-2', name: 'Juventus', short: 'JUV', ovr: 83, color: '#ffffff', accent: '#000000', initials: 'J', names: 'it',
    home: kit('#f2f2f2', '#111111', '#d4af37', '#111111', '#111111', '#f2f2f2', '#d4af37', 'stripes'), away: kit('#f5c518', '#d6a90f', '#111111', '#111111', '#f5c518', '#111111', '#111111') },
  { id: 'mil', formation: '4-2-3-1', name: 'AC Milan', short: 'MIL', ovr: 82, color: '#fb090b', accent: '#000000', initials: 'ACM', names: 'it',
    home: kit('#d8090b', '#111111', '#ffffff', '#ffffff', '#111111', '#d8090b', '#ffffff', 'stripes'), away: kit('#f4f4f4', '#dcdcdc', '#d8090b', '#f4f4f4', '#f4f4f4', '#d8090b', '#d8090b') },
  { id: 'mun', formation: '4-2-3-1', name: 'Manchester United', short: 'MUN', ovr: 81, color: '#da291c', accent: '#fbe122', initials: 'MU', names: 'en',
    home: kit('#da291c', '#b01f14', '#fbe122', '#ffffff', '#111111', '#da291c', '#ffffff'), away: kit('#f2f2f2', '#dadada', '#da291c', '#111111', '#f2f2f2', '#da291c', '#da291c') },
];

// Real squads, in each club's formation slot order: [name, shirt number, rating, skin 0-5, hair 0-5]
const SQUADS = {
  rma: [["Courtois", 1, 89, 0, 2], ["Carreras", 18, 81, 1, 1], ["Huijsen", 24, 83, 1, 0], ["Rüdiger", 22, 86, 5, 5], ["Alexander-Arnold", 12, 86, 3, 5], ["Bellingham", 5, 90, 3, 5], ["Tchouaméni", 14, 86, 5, 5], ["Valverde", 8, 89, 1, 2], ["Vinícius", 7, 90, 4, 5], ["Mbappé", 10, 91, 4, 5], ["Rodrygo", 11, 85, 3, 5]],
  mci: [["Donnarumma", 25, 89, 1, 0], ["Gvardiol", 24, 86, 0, 1], ["Rúben Dias", 3, 88, 1, 0], ["Stones", 5, 84, 0, 2], ["Rico Lewis", 82, 80, 2, 0], ["Reijnders", 4, 85, 1, 1], ["Rodri", 16, 90, 1, 1], ["Foden", 47, 87, 0, 2], ["Doku", 11, 84, 5, 5], ["Haaland", 9, 91, 0, 4], ["Bernardo Silva", 20, 86, 1, 1]],
  bay: [["Neuer", 1, 86, 0, 3], ["Davies", 19, 85, 5, 5], ["Upamecano", 2, 84, 5, 5], ["Kim", 3, 85, 1, 0], ["Laimer", 27, 83, 0, 2], ["Kimmich", 6, 88, 0, 3], ["Goretzka", 8, 84, 0, 2], ["Luis Díaz", 14, 86, 3, 5], ["Musiala", 10, 89, 3, 1], ["Olise", 17, 87, 4, 5], ["Kane", 9, 90, 0, 2]],
  liv: [["Alisson", 1, 89, 1, 1], ["Kerkez", 6, 82, 0, 1], ["Van\xa0Dijk", 4, 89, 4, 5], ["Konaté", 5, 85, 5, 5], ["Frimpong", 30, 83, 5, 5], ["Wirtz", 7, 88, 0, 2], ["Gravenberch", 38, 85, 5, 5], ["Szoboszlai", 8, 85, 0, 4], ["Gakpo", 18, 85, 3, 5], ["Isak", 9, 88, 4, 5], ["Salah", 11, 90, 3, 5]],
  psg: [["Chevalier", 30, 84, 0, 1], ["Nuno Mendes", 25, 87, 4, 5], ["Marquinhos", 5, 86, 2, 5], ["Pacho", 51, 84, 5, 5], ["Hakimi", 2, 88, 3, 5], ["Vitinha", 17, 89, 1, 1], ["João Neves", 87, 86, 1, 1], ["Fabián Ruiz", 8, 85, 1, 1], ["Kvaratskhelia", 7, 88, 0, 1], ["Dembélé", 10, 90, 4, 5], ["Doué", 14, 85, 4, 5]],
  ars: [["Raya", 1, 87, 1, 5], ["Calafiori", 33, 83, 0, 1], ["Saliba", 2, 88, 5, 5], ["Gabriel", 6, 87, 3, 5], ["Timber", 12, 84, 4, 5], ["Ødegaard", 8, 88, 0, 1], ["Zubimendi", 36, 86, 1, 1], ["Rice", 41, 88, 0, 1], ["Martinelli", 11, 83, 1, 1], ["Gyökeres", 14, 88, 0, 2], ["Saka", 7, 89, 4, 5]],
  int: [["Sommer", 1, 85, 0, 2], ["Bastoni", 95, 87, 0, 1], ["Acerbi", 15, 84, 0, 0], ["Bisseck", 31, 82, 4, 5], ["Dimarco", 32, 86, 0, 1], ["Barella", 23, 88, 0, 1], ["Çalhanoğlu", 20, 86, 0, 1], ["Mkhitaryan", 22, 84, 0, 0], ["Dumfries", 2, 85, 4, 5], ["Thuram", 9, 86, 4, 5], ["Lautaro", 10, 89, 1, 5]],
  che: [["Sánchez", 1, 82, 1, 5], ["Cucurella", 3, 84, 0, 1], ["Colwill", 6, 83, 0, 2], ["Fofana", 29, 82, 5, 5], ["Reece James", 24, 85, 4, 5], ["Caicedo", 25, 88, 4, 5], ["Enzo Fernández", 8, 86, 1, 1], ["Pedro Neto", 7, 83, 1, 5], ["Palmer", 10, 89, 0, 2], ["Estêvão", 41, 82, 3, 5], ["João\xa0Pedro", 20, 84, 3, 5]],
  juv: [["Di\xa0Gregorio", 29, 83, 0, 1], ["Gatti", 4, 82, 0, 1], ["Bremer", 3, 86, 4, 5], ["Kalulu", 15, 82, 5, 5], ["Cambiaso", 27, 83, 0, 1], ["Koopmeiners", 8, 84, 0, 4], ["Locatelli", 5, 83, 0, 1], ["McKennie", 16, 81, 0, 4], ["Conceição", 7, 83, 1, 5], ["Vlahović", 9, 84, 0, 1], ["Yıldız", 10, 85, 1, 1]],
  mil: [["Maignan", 16, 87, 5, 5], ["Estupiñán", 2, 82, 5, 5], ["Tomori", 23, 83, 4, 5], ["Gabbia", 46, 80, 0, 1], ["Saelemaekers", 56, 81, 1, 1], ["Modrić", 14, 85, 0, 3], ["Youssouf Fofana", 29, 83, 5, 5], ["Leão", 10, 86, 4, 5], ["Loftus-Cheek", 8, 81, 5, 5], ["Pulisic", 11, 85, 0, 2], ["Giménez", 7, 82, 1, 5]],
  mun: [["Onana", 24, 82, 5, 5], ["Dorgu", 13, 79, 5, 5], ["Lisandro Martínez", 6, 85, 1, 5], ["De\xa0Ligt", 4, 83, 0, 4], ["Dalot", 2, 82, 1, 1], ["Casemiro", 18, 82, 3, 5], ["Mainoo", 37, 81, 4, 5], ["Cunha", 10, 84, 3, 5], ["Bruno Fernandes", 8, 87, 1, 1], ["Mbeumo", 19, 85, 5, 5], ["Šeško", 30, 83, 0, 4]],
};

const NAMES = {
  en: ['Hargreaves', 'Whitfield', 'Okonkwo', 'Bramley', 'Ashworth', 'Kettering', 'Doyle', 'Mensah', 'Fairbanks', 'Lowe', 'Pemberton', 'Sinclair', 'Adeyemi', 'Thornton', 'Rhodes', 'Caldwell'],
  es: ['Valverde', 'Ibarra', 'Castaño', 'Morales', 'Aguado', 'Serrano', 'Quiroga', 'Lozano', 'Mendívil', 'Barrios', 'Ochoa', 'Peralta', 'Salcedo', 'Robles', 'Cuesta', 'Arenas'],
  de: ['Brandt', 'Hoffmeier', 'Kessling', 'Vogt', 'Lindner', 'Albrecht', 'Steiner', 'Kramer', 'Wendt', 'Huber', 'Achterberg', 'Rauch', 'Gerlach', 'Seidel', 'Pohl', 'Nagel'],
  fr: ['Dubois', 'Lefèvre', 'Moreau', 'Kanté-Roux', 'Girard', 'Fontaine', 'Mbaye', 'Laurent', 'Chevalier', 'Diakité', 'Rousseau', 'Benali', 'Marchand', 'Traoré', 'Perrin', 'Garnier'],
  it: ['Bianchi', 'Ferraro', 'Colombo', 'Rinaldi', 'Galli', 'Marchetti', 'Conti', 'De Santis', 'Leone', 'Mancini-Gori', 'Barone', 'Fontana', 'Pellegrini', 'Testa', 'Caruso', 'Villa'],
};

// deterministic RNG so each club always has the same squad
function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const ROLE_SHAPE = {
  GK: { pac: -25, sho: -50, pas: -20, dri: -40, def: -35, phy: -10, gk: 0 },
  CB: { pac: -14, sho: -40, pas: -16, dri: -28, def: 3, phy: 2 },
  LB: { pac: 1, sho: -32, pas: -8, dri: -10, def: -6, phy: -10 }, RB: { pac: 1, sho: -32, pas: -8, dri: -10, def: -6, phy: -10 },
  DM: { pac: -12, sho: -18, pas: -1, dri: -9, def: -2, phy: -2 },
  CM: { pac: -8, sho: -6, pas: 2, dri: 0, def: -20, phy: -12 },
  LW: { pac: 4, sho: -4, pas: -6, dri: 2, def: -45, phy: -20 }, RW: { pac: 4, sho: -4, pas: -6, dri: 2, def: -45, phy: -20 },
  ST: { pac: 0, sho: 3, pas: -12, dri: -4, def: -45, phy: -6 },
  LWB: { pac: 3, sho: -28, pas: -6, dri: -6, def: -10, phy: -10 }, RWB: { pac: 3, sho: -28, pas: -6, dri: -6, def: -10, phy: -10 },
  CAM: { pac: -4, sho: 0, pas: 2, dri: 2, def: -35, phy: -16 },
  LM: { pac: 2, sho: -8, pas: -3, dri: 0, def: -30, phy: -15 }, RM: { pac: 2, sho: -8, pas: -3, dri: 0, def: -30, phy: -15 },
};
const NUM_BY_ROLE = { GK: [1], LB: [3], LWB: [3], CB: [4, 5, 15], RB: [2], RWB: [2], DM: [6, 16], CM: [8, 14, 18], CAM: [10], LM: [11], RM: [7], LW: [11], RW: [7], ST: [9, 19] };

export function clubSquad(club) {
  const r = rng(club.id);
  const pool = NAMES[club.names].slice();
  const used = new Set();
  const f = FORMATIONS[club.formation] || FORMATIONS['4-3-3'];
  const usedNums = new Set();
  const real = SQUADS[club.id];
  return f.map((slot, i) => {
    let name, base, num, skin, hair;
    if (real && real[i]) {
      [name, num, base, skin, hair] = real[i];
    } else {
      do { name = pool[(r() * pool.length) | 0]; } while (used.has(name));
      used.add(name);
      base = club.ovr + (['ST', 'LW', 'RW', 'CAM'].includes(slot.role) ? 2 : i === 0 ? 0 : -1) + Math.round((r() - 0.5) * 6);
      num = (NUM_BY_ROLE[slot.role] || [20]).find(n => !usedNums.has(n));
      if (!num) { num = 12; while (usedNums.has(num)) num++; }
      skin = (r() * 6) | 0; hair = (r() * 6) | 0;
    }
    usedNums.add(num);
    const sh = ROLE_SHAPE[slot.role];
    const a = {};
    for (const k of ['pac', 'sho', 'pas', 'dri', 'def', 'phy']) a[k] = Math.max(30, Math.min(97, base + sh[k] + Math.round((r() - 0.5) * 8)));
    a.gk = slot.role === 'GK' ? Math.min(95, base + 2) : 25;
    return {
      name, num, pos: slot.role, ovr: Math.min(97, base), a,
      skin, hair, style: (r() * 5) | 0,
      st: { spd: a.pac / 100, pas: a.pas / 100, sho: a.sho / 100, dri: a.dri / 100, def: a.def / 100, gk: a.gk / 100, phy: a.phy / 100 },
    };
  });
}

// pick the kit that doesn't clash with ZorpFC's blue
function blueish(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return b > 120 && b > r * 1.4 && b > g * 1.1;
}
export function clubKit(club) { return blueish(club.home.shirt) ? club.away : club.home; }

export function teamConfig(club) {
  const k = clubKit(club);
  return {
    name: club.name, short: club.short, color: club.color, club, formation: club.formation,
    kit: k,
    gkKit: { shirt: '#f2c40c', shirt2: '#9a7a00', trim: '#222222', shorts: '#222222', socks: '#f2c40c', sockTop: '#222222', boots: '#ff4b1f', number: '#222222', gloves: '#ff4b1f', pattern: 'plain', longSleeve: true },
    players: clubSquad(club),
  };
}

export function crestSVG(club, size = 48) {
  const c1 = club.color, c2 = club.accent;
  const txt = club.initials;
  const fs = txt.length > 2 ? 15 : 19;
  const ink = (() => { const n = parseInt(c1.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 165 ? '#111' : '#fff'; })();
  return `<svg class="club-crest" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 2l19 6v14c0 12-8 20-19 24C13 42 5 34 5 22V8z" fill="${c2}"/>
    <path d="M24 5.5l16 5v11.3c0 10-6.8 16.9-16 20.4-9.2-3.5-16-10.4-16-20.4V10.5z" fill="${c1}"/>
    <path d="M8 19h32" stroke="${c2}" stroke-width="2.4" opacity=".55"/>
    <text x="24" y="${txt.length > 2 ? 32 : 33}" text-anchor="middle" font-family="Russo One, Arial Black, sans-serif" font-size="${fs}" fill="${ink}">${txt}</text>
  </svg>`;
}

export function zorpCrestSVG(size = 48) {
  return crestSVG({ color: '#1d5cff', accent: '#ffd23f', initials: 'Z' }, size);
}
