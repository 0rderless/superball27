import * as THREE from '../lib/three.module.min.js';
import { buildStadium } from './stadium.js';
import { Match } from './match.js';
import { loadPlayerAssets } from './model.js';
import { Commentary } from './commentary.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { F, DIFFICULTY, DIFF_KEYS, TEAMS, FORMATIONS } from './config.js';
import { CLUBS, teamConfig, crestSVG } from './clubs.js';
import * as SQ from './squad.js';
import { card, clubCard, avatar } from './cards.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
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
  passAssist: legacyAssist, autoSwitch: legacyAssist, autoSprint: true, defAssist: true,
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
  'Push the joystick to the edge to sprint — ZorpFC never tire.',
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
let camSnap = false;
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
  },
  fullTime() {
    hooks.banner('FULL TIME', `${match.home.cfg.name} ${match.home.score} - ${match.away.score} ${match.away.cfg.name}`, 2600);
    setTimeout(showResult, 2800);
  },
};

// ---------------------------------------------------------------- state
let match = null;
let state = 'boot'; // boot | title | menu | prematch | intro | game | paused | result
let introT = 0;
let assetsReady = false;

function newMatch() {
  if (!assetsReady) return;
  if (match) match.dispose();
  TEAMS.home.players = SQ.lineupForMatch(); // your starting XI from Squad
  TEAMS.home.formation = SQ.formationName();
  TEAMS.away = teamConfig(opponent);
  match = new Match(scene, sound, settings, hooks);
  match.diff = effDiff();
  syncOpponentUI();
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
  $('sb-away-col').style.background = opponent.color;
  $('sb-away-col').style.color = opponent.color;
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
  goalCardTimer = setTimeout(() => el.classList.remove('show'), 3200);
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

let coinShown = null;
function updateCoins() {
  const c = SQ.profile().coins;
  $('coins').textContent = c.toLocaleString('en-US');
  if (coinShown !== null && c !== coinShown) { const el = $('coins').parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  coinShown = c;
  $('shop-dot').classList.toggle('on', SQ.dailyReady());
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
  det.innerHTML = `${card(focus)}<div class="sd-info"><h3>${p.name}</h3><div class="sub">${p.pos} · #${p.num} · ${SQ.ovr(focus)} OVR${p.star ? ' · SUPERSTAR' : ''}</div>
    <div class="attr-list">${keys.map(k => {
      const v = a[k], lv = SQ.attrLevel(focus, k), cost = SQ.trainCost(focus, k), can = SQ.canTrain(focus, k);
      return `<div class="attr">${SQ.ATTR_NAME[k]}<i style="--v:${v}%"><u style="--b:${v - lv}%;--u:${lv}%"></u></i><b>${v}</b>${can
        ? `<button data-train="${k}" ${SQ.profile().coins < cost ? 'disabled' : ''}><svg class="ico"><use href="#i-coin"/></svg>${cost >= 1000 ? (cost / 1000).toFixed(1) + 'k' : cost}</button>`
        : '<button class="max" disabled>MAX</button>'}</div>`;
    }).join('')}</div></div>`;
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
  const items = SQ.SHOP.filter(id => shopFilter === 'all' || GROUP[SQ.DB[id].pos] === shopFilter);
  $('shop-grid').innerHTML = items.map(id => {
    const p = SQ.DB[id], owned = pr.owned.includes(id);
    const btn = owned ? `<button class="buy owned" disabled><svg class="ico"><use href="#i-check"/></svg>OWNED</button>`
      : confirmId === id ? `<button class="buy confirm" data-buy="${id}">CONFIRM</button>`
      : `<button class="buy" data-buy="${id}" ${pr.coins < p.price ? 'disabled' : ''}>${coin(p.price)}</button>`;
    return `<div class="shop-item">${card(id)}${btn}</div>`;
  }).join('');
  const d = $('daily-btn');
  d.disabled = !SQ.dailyReady();
  $('daily-txt').textContent = SQ.dailyReady() ? 'Claim daily 750' : 'Daily claimed';
}
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

$('play-btn').addEventListener('click', () => { if (match && state === 'menu') startMatchmaking(); });
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
  const away = teamConfig(opponent);
  const awayF = FORMATIONS[away.formation] || FORMATIONS['4-3-3'];
  const ink = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 165 ? '#111' : '#fff'; };
  const pos = (sl, mirror) => {
    const x = 4 + sl.a / 0.72 * 42, y = 50 + sl.c * 40;
    return mirror ? [100 - x, 100 - y] : [x, y];
  };
  let html = '', k = 0;
  pr.lineup.forEach((id, i) => {
    const p = SQ.DB[id], [x, y] = pos(homeF[i], false);
    html += `<div class="lu${p.star ? ' star' : ''}" style="left:${x}%;top:${y}%;--ring:#2a6bff;animation-delay:${(k++) * 40}ms"><div class="lu-face">${avatar(p)}</div><span class="lu-num">${p.num}</span><b>${p.name.split(' ').slice(-1)[0]}</b></div>`;
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
  $('ft-msg').textContent = h > a ? 'ZORPFC WIN!' : h < a ? `${opponent.name.toUpperCase()} WIN` : 'IT\'S A DRAW';
  const st = match.stats;
  const total = st.home.poss + st.away.poss || 1;
  const rows = [
    [Math.round(st.home.poss / total * 100), 'Possession', Math.round(st.away.poss / total * 100), '%'],
    [st.home.shots, 'Shots', st.away.shots, ''],
    [st.home.on, 'On target', st.away.on, ''],
    [st.home.passes, 'Passes', st.away.passes, ''],
  ];
  $('ft-stats').innerHTML = rows.map(([hv, label, av, u]) => {
    const t = (hv + av) || 1;
    return `<div class="st-row"><span>${hv}${u}</span><div class="bar"><i class="h" style="width:${hv / t * 100}%"></i><i class="a" style="width:${av / t * 100}%"></i><span>${label}</span></div><span>${av}${u}</span></div>`;
  }).join('');
  if (!match.rewarded) {
    match.rewarded = true;
    const r = SQ.matchRewards(h, a, settings.difficulty, opponent.ovr);
    $('ft-rewards').innerHTML = r.lines.map(([l, v]) => `<span>${l} +${v}</span>`).join('') + `<span class="total"><svg class="ico"><use href="#i-coin"/></svg>+${r.total}</span>`;
  }
  showScreen('result');
  ui.hud.classList.add('hidden');
}

// ---------------------------------------------------------------- pause
function pause() {
  if (state !== 'game') return;
  state = 'paused';
  commentary.stop();
  input.reset();
  $('pp-score').textContent = `${match.home.score} - ${match.away.score}`;
  $('pp-time').textContent = ui.clock.textContent;
  buildCamStrip();
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
$('restart-btn').addEventListener('click', () => { closeModals(); startPrematch(); });

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
$('again-btn').addEventListener('click', () => startMatchmaking());
$('menu-btn').addEventListener('click', () => goMenu());

// ---------------------------------------------------------------- settings panel (built from a schema)
const SCHEMA = [
  { tab: 'Gameplay', key: 'difficulty', label: 'Difficulty', type: 'seg', options: DIFF_KEYS.map(k => [k, DIFFICULTY[k].label]) },
  { tab: 'Gameplay', key: 'minutes', label: 'Match length', desc: 'Applies to the next match', type: 'seg', options: [[4, '4 min'], [6, '6 min'], [10, '10 min']] },
  { tab: 'Gameplay', key: 'passAssist', label: 'Pass assist', desc: 'Passes go to who you aim at and follow him', type: 'toggle' },
  { tab: 'Gameplay', key: 'autoSwitch', label: 'Auto switch', desc: 'Control the closest defender automatically', type: 'toggle' },
  { tab: 'Gameplay', key: 'autoSprint', label: 'Auto sprint', desc: 'Push the joystick to the edge to sprint', type: 'toggle' },
  { tab: 'Gameplay', key: 'defAssist', label: 'Defence assist', desc: 'Hold SPRINT (no stick) to press and contain the man on the ball', type: 'toggle' },
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
function closeModals() { for (const id of ['settings', 'help']) $(id).classList.add('hidden'); }
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) { m.classList.add('hidden'); if (state === 'paused') buildCamStrip(); } });
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
    g.fillStyle = p.team.isUser ? '#3d7bff' : '#ff3b3b';
    g.beginPath(); g.arc(X(p.pos.x), Z(p.pos.z), p === ctl ? 5.5 : 4, 0, Math.PI * 2); g.fill();
    if (p === ctl) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
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
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// debug handle for automated testing
window.__sb27 = {
  get match() { return match; }, get state() { return state; }, input, camera, renderer, settings,
  get stadium() { return stadium; }, skipIntro() { introT = 99; }, startGame: () => startPrematch(), setSetting,
  skipBoot() { if (state === 'title') { sound.init(); goMenu(); } },
  showLineups() { renderLineups(); showScreen('prematch'); $('prematch').classList.add('ready'); },
};
