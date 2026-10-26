// FC-style player cards and drawn portraits for the squad and shop screens.
import { SKINS, HAIRS } from './model.js';
import { DB, ovr, attrs, tier } from './squad.js';

const HAIR = [
  '<path d="M19 28c-1.5-11.5 5-18 13-18s14.5 6.5 13 18c-2-5.5-7-8.5-13-8.5s-11 3-13 8.5z"/>',
  '<path d="M20.5 26c0-9 5-14.5 11.5-14.5S43.5 17 43.5 26c-3-4-7-5.8-11.5-5.8S23.5 22 20.5 26z" opacity=".8"/>',
  '<path d="M19 28c-1.5-12.5 4-20 14-20 6.5 0 11.5 3.3 12.5 10-2-1.2-4.5-1.2-6.5 0-2.3-2.2-5.5-3-8.6-2-5.2 1.4-8.8 5.5-11.4 12z"/>',
  '<ellipse cx="32" cy="21" rx="17" ry="14.5"/>',
  '<path d="M18 31c-2.3-13.5 5-21 14-21s16.3 7.5 14 21l-2.4 8.5c.2-8.5-1.3-14.5-11.6-15.8C21.7 25 20.2 31 20.4 39.5z"/>',
  '',
];

export function avatar(p, shirt = '#1557ff', trim = '#ffffff') {
  const skin = SKINS[p.skin % SKINS.length], hair = HAIRS[p.hair % HAIRS.length];
  const style = p.style % HAIR.length;
  const back = style === 3 ? `<g fill="${hair}">${HAIR[3]}</g>` : '';
  const front = style !== 3 && HAIR[style] ? `<g fill="${hair}">${HAIR[style]}</g>` : style === 3 ? `<path d="M20 25c1-7 6-11 12-11s11 4 12 11c-3-3-7-4.5-12-4.5S23 22 20 25z" fill="${hair}"/>` : '';
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    ${back}
    <path d="M4 64c1-10.5 9.5-16.5 19-17.5l9 5.5 9-5.5c9.5 1 18 7 19 17.5z" fill="${shirt}"/>
    <path d="M23 46.5l9 5.5 9-5.5-2-1.5-7 4.2-7-4.2z" fill="${trim}"/>
    <rect x="27" y="37" width="10" height="11" rx="4" fill="${skin}"/>
    <ellipse cx="20.8" cy="30.5" rx="2.2" ry="3.2" fill="${skin}"/><ellipse cx="43.2" cy="30.5" rx="2.2" ry="3.2" fill="${skin}"/>
    <ellipse cx="32" cy="29" rx="11.4" ry="13.6" fill="${skin}"/>
    <path d="M24 39c3 4 13 4 16 0-1.5 3.5-4.5 5.5-8 5.5s-6.5-2-8-5.5z" fill="#000" opacity=".12"/>
    <ellipse cx="27.6" cy="29.3" rx="1.6" ry="1.2" fill="#1b120c"/><ellipse cx="36.4" cy="29.3" rx="1.6" ry="1.2" fill="#1b120c"/>
    <path d="M25 26.2h5M34 26.2h5" stroke="${hair}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M32 30v4.2" stroke="#000" stroke-opacity=".15" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M28.5 37.3c2.2 1.2 4.8 1.2 7 0" stroke="#5a2a20" stroke-opacity=".7" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    ${front}
  </svg>`;
}

const rowsFor = (pos, a) => pos === 'GK'
  ? [['DIV', a.gk], ['HAN', Math.max(1, a.gk - 3)], ['KIC', a.pas], ['REF', Math.min(99, a.gk + 2)], ['SPD', a.pac], ['POS', Math.max(1, a.gk - 1)]]
  : [['PAC', a.pac], ['SHO', a.sho], ['PAS', a.pas], ['DRI', a.dri], ['DEF', a.def], ['PHY', a.phy]];

export function statRows(id) { return rowsFor(DB[id].pos, attrs(id)); }

// v: { name, pos, num, ovr, tier, rows, look:{skin,hair,style}, shirt, trim }
export function cardView(v, { mini = false } = {}) {
  const name = mini ? v.name.split(' ').slice(-1)[0] : v.name;
  const stats = mini ? '' : `<div class="pc-stats">${v.rows.map(([k, val]) => `<span><b>${val}</b><i>${k}</i></span>`).join('')}</div>`;
  return `<div class="pcard t-${v.tier}${mini ? ' mini' : ''}">
    <div class="pc-top"><div class="pc-ovr"><b>${v.ovr}</b><small>${v.pos}</small></div><div class="pc-face">${avatar(v.look, v.shirt, v.trim)}</div><div class="pc-num">${v.num}</div></div>
    <div class="pc-name">${name}</div>${stats}
  </div>`;
}

export function card(id, opts) {
  const p = DB[id];
  return cardView({ name: p.name, pos: p.pos, num: p.num, ovr: ovr(id), tier: tier(id), rows: statRows(id), look: p }, opts);
}

// card for an opponent (club squad player)
export function clubCard(pl, kit, opts) {
  const t = pl.ovr >= 88 ? 'rare' : pl.ovr >= 75 ? 'gold' : pl.ovr >= 65 ? 'silver' : 'bronze';
  return cardView({ name: pl.name, pos: pl.pos, num: pl.num, ovr: pl.ovr, tier: t, rows: rowsFor(pl.pos, pl.a), look: pl, shirt: kit.shirt, trim: kit.trim }, opts);
}
