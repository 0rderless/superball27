import * as THREE from '../lib/three.module.min.js';
import { buildStadium } from './stadium.js';
import { Match } from './match.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { F } from './config.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const store = {
  get(k, d) { try { const v = localStorage.getItem('sb27.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('sb27.' + k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};

const weakDevice = (navigator.hardwareConcurrency || 4) <= 4 && /Android/i.test(navigator.userAgent);
const settings = {
  difficulty: store.get('difficulty', 'pro'),
  minutes: store.get('minutes', 6),
  camera: store.get('camera', 'broadcast'),
  graphics: store.get('graphics', weakDevice ? 'low' : 'high'),
  autoSprint: true,
  sound: store.get('sound', true),
  assist: store.get('assist', 'on'),
};
const applyAssist = () => { settings.passAssist = settings.autoSwitch = settings.assist !== 'off'; };
applyAssist();

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
sound.muted = !settings.sound;
const input = new Input();

// ---------------------------------------------------------------- UI hooks
const ui = {
  fade: $('fade'), banner: $('banner'), event: $('event'), hint: $('hint'),
  scH: $('sc-h'), scA: $('sc-a'), clock: $('clock'), radar: $('radar'),
  ptNum: $('pt-num'), ptName: $('pt-name'), stamina: $('stamina').firstElementChild,
  power: $('power'), powerFill: $('power').firstElementChild, controls: $('controls'),
};
const rctx = ui.radar.getContext('2d');
let camSnap = false;
let bannerTimer = 0, eventTimer = 0;

const hooks = {
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
    if (stadium) stadium.confetti(c.x, c.z, team.isUser ? ['#1d5cff', '#ffffff', '#ffd21f', '#4f86ff'] : ['#e0202a', '#ffd23f', '#8e0a12']);
    hooks.banner('GOAL!', `${name}  ${match.home.score} - ${match.away.score}`, 4200, team.isUser ? 'home' : 'away');
    if (navigator.vibrate) try { navigator.vibrate(team.isUser ? [60, 40, 120] : 40); } catch (_) { /* ignore */ }
  },
  fullTime() {
    hooks.banner('FULL TIME', `${match.home.cfg.name} ${match.home.score} - ${match.away.score} ${match.away.cfg.name}`, 2600);
    setTimeout(showResult, 2800);
  },
};

// ---------------------------------------------------------------- match lifecycle
let match = null;
let state = 'menu'; // menu | intro | game | paused | result
let introT = 0;

function newMatch() {
  if (match) match.dispose();
  match = new Match(scene, sound, settings, hooks);
}

function showScreen(id) {
  for (const s of ['menu', 'pause', 'result']) $(s).classList.toggle('hidden', s !== id);
  const inGame = id === null || id === 'pause';
  $('hud').classList.toggle('hidden', !inGame && id !== 'result');
  ui.controls.classList.toggle('hidden', id !== null);
}

function startGame() {
  sound.init();
  applyGraphics();
  newMatch();
  input.reset();
  state = 'intro';
  introT = 0;
  match.phase = 'intro';
  showScreen(null);
  ui.controls.classList.add('hidden');
  hooks.hint('');
  hooks.banner('ZorpFC', 'vs  Varcelona', 2600, 'home');
  sound.applause();
  requestFullscreen();
  requestWakeLock();
}

function beginKickoff() {
  state = 'game';
  ui.controls.classList.remove('hidden');
  match.startMatch();
  camSnap = true;
}

function showResult() {
  if (!match || state === 'menu') return;
  state = 'result';
  const h = match.home.score, a = match.away.score;
  $('ft-h').textContent = h;
  $('ft-a').textContent = a;
  $('ft-msg').textContent = h > a ? 'ZORPFC WIN!' : h < a ? 'VARCELONA WIN' : 'DRAW';
  const st = match.stats;
  const total = st.home.poss + st.away.poss || 1;
  const rows = [
    [Math.round(st.home.poss / total * 100) + '%', 'Possession', Math.round(st.away.poss / total * 100) + '%'],
    [st.home.shots, 'Shots', st.away.shots],
    [st.home.on, 'On target', st.away.on],
    [st.home.passes, 'Passes', st.away.passes],
  ];
  $('ft-stats').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  showScreen('result');
  $('hud').classList.add('hidden');
}

function toMenu() {
  state = 'menu';
  newMatch();
  showScreen('menu');
  $('hud').classList.add('hidden');
}

function pause() {
  if (state !== 'game') return;
  state = 'paused';
  input.reset();
  showScreen('pause');
}
function resume() {
  if (state !== 'paused') return;
  state = 'game';
  showScreen(null);
}

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

// ---------------------------------------------------------------- menu wiring
function syncOptions() {
  document.querySelectorAll('.opt').forEach(o => {
    const k = o.dataset.opt;
    o.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[k]) === b.dataset.v));
  });
}
document.querySelectorAll('.opt').forEach(o => {
  const k = o.dataset.opt;
  o.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    settings[k] = k === 'minutes' ? Number(b.dataset.v) : b.dataset.v;
    store.set(k, settings[k]);
    syncOptions();
    if (k === 'graphics') { applyGraphics(); newMatch(); }
    if (k === 'assist') applyAssist();
  }));
});
syncOptions();

$('play-btn').addEventListener('click', startGame);
$('pause-btn').addEventListener('click', pause);
$('resume-btn').addEventListener('click', resume);
$('restart-btn').addEventListener('click', startGame);
$('quit-btn').addEventListener('click', toMenu);
$('again-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', toMenu);
const soundBtn = $('sound-btn');
const syncSound = () => { soundBtn.textContent = 'Sound: ' + (settings.sound ? 'On' : 'Off'); };
soundBtn.addEventListener('click', () => {
  settings.sound = !settings.sound;
  store.set('sound', settings.sound);
  sound.setMuted(!settings.sound);
  syncSound();
});
syncSound();
window.addEventListener('keydown', e => {
  if (e.code === 'Escape' || e.code === 'KeyP') state === 'game' ? pause() : state === 'paused' && resume();
});
// skip intro with a tap
window.addEventListener('pointerdown', () => { if (state === 'intro' && introT > 0.6) introT = 99; });

const standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
if (standalone) $('install-tip').classList.add('hidden');

// ---------------------------------------------------------------- camera
const CAMS = {
  close: { h: 9.5, back: 15.5, fov: 40 },
  broadcast: { h: 13, back: 22, fov: 40 },
  wide: { h: 20, back: 31, fov: 42 },
};
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();
const focusV = new THREE.Vector3();
const camDesired = new THREE.Vector3();
let menuT = 0;

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
  if (state === 'menu') {
    menuT += dt * 0.06;
    setFov(42);
    camera.position.set(Math.sin(menuT) * 62, 22 + Math.sin(menuT * 0.7) * 5, Math.cos(menuT) * 48);
    camera.lookAt(0, 2, 0);
    return;
  }
  const c = CAMS[settings.camera] || CAMS.broadcast;
  setFov(c.fov);
  if (state === 'intro') {
    const t = clamp(introT / 3.4, 0, 1);
    const e = t * t * (3 - 2 * t);
    const a = -0.9 + e * 0.9;
    const r = 75 - e * (75 - c.back);
    camera.position.set(Math.sin(a) * r * 1.2, 34 - e * (34 - c.h), Math.cos(a) * r);
    camera.lookAt(0, 0, 0);
    camTarget.set(0, 0, 0);
    camLook.set(0, 0, 0);
    return;
  }
  match.focus(focusV);
  let zoom = 1;
  if (match.phase === 'goal') zoom = 0.55;
  else if (match.phase === 'restart' && match.restart && match.restart.type === 'corner') zoom = 0.92;
  const k = camSnap ? 1 : 1 - Math.exp(-dt * 3.2);
  camTarget.lerp(focusV, k);
  const tx = clamp(camTarget.x, -F.HL + 6, F.HL - 6);
  camDesired.set(tx * 0.97, c.h * zoom, Math.min(camTarget.z * 0.5 + c.back * zoom, F.HW + 28));
  camera.position.lerp(camDesired, camSnap ? 1 : 1 - Math.exp(-dt * 2.6));
  camLook.lerp(focusV.set(camTarget.x, 0.4, camTarget.z + 0.5), camSnap ? 1 : 1 - Math.exp(-dt * 5));
  camera.lookAt(camLook);
  camSnap = false;
}

// ---------------------------------------------------------------- HUD
let lastMode = '';
let lastCtl = null;
const LABELS = {
  attack: { pass: 'PASS', shoot: 'SHOOT', through: 'THROUGH', skill: 'SKILL' },
  defend: { pass: 'SWITCH', shoot: 'TACKLE', through: 'PRESS', skill: 'SLIDE' },
};
const btnSpans = {};
document.querySelectorAll('[data-btn]').forEach(b => { btnSpans[b.dataset.btn] = b.querySelector('span'); });
const projV = new THREE.Vector3();

function updateHUD() {
  if (!match || state === 'menu') return;
  ui.scH.textContent = match.home.score;
  ui.scA.textContent = match.away.score;
  const m = match.minute;
  const mm = Math.floor(m), ss = Math.floor((m - mm) * 60);
  ui.clock.textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');

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
  } else ui.power.style.display = 'none';

  drawRadar();
}

function drawRadar() {
  const W = ui.radar.width, H = ui.radar.height;
  const g = rctx;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(10, 60, 30, 0.72)';
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2;
  const pad = 6;
  const sx = (W - pad * 2) / (F.HL * 2), sz = (H - pad * 2) / (F.HW * 2);
  g.beginPath(); g.roundRect ? g.roundRect(1, 1, W - 2, H - 2, 10) : g.rect(1, 1, W - 2, H - 2); g.fill();
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
applyGraphics();
newMatch();
showScreen('menu');
$('hud').classList.add('hidden');

let last = performance.now();
const focusDefault = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  input.update(dt);
  if (state === 'intro') {
    introT += dt;
    if (introT > 3.4) beginKickoff();
  }
  if (match && state !== 'paused') match.update(dt, input);
  if (stadium) {
    if (match && match.netBulge && !match.netBulge.done) { match.netBulge.done = true; stadium.netHit(match.netBulge.s); }
    stadium.update(dt, match ? match.excite : 0, state === 'game' ? camTarget : focusDefault);
  }
  sound.update(match && state === 'game' ? match.excite : 0);
  updateCamera(dt);
  updateHUD();
  renderer.render(scene, camera);
  input.endFrame();
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// debug handle for automated testing
window.__sb27 = { get match() { return match; }, get state() { return state; }, startGame, input, camera, renderer, get stadium() { return stadium; }, skipIntro() { introT = 99; } };
