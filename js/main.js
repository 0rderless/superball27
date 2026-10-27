import * as THREE from '../lib/three.module.min.js';
import { buildStadium } from './stadium.js';
import { Match } from './match.js';
import { loadPlayerAssets } from './model.js';
import { Commentary } from './commentary.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { F, DIFFICULTY, DIFF_KEYS, TEAMS, FORMATIONS } from './config.js';
import { CLUBS, teamConfig, crestSVG, zorpCrestSVG } from './clubs.js';
import * as SQ from './squad.js';
import { startCloud } from './cloud.js';
import { chooseKits, PATTERNS, KIT_SLOTS } from './kits.js';
import { CELEBS } from './celebrations.js';
import { rating, playerOfMatch, summary } from './ratings.js';
import { DRILLS, DRILL, isBetter, fmtScore } from './drills.js';
import { DrillRun } from './drill-run.js';
import * as MD from './modes.js';
import { sortTable, topScorers } from './league.js';
import { ROUND_NAMES } from './cup.js';
import { teamFacts } from './facts.js';
import { card, clubCard, avatar, cardView, rowsFor } from './cards.js';
import { SKINS, HAIRS } from './model.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BUILD = 35; // shown on the title screen and in settings, so you can tell which version is running
document.querySelectorAll('.build-no').forEach(e => { e.textContent = 'Build ' + BUILD; });
// cloud save (Firebase): keeps the squad, editor players, kits and settings across phones and links
const CLOUD_TEXT = { syncing: '· Cloud: saving…', synced: '· Cloud: saved', offline: '· Cloud: offline (saved on this phone)', blocked: '· Cloud: blocked by database rules', off: '' };
startCloud({ onStatus: s => document.querySelectorAll('.cloud-st').forEach(e => { e.textContent = CLOUD_TEXT[s] || ''; }) });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

const store = {
  get(k, d) { try { const v = localStorage.getItem('sb27.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('sb27.' + k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};

// ---------------------------------------------------------------- settings
const weakDevice = (navigator.hardwareConcurrency || 4) <= 4 && /Android/i.test(navigator.userAgent);
const legacyAssist = store.get('assist', 'on') !== 'off';
const DEFAULTS = {
  difficulty: 'pro', minutes: 6, camera: 'broadcast', camZoom: 100, graphics: weakDevice ? 'low' : 'high',
  passAssist: legacyAssist, autoSwitch: legacyAssist, autoSprint: true, defAssist: true, dribAssist: true, offside: true, celebration: 'random', stayOnside: false, tacAttack: 50, tacLine: 50, tacPress: 50, tacWidth: 50,
  volume: 90, crowd: 100, sound: true, commentary: true,
  radar: true, fps: false, btnSize: 1, vibration: true, joyFixed: false,
};
const settings = {};
for (const k in DEFAULTS) settings[k] = store.get(k, DEFAULTS[k]);

const CAMERA_INFO = {
  close: ['Close', 'Tight on the action'],
  broadcast: ['Broadcast', 'Classic TV angle'],
  wide: ['Wide', 'See more of the pitch'],
  tele: ['Tele', 'High gantry, long lens'],
  dynamic: ['Dynamic', 'Zooms with the play'],
  pro: ['Pro', 'End-to-end, behind the attack'],
};
const CAMERA_ICONS = {
  close: '<svg viewBox="0 0 80 44"><rect x="6" y="18" width="68" height="22" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M40 4l-8 12h16z" fill="currentColor"/><circle cx="40" cy="30" r="4" fill="currentColor"/></svg>',
  broadcast: '<svg viewBox="0 0 80 44"><path d="M10 40l12-20h36l12 20z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M40 2l-7 10h14z" fill="currentColor"/><path d="M40 20v20" stroke="currentColor" stroke-width="1.5"/></svg>',
  wide: ['<svg viewBox="0 0 80 44"><path d="M2 40l16-22h44l16 22z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M40 2l-6 9h12z" fill="currentColor"/><path d="M40 18v22M18 29h44" stroke="currentColor" stroke-width="1.2"/></svg>'][0],
  tele: '<svg viewBox="0 0 80 44"><path d="M16 40l8-14h32l8 14z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M40 1v12M34 7l6-6 6 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  dynamic: '<svg viewBox="0 0 80 44"><path d="M8 40l12-20h40l12 20z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 8h28M26 8l5-4M26 8l5 4M54 8l-5-4M54 8l-5 4" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  pro: '<svg viewBox="0 0 80 44"><path d="M28 40l6-34h12l6 34z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M40 14v26" stroke="currentColor" stroke-width="1.5"/><circle cx="40" cy="40" r="3" fill="currentColor"/></svg>',
};

const TIPS = [
  'Flick PASS upwards for a high ball over the defence.',
  'Hold SHOOT for power — flick up while holding to chip the keeper.',
  'Swipe the SKILL button upwards for a rainbow flick.',
  'Swipe SKILL down for a drag-back, left or right for La Croqueta.',
  'Press PASS while a pass is still coming to you for a one-touch pass.',
  'Assisted passes follow your teammate wherever he runs.',
  'Try the Pro camera in Settings for an end-to-end view.',
  'Tap the screen to skip a goal replay.',
  'Hold SPRINT for top speed (stick at the edge is a quicker run) — ZorpFC never tire.',
  'Defending: hold SPRINT to press the man on the ball.',
];
const tip = () => TIPS[(Math.random() * TIPS.length) | 0];

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b1f);
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1500);
let stadium = null;
let builtGraphics = null;

function applyGraphics() {
  if (builtGraphics === settings.graphics) return;
  builtGraphics = settings.graphics;
  const high = settings.graphics === 'high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.3));
  renderer.shadowMap.enabled = high;
  if (stadium) scene.remove(stadium.root);
  stadium = buildStadium(scene, settings.graphics, renderer);
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

const sound = new Sound();
const input = new Input();
const commentary = new Commentary();

// ---------------------------------------------------------------- UI hooks
const ui = {
  fade: $('fade'), banner: $('banner'), event: $('event'), hint: $('hint'),
  scH: $('sc-h'), scA: $('sc-a'), clock: $('clock'), radar: $('radar'),
  ptNum: $('pt-num'), ptName: $('pt-name'), stamina: $('stamina').firstElementChild,
  power: $('power'), powerFill: $('power').firstElementChild, controls: $('controls'), hud: $('hud'),
};
const rctx = ui.radar.getContext('2d');
let camSnap = false, spCam = false, bannerDockTimer = 0;
let bannerTimer = 0, eventTimer = 0;
const vibrate = p => { if (settings.vibration && navigator.vibrate) try { navigator.vibrate(p); } catch (_) { /* ignore */ } };

const hooks = {
  say(key, vars, prio) { if (state === 'game' || state === 'intro') commentary.say(key, vars, prio); },
  replay(on) {
    $('replay-badge').classList.toggle('show', on);
    ui.hud.classList.toggle('replaying', on);
    if (on) { ui.banner.className = ''; if (stadium) stadium.clearConfetti(); }
    ui.controls.classList.toggle('hidden', on);
    hooks.hint('');
  },
  fade(cb) {
    ui.fade.classList.add('on');
    setTimeout(() => { cb(); camSnap = true; ui.fade.classList.remove('on'); }, 280);
  },
  banner(title, sub, ms = 2500, cls = '') {
    ui.banner.querySelector('.b1').textContent = title;
    const b2 = ui.banner.querySelector('.b2');
    b2.textContent = sub || '';
    b2.style.display = sub ? '' : 'none';
    ui.banner.className = 'show ' + cls;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { ui.banner.className = ''; }, ms);
  },
  hint(t) {
    ui.hint.textContent = t;
    ui.hint.classList.toggle('show', !!t);
  },
  event(t) {
    if (!t) return;
    ui.event.textContent = t;
    ui.event.classList.add('show');
    clearTimeout(eventTimer);
    eventTimer = setTimeout(() => ui.event.classList.remove('show'), 1300);
  },
  goal(team, name, own) {
    const c = match.scorer ? match.scorer.pos : match.ball.pos;
    if (!own && match.scorer) showGoalCard(match.scorer);
    if (stadium) stadium.confetti(c.x, c.z, team.isUser ? ['#1d5cff', '#ffffff', '#ffd21f', '#4f86ff'] : ['#e0202a', '#ffd23f', '#8e0a12']);
    hooks.banner('GOAL!', `${name}  ${match.home.score} - ${match.away.score}`, 3300, team.isUser ? 'home' : 'away');
    vibrate(team.isUser ? [60, 40, 120] : 40);
    if (team.isUser && !own) showCelebPick();
    // big for a moment, then out of the way of the celebration
    clearTimeout(bannerDockTimer);
    bannerDockTimer = setTimeout(() => { if (ui.banner.classList.contains('show')) ui.banner.classList.add('dock'); }, 1150);
  },
  drillHud(o) { ui.hud.classList.add('drilling'); drillHooks.drillHud(o); },
  fullTime() {
    hooks.banner('FULL TIME', `${match.home.cfg.name} ${match.home.score} - ${match.away.score} ${match.away.cfg.name}`, 2600);
    setTimeout(showResult, 2800);
  },
};

// after you score: tap a celebration while he runs to the fans
let celebPickTimer = 0;
document.body.appendChild($('celeb-pick')); // above the touch controls, so a tap picks rather than moves
function showCelebPick() {
  const el = $('celeb-pick');
  el.innerHTML = CELEBS.map(c => `<button data-celeb="${c.key}" class="${c.key === match.celeb.kind ? 'on' : ''}"><i>${c.icon}</i><span>${c.name}</span></button>`).join('');
  el.classList.add('show');
  clearTimeout(celebPickTimer);
  celebPickTimer = setTimeout(() => el.classList.remove('show'), 1400);
}
$('celeb-pick').addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-celeb]');
  if (!b || !match || !match.chooseCeleb(b.dataset.celeb)) return;
  e.stopPropagation();
  for (const x of $('celeb-pick').children) x.classList.toggle('on', x === b);
  setTimeout(() => $('celeb-pick').classList.remove('show'), 250);
});

// ---------------------------------------------------------------- state
let match = null;
let mode = null; // null = quick match | { type: 'season' | 'cup', round }
let state = 'boot'; // boot | title | menu | prematch | intro | game | paused | result
let introT = 0;
let assetsReady = false;

// match kits: yours (chosen or auto) and theirs, never clashing
function pickKits() {
  const mk = chooseKits({ kits: SQ.kits(), choice: SQ.profile().kitChoice, club: opponent });
  TEAMS.home.kit = mk.home;
  TEAMS.home.gkKit = SQ.kits().gk;
  TEAMS.home.color = mk.home.shirt;
  TEAMS.away = teamConfig(opponent, mk.away);
}
function newMatch() {
  if (!assetsReady) return;
  if (match) match.dispose();
  TEAMS.home.players = SQ.lineupForMatch(); // your starting XI from Squad
  TEAMS.home.formation = SQ.formationName();
  pickKits();
  match = new Match(scene, sound, settings, hooks);
  match.diff = effDiff();
  match.knockout = !!(mode && mode.type === 'cup'); // level after 90: extra time, then penalties
  syncOpponentUI();
  commentary.prefetch([...TEAMS.home.players, ...TEAMS.away.players].map(p => p.name));
}

// ---------------------------------------------------------------- opponent club
let opponent = CLUBS[(Math.random() * CLUBS.length) | 0];
// AI strength = difficulty, scaled by how good the club is
function effDiff() {
  const d = { ...(DIFFICULTY[settings.difficulty] || DIFFICULTY.pro) };
  const k = (opponent.ovr - 84) / 100;
  d.speed *= 1 + k * 0.6;
  d.tackle *= 1 + k * 1.5;
  d.press *= 1 + k * 0.8;
  d.gk = Math.min(0.97, d.gk + k * 0.6);
  d.shootErr *= 1 - k * 1.5;
  d.react *= 1 - k;
  return d;
}
function syncOpponentUI() {
  const kitCol = TEAMS.away.kit.shirt;
  $('sb-away-name').textContent = opponent.short;
  $('sb-away-col').style.background = kitCol;
  $('sb-away-col').style.color = kitCol;
  document.querySelector('.sb-home i').style.cssText = `background:${TEAMS.home.kit.shirt};color:${TEAMS.home.kit.shirt}`;
  $('pp-a').textContent = opponent.short;
  $('pp-a').style.color = kitCol === '#f4f4f4' || kitCol === '#f2f2f2' ? '#e8e8e8' : opponent.color;
  $('pm-away-crest').innerHTML = crestSVG(opponent);
  $('pm-away-name').textContent = opponent.name;
  $('ft-away-crest').innerHTML = crestSVG(opponent);
  $('ft-away-name').textContent = opponent.name;
}

let goalCardTimer = 0;
function showGoalCard(pl) {
  const el = $('goal-card');
  const html = pl.team.isUser && pl.data.id ? card(pl.data.id) : clubCard(pl.data, pl.team.cfg.kit);
  el.innerHTML = html + `<div class="gc-tag">${pl.team.isUser ? 'ZORPFC' : opponent.short} · GOAL</div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(goalCardTimer);
  goalCardTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

const SCREENS = ['boot', 'menu', 'matchmaking', 'prematch', 'pause', 'result'];
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  ui.hud.classList.toggle('hidden', !(id === null || id === 'pause'));
  ui.controls.classList.toggle('hidden', id !== null);
}

// ---------------------------------------------------------------- boot: studio sting + title loading
const loadFill = $('load-fill'), loadPct = $('load-pct'), loadStatus = $('load-status');
function setLoad(p, msg) {
  const v = Math.round(clamp(p, 0, 1) * 100);
  loadFill.style.width = v + '%';
  loadPct.textContent = v + '%';
  if (msg) loadStatus.textContent = msg;
}

async function boot() {
  $('load-tip').textContent = tip();
  const tipTimer = setInterval(() => { $('load-tip').textContent = tip(); }, 3500);
  const minTime = wait(3300); // let the Ontronop sting play
  try {
    setLoad(0.02, 'Preparing stadium…');
    await nextFrame();
    applyGraphics();
    setLoad(0.12, 'Loading players…');
    await loadPlayerAssets('assets/player.glb', f => setLoad(0.12 + f * 0.6, 'Loading players…'));
    assetsReady = true;
    setLoad(0.78, 'Building squads…');
    await nextFrame();
    newMatch();
    setLoad(0.9, 'Warming up…');
    await nextFrame();
    renderer.compile(scene, camera);
    setLoad(1, 'Ready');
  } catch (err) {
    console.error(err);
    loadStatus.textContent = 'Could not load — check your connection and reload';
    clearInterval(tipTimer);
    return;
  }
  await minTime;
  clearInterval(tipTimer);
  state = 'title';
  $('title').classList.add('ready');
}

$('boot').addEventListener('pointerup', () => {
  if (state !== 'title') return;
  // first tap: unlock audio / speech (iOS needs a gesture)
  sound.init();
  applyAudio();
  commentary.unlock();
  requestFullscreen();
  goMenu();
});

function goMenu() {
  state = 'menu';
  ui.hud.classList.remove('drilling');
  commentary.stop();
  ui.fade.classList.add('on');
  setTimeout(() => {
    if (match && match.phase !== 'menu') newMatch();
    showScreen('menu');
    setTab('play');
    ui.fade.classList.remove('on');
  }, 260);
}

// ---------------------------------------------------------------- menu
function seg(container, options, get, set) {
  container.innerHTML = '';
  for (const [v, label] of options) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => { set(v); container.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', String(options[i][0]) === String(get()))); });
    container.appendChild(b);
  }
  container.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', String(options[i][0]) === String(get())));
}

function syncMenu() {
  $('meta-diff').textContent = DIFFICULTY[settings.difficulty].label;
  $('meta-len').textContent = settings.minutes + ' min';
  $('meta-cam').textContent = CAMERA_INFO[settings.camera][0] + ' cam';
  const dseg = $('menu').querySelector('[data-quick="difficulty"] .seg');
  dseg.classList.add('seg5');
  seg(dseg, DIFF_KEYS.map(k => [k, DIFFICULTY[k].label]), () => settings.difficulty, v => { setSetting('difficulty', v); syncMenu(); });
  seg($('menu').querySelector('[data-quick="minutes"] .seg'), [[4, '4 min'], [6, '6 min'], [10, '10 min']], () => settings.minutes, v => { setSetting('minutes', v); syncMenu(); });
  $('tip-text').textContent = tip();
  const pr = SQ.profile();
  $('team-ovr').textContent = SQ.teamOvr();
  $('team-record').textContent = `${pr.record.w}W ${pr.record.d}D ${pr.record.l}L`;
  $('team-form').textContent = SQ.formationName();
  $('team-stars').innerHTML = pr.lineup.filter(id => SQ.DB[id].star).map(id => `<span>${SQ.DB[id].name} ${SQ.ovr(id)}</span>`).join('');
  // FC-style home tiles: club badge, your best player, the next signing in the store
  $('pf-crest').innerHTML = zorpCrestSVG(40);
  const best = pr.lineup.slice().sort((a, b) => SQ.ovr(b) - SQ.ovr(a))[0];
  $('team-card').innerHTML = card(best);
  const next = SQ.SHOP.filter(id => !pr.owned.includes(id)).sort((a, b) => SQ.ovr(b) - SQ.ovr(a))[0] || SQ.SHOP[0];
  $('store-card').innerHTML = card(next);
  updateCoins();
}

// ---------------------------------------------------------------- hub tabs: play / squad / shop
let tab = 'play';
function setTab(t) {
  tab = t;
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === t);
  for (const id of ['play', 'squad', 'shop']) $('page-' + id).classList.toggle('hidden', id !== t);
  if (t === 'squad') renderSquad();
  if (t === 'shop') renderShop();
  if (t === 'play') syncMenu();
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
$('team-tile').addEventListener('click', () => setTab('squad'));
$('store-tile').addEventListener('click', () => setTab('shop'));

let coinShown = null;
function updateCoins() {
  const c = SQ.profile().coins;
  $('coins').textContent = SQ.INFINITE_COINS ? '∞' : c.toLocaleString('en-US');
  if (coinShown !== null && c !== coinShown) { const el = $('coins').parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  coinShown = c;
  $('shop-dot').classList.toggle('on', !SQ.INFINITE_COINS && SQ.dailyReady());
}
let toastTimer = 0;
function toast(msg, icon = 'check') {
  const t = $('toast');
  t.innerHTML = `<svg class="ico"><use href="#i-${icon}"/></svg>${msg}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
const coin = n => `<svg class="ico"><use href="#i-coin"/></svg>${n.toLocaleString('en-US')}`;

// squad: pitch (attacking to the right) + reserves + player detail
// pitch position (%) of a formation slot, attacking to the right
const slotXY = sl => [6 + sl.a / 0.72 * 82, 50 + sl.c * 44];
const FORMATION_NAMES = ['4-3-3', '4-4-2', '4-2-3-1', '4-1-2-1-2', '3-5-2', '3-4-3', '5-3-2'];
let selSlot = null, selBench = null;
function renderSquad() {
  const pr = SQ.profile();
  const pitch = $('pitch');
  const form = SQ.formation();
  $('form-pick').innerHTML = FORMATION_NAMES.map(f => `<button data-form="${f}" class="${f === SQ.formationName() ? 'on' : ''}">${f}</button>`).join('');
  pitch.innerHTML = pr.lineup.map((id, i) => {
      const [x, y] = slotXY(form[i]);
      const pen = SQ.ovr(id) - SQ.slotOvr(id, i);
      return `<button class="slot${selSlot === i ? ' sel' : ''}${selSlot !== null && selSlot !== i ? ' swap-target' : ''}" data-slot="${i}" style="left:${x}%;top:${y}%">${card(id, { mini: true })}<span class="pos-tag${pen ? ' oop' : ''}">${SQ.slotPos(i)}${pen ? ` −${pen}` : ''}</span></button>`;
    }).join('');
  const bench = pr.owned.filter(id => !pr.lineup.includes(id)).sort((a, b) => SQ.ovr(b) - SQ.ovr(a));
  $('bench').innerHTML = bench.length ? bench.map(id => `<button class="bench-card${selBench === id ? ' sel' : ''}" data-id="${id}">${card(id, { mini: true })}</button>`).join('') : '<div class="empty-bench">No reserves — sign players in the Shop.</div>';
  const focus = selBench || (selSlot !== null ? pr.lineup[selSlot] : null);
  const det = $('squad-detail');
  if (!focus) {
    det.innerHTML = `<div class="sd-empty"><b>ZorpFC · ${SQ.formationName()} · ${SQ.teamOvr()} OVR</b><span>Tap a player to see his card and upgrade his attributes — pace, shooting, passing and more.</span><span>Tap two players on the pitch to swap positions, or a player then a reserve to substitute.</span></div>`;
    return;
  }
  const p = SQ.DB[focus], a = SQ.attrs(focus);
  const keys = p.pos === 'GK' ? SQ.UPGRADABLE.gk : SQ.UPGRADABLE.field;
  det.innerHTML = `${card(focus)}<div class="sd-info"><div class="sd-top"><h3>${p.name}</h3><button class="sd-edit" data-edit="${focus}"><svg class="ico"><use href="#i-sliders"/></svg>Edit</button></div><div class="sub">${p.pos} · #${p.num} · ${SQ.ovr(focus)} OVR${p.star ? ' · SUPERSTAR' : ''}</div>
    <div class="attr-list">${keys.map(k => {
      const v = a[k], lv = SQ.attrLevel(focus, k), cost = SQ.trainCost(focus, k), can = SQ.canTrain(focus, k);
      return `<div class="attr">${SQ.ATTR_NAME[k]}<i style="--v:${v}%"><u style="--b:${v - lv}%;--u:${lv}%"></u></i><b>${v}</b>${can
        ? `<button data-train="${k}" ${SQ.profile().coins < cost ? 'disabled' : ''}><svg class="ico"><use href="#i-coin"/></svg>${cost >= 1000 ? (cost / 1000).toFixed(1) + 'k' : cost}</button>`
        : '<button class="max" disabled>MAX</button>'}</div>`;
    }).join('')}</div></div>`;
  det.querySelector('[data-edit]').addEventListener('click', () => { edLoad(focus); openModal('editor'); });
  det.querySelectorAll('[data-train]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.train;
    if (SQ.train(focus, k)) {
      toast(`${p.name}: ${SQ.ATTR_NAME[k]} ${SQ.attrs(focus)[k]} · ${SQ.ovr(focus)} OVR`, 'bolt');
      if (sound.ctx) sound.kick(0.2);
      renderSquad(); updateCoins();
    }
  }));
}
$('form-pick').addEventListener('click', e => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  SQ.setFormation(f.dataset.form); selSlot = null; selBench = null;
  toast(`Formation: ${f.dataset.form} · ${SQ.teamOvr()} OVR`, 'shirt');
  renderSquad(); syncMenu();
});
$('pitch').addEventListener('click', e => {
  const b = e.target.closest('.slot');
  if (!b) return;
  const i = Number(b.dataset.slot);
  if (selBench) { SQ.swap(i, selBench); toast(`${SQ.DB[selBench].name} comes into the XI`, 'swap'); selBench = null; selSlot = null; }
  else if (selSlot === null) selSlot = i;
  else if (selSlot === i) selSlot = null;
  else { SQ.swap(selSlot, i); toast('Positions swapped', 'swap'); selSlot = null; }
  renderSquad();
});
$('bench').addEventListener('click', e => {
  const b = e.target.closest('.bench-card');
  if (!b) return;
  const id = b.dataset.id;
  if (selSlot !== null) { SQ.swap(selSlot, id); toast(`${SQ.DB[id].name} comes into the XI`, 'swap'); selSlot = null; selBench = null; }
  else selBench = selBench === id ? null : id;
  renderSquad();
});

// shop: transfer market with a two-tap buy
const FILTERS = [['all', 'All'], ['att', 'Attack'], ['mid', 'Midfield'], ['def', 'Defence'], ['gk', 'GK']];
const GROUP = { ST: 'att', LW: 'att', RW: 'att', CM: 'mid', DM: 'mid', CB: 'def', LB: 'def', RB: 'def', GK: 'gk' };
let shopFilter = 'all', confirmId = null;
function renderShop() {
  seg($('shop-filter'), FILTERS, () => shopFilter, v => { shopFilter = v; confirmId = null; renderShop(); });
  const pr = SQ.profile();
  const q = ($('shop-search').value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const plain = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u00a0/g, ' ');
  const sorts = {
    'ovr-desc': (a, b) => SQ.ovr(b) - SQ.ovr(a), 'ovr-asc': (a, b) => SQ.ovr(a) - SQ.ovr(b),
    'price-desc': (a, b) => SQ.DB[b].price - SQ.DB[a].price, 'price-asc': (a, b) => SQ.DB[a].price - SQ.DB[b].price,
    name: (a, b) => plain(SQ.DB[a].name).localeCompare(plain(SQ.DB[b].name)),
  };
  const items = SQ.SHOP.filter(id => (shopFilter === 'all' || GROUP[SQ.DB[id].pos] === shopFilter) && (!q || plain(SQ.DB[id].name).includes(q) || SQ.DB[id].pos.toLowerCase() === q))
    .sort(sorts[$('shop-sort').value] || sorts['ovr-desc']);
  $('shop-grid').innerHTML = items.map(id => {
    const p = SQ.DB[id], owned = pr.owned.includes(id);
    const btn = owned ? `<button class="buy owned" disabled><svg class="ico"><use href="#i-check"/></svg>OWNED</button>`
      : confirmId === id ? `<button class="buy confirm" data-buy="${id}">CONFIRM</button>`
      : `<button class="buy" data-buy="${id}" ${!SQ.INFINITE_COINS && pr.coins < p.price ? 'disabled' : ''}>${SQ.INFINITE_COINS ? 'SIGN' : coin(p.price)}</button>`;
    return `<div class="shop-item">${card(id)}${btn}</div>`;
  }).join('') || `<div class="shop-empty">No players match "${$('shop-search').value.replace(/</g, '&lt;')}"</div>`;
  const d = $('daily-btn');
  d.classList.toggle('hidden', SQ.INFINITE_COINS); // nothing to claim with unlimited coins
  d.disabled = !SQ.dailyReady();
  $('daily-txt').textContent = SQ.dailyReady() ? 'Claim daily 750' : 'Daily claimed';
}
$('shop-search').addEventListener('input', () => renderShop());
$('shop-sort').addEventListener('change', () => renderShop());
$('shop-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-buy]');
  if (!b) return;
  const id = b.dataset.buy;
  if (confirmId !== id) { confirmId = id; renderShop(); return; }
  confirmId = null;
  if (SQ.buy(id)) { toast(`${SQ.DB[id].name} signed for ZorpFC!`, 'check'); sound.ctx && sound.cheer && sound.applause(); }
  renderShop(); updateCoins();
});
$('daily-btn').addEventListener('click', () => {
  const n = SQ.claimDaily();
  if (n) { toast(`+${n} coins`, 'gift'); renderShop(); updateCoins(); }
});
setInterval(() => { if (state === 'menu') $('tip-text').textContent = tip(); }, 6000);

// ---------------------------------------------------------------- player editor
const ED_STATS = [['pac', 'Pace'], ['sho', 'Shooting'], ['pas', 'Passing'], ['dri', 'Dribbling'], ['def', 'Defending'], ['phy', 'Physical'], ['gk', 'Goalkeeping']];
const CARD_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', rare: 'Rare gold', icon: 'Icon', star: 'Superstar', toty: 'TOTY', ruby: 'Ruby', emerald: 'Emerald', black: 'Black' };
let edId = null, ed = null;
function edLoad(id) {
  edId = id;
  const p = id ? SQ.DB[id] : null;
  ed = p ? { name: p.name, pos: p.pos, num: p.num, skin: p.skin, hair: p.hair, style: p.style, a: { ...SQ.attrs(id) }, base: p.base || 0, card: p.card || '' }
    : { name: 'New Player', pos: 'ST', num: 9, skin: 2, hair: 0, style: 0, a: { pac: 80, sho: 80, pas: 75, dri: 80, def: 40, phy: 70, gk: 25 }, base: 0, card: '' };
  edForm();
}
function edOvr() {
  if (ed.base) return ed.base;
  // same weighting as the squad screen, via a throwaway preview player
  const w = { GK: { gk: 1 }, CB: { def: .55, phy: .2, pas: .15, pac: .1 }, LB: { def: .4, pac: .3, pas: .2, dri: .1 }, RB: { def: .4, pac: .3, pas: .2, dri: .1 }, DM: { def: .4, pas: .35, phy: .15, dri: .1 }, CM: { pas: .4, dri: .25, def: .1, sho: .15, pac: .1 }, LW: { pac: .3, dri: .35, sho: .2, pas: .15 }, RW: { pac: .3, dri: .35, sho: .2, pas: .15 }, ST: { sho: .45, pac: .2, dri: .2, phy: .1, pas: .05 } }[ed.pos];
  let v = 0; for (const k in w) v += ed.a[k] * w[k];
  return Math.min(99, Math.round(v + 2));
}
function edPreview() {
  const o = edOvr();
  const t = ed.card || (o >= 88 ? 'rare' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze');
  $('ed-preview').innerHTML = cardView({ name: ed.name, pos: ed.pos, num: ed.num, ovr: o, tier: t, rows: rowsFor(ed.pos, ed.a), look: ed });
}
function edForm() {
  const pr = SQ.profile();
  const opt = id => `<option value="${id}" ${id === edId ? 'selected' : ''}>${SQ.DB[id].name} · ${SQ.DB[id].pos} ${SQ.ovr(id)}${SQ.isCustom(id) ? ' (created)' : SQ.isEdited(id) ? ' (edited)' : ''}</option>`;
  const byOvr = (a, b) => SQ.ovr(b) - SQ.ovr(a);
  const mine = pr.owned.filter(id => SQ.DB[id]).sort(byOvr), store = SQ.SHOP.filter(id => SQ.DB[id] && !pr.owned.includes(id)).sort(byOvr);
  $('ed-pick').innerHTML = `<option value="">+ Create a new player</option><optgroup label="Your squad (${mine.length})">${mine.map(opt).join('')}</optgroup><optgroup label="Store players">${store.map(opt).join('')}</optgroup>`;
  const sw = (key, list) => list.map((c, i) => `<button class="sw ${ed[key] === i ? 'on' : ''}" data-k="${key}" data-v="${i}" style="background:${c}"></button>`).join('');
  $('ed-form').innerHTML = `
    <div class="ed-hint">${edId ? `Editing <b>${SQ.DB[edId].name}</b>: change anything, then Save.` : 'Creating a new player. To edit one of yours, pick him in the list on the left (or tap Edit on the Team page).'}</div>
    <label class="ed-row"><span>Name</span><input id="ed-name" maxlength="22" value="${ed.name.replace(/"/g, '&quot;')}"></label>
    <div class="ed-row"><span>Position</span><div class="ed-chips">${SQ.POSITIONS.map(p => `<button class="chip ${ed.pos === p ? 'on' : ''}" data-k="pos" data-v="${p}">${p}</button>`).join('')}</div></div>
    <label class="ed-row"><span>Number</span><input id="ed-num" type="number" min="1" max="99" value="${ed.num}"></label>
    ${ED_STATS.map(([k, n]) => `<label class="ed-row ed-stat"><span>${n}</span><input type="range" min="1" max="99" data-stat="${k}" value="${ed.a[k]}"><b>${ed.a[k]}</b></label>`).join('')}
    <label class="ed-row ed-stat"><span>Overall</span><input type="range" min="0" max="99" data-base value="${ed.base}"><b>${ed.base || 'auto'}</b></label>
    <div class="ed-row"><span>Skin tone</span><div class="ed-chips">${sw('skin', SKINS)}</div></div>
    <div class="ed-row"><span>Hair colour</span><div class="ed-chips">${sw('hair', HAIRS)}</div></div>
    <div class="ed-row"><span>Hair style</span><div class="ed-chips">${['Short', 'Buzz', 'Swept', 'Afro', 'Long', 'Shaved'].map((n, i) => `<button class="chip ${ed.style === i ? 'on' : ''}" data-k="style" data-v="${i}">${n}</button>`).join('')}</div></div>
    <div class="ed-row"><span>Card</span><div class="ed-chips"><button class="chip ${!ed.card ? 'on' : ''}" data-k="card" data-v="">Auto</button>${SQ.CARDS.map(c => `<button class="chip card-chip t-${c} ${ed.card === c ? 'on' : ''}" data-k="card" data-v="${c}">${CARD_NAMES[c]}</button>`).join('')}</div></div>`;
  $('ed-remove').textContent = edId && SQ.isCustom(edId) ? 'Delete' : 'Reset';
  $('ed-remove').disabled = !edId || !(SQ.isCustom(edId) || SQ.isEdited(edId));
  edPreview();
}
$('ed-pick').addEventListener('change', e => edLoad(e.target.value || null));
$('ed-form').addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'ed-name') ed.name = t.value;
  else if (t.id === 'ed-num') ed.num = +t.value;
  else if (t.dataset.stat) { ed.a[t.dataset.stat] = +t.value; t.nextElementSibling.textContent = t.value; }
  else if (t.hasAttribute('data-base')) { ed.base = +t.value; t.nextElementSibling.textContent = +t.value || 'auto'; }
  edPreview();
});
$('ed-form').addEventListener('click', e => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  const k = b.dataset.k, v = b.dataset.v;
  ed[k] = k === 'pos' || k === 'card' ? v : +v;
  b.parentElement.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b));
  edPreview();
});
$('ed-save').addEventListener('click', () => {
  const id = SQ.savePlayer(edId, ed);
  if (!id) return;
  toast(edId ? `${ed.name} updated` : `${ed.name} created and added to your squad`, 'check');
  edLoad(id);
  if (tab === 'shop') renderShop(); syncMenu();
});
$('ed-remove').addEventListener('click', () => {
  if (!edId) return;
  const custom = SQ.isCustom(edId), name = SQ.DB[edId].name;
  if (!SQ.removePlayer(edId)) { toast('Take him out of your starting XI first', 'close'); return; }
  toast(custom ? `${name} deleted` : `${name} reset`, 'check');
  edLoad(custom ? null : edId);
  if (tab === 'shop') renderShop(); syncMenu();
});
$('editor-btn').addEventListener('click', () => { edLoad(null); openModal('editor'); });
// keep the Team page in step with edits
$('ed-save').addEventListener('click', () => { if (tab === 'squad') renderSquad(); });
$('ed-remove').addEventListener('click', () => { if (tab === 'squad') renderSquad(); });

// ---------------------------------------------------------------- kit editor
const KIT_FIELDS = [['shirt', 'Shirt'], ['shirt2', 'Pattern'], ['trim', 'Trim'], ['number', 'Number'], ['shorts', 'Shorts'], ['socks', 'Socks'], ['sockTop', 'Sock tops'], ['boots', 'Boots']];
const KIT_NAMES = { home: 'Home', away: 'Away', third: 'Third', gk: 'Keeper' };
let kitSlot = 'home', kit = null;
function kitSvg(k, num = 10) {
  const id = 'kc' + Math.random().toString(36).slice(2, 7);
  const pat = {
    stripes: [0, 1, 2, 3, 4].map(i => `<rect x="${24 + i * 16}" y="0" width="8" height="90" fill="${k.shirt2}"/>`).join(''),
    hoops: [0, 1, 2, 3, 4].map(i => `<rect x="0" y="${14 + i * 15}" width="120" height="7" fill="${k.shirt2}"/>`).join(''),
    sash: `<path d="M18,0 L40,0 L104,90 L82,90 Z" fill="${k.shirt2}"/>`,
    halves: `<rect x="60" y="0" width="60" height="90" fill="${k.shirt2}"/>`,
  }[k.pattern] || '';
  return `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="${id}"><path d="M30,10 L48,4 Q60,12 72,4 L90,10 L112,32 L98,46 L90,40 L90,84 L30,84 L30,40 L22,46 L8,32 Z"/></clipPath></defs>
    <g clip-path="url(#${id})"><rect width="120" height="90" fill="${k.shirt}"/>${pat}</g>
    <path d="M48,4 Q60,14 72,4" fill="none" stroke="${k.trim}" stroke-width="4"/>
    <path d="M8,32 L22,46 M112,32 L98,46" stroke="${k.trim}" stroke-width="4"/>
    <text x="60" y="64" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="26" fill="${k.number}">${num}</text>
    <path d="M30,84 L90,84 L92,114 L64,114 L60,102 L56,114 L28,114 Z" fill="${k.shorts}"/>
    <rect x="34" y="117" width="16" height="24" rx="2" fill="${k.socks}"/><rect x="70" y="117" width="16" height="24" rx="2" fill="${k.socks}"/>
    <rect x="34" y="117" width="16" height="5" fill="${k.sockTop}"/><rect x="70" y="117" width="16" height="5" fill="${k.sockTop}"/>
    <rect x="31" y="141" width="21" height="7" rx="3" fill="${k.boots}"/><rect x="68" y="141" width="21" height="7" rx="3" fill="${k.boots}"/>
  </svg>`;
}
function kitLoad(slot) {
  kitSlot = slot;
  kit = { ...SQ.kits()[slot] };
  const choice = SQ.profile().kitChoice;
  $('kit-slots').innerHTML = KIT_SLOTS.map(s => `<button class="chip ${s === slot ? 'on' : ''}" data-slot="${s}">${KIT_NAMES[s]}</button>`).join('');
  $('kit-form').innerHTML = `
    <div class="ed-row"><span>Wear in matches</span><div class="ed-chips">${['auto', 'home', 'away', 'third'].map(c => `<button class="chip ${choice === c ? 'on' : ''}" data-choice="${c}">${c === 'auto' ? 'Auto (no clash)' : KIT_NAMES[c]}</button>`).join('')}</div></div>
    <div class="ed-row"><span>Pattern</span><div class="ed-chips">${PATTERNS.map(p => `<button class="chip ${kit.pattern === p ? 'on' : ''}" data-pattern="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div></div>
    <div class="kit-colours">${KIT_FIELDS.concat(slot === 'gk' ? [['gloves', 'Gloves']] : []).map(([k, n]) => `<label class="ed-row"><span>${n}</span><input type="color" data-col="${k}" value="${kit[k] || '#ffffff'}"></label>`).join('')}</div>`;
  kitPreview();
}
function kitPreview() { $('kit-preview').innerHTML = kitSvg(kit, kitSlot === 'gk' ? 1 : 10); }
$('kit-slots').addEventListener('click', e => { const b = e.target.closest('[data-slot]'); if (b) kitLoad(b.dataset.slot); });
$('kit-form').addEventListener('input', e => { const k = e.target.dataset.col; if (k) { kit[k] = e.target.value; kitPreview(); } });
$('kit-form').addEventListener('click', e => {
  const c = e.target.closest('[data-choice]'), p = e.target.closest('[data-pattern]');
  if (c) { SQ.setKitChoice(c.dataset.choice); c.parentElement.querySelectorAll('[data-choice]').forEach(x => x.classList.toggle('on', x === c)); toast(c.dataset.choice === 'auto' ? 'Kit picked automatically each match' : `Wearing the ${KIT_NAMES[c.dataset.choice].toLowerCase()} kit`, 'check'); }
  if (p) { kit.pattern = p.dataset.pattern; p.parentElement.querySelectorAll('[data-pattern]').forEach(x => x.classList.toggle('on', x === p)); kitPreview(); }
});
$('kit-save').addEventListener('click', () => { SQ.saveKit(kitSlot, kit); toast(`${KIT_NAMES[kitSlot]} kit saved`, 'check'); });
$('kit-reset').addEventListener('click', () => { SQ.resetKit(kitSlot); kitLoad(kitSlot); toast(`${KIT_NAMES[kitSlot]} kit reset`, 'check'); });
$('kits-btn').addEventListener('click', () => { kitLoad('home'); openModal('kit-editor'); });

$('play-btn').addEventListener('click', () => { if (match && state === 'menu') startMatchmaking(); });

// ---------------------------------------------------------------- season
const crestFor = (id, size = 22) => id === MD.USER ? zorpCrestSVG(size) : crestSVG(MD.clubById(id), size);
function renderSeason() {
  const s = MD.season(), tr = MD.trophies();
  const body = $('ssn-body');
  $('ssn-sub').textContent = s ? (s.champion ? '· finished' : `· matchday ${s.round + 1} of ${s.rounds.length}`) : '';
  if (!s) {
    body.innerHTML = `<div class="ssn-start"><svg class="ico big"><use href="#i-trophy"/></svg>
      <p>Take ZorpFC through a league against all 11 clubs. Every other game is played out around you; finish top to lift the trophy.</p>
      <div class="row"><button class="mbtn primary" data-new="1">11 games</button><button class="mbtn" data-new="2">22 games (home &amp; away)</button></div>
      <small>League titles: ${tr.league}</small></div>`;
    return;
  }
  const table = sortTable(s.table);
  const rows = table.map((r, i) => `<tr class="${r.id === MD.USER ? 'me' : ''}"><td>${i + 1}</td><td class="tm">${crestFor(r.id, 18)}<span>${MD.teamName(r.id)}</span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('');
  const g = MD.nextSeasonGame();
  const last = s.results[s.results.length - 1] || [];
  const scorers = topScorers(s, 5);
  let side;
  if (g) {
    side = `<div class="ssn-next"><small>MATCHDAY ${g.round} OF ${g.rounds} · ${g.home ? 'HOME' : 'AWAY'}</small>
      <div class="ssn-vs">${crestFor(MD.USER, 34)}<b>VS</b>${crestFor(g.opp, 34)}</div><b class="ssn-opp">${MD.teamName(g.opp)}</b>
      <button class="mbtn primary" id="ssn-play">Play matchday ${g.round}</button></div>`;
  } else {
    const won = s.champion === MD.USER, pos = table.findIndex(r => r.id === MD.USER) + 1;
    side = `<div class="ssn-next ${won ? 'champ' : ''}"><svg class="ico big"><use href="#i-trophy"/></svg><b class="ssn-opp">${won ? 'CHAMPIONS!' : `${MD.teamName(s.champion)} are champions`}</b>
      <small>ZorpFC finished ${pos}${['st', 'nd', 'rd'][pos - 1] || 'th'} · League titles: ${tr.league}</small><button class="mbtn primary" data-new="${s.legs}">New season</button></div>`;
  }
  body.innerHTML = `<div class="ssn-table"><table><thead><tr><th>#</th><th class="tm">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="ssn-side">${side}
      ${last.length ? `<div class="ssn-box"><small>LAST ROUND</small>${last.map(f => `<div class="res ${f.h === MD.USER || f.a === MD.USER ? 'me' : ''}"><span>${MD.teamShort(f.h)}</span><b>${f.hg} - ${f.ag}</b><span>${MD.teamShort(f.a)}</span></div>`).join('')}</div>` : ''}
      ${scorers.length ? `<div class="ssn-box"><small>TOP SCORERS</small>${scorers.map(x => `<div class="sc ${x.team === MD.USER ? 'me' : ''}"><span>${x.name} <i>${MD.teamShort(x.team)}</i></span><b>${x.goals}</b></div>`).join('')}</div>` : ''}
      ${g ? '<button class="mbtn ghost" id="ssn-quit">Abandon season</button>' : ''}
    </div>`;
}
function openSeason() { renderSeason(); openModal('season'); }
$('season-tile').addEventListener('click', openSeason);
$('ssn-body').addEventListener('click', e => {
  const n = e.target.closest('[data-new]');
  if (n) { MD.startSeason(+n.dataset.new); renderSeason(); syncModeTiles(); return; }
  if (e.target.closest('#ssn-play')) { closeModals(); startSeasonMatch(); return; }
  if (e.target.closest('#ssn-quit') && confirm('Abandon this season? The table and results will be lost.')) { MD.abandonSeason(); renderSeason(); syncModeTiles(); }
});
function startSeasonMatch() {
  const g = MD.nextSeasonGame();
  if (!g) return;
  mode = { type: 'season', round: g.round };
  opponent = MD.clubById(g.opp);
  startPrematch();
}
function syncModeTiles() {
  const cg = MD.nextCupGame(), c = MD.cup();
  $('cup-tile-sub').textContent = cg ? `${cg.round} · vs ${MD.teamShort(cg.opp)}` : c ? (c.winner === MD.USER ? 'Winners!' : 'Finished') : '8-club knockout';
  const g = MD.nextSeasonGame(), s = MD.season();
  $('season-tile-sub').textContent = g ? `Matchday ${g.round}/${g.rounds} · vs ${MD.teamShort(g.opp)}` : s && s.champion ? 'Season finished' : 'League vs 11 clubs';
}
syncModeTiles();
// ---------------------------------------------------------------- cup
function renderCup() {
  const c = MD.cup(), tr = MD.trophies(), body = $('cup-body');
  const g = MD.nextCupGame();
  $('cup-sub').textContent = c ? (c.winner ? '· finished' : c.out ? '· knocked out' : `· ${ROUND_NAMES[c.round].toLowerCase()}`) : '';
  if (!c) {
    body.innerHTML = `<div class="ssn-start"><svg class="ico big"><use href="#i-star"/></svg>
      <p>Eight clubs, one trophy. Quarter-final, semi-final, final. Level after 90 minutes? Extra time, then penalties.</p>
      <div class="row"><button class="mbtn primary" data-cup-new>Enter the cup</button></div><small>Cups won: ${tr.cup}</small></div>`;
    return;
  }
  const tie = t => {
    const sc = t.hg != null ? `${t.hg}-${t.ag}${t.pens ? ` <i>(${t.pens[0]}-${t.pens[1]} p)</i>` : ''}` : 'v';
    const cls = id => `${id === MD.USER ? 'me' : ''} ${t.winner ? (t.winner === id ? 'win' : 'lose') : ''}`;
    return `<div class="tie"><span class="${cls(t.h)}">${crestFor(t.h, 16)}${MD.teamShort(t.h)}</span><b>${sc}</b><span class="${cls(t.a)}">${MD.teamShort(t.a)}${crestFor(t.a, 16)}</span></div>`;
  };
  const cols = ROUND_NAMES.map((n, i) => `<div class="cup-col"><small>${n.toUpperCase()}</small>${(c.rounds[i] || Array.from({ length: [4, 2, 1][i] }, () => null)).map(t => t ? tie(t) : '<div class="tie tbd">to be decided</div>').join('')}</div>`).join('');
  let side;
  if (g) side = `<div class="ssn-next"><small>${g.round.toUpperCase()}</small><div class="ssn-vs">${crestFor(MD.USER, 34)}<b>VS</b>${crestFor(g.opp, 34)}</div><b class="ssn-opp">${MD.teamName(g.opp)}</b><button class="mbtn primary" id="cup-play">Play the ${g.round.toLowerCase()}</button><button class="mbtn ghost" id="cup-quit">Leave the cup</button></div>`;
  else side = `<div class="ssn-next ${c.winner === MD.USER ? 'champ' : ''}"><svg class="ico big"><use href="#i-star"/></svg><b class="ssn-opp">${c.winner === MD.USER ? 'CUP WINNERS!' : `${MD.teamName(c.winner)} win the cup`}</b><small>Cups won: ${tr.cup}</small><button class="mbtn primary" data-cup-new>New cup</button></div>`;
  body.innerHTML = `<div class="cup-bracket">${cols}</div><div class="ssn-side">${side}</div>`;
}
function openCup() { renderCup(); openModal('cup'); }
$('cup-tile').addEventListener('click', openCup);
$('cup-body').addEventListener('click', e => {
  if (e.target.closest('[data-cup-new]')) { MD.startCup(); renderCup(); syncModeTiles(); return; }
  if (e.target.closest('#cup-play')) { closeModals(); const g = MD.nextCupGame(); mode = { type: 'cup', round: g.round }; opponent = MD.clubById(g.opp); startPrematch(); return; }
  if (e.target.closest('#cup-quit') && confirm('Leave the cup? This draw will be lost.')) { MD.abandonCup(); renderCup(); syncModeTiles(); }
});

// a season game has finished: into the table it goes
function recordModeResult(h, a) {
  if (!mode || match.recordedMode) return null;
  match.recordedMode = true;
  if (mode.type === 'season') {
    const scorers = [];
    for (const p of match.matchPlayers()) for (let i = 0; i < p.ms.goals; i++) scorers.push({ name: p.name, team: p.team === 'home' ? MD.USER : opponent.id });
    const r = MD.recordSeasonGame(h, a, scorers);
    syncModeTiles();
    return r.champion ? (r.champion === MD.USER ? 'CHAMPIONS! ZorpFC win the league' : `${MD.teamName(r.champion)} win the league`) : `ZorpFC are ${r.pos}${['st', 'nd', 'rd'][r.pos - 1] || 'th'} in the table`;
  }
  if (mode.type === 'cup') {
    const so = match.shootoutResult;
    const r = MD.recordCupGame(h, a, so ? { us: so.home, them: so.away } : undefined);
    syncModeTiles();
    return r.won ? 'CUP WINNERS!' : r.out ? `Out in the ${r.roundName.toLowerCase()}` : `Through to the ${r.next.toLowerCase()}`;
  }
  return null;
}

// ---------------------------------------------------------------- skill games
function renderDrills() {
  $('drill-list').innerHTML = DRILLS.map(d => `<button class="drill" data-drill="${d.key}"><svg class="ico"><use href="#${d.icon}"/></svg><b>${d.name}</b><p>${d.desc}</p><span class="best">BEST ${fmtScore(d.key, SQ.drillBest(d.key))}</span></button>`).join('');
}
$('drills-tile').addEventListener('click', () => { renderDrills(); openModal('drills'); });
$('drill-list').addEventListener('click', e => { const b = e.target.closest('[data-drill]'); if (b) startDrill(b.dataset.drill); });
const drillHooks = {
  event: t => hooks.event(t),
  drillHud({ title, score, info }) { $('dh-title').textContent = title; $('dh-score').textContent = score; $('dh-info').textContent = info; },
  drillEnd({ kind, score, text }) {
    const best = SQ.drillBest(kind), isNew = SQ.saveDrill(kind, score, (a, b) => isBetter(kind, a, b));
    setTimeout(() => {
      if (!match || !match.drill || match.drill.kind !== kind) return;
      state = 'result';
      $('dr-name').textContent = DRILL[kind].name;
      $('dr-score').textContent = text;
      $('dr-best').textContent = isNew ? (best == null ? 'First score set!' : `New best! (was ${fmtScore(kind, best)})`) : `Best: ${fmtScore(kind, SQ.drillBest(kind))}`;
      $('dr-best').classList.toggle('new', isNew);
      ui.controls.classList.add('hidden');
      openModal('drill-result');
      if (isNew) sound.cheer();
    }, 1200);
  },
};
async function startDrill(kind) {
  closeModals();
  sound.init(); commentary.unlock(); commentary.stop();
  requestFullscreen(); requestWakeLock();
  ui.fade.classList.add('on');
  await wait(260);
  applyGraphics();
  newMatch();
  new DrillRun(match, kind, drillHooks);
  input.reset();
  state = 'game';
  showScreen(null);
  ui.hud.classList.remove('hidden');
  ui.hud.classList.add('drilling');
  ui.controls.classList.remove('hidden');
  camSnap = true;
  ui.fade.classList.remove('on');
}
$('dr-again').addEventListener('click', () => { if (match && match.drill) startDrill(match.drill.kind); });
$('dr-list').addEventListener('click', () => { closeModals(); goMenu(); setTimeout(() => { renderDrills(); openModal('drills'); }, 300); });
$('dr-menu').addEventListener('click', () => { closeModals(); goMenu(); });
$('menu-settings').addEventListener('click', () => openSettings());
$('menu-controls').addEventListener('click', () => openModal('help'));
$('fs-btn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
  else requestFullscreen();
});
const standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
if (standalone) $('install-tip').classList.add('hidden');

// ---------------------------------------------------------------- matchmaking
let mmToken = 0;
async function startMatchmaking() {
  mode = null;
  const tok = ++mmToken;
  state = 'matchmaking';
  sound.init();
  commentary.unlock();
  requestFullscreen();
  showScreen('matchmaking');
  const mm = $('matchmaking');
  mm.classList.remove('found');
  $('mm-status').textContent = 'SEARCHING FOR OPPONENT';
  $('mm-sub').textContent = `Difficulty: ${DIFFICULTY[settings.difficulty].label}`;
  $('mm-you-ovr').textContent = `OVR ${SQ.teamOvr()}`;
  $('mm-name').textContent = '…';
  $('mm-ovr').innerHTML = '&nbsp;';
  // pick an opponent (any of the big clubs, not the same one twice in a row)
  let pick;
  do { pick = CLUBS[(Math.random() * CLUBS.length) | 0]; } while (CLUBS.length > 1 && pick === opponent);
  const reel = $('mm-reel');
  let i = (Math.random() * CLUBS.length) | 0, delay = 70;
  const t0 = performance.now();
  while (performance.now() - t0 < 2100 || CLUBS[i] !== pick) {
    if (tok !== mmToken || state !== 'matchmaking') return;
    i = (i + 1) % CLUBS.length;
    reel.innerHTML = crestSVG(CLUBS[i]);
    reel.classList.remove('spin'); void reel.offsetWidth; reel.classList.add('spin');
    if (sound.ctx) sound.kick(0.03);
    await wait(delay);
    if (performance.now() - t0 > 1500) delay = Math.min(260, delay * 1.18);
  }
  opponent = pick;
  mm.classList.add('found');
  $('mm-status').textContent = 'MATCH FOUND';
  $('mm-name').textContent = pick.name;
  $('mm-ovr').textContent = `OVR ${pick.ovr}`;
  vibrate([30, 40, 30]);
  if (sound.ctx) sound.whistle(1);
  await wait(1300);
  if (tok !== mmToken || state !== 'matchmaking') return;
  startPrematch();
}
$('mm-cancel').addEventListener('click', () => { mmToken++; goMenu(); });

// ---------------------------------------------------------------- pre-match loading (matchup screen)
function renderLineups() {
  const el = $('lineup-pitch');
  const homeF = SQ.formation(), pr = SQ.profile();
  pickKits();
  const away = TEAMS.away;
  const awayF = FORMATIONS[away.formation] || FORMATIONS['4-3-3'];
  const ink = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 165 ? '#111' : '#fff'; };
  const pos = (sl, mirror) => {
    const x = 4 + sl.a / 0.72 * 42, y = 50 + sl.c * 40;
    return mirror ? [100 - x, 100 - y] : [x, y];
  };
  let html = '', k = 0;
  const hk = TEAMS.home.kit;
  pr.lineup.forEach((id, i) => {
    const p = SQ.DB[id], [x, y] = pos(homeF[i], false);
    html += `<div class="lu${p.star ? ' star' : ''}" style="left:${x}%;top:${y}%;--ring:${hk.shirt};--ringInk:${ink(hk.shirt)};animation-delay:${(k++) * 40}ms"><div class="lu-face">${avatar(p, hk.shirt, hk.trim)}</div><span class="lu-num">${p.num}</span><b>${p.name.split(' ').slice(-1)[0]}</b></div>`;
  });
  away.players.forEach((p, i) => {
    const [x, y] = pos(awayF[i], true);
    html += `<div class="lu" style="left:${x}%;top:${y}%;--ring:${away.kit.shirt};--ringInk:${ink(away.kit.shirt)};animation-delay:${(k++) * 40}ms"><div class="lu-face">${avatar(p, away.kit.shirt, away.kit.trim)}</div><span class="lu-num">${p.num}</span><b>${p.name}</b></div>`;
  });
  el.innerHTML = html;
  $('pm-home-sub').textContent = `${SQ.formationName()} · OVR ${SQ.teamOvr()}`;
  $('pm-away-name').textContent = opponent.name;
  $('pm-away-sub').textContent = `${away.formation} · OVR ${opponent.ovr}`;
  $('pm-away-crest').innerHTML = crestSVG(opponent);
}

let pmContinue = null;
async function startPrematch() {
  state = 'prematch';
  sound.init();
  commentary.unlock();
  commentary.stop();
  requestFullscreen();
  requestWakeLock();
  const pm = $('prematch');
  pm.classList.remove('ready');
  pm.querySelector('.pm-head b').textContent = mode && mode.type === 'season' ? `SEASON · MATCHDAY ${mode.round}` : mode && mode.type === 'cup' ? `CUP · ${mode.round.toUpperCase()}` : 'QUICK MATCH';
  renderLineups();
  showScreen('prematch');
  for (const el of pm.querySelectorAll('.pm-club, .pm-vs, .lineup-pitch')) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
  $('pm-tip').textContent = tip();
  const fill = $('pm-fill');
  fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = '';
  const t0 = performance.now();
  fill.style.width = '25%';
  await wait(350);
  applyGraphics();
  newMatch();
  fill.style.width = '60%';
  await nextFrame();
  renderer.compile(scene, camera);
  fill.style.width = '100%';
  sound.applause();
  if (state !== 'prematch') return;
  // lineups stay up until you tap (or a few seconds pass)
  pm.classList.add('ready');
  await new Promise(res => {
    pmContinue = res;
    setTimeout(res, Math.max(2500, 6500 - (performance.now() - t0)));
  });
  pmContinue = null;
  if (state !== 'prematch') return;
  ui.fade.classList.add('on');
  await wait(260);
  startIntro();
  ui.fade.classList.remove('on');
}
$('prematch').addEventListener('pointerup', () => { if (pmContinue && $('prematch').classList.contains('ready')) pmContinue(); });

function startIntro() {
  input.reset();
  state = 'intro';
  introT = 0;
  match.phase = 'intro';
  match.lineupPose();
  showScreen(null);
  ui.controls.classList.add('hidden');
  hooks.hint('');
  hooks.banner('ZorpFC', `vs  ${opponent.name}`, 2600, 'home');
}

let kickoffPending = false;
function beginKickoff() {
  if (kickoffPending) return;
  kickoffPending = true;
  hooks.fade(() => {
    kickoffPending = false;
    if (state !== 'intro') return;
    state = 'game';
    ui.controls.classList.remove('hidden');
    match.startMatch();
    camSnap = true;
  });
}
const INTRO_DUR = 5.4;

function showResult() {
  if (!match || state === 'menu') return;
  state = 'result';
  const h = match.home.score, a = match.away.score;
  $('ft-h').textContent = h;
  $('ft-a').textContent = a;
  const so = match.shootoutResult;
  $('ft-msg').textContent = so ? (so.winner === 'home' ? `ZORPFC WIN ${so.home}-${so.away} ON PENS` : `${opponent.name.toUpperCase()} WIN ${so.away}-${so.home} ON PENS`)
    : h > a ? 'ZORPFC WIN!' : h < a ? `${opponent.name.toUpperCase()} WIN` : 'IT\'S A DRAW';
  const st = match.stats;
  const total = st.home.poss + st.away.poss || 1;
  const rows = [
    [Math.round(st.home.poss / total * 100), 'Possession', Math.round(st.away.poss / total * 100), '%'],
    [st.home.shots, 'Shots', st.away.shots, ''],
    [st.home.on, 'On target', st.away.on, ''],
    [st.home.passes, 'Passes', st.away.passes, ''],
    [st.home.fouls, 'Fouls', st.away.fouls, ''],
  ];
  if (st.home.yellows + st.away.yellows + st.home.reds + st.away.reds) rows.push([st.home.yellows + st.home.reds, 'Cards', st.away.yellows + st.away.reds, '']);
  if ((st.home.offsides || 0) + (st.away.offsides || 0)) rows.push([st.home.offsides || 0, 'Offsides', st.away.offsides || 0, '']);
  // player of the match, and your team's ratings
  const winner = h > a ? 'home' : a > h ? 'away' : null;
  const all = match.matchPlayers();
  const potm = playerOfMatch(all, { winner });
  if (potm) {
    const kit = TEAMS[potm.team].kit;
    $('ft-potm').innerHTML = `<div class="potm-face">${avatar(potm.data, kit.shirt, kit.trim)}</div>
      <div class="potm-txt"><small>PLAYER OF THE MATCH</small><b>${potm.name}</b><span>${potm.team === 'home' ? 'ZorpFC' : opponent.name} · ${summary(potm.ms, potm.role)}</span></div>
      <div class="potm-rt">${potm.rating.toFixed(1)}</div>`;
  }
  const mine = all.filter(p => p.team === 'home').map(p => ({ ...p, r: rating(p.ms, { role: p.role, won: winner === 'home', lost: winner === 'away' }) })).sort((x, y) => y.r - x.r);
  $('ft-ratings').innerHTML = mine.map(p => `<span class="rt ${p.r >= 8 ? 'hi' : p.r >= 6.5 ? 'ok' : p.r < 5.5 ? 'lo' : ''}${p.ms.red ? ' off' : ''}"><b>${p.r.toFixed(1)}</b>${p.name.split(' ').slice(-1)[0]}</span>`).join('');
  $('ft-stats').innerHTML = rows.map(([hv, label, av, u]) => {
    const t = (hv + av) || 1;
    return `<div class="st-row"><span>${hv}${u}</span><div class="bar"><i class="h" style="width:${hv / t * 100}%"></i><i class="a" style="width:${av / t * 100}%"></i><span>${label}</span></div><span>${av}${u}</span></div>`;
  }).join('');
  if (!match.rewarded) {
    match.rewarded = true;
    const r = SQ.matchRewards(h, a, settings.difficulty, opponent.ovr);
    $('ft-rewards').innerHTML = r.lines.map(([l, v]) => `<span>${l} +${v}</span>`).join('') + `<span class="total"><svg class="ico"><use href="#i-coin"/></svg>+${r.total}</span>`;
  }
  const note = recordModeResult(h, a);
  if (note) $('ft-msg').textContent += ` · ${note}`;
  $('again-btn').textContent = mode && mode.type === 'season' ? (MD.nextSeasonGame() ? 'Next matchday' : 'Season table')
    : mode && mode.type === 'cup' ? (MD.nextCupGame() ? `On to the ${MD.nextCupGame().round.toLowerCase()}` : 'Cup draw') : 'Play again';
  showScreen('result');
  ui.hud.classList.add('hidden');
}

// ---------------------------------------------------------------- match facts
let factsTab = 'team', factsSide = 'home';
function renderFacts(el) {
  if (!match) return;
  const H = match.home.cfg.short || 'ZFC', A = match.away.cfg.short;
  const tabs = `<div class="seg facts-tabs">${[['team', 'Match facts'], ['players', 'Players'], ['timeline', 'Timeline']].map(([k, n]) => `<button data-ft="${k}" class="${factsTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  let body = '';
  if (factsTab === 'team') {
    const st = { ...match.stats.home, goals: match.home.score }, sa = { ...match.stats.away, goals: match.away.score };
    body = `<div class="facts-head"><span class="fh-h">${H}</span><b>${match.home.score} - ${match.away.score}</b><span class="fh-a">${A}</span></div>` +
      teamFacts(st, sa).map(r => {
        const t = (r.hv + r.av) || 1;
        return `<div class="fr"><span>${r.h}</span><div class="fr-mid"><small>${r.label}</small><div class="fr-bar"><i class="h" style="width:${r.hv / t * 100}%"></i><i class="a" style="width:${r.av / t * 100}%"></i></div></div><span>${r.a}</span></div>`;
      }).join('');
  } else if (factsTab === 'players') {
    const winner = match.home.score > match.away.score ? 'home' : match.away.score > match.home.score ? 'away' : null;
    const ps = match.matchPlayers().filter(p => p.team === factsSide)
      .map(p => ({ ...p, r: rating(p.ms, { role: p.role, won: winner === p.team, lost: !!winner && winner !== p.team }) }))
      .sort((x, y) => y.r - x.r);
    body = `<div class="seg facts-side"><button data-fs="home" class="${factsSide === 'home' ? 'on' : ''}">${match.home.cfg.name}</button><button data-fs="away" class="${factsSide === 'away' ? 'on' : ''}">${match.away.cfg.name}</button></div>
      <div class="pf-wrap"><table class="pf"><thead><tr><th class="nm">Player</th><th>Rtg</th><th>G</th><th>A</th><th>Sh</th><th>xG</th><th>Passes</th><th>Tkl</th><th>Int</th><th>Sav</th><th>Skl</th><th>Km</th><th>Top</th></tr></thead><tbody>${
      ps.map(p => { const m = p.ms; return `<tr class="${p.off ? 'off' : ''}"><td class="nm"><i>${p.num}</i>${p.name}${m.red ? ' <em class="rc"></em>' : m.yellow ? ' <em class="yc"></em>' : ''}<small>${p.role}</small></td><td><b class="rt ${p.r >= 8 ? 'hi' : p.r >= 6.5 ? 'ok' : p.r < 5.5 ? 'lo' : ''}">${p.r.toFixed(1)}</b></td><td>${m.goals}</td><td>${m.assists}</td><td>${m.shots}</td><td>${m.xg.toFixed(2)}</td><td>${m.passes}/${m.passAtt}</td><td>${m.tackles}</td><td>${m.intercepts}</td><td>${m.saves}</td><td>${m.skills}</td><td>${(m.dist / 1000).toFixed(1)}</td><td>${Math.round(m.topSpd * 3.6)}</td></tr>`; }).join('')
    }</tbody></table></div>`;
  } else {
    const ev = match.events;
    const icon = e => e.type === 'goal' ? '⚽' : e.type === 'og' ? '⚽ OG' : e.type === 'yellow' ? '<em class="yc"></em>' : e.type === 'red2' ? '<em class="yc"></em><em class="rc"></em>' : '<em class="rc"></em>';
    body = `<div class="facts-head"><span class="fh-h">${H}</span><b>${match.home.score} - ${match.away.score}</b><span class="fh-a">${A}</span></div>` + (ev.length ? `<div class="tl">${
      ev.map(e => `<div class="tl-row ${e.team}"><div class="tl-side">${e.team === 'home' ? `<b>${e.name}</b>${e.assist ? `<small>assist ${e.assist}</small>` : ''}` : ''}</div><div class="tl-min">${e.min}'<span>${icon(e)}</span></div><div class="tl-side">${e.team === 'away' ? `<b>${e.name}</b>${e.assist ? `<small>assist ${e.assist}</small>` : ''}` : ''}</div></div>`).join('')
    }</div>` : '<p class="tl-empty">No goals or cards yet.</p>');
  }
  el.innerHTML = tabs + `<div class="facts-body">${body}</div>`;
}
for (const id of ['pause-facts', 'modal-facts']) {
  $(id).addEventListener('click', e => {
    const t = e.target.closest('[data-ft]'), sd = e.target.closest('[data-fs]');
    if (t) factsTab = t.dataset.ft;
    if (sd) factsSide = sd.dataset.fs;
    if (t || sd) renderFacts($(id));
  });
}
$('facts-btn').addEventListener('click', () => { renderFacts($('modal-facts')); openModal('facts-modal'); });

// ---------------------------------------------------------------- pause
function pause() {
  if (state !== 'game') return;
  state = 'paused';
  commentary.stop();
  input.reset();
  $('pp-score').textContent = `${match.home.score} - ${match.away.score}`;
  $('pp-time').textContent = ui.clock.textContent;
  buildCamStrip();
  renderFacts($('pause-facts'));
  showScreen('pause');
}
function resume() {
  if (state !== 'paused') return;
  closeModals();
  state = 'game';
  showScreen(null);
}
function buildCamStrip() {
  const el = $('pause-cams');
  el.innerHTML = '';
  for (const k in CAMERA_INFO) {
    const b = document.createElement('button');
    b.textContent = CAMERA_INFO[k][0];
    b.classList.toggle('on', settings.camera === k);
    b.addEventListener('click', () => { setSetting('camera', k); camSnap = true; buildCamStrip(); });
    el.appendChild(b);
  }
}
$('pause-btn').addEventListener('click', pause);
$('resume-btn').addEventListener('click', resume);
$('pause-settings').addEventListener('click', () => openSettings());
$('pause-controls').addEventListener('click', () => openModal('help'));
$('restart-btn').addEventListener('click', () => { closeModals(); if (match && match.drill) startDrill(match.drill.kind); else startPrematch(); });

// ---------------------------------------------------------------- button layout editor
// Positions are button centres in % of the screen, saved on the device.
const LAYOUT_KEY = 'sb27.layout';
function loadLayout() { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || null; } catch (_) { return null; } }
function applyLayout(L) {
  const box = $('buttons');
  box.classList.toggle('custom', !!L);
  for (const b of box.querySelectorAll('.btn')) {
    const p = L && L[b.dataset.btn];
    b.style.left = p ? p[0] + '%' : '';
    b.style.top = p ? p[1] + '%' : '';
  }
}
applyLayout(loadLayout());
let layoutDraft = null, dragBtn = null;
function editLayout() {
  if (state !== 'paused') return;
  showScreen(null); // shows the controls so they can be measured and dragged
  const L = {};
  for (const b of $('buttons').querySelectorAll('.btn')) {
    const r = b.getBoundingClientRect();
    L[b.dataset.btn] = [(r.left + r.width / 2) / innerWidth * 100, (r.top + r.height / 2) / innerHeight * 100];
  }
  layoutDraft = L;
  applyLayout(L);
  $('controls').classList.add('editing');
  $('layout-edit').classList.remove('hidden');
}
function endLayoutEdit(save) {
  if (save && layoutDraft) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutDraft)); } catch (_) { /* private mode */ } }
  layoutDraft = null;
  $('controls').classList.remove('editing');
  $('layout-edit').classList.add('hidden');
  showScreen('pause');
}
$('pause-layout').addEventListener('click', editLayout);
$('le-done').addEventListener('click', () => endLayoutEdit(true));
$('le-reset').addEventListener('click', () => { try { localStorage.removeItem(LAYOUT_KEY); } catch (_) { /* ignore */ } applyLayout(null); layoutDraft = null; endLayoutEdit(false); });
$('layout-edit').addEventListener('pointerdown', e => {
  if (e.target.closest('.le-bar')) return;
  dragBtn = null;
  for (const b of $('buttons').querySelectorAll('.btn')) {
    const r = b.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) dragBtn = b;
  }
  if (dragBtn) $('layout-edit').setPointerCapture(e.pointerId);
});
$('layout-edit').addEventListener('pointermove', e => {
  if (!dragBtn || !layoutDraft) return;
  const x = clamp(e.clientX / innerWidth * 100, 4, 96), y = clamp(e.clientY / innerHeight * 100, 8, 94);
  layoutDraft[dragBtn.dataset.btn] = [+x.toFixed(2), +y.toFixed(2)];
  applyLayout(layoutDraft);
});
$('layout-edit').addEventListener('pointerup', () => { dragBtn = null; });
$('quit-btn').addEventListener('click', () => { closeModals(); goMenu(); });
$('again-btn').addEventListener('click', () => {
  if (mode && mode.type === 'season') { goMenu(); setTimeout(openSeason, 320); return; }
  if (mode && mode.type === 'cup') { goMenu(); setTimeout(openCup, 320); return; }
  startMatchmaking();
});
$('menu-btn').addEventListener('click', () => goMenu());

// ---------------------------------------------------------------- settings panel (built from a schema)
const SCHEMA = [
  { tab: 'Gameplay', key: 'formation', label: 'Formation', desc: 'Your shape — changes straight away, even mid-match', type: 'formation' },
  { tab: 'Gameplay', key: 'offside', label: 'Offside', desc: 'On: runners beyond the last defender are flagged. Off: no offside at all', type: 'toggle' },
  { tab: 'Gameplay', key: 'difficulty', label: 'Difficulty', type: 'seg', options: DIFF_KEYS.map(k => [k, DIFFICULTY[k].label]) },
  { tab: 'Gameplay', key: 'minutes', label: 'Match length', desc: 'Applies to the next match', type: 'seg', options: [[4, '4 min'], [6, '6 min'], [10, '10 min']] },
  { tab: 'Gameplay', key: 'passAssist', label: 'Pass assist', desc: 'Passes go to who you aim at and follow him', type: 'toggle' },
  { tab: 'Gameplay', key: 'autoSwitch', label: 'Auto switch', desc: 'Control the closest defender automatically', type: 'toggle' },
  { tab: 'Gameplay', key: 'autoSprint', label: 'Auto sprint', desc: 'Stick at the edge = quicker run. Hold SPRINT for top speed', type: 'toggle' },
  { tab: 'Gameplay', key: 'dribAssist', label: 'Dribble assist', desc: 'Closer ball control and quicker turns for your players', type: 'toggle' },
  { tab: 'Gameplay', key: 'celebration', label: 'Celebration', desc: 'What your scorer does (or tap one right after you score)', type: 'seg', options: [['random', 'Random'], ...CELEBS.map(c => [c.key, c.name])] },
  { tab: 'Gameplay', key: 'defAssist', label: 'Defence assist', desc: 'Hold SPRINT (no stick) to press and contain the man on the ball', type: 'toggle' },
  { tab: 'Tactics', key: 'tacAttack', label: 'Attacking', desc: 'Low: players stay back. High: more bodies forward and more runs in behind', type: 'range', min: 0, max: 100, step: 5, unit: '' },
  { tab: 'Tactics', key: 'tacLine', label: 'Defensive line', desc: 'Low: sit deep near your box. High: push the back line up the pitch', type: 'range', min: 0, max: 100, step: 5, unit: '' },
  { tab: 'Tactics', key: 'tacPress', label: 'Pressing', desc: 'High: the nearest players close the ball down and win it back by themselves', type: 'range', min: 0, max: 100, step: 5, unit: '' },
  { tab: 'Tactics', key: 'tacWidth', label: 'Width', desc: 'Low: narrow and compact. High: wide, using the wings', type: 'range', min: 0, max: 100, step: 5, unit: '' },
  { tab: 'Tactics', key: 'stayOnside', label: 'Stay onside', desc: 'Your team-mates move freely but stop at the offside line, so you can\'t pass to an offside man', type: 'toggle' },
  { tab: 'Camera', key: 'camera', type: 'cams' },
  { tab: 'Camera', key: 'camZoom', label: 'Camera distance', desc: 'Closer or further than the preset', type: 'range', min: 80, max: 125, step: 5, unit: '%' },
  { tab: 'Audio', key: 'volume', label: 'Master volume', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
  { tab: 'Audio', key: 'crowd', label: 'Crowd', type: 'range', min: 0, max: 100, step: 5, unit: '%' },
  { tab: 'Audio', key: 'commentary', label: 'Commentary', desc: 'Spoken match commentary', type: 'toggle' },
  { tab: 'Graphics', key: 'graphics', label: 'Quality', desc: 'HD adds real-time shadows', type: 'seg', options: [['low', 'Smooth'], ['high', 'HD']] },
  { tab: 'Graphics', key: 'radar', label: 'Mini-map', type: 'toggle' },
  { tab: 'Graphics', key: 'fps', label: 'Show FPS', type: 'toggle' },
  { tab: 'Controls', key: 'btnSize', label: 'Button size', type: 'seg', options: [[0.85, 'Small'], [1, 'Medium'], [1.15, 'Large']] },
  { tab: 'Controls', key: 'joyFixed', label: 'Fixed joystick', desc: 'Stays in the corner instead of following your thumb', type: 'toggle' },
  { tab: 'Controls', key: 'vibration', label: 'Vibration', type: 'toggle' },
];
let settingsTab = 'Gameplay';

function setSetting(key, v) {
  settings[key] = v;
  store.set(key, v);
  applySetting(key);
}

function applySetting(key) {
  switch (key) {
    case 'difficulty': if (match) match.diff = effDiff(); break;
    case 'volume': case 'crowd': case 'sound': applyAudio(); break;
    case 'commentary': commentary.enabled = settings.commentary; if (!settings.commentary) commentary.stop(); break;
    case 'graphics': if (state === 'menu' || state === 'title') { applyGraphics(); newMatch(); } break;
    case 'radar': ui.hud.classList.toggle('no-radar', !settings.radar); break;
    case 'fps': ui.hud.classList.toggle('show-fps', settings.fps); break;
    case 'btnSize': document.documentElement.style.setProperty('--btn-scale', settings.btnSize); break;
    case 'vibration': input.vibrate = settings.vibration; break;
    case 'joyFixed': input.fixed = settings.joyFixed; $('joy-base').style.left = ''; $('joy-base').style.top = ''; break;
    case 'camera': camSnap = true; break;
  }
  if (state === 'menu') syncMenu();
}
function applyAudio() { sound.setVolume(settings.volume / 100, settings.crowd / 100); }
for (const k in DEFAULTS) applySetting(k);

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModals() { for (const id of ['settings', 'help', 'editor', 'kit-editor', 'drills', 'drill-result', 'season', 'cup', 'facts-modal']) $(id).classList.add('hidden'); }
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (m.id === 'drill-result') return; if (e.target === m || e.target.closest('[data-close]')) { m.classList.add('hidden'); if (state === 'paused') buildCamStrip(); } });
});

function openSettings(tab) {
  if (tab) settingsTab = tab;
  renderSettings();
  openModal('settings');
}

function renderSettings() {
  const tabs = $('set-tabs'), pane = $('set-pane');
  tabs.innerHTML = '';
  for (const t of [...new Set(SCHEMA.map(s => s.tab))]) {
    const b = document.createElement('button');
    b.textContent = t;
    b.classList.toggle('on', t === settingsTab);
    b.addEventListener('click', () => { settingsTab = t; renderSettings(); });
    tabs.appendChild(b);
  }
  pane.innerHTML = '';
  for (const s of SCHEMA.filter(x => x.tab === settingsTab)) {
    if (s.type === 'cams') {
      const grid = document.createElement('div');
      grid.className = 'cam-grid';
      for (const k in CAMERA_INFO) {
        const c = document.createElement('button');
        c.className = 'cam-card' + (settings.camera === k ? ' on' : '');
        c.innerHTML = `${CAMERA_ICONS[k]}<b>${CAMERA_INFO[k][0]}</b><small>${CAMERA_INFO[k][1]}</small>`;
        c.addEventListener('click', () => { setSetting('camera', k); renderSettings(); });
        grid.appendChild(c);
      }
      pane.appendChild(grid);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'set-row';
    const inGameNote = s.key === 'graphics' && state !== 'menu' && state !== 'title' ? '<small class="set-note">Applies from the next match</small>' : '';
    row.innerHTML = `<div class="lbl"><b>${s.label}</b>${s.desc ? `<small>${s.desc}</small>` : ''}${inGameNote}</div>`;
    if (s.type === 'toggle') {
      const t = document.createElement('button');
      t.className = 'toggle' + (settings[s.key] ? ' on' : '');
      t.setAttribute('aria-label', s.label);
      t.addEventListener('click', () => { setSetting(s.key, !settings[s.key]); t.classList.toggle('on', settings[s.key]); });
      row.appendChild(t);
    } else if (s.type === 'formation') {
      const g = document.createElement('div');
      g.className = 'seg seg-wrap';
      seg(g, FORMATION_NAMES.map(f => [f, f]), () => SQ.formationName(), v => {
        SQ.setFormation(v);
        TEAMS.home.formation = v;
        if (match) match.setFormation(match.home, v);
        if (tab === 'squad') renderSquad();
        syncMenu();
        toast(`Formation: ${v}`, 'shirt');
      });
      row.appendChild(g);
    } else if (s.type === 'seg') {
      const g = document.createElement('div');
      g.className = 'seg';
      seg(g, s.options, () => settings[s.key], v => setSetting(s.key, v));
      row.appendChild(g);
    } else if (s.type === 'range') {
      const r = document.createElement('div');
      r.className = 'range';
      r.innerHTML = `<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${settings[s.key]}"><output>${settings[s.key]}${s.unit || ''}</output>`;
      const inp = r.querySelector('input'), out = r.querySelector('output');
      inp.addEventListener('input', () => { out.textContent = inp.value + (s.unit || ''); setSetting(s.key, Number(inp.value)); });
      row.appendChild(r);
    }
    pane.appendChild(row);
  }
}

// ---------------------------------------------------------------- system
function requestFullscreen() {
  const el = document.documentElement;
  const rf = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!rf || document.fullscreenElement) return;
  try {
    const p = rf.call(el, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
  } catch (_) { /* not supported */ }
}

let wakeLock = null;
async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (_) { /* ignore */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else if (state !== 'menu') requestWakeLock();
});
window.addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.code === 'Escape' || e.code === 'KeyP') state === 'game' ? pause() : state === 'paused' && resume();
});
window.addEventListener('pointerdown', () => {
  if (state === 'intro' && introT > 0.6) introT = 99;
  if (state === 'game' && match && match.replay && match.replay.i > match.replay.start + 15) match.skipReplay();
});

// ---------------------------------------------------------------- camera
const CAMS = {
  close: { h: 9.5, back: 15.5, fov: 40 },
  broadcast: { h: 13, back: 22, fov: 40 },
  wide: { h: 20, back: 31, fov: 42 },
  tele: { h: 27, back: 46, fov: 27 },        // high TV gantry, long lens
  dynamic: { h: 12, back: 20, fov: 40, dynamic: true },
  pro: { h: 6.5, back: 13, fov: 52, pro: true }, // end-to-end behind the play
};
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();
const focusV = new THREE.Vector3();
const camDesired = new THREE.Vector3();
let menuT = 0;
const camFwdV = new THREE.Vector3(0, 0, -1);

function setFov(base) {
  // keep a similar horizontal field of view on narrow screens
  const aspect = camera.aspect;
  const hf = 2 * Math.atan(Math.tan(base * Math.PI / 360) * 1.9);
  let vf = 2 * Math.atan(Math.tan(hf / 2) / aspect) * 180 / Math.PI;
  vf = clamp(vf, base * 0.9, 75);
  if (Math.abs(camera.fov - vf) > 0.01) { camera.fov = vf; camera.updateProjectionMatrix(); }
}

function updateCamera(dt) {
  const dbg = window.__sb27 && window.__sb27.debugCam;
  if (dbg) { camera.position.set(...dbg.pos); camera.lookAt(...dbg.look); return; }
  if (state === 'menu' || state === 'boot' || state === 'title' || state === 'prematch' || !match) {
    menuT += dt * 0.06;
    setFov(42);
    camera.position.set(Math.sin(menuT) * 62, 22 + Math.sin(menuT * 0.7) * 5, Math.cos(menuT) * 48);
    camera.lookAt(0, 2, 0);
    return;
  }
  const base = CAMS[settings.camera] || CAMS.broadcast;
  const zk = settings.camZoom / 100;
  const c = { ...base, h: base.h * zk, back: base.back * zk };
  setFov(c.fov);
  if (state === 'intro') {
    // walk-out: low tracking shot along the two lines, then rise to the match camera
    const t = clamp(introT / INTRO_DUR, 0, 1);
    if (t < 0.72) {
      const u = t / 0.72, e = u * u * (3 - 2 * u);
      const x = -11 + e * 22;
      camera.position.set(x, 1.65, 8.6);
      camera.lookAt(x * 0.92, 1.25, 2.2);
    } else {
      const u = (t - 0.72) / 0.28, e = u * u * (3 - 2 * u);
      camera.position.set(11 * (1 - e), 1.65 + e * (c.h - 1.65), 8.6 + e * (c.back - 8.6));
      camera.lookAt(10 * (1 - e), 1.25 * (1 - e) + 0.4 * e, 2.2 * (1 - e));
    }
    camTarget.set(0, 0, 0);
    camLook.set(0, 0, 0);
    return;
  }
  if (match.replay) {
    match.replayCamera(camDesired, focusV);
    if (camSnap) { camera.position.copy(camDesired); camLook.copy(focusV); }
    camera.position.lerp(camDesired, 1 - Math.exp(-dt * 3));
    camLook.lerp(focusV, 1 - Math.exp(-dt * 6));
    camera.lookAt(camLook);
    camSnap = false;
    return;
  }
  if (match.setPieceView(camDesired, focusV)) {
    if (camSnap || !spCam) { camera.position.copy(camDesired); camLook.copy(focusV); }
    spCam = true;
    camera.position.lerp(camDesired, 1 - Math.exp(-dt * 4));
    camLook.lerp(focusV, 1 - Math.exp(-dt * 6));
    camera.lookAt(camLook);
    camSnap = false;
    return;
  }
  if (spCam) { spCam = false; camSnap = true; }
  match.focus(focusV);
  if (c.pro) { proCamera(dt, c); return; }
  // look ahead in the direction of play, like a TV director
  if (match.possTeam && match.phase === 'play') focusV.x += match.possTeam.dir * 3.5;
  let zoom = 1;
  if (match.phase === 'goal') zoom = 0.55;
  else if (match.phase === 'restart' && match.restart && match.restart.type === 'corner') zoom = 0.92;
  else zoom = 1 + clamp((match.ball.speed - 12) / 60, 0, 0.12); // pull back a touch on long balls
  if (c.dynamic && match.phase === 'play') {
    // tighter near the box and when dribbling, wider for long balls and transitions
    const nearGoal = clamp(1 - (F.HL - Math.abs(match.ball.pos.x)) / 30, 0, 1);
    const owner = match.ball.owner;
    const slow = owner ? clamp(1 - Math.hypot(owner.vel.x, owner.vel.z) / 7, 0, 1) : 0;
    dynZoom += ((1.05 - nearGoal * 0.28 - slow * 0.12 + clamp((match.ball.speed - 14) / 40, 0, 0.25)) - dynZoom) * Math.min(1, dt * 1.5);
    zoom *= dynZoom;
  }
  if (camSnap) { camTarget.copy(focusV); camVel.set(0, 0, 0); posVel.set(0, 0, 0); }
  smoothDamp(camTarget, camVel, focusV, 0.32, dt);
  const tx = clamp(camTarget.x, -F.HL + 6, F.HL - 6);
  camDesired.set(tx * 0.97, c.h * zoom, Math.min(camTarget.z * 0.5 + c.back * zoom, F.HW + 28));
  if (camSnap) camera.position.copy(camDesired);
  else smoothDamp(camera.position, posVel, camDesired, 0.45, dt);
  camLook.set(camTarget.x, 0.4, camTarget.z + 0.5);
  camera.lookAt(camLook);
  camSnap = false;
}

let dynZoom = 1;
// end-to-end camera: always behind ZorpFC's attack, so "up" on the joystick is towards their goal
function proCamera(dt, c) {
  const dir = match.home.dir;
  if (camSnap) { camTarget.copy(focusV); camVel.set(0, 0, 0); posVel.set(0, 0, 0); }
  smoothDamp(camTarget, camVel, focusV, 0.28, dt);
  camDesired.set(camTarget.x - dir * c.back, c.h, camTarget.z * 0.85);
  if (camSnap) camera.position.copy(camDesired);
  else smoothDamp(camera.position, posVel, camDesired, 0.35, dt);
  camLook.set(camTarget.x + dir * 9, 0.5, camTarget.z);
  camera.lookAt(camLook);
  camSnap = false;
}

// critically damped spring (Unity-style SmoothDamp) — no overshoot, no jitter
const camVel = new THREE.Vector3(), posVel = new THREE.Vector3();
function smoothDamp(cur, vel, target, time, dt) {
  const w = 2 / time, x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (const k of ['x', 'y', 'z']) {
    const ch = cur[k] - target[k];
    const tmp = (vel[k] + w * ch) * dt;
    vel[k] = (vel[k] - w * tmp) * e;
    cur[k] = target[k] + (ch + tmp) * e;
  }
}

// ---------------------------------------------------------------- HUD
let lastMode = '';
let lastCtl = null;
const LABELS = {
  attack: { pass: 'PASS', shoot: 'SHOOT', through: 'THROUGH', skill: 'SKILL', sprint: 'SPRINT' },
  defend: { pass: 'SWITCH', shoot: 'TACKLE', through: '2ND PRESS', skill: 'SLIDE', sprint: 'PRESS' },
};
const btnSpans = {};
document.querySelectorAll('[data-btn]').forEach(b => { btnSpans[b.dataset.btn] = b.querySelector('span'); });
const projV = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0;

function updateHUD(dt) {
  if (!match || !(state === 'game' || state === 'intro' || state === 'paused')) return;
  ui.scH.textContent = match.home.score;
  ui.scA.textContent = match.away.score;
  const m = match.minute;
  const mm = Math.floor(m), ss = Math.floor((m - mm) * 60);
  ui.clock.textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');

  ui.controls.classList.toggle('celebrating', match.phase === 'goal');
  ui.hud.classList.toggle('celebrating', match.phase === 'goal'); // a clear view of the celebration
  const mode = match.uiMode();
  if (mode !== lastMode) {
    lastMode = mode;
    for (const k in LABELS[mode]) btnSpans[k].textContent = LABELS[mode][k];
    ui.controls.classList.toggle('defend', mode === 'defend');
  }
  const c = match.home.controlled;
  if (c && c !== lastCtl) {
    lastCtl = c;
    ui.ptNum.textContent = c.num;
    ui.ptName.textContent = c.name;
  }
  if (c) ui.stamina.style.width = Math.round(c.stamina * 100) + '%';

  if (c && c.charging) {
    projV.set(c.pos.x, 2.9, c.pos.z).project(camera);
    ui.power.style.display = 'block';
    ui.power.style.left = ((projV.x + 1) / 2 * window.innerWidth) + 'px';
    ui.power.style.top = ((1 - projV.y) / 2 * window.innerHeight) + 'px';
    ui.powerFill.style.width = Math.round(c.charge * 100) + '%';
    ui.power.classList.toggle('chip', !!c.chipping);
    if (c.shotKind && c.shotKind !== 'normal') ui.power.dataset.kind = c.shotKind; else delete ui.power.dataset.kind;
  } else ui.power.style.display = 'none';

  if (settings.radar) drawRadar();
  if (settings.fps) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { $('fps').textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; }
  }
}

function drawRadar() {
  const W = ui.radar.width, H = ui.radar.height;
  const g = rctx;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(8, 40, 30, 0.72)';
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 2;
  const pad = 6;
  const sx = (W - pad * 2) / (F.HL * 2), sz = (H - pad * 2) / (F.HW * 2);
  g.beginPath(); g.roundRect ? g.roundRect(1, 1, W - 2, H - 2, 12) : g.rect(1, 1, W - 2, H - 2); g.fill();
  g.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  g.beginPath(); g.moveTo(W / 2, pad); g.lineTo(W / 2, H - pad); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, F.CIRCLE * sx, 0, Math.PI * 2); g.stroke();
  const bw = F.BOX_L * sx, bh = F.BOX_W * 2 * sz;
  g.strokeRect(pad, H / 2 - bh / 2, bw, bh);
  g.strokeRect(W - pad - bw, H / 2 - bh / 2, bw, bh);
  const X = x => pad + (x + F.HL) * sx, Z = z => pad + (z + F.HW) * sz;
  const ctl = match.home.controlled;
  for (const p of match.players) {
    g.fillStyle = p.team.cfg.kit.shirt; // dots in each team's match kit
    g.beginPath(); g.arc(X(p.pos.x), Z(p.pos.z), p === ctl ? 5.5 : 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = p === ctl ? '#fff' : 'rgba(0,0,0,.55)'; g.lineWidth = p === ctl ? 2 : 1; g.stroke();
  }
  const b = match.ball.pos;
  g.fillStyle = '#ffe14a';
  g.beginPath(); g.arc(X(b.x), Z(b.z), 3.5, 0, Math.PI * 2); g.fill();
}

// ---------------------------------------------------------------- loop
showScreen('boot');
boot();

let last = performance.now();
const focusDefault = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  input.update(dt);
  if (state === 'intro') {
    introT += dt;
    if (introT > INTRO_DUR) beginKickoff();
  }
  if (match && (state === 'game' || state === 'intro' || state === 'menu' || state === 'result' || state === 'title')) match.update(dt, input);
  if (stadium) {
    if (match && match.netBulge && !match.netBulge.done) { match.netBulge.done = true; stadium.netHit(match.netBulge.s); }
    stadium.update(dt, match ? match.excite : 0, state === 'game' ? camTarget : focusDefault);
  }
  sound.update(match && state === 'game' ? match.excite : 0);
  updateCamera(dt);
  if (match) {
    camera.getWorldDirection(camFwdV);
    camFwdV.y = 0;
    if (camFwdV.lengthSq() > 1e-4) { camFwdV.normalize(); match.camFwd = camFwdV; }
  }
  updateHUD(dt);
  // the 3D scene is hidden behind the boot / loading screens: skip rendering it there
  if (state !== 'boot' && state !== 'title' && state !== 'prematch') renderer.render(scene, camera);
  input.endFrame();
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {}));
  // a new version took over: reload once so it's what you're playing
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}

// debug handle for automated testing
window.__sb27 = {
  get match() { return match; }, get state() { return state; }, input, camera, renderer, settings,
  get stadium() { return stadium; }, skipIntro() { introT = 99; }, startGame: () => startPrematch(), startDrill: k => startDrill(k), setSetting,
  skipBoot() { if (state === 'title') { sound.init(); goMenu(); } },
  showLineups() { renderLineups(); showScreen('prematch'); $('prematch').classList.add('ready'); },
};
