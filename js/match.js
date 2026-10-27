import * as THREE from '../lib/three.module.min.js';
import { F, BALL_R, GRAVITY, FORMATIONS, FORMATION, kickoffShape, DIFFICULTY, TEAMS } from './config.js';
import { createPlayerModel, animateModel, disposePlayerModel } from './model.js';
import { Ball } from './ball.js';
import { advanceGait, slotDistance, planTouch, ROLL_DECEL, FOOT_REACH, exposure, tackleOutcome } from './dribble.js';
import { foulChance, fromBehind, cardFor, restartForFoul, wallSpots, isDogso, secondLastX, offsidePosition } from './rules.js';
import { aimCurl, fly } from './setpiece.js';
import { CELEB, pickCeleb, celebLength } from './celebrations.js';
import { Shootout } from './shootout.js';
import { xg as shotXg } from './facts.js';

const V3 = THREE.Vector3;
const { HL, HW, GW, GH, GD } = F;
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73;
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const RUN = 6.3, SPRINT = 8.7;
const PRED_N = 30, PRED_DT = 0.1;
const FORWARDS = new Set(['LW', 'ST', 'RW']);
const DEFENDERS = new Set(['LB', 'CB', 'RB', 'LWB', 'RWB']);
const ATT_MIDS = new Set(['CM', 'CAM', 'LM', 'RM']);
// role order for picking a striker / attackers
const ATTACK_ORDER = ['ST', 'CAM', 'LW', 'RW', 'LM', 'RM', 'CM'];

// ---------------------------------------------------------------------------
class Player {
  constructor(match, team, data, idx) {
    this.m = match;
    this.team = team;
    this.data = data;
    this.st = data.st;
    this.idx = idx;
    this.slot = team.formation[idx];
    this.role = this.slot.role;
    this.isGK = this.role === 'GK';
    this.name = data.name;
    this.num = data.num;
    this.pos = new V3();
    this.vel = new V3();
    this.desired = new V3();
    this.facing = 0;
    this.fwd = new V3(0, 0, 1);
    this.faceTo = null;
    const kit = this.isGK ? team.cfg.gkKit : team.cfg.kit;
    this.model = createPlayerModel({ kit, skin: data.skin, hair: data.hair, style: data.style, number: data.num, teamTag: team.cfg.short });
    match.scene.add(this.model.root);
    this.a = {
      speed: 0, phase: Math.random() * 6, kickT: -1, kickPow: 0.5, tackleT: -1, slideT: -1, diveT: -1, diveSide: 1, diveHigh: false,
      headerT: -1, throwT: -1, throwReady: false, celebrate: 0, celebrateStyle: 0, celebKind: null, celebT: -1, celebClipName: null, sad: 0, hold: false, ready: false,
      hitT: -1, hitBig: false, touchT: -1, touchSide: 0, touchFoot: 'R', gait: Math.random(), strike: null, skillT: -1, skillType: 'tap', skillSide: 1, moveAngle: 0, turnRate: 0, celebClip: 0, sadClip: 0,
    };
    this.busy = 0;
    this.action = null;
    this.actionT = 0;
    this.lockFacing = null;
    this.cool = 0;
    this.stun = 0;
    this.stamina = 1;
    this.sprint = false;
    this.pending = null;
    this.think = Math.random() * 0.5;
    this.runT = 0;
    this.recv = null;
    this.tackleCD = 0;
    this.tackleDone = false;
    this.idleT = 9;
    this.manual = false;
    this.dribbleDir = new V3(team.dir, 0, 0);
    this.charge = 0;
    this.charging = false;
    this.skillT = 0;
    this.holdT = 0;
    this.save = null;
    this.lastKickSeen = -1;
    this.ms = { goals: 0, assists: 0, shots: 0, onTarget: 0, passes: 0, passAtt: 0, tackles: 0, intercepts: 0, saves: 0, conceded: 0, yellow: 0, red: 0, xg: 0, headers: 0, skills: 0, dist: 0, topSpd: 0 };
  }

  maxSpeed(sprint) {
    let v = (sprint ? SPRINT : RUN) * (0.86 + 0.18 * this.st.spd);
    if (this.m.ball.owner === this) v *= sprint ? 0.93 : 0.96;
    v *= 0.86 + 0.14 * this.stamina;
    if (!this.team.isUser) v *= this.m.diff.speed;
    if (this.isGK) v *= 0.92;
    return v;
  }

  goTo(target, speed, arrive = 2.5) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) { this.desired.set(0, 0, 0); this.sprint = false; return d; }
    const s = Math.min(speed, speed * d / arrive + 0.3);
    this.desired.set(dx / d * s, 0, dz / d * s);
    this.sprint = speed > RUN * 1.02;
    return d;
  }

  // jog/run/sprint picked by distance
  goToAuto(target, urgent = false) {
    const d = hdist(this.pos, target);
    const sp = urgent || d > 9 ? this.maxSpeed(true) : d > 3 ? this.maxSpeed(false) : this.maxSpeed(false) * 0.6;
    return this.goTo(target, sp, urgent ? 1 : 3);
  }
}

// ---------------------------------------------------------------------------
class Team {
  constructor(match, key, isUser, dir) {
    this.m = match;
    this.key = key;
    this.cfg = TEAMS[key];
    this.isUser = isUser;
    this.dir = dir;
    this.score = 0;
    this.controlled = null;
    this.callPress = false;
    this.formationName = FORMATIONS[this.cfg.formation] ? this.cfg.formation : '4-3-3';
    this.formation = FORMATIONS[this.formationName];
    this.kickoff = kickoffShape(this.formation);
    this.players = this.cfg.players.map((d, i) => new Player(match, this, d, i));
    this.opp = null;
  }
  get gk() { return this.players[0]; }
  // best available player for a role list (e.g. the striker)
  byRoles(roles, exclude = null) {
    for (const r of roles) { const p = this.players.filter(q => q.role === r && q !== exclude); if (p.length) return p[p.length - 1]; }
    return this.players[this.players.length - 1];
  }
  get striker() { return this.byRoles(ATTACK_ORDER); }
  get forwards() { const f = this.players.filter(q => FORWARDS.has(q.role) || q.role === 'CAM'); return f.length ? f : [this.striker]; }
  get goalX() { return -this.dir * HL; }
  get attackX() { return this.dir * HL; }
  world(a, c, out = new V3()) { return out.set(this.dir * (a * 2 * HL - HL), 0, this.dir * c * HW); }
  along(p) { return (p.x * this.dir + HL) / (2 * HL); }
  across(p) { return p.z * this.dir / HW; }
  inOwnBox(p, m = 0) { return Math.abs(p.x - this.goalX) < F.BOX_L + m && Math.abs(p.z) < F.BOX_W + m; }
}

// ---------------------------------------------------------------------------
export class Match {
  constructor(scene, sound, settings, hooks) {
    this.scene = scene;
    this.sound = sound;
    this.settings = settings;
    this.hooks = hooks;
    this.diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.pro;
    this.halfLen = settings.minutes * 60 / 2;
    this.high = settings.graphics === 'high';
    this.ball = new Ball(scene, this.high);
    this.ball.onBounce = v => { if (v > 3) sound.thud(v); };
    this.home = new Team(this, 'home', true, 1);
    this.away = new Team(this, 'away', false, -1);
    this.home.opp = this.away;
    this.away.opp = this.home;
    this.players = [...this.home.players, ...this.away.players];
    this.pred = Array.from({ length: PRED_N }, () => new V3());
    this.phase = 'menu';
    this.phaseT = 0;
    this.half = 1;
    this.clock = 0;
    this.time = 0;
    const blank = () => ({ shots: 0, on: 0, poss: 0, passes: 0, passCmp: 0, fouls: 0, yellows: 0, reds: 0, offsides: 0, xg: 0, big: 0, blocked: 0, woodwork: 0, saves: 0, headers: 0, through: 0, long: 0, skills: 0, tackles: 0, intercepts: 0, corner: 0, freekick: 0, penalty: 0, throw: 0, goalkick: 0, dist: 0, topSpd: 0 });
    this.stats = { home: blank(), away: blank() };
    this.events = []; // goals and cards, for the timeline
    this.sentOff = [];
    this.adv = null;
    this.possTeam = null;
    this.lastTouch = null;
    this.restart = null;
    this.kickId = 0;
    this.lastKick = { kind: null, team: null, id: 0 };
    this.excite = 0;
    this.scorer = null;
    this.stoppage = 0;
    this.objects = [];
    this._interceptCache = new Map();
    this.buildIndicators();
    this.buildShadows();
    this.placeKickoff(this.home);
    this.restart = null;
    this.ball.owner = null;
    this.ball.pos.set(0, BALL_R, 0);
    this.ball.sync(0);
  }

  dispose() {
    for (const p of [...this.players, ...this.sentOff, ...(this.benched || [])]) {
      this.scene.remove(p.model.root);
      disposePlayerModel(p.model);
    }
    this.scene.remove(this.ball.mesh, this.ball.shadow);
    for (const o of this.objects) this.scene.remove(o);
  }

  // ---------------------------------------------------------------- visuals
  buildIndicators() {
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x45e0ff, transparent: true, opacity: 0.9, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 3;
    const arrowGeo = new THREE.ConeGeometry(0.22, 0.42, 3);
    arrowGeo.rotateX(Math.PI);
    this.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x45e0ff }));
    this.recvRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.recvRing.rotation.x = -Math.PI / 2;
    this.recvRing.renderOrder = 3;
    // aim arrow for set pieces
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.25, 0); shape.lineTo(0.25, 3); shape.lineTo(0.6, 3); shape.lineTo(0, 4.2);
    shape.lineTo(-0.6, 3); shape.lineTo(-0.25, 3); shape.lineTo(-0.25, 0); shape.lineTo(0, 0);
    const ag = new THREE.ShapeGeometry(shape);
    ag.rotateX(-Math.PI / 2);
    ag.rotateY(Math.PI);
    this.aimArrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
    this.aimArrow.renderOrder = 3;
    for (const o of [this.ring, this.arrow, this.recvRing, this.aimArrow]) { this.scene.add(o); this.objects.push(o); o.visible = false; }
  }

  buildShadows() {
    if (this.high) return;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }), this.players.length);
    this.blobs.renderOrder = 1;
    this.blobs.frustumCulled = false;
    this.scene.add(this.blobs);
    this.objects.push(this.blobs);
    this._m4 = new THREE.Matrix4();
  }

  // ---------------------------------------------------------------- setup
  placeKickoff(kickTeam) {
    for (const t of [this.home, this.away]) {
      t.players.forEach(p => {
        const k = t.kickoff[p.idx];
        t.world(k.a, k.c, p.pos);
        p.vel.set(0, 0, 0);
        p.desired.set(0, 0, 0);
        p.facing = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        p.fwd.set(Math.sin(p.facing), 0, Math.cos(p.facing));
        p.busy = 0; p.action = null; p.pending = null; p.recv = null; p.stun = 0; p.save = null;
        p.lockFacing = null; p.skill = null; p.drib = null; p.exposedT = 0; p.tkSeen = 0; p.containT = 0; p.pokeCD = 0;
        p.a.celebrate = 0; p.a.celebKind = null; p.a.celebT = -1; p.a.celebClipName = null; p.a.sad = 0; p.a.diveT = -1; p.a.slideT = -1; p.a.kickT = -1; p.a.throwReady = false; p.a.hold = false;
      });
    }
    const st = kickTeam.striker, partner = kickTeam.byRoles(ATTACK_ORDER, st);
    st.pos.set(-kickTeam.dir * 0.45, 0, 0.3);
    partner.pos.set(-kickTeam.dir * 1.0, 0, -6);
    this.ball.pos.set(0, BALL_R, 0);
    this.ball.vel.set(0, 0, 0);
    this.ball.owner = st;
    this.ball.held = false;
    this.restart = { type: 'kickoff', team: kickTeam, taker: st, spot: new V3(0, BALL_R, 0), aim: new V3(-kickTeam.dir, 0, 0), wait: 0, ready: true };
    this.possTeam = kickTeam;
    if (kickTeam.isUser) this.home.controlled = st;
    else this.home.controlled = this.home.striker;
  }

  scoreLine() {
    const h = this.home, a = this.away;
    if (h.score === a.score) return `${h.score} all`;
    const [w, l] = h.score > a.score ? [h, a] : [a, h];
    return `${w.cfg.name} lead ${w.score}, ${l.score}`;
  }

  say(key, vars, prio = 1) { if (this.hooks.say) this.hooks.say(key, { t: this.away.cfg.name, h: this.home.score, a: this.away.score, ...(vars || {}) }, prio); }

  startMatch() {
    this.say('kickoff', {}, 3);
    this.phase = 'restart';
    this.phaseT = 0;
    this.placeKickoff(this.home);
    this.hooks.hint('Tap PASS to kick off');
    this.sound.whistle(1);
  }

  // ---------------------------------------------------------------- main update
  update(dt, input) {
    if (this.replay) { this.updateReplay(dt); return; }
    this.time += dt;
    this.phaseT += dt;
    const ball = this.ball;

    for (const p of this.players) {
      p.cool -= dt; p.stun -= dt; p.tackleCD -= dt; p.pokeCD = (p.pokeCD || 0) - dt; p.skillT -= dt; p.skillCD = (p.skillCD || 0) - dt;
      if (p.busy > 0) p.busy -= dt;
    }

    if (ball.owner) {
      const o = ball.owner;
      for (let i = 0; i < PRED_N; i++) this.pred[i].set(o.pos.x + o.vel.x * (i + 1) * PRED_DT, BALL_R, o.pos.z + o.vel.z * (i + 1) * PRED_DT);
    } else ball.predict(this.pred, PRED_N, PRED_DT);
    this._interceptCache.clear();

    const ph = this.phase;
    if (ph === 'play' || ph === 'restart') {
      this.userControl(dt, input);
      this.teamAI(this.home, dt);
      this.teamAI(this.away, dt);
      if (ph === 'restart') this.updateRestart(dt);
    } else if (ph === 'goal') {
      this.celebrationAI(dt);
      if (this.phaseT > this.celebEnd() && !this._transition) {
        this._transition = true;
        // celebration, then the replay, then kick-off
        this.hooks.fade(() => { this._transition = false; if (!this.startReplay()) this.setupKickoff(this.concede); });
      }
    } else if (ph === 'halftime') {
      this.idleAI(dt);
      if (this.phaseT > 4 && !this._transition) {
        this._transition = true;
        this.hooks.fade(() => {
          this._transition = false;
          if (this.half === 1) {
            this.home.dir *= -1; this.away.dir *= -1;
            this.half = 2; this.clock = 0; this.stoppage = 0;
            this.setupKickoff(this.away);
          } else {
            this.half = 3; this.clock = 0; this.stoppage = 0;
            this.setupKickoff(this.home);
          }
        });
      }
    } else if (ph === 'fulltime' || ph === 'menu' || ph === 'intro') {
      this.idleAI(dt);
    }

    this.movePlayers(dt);
    this.updateBall(dt);
    if (this.drill) this.drill.update(dt);
    if (this.phase === 'play') {
      this.userClaim(dt);
      this.updateAdvantage(dt);
      this.ballInteractions(dt);
      this.checkGoalAndOut();
      if (this.possTeam) this.stats[this.possTeam.key].poss += dt;
    }
    if (this.phase === 'play' || this.phase === 'restart') this.updateClock(dt);

    // crowd excitement: ball near a goal
    const dg = HL - Math.abs(ball.pos.x);
    const ex = this.phase === 'goal' ? 1 : clamp(1 - dg / 30, 0, 1) * (Math.abs(ball.pos.z) < 25 ? 1 : 0.5);
    this.excite += (ex - this.excite) * Math.min(1, dt * 2);
    this.chantT = (this.chantT || 20) - dt;
    if (this.chantT <= 0 && this.phase === 'play' && this.possTeam === this.home && this.home.along(ball.pos) > 0.55) { this.chantT = 35 + Math.random() * 25; this.sound.chant(); }

    this.animate(dt);
    this.updateIndicators(dt);
    if (this.phase === 'play' || this.phase === 'restart' || this.phase === 'goal') this.record(dt);
  }

  // ---------------------------------------------------------------- replays
  // Ring buffer of the last ~10 s: ball + every player's root, body offsets and bone rotations.
  initRecorder() {
    const bones = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r',
      'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'];
    this.recBones = bones;
    this.recPer = 9 + bones.length * 4;
    this.recStride = 8 + this.players.length * this.recPer;
    this.recCap = 320; // frames at 30 Hz
    this.recBuf = new Float32Array(this.recCap * this.recStride);
    this.recN = 0;
    this.recHead = 0;
    this.recAcc = 0;
  }

  record(dt) {
    if (!this.recBuf) this.initRecorder();
    this.recAcc += dt;
    if (this.recAcc < 1 / 30) return;
    this.recAcc = 0;
    const B = this.recBuf, o = this.recHead * this.recStride;
    const ball = this.ball, q = ball.mesh.quaternion;
    B[o] = this.time; B[o + 1] = ball.pos.x; B[o + 2] = ball.pos.y; B[o + 3] = ball.pos.z;
    B[o + 4] = q.x; B[o + 5] = q.y; B[o + 6] = q.z; B[o + 7] = q.w;
    let k = o + 8;
    for (const p of this.players) {
      const m = p.model;
      B[k] = p.pos.x; B[k + 1] = p.pos.z; B[k + 2] = p.facing;
      B[k + 3] = m.body.position.x; B[k + 4] = m.body.position.y; B[k + 5] = m.body.rotation.z;
      const pv = m.bones.pelvis.position;
      B[k + 6] = pv.x; B[k + 7] = pv.y; B[k + 8] = pv.z;
      let j = k + 9;
      for (const bn of this.recBones) {
        const bq = m.bones[bn].quaternion;
        B[j] = bq.x; B[j + 1] = bq.y; B[j + 2] = bq.z; B[j + 3] = bq.w;
        j += 4;
      }
      k += this.recPer;
    }
    this.recHead = (this.recHead + 1) % this.recCap;
    this.recN = Math.min(this.recCap, this.recN + 1);
  }

  frameIdx(i) { return ((this.recHead - this.recN + i) % this.recCap + this.recCap) % this.recCap; }

  startReplay() {
    if (!this.recN || this.recN < 40) return false;
    // find the frame where the goal went in
    const B = this.recBuf, S = this.recStride;
    let goalI = this.recN - 1;
    for (let i = 0; i < this.recN; i++) if (B[this.frameIdx(i) * S] >= this.goalTime) { goalI = i; break; }
    const start = Math.max(0, goalI - 150), end = Math.min(this.recN - 1, goalI + 36);
    this.replay = { i: start, start, goalI, end, cam: Math.random() < 0.5 ? 0 : 1 };
    this.ring.visible = this.arrow.visible = this.recvRing.visible = this.aimArrow.visible = false;
    this.hooks.replay(true);
    this.say('replay', {}, 2);
    return true;
  }

  skipReplay() {
    if (!this.replay || this._transition) return;
    this.replay.i = this.replay.end;
  }

  updateReplay(dt) {
    const r = this.replay;
    // real-time build-up, slow motion around the finish
    const toGoal = r.goalI - r.i;
    const speed = toGoal < 45 && toGoal > -25 ? 0.4 : 1;
    r.i = Math.min(r.end, r.i + dt * 30 * speed);
    const i0 = Math.floor(r.i), i1 = Math.min(r.end, i0 + 1), f = r.i - i0;
    this.applyFrame(this.frameIdx(i0), this.frameIdx(i1), f);
    this.updateTrail(dt);
    if (r.i >= r.end && !this._transition) {
      this._transition = true;
      this.hooks.fade(() => {
        this._transition = false;
        this.replay = null;
        this.hooks.replay(false);
        this.setupKickoff(this.concede);
      });
    }
  }

  applyFrame(fa, fb, t) {
    const B = this.recBuf, S = this.recStride;
    const a = fa * S, b = fb * S;
    const L = (x, y) => x + (y - x) * t;
    const ball = this.ball;
    ball.pos.set(L(B[a + 1], B[b + 1]), L(B[a + 2], B[b + 2]), L(B[a + 3], B[b + 3]));
    ball.sync(0);
    const qa = this._qa || (this._qa = new THREE.Quaternion()), qb = this._qb || (this._qb = new THREE.Quaternion());
    qa.set(B[a + 4], B[a + 5], B[a + 6], B[a + 7]); qb.set(B[b + 4], B[b + 5], B[b + 6], B[b + 7]);
    ball.mesh.quaternion.slerpQuaternions(qa, qb, t);
    let ka = a + 8, kb = b + 8, i = 0;
    for (const p of this.players) {
      const m = p.model;
      const fa2 = B[ka + 2], fb2 = B[kb + 2];
      m.root.position.set(L(B[ka], B[kb]), 0, L(B[ka + 1], B[kb + 1]));
      m.root.rotation.y = fa2 + wrap(fb2 - fa2) * t;
      m.body.position.set(L(B[ka + 3], B[kb + 3]), L(B[ka + 4], B[kb + 4]), 0);
      m.body.rotation.set(0, 0, L(B[ka + 5], B[kb + 5]));
      m.bones.pelvis.position.set(L(B[ka + 6], B[kb + 6]), L(B[ka + 7], B[kb + 7]), L(B[ka + 8], B[kb + 8]));
      let ja = ka + 9, jb = kb + 9;
      for (const bn of this.recBones) {
        qa.set(B[ja], B[ja + 1], B[ja + 2], B[ja + 3]); qb.set(B[jb], B[jb + 1], B[jb + 2], B[jb + 3]);
        m.bones[bn].quaternion.slerpQuaternions(qa, qb, t);
        ja += 4; jb += 4;
      }
      if (this.blobs) {
        this._m4.makeScale(1, 1, 1.25);
        this._m4.setPosition(m.root.position.x + 0.15, 0.02, m.root.position.z - 0.1);
        this.blobs.setMatrixAt(i, this._m4);
      }
      ka += this.recPer; kb += this.recPer; i++;
    }
    if (this.blobs) this.blobs.instanceMatrix.needsUpdate = true;
  }

  // cinematic replay cameras: low tracking shot for the build-up, then behind the goal
  replayCamera(pos, look) {
    const r = this.replay, b = this.ball.pos;
    const s = Math.sign(b.x || 1);
    const late = r.i > r.goalI - 40;
    if (late && r.cam === 0) {
      pos.set(s * (HL + 9), 2.6, b.z * 0.25);
      look.set(b.x, 0.8, b.z);
    } else if (late) {
      pos.set(b.x - s * 9, 1.7, b.z + 7);
      look.set(b.x + s * 3, 1.0, b.z);
    } else {
      pos.set(b.x - s * 6, 4.5, b.z + 13);
      look.set(b.x + s * 2, 0.8, b.z);
    }
  }

  updateClock(dt) {
    if (this.drill) return; // skill games keep their own clock
    this.clock += dt;
    if (this.clock < (this.half === 3 ? this.halfLen * 0.5 : this.halfLen)) return;
    const ball = this.ball;
    const danger = HL - Math.abs(ball.pos.x) < 25 && this.phase === 'play';
    this.stoppage += dt;
    if (danger && this.stoppage < 8) return;
    if (this.phase === 'restart' && this.restart && this.restart.type === 'corner' && this.stoppage < 8) return;
    this.sound.whistle(3, true);
    this.restart = null;
    this.hooks.hint('');
    if (this.half === 1) {
      this.phase = 'halftime';
      this.phaseT = 0;
      this.say('halfTime', { s: `${this.home.cfg.name} ${this.home.score}, ${this.away.cfg.name} ${this.away.score}` }, 3);
      this.hooks.banner('HALF TIME', `${this.home.cfg.name} ${this.home.score} - ${this.away.score} ${this.away.cfg.name}`, 3500);
    } else if (this.knockout && this.home.score === this.away.score && this.half === 2) {
      // level after 90 in a cup tie: one period of extra time
      this.phase = 'halftime';
      this.phaseT = 0;
      this.hooks.banner('EXTRA TIME', `${this.home.cfg.name} ${this.home.score} - ${this.away.score} ${this.away.cfg.name}`, 3500);
    } else if (this.knockout && this.home.score === this.away.score) {
      // still level: penalties
      this.phase = 'play';
      new Shootout(this, this.hooks);
    } else {
      this.phase = 'fulltime';
      this.phaseT = 0;
      const h = this.home.score, a = this.away.score;
      this.say(h > a ? 'fullTimeWin' : h < a ? 'fullTimeLose' : 'fullTimeDraw', { s: `${this.home.cfg.name} ${this.home.score}, ${this.away.cfg.name} ${this.away.score}` }, 3);
      this.hooks.fullTime();
    }
    this.sound.applause();
  }

  get minute() {
    if (this.half === 3) return 90 + Math.min(30, this.clock / (this.halfLen * 0.5) * 30);
    const m = Math.min(45, this.clock / this.halfLen * 45) + (this.half - 1) * 45;
    return m;
  }

  // ---------------------------------------------------------------- user control
  userControl(dt, input) {
    const team = this.home, ball = this.ball;
    const p = team.controlled;
    if (!p) return;
    const mag = input.mag;
    // joystick is relative to the camera: up on screen = camera forward along the ground
    const cf = this.camFwd || new V3(0, 0, -1);
    const wdir = new V3(-cf.z * input.move.x + cf.x * input.move.y, 0, cf.x * input.move.x + cf.z * input.move.y);
    if (mag > 0) wdir.normalize();
    const B = input.b;
    const sprint = B.sprint.down || (this.settings.autoSprint && mag > 0.93);
    const r = this.restart;

    if (this.phase === 'restart' && r && r.team === team && r.ready && !r.taker.isGK && p !== r.taker) {
      this.setControlled(r.taker);
      return;
    }
    if (this.phase === 'restart' && r) {
      if (r.team === team && r.taker === p) {
        if (mag > 0.2) r.aim.copy(wdir);
        if (r.ready && r.shooting) {
          // hold SHOOT for power, release to strike
          if (B.shoot.pressed) { p.charging = true; p.charge = 0; }
          if (p.charging) {
            p.charge = Math.min(1, p.charge + dt / 0.9);
            if (!B.shoot.down) { p.charging = false; this.setPieceShot(p, Math.max(0.2, p.charge), r.aim); }
            return;
          }
          if (r.type === 'penalty') return;
        }
        if (r.ready && (B.pass.fire || B.through.fire || B.shoot.pressed)) {
          // tap PASS = short/low, flick PASS up (or SHOOT) = long/high, THROUGH = short pass into space
          this.takeRestart(B.through.fire ? 'through' : (B.shoot.pressed || B.pass.fireType === 'up') ? 'long' : 'ground');
        }
        return;
      }
    }

    if (p.busy > 0 || p.stun > 0) { p.charging = false; return; }
    const hasBall = ball.owner === p;

    // the receiver is free to move: an assisted pass follows him (see homePass)
    p.letGo = mag === 0; // stick released: a dribbler traps it on the next footfall
    if (mag > 0) {
      p.idleT = 0;
      p.manual = true;
      // holding SPRINT is top speed; auto sprint (stick at the edge) is only a quicker run
      const sp = (B.sprint.down ? p.maxSpeed(true) : sprint ? p.maxSpeed(false) + (p.maxSpeed(true) - p.maxSpeed(false)) * 0.35 : p.maxSpeed(false)) * Math.min(1, 0.3 + mag);
      p.desired.copy(wdir).multiplyScalar(sp);
      p.sprint = sprint;
    } else {
      p.idleT += dt;
      if (hasBall) {
        p.manual = true;
        p.desired.multiplyScalar(Math.max(0, 1 - dt * (this.settings.dribAssist !== false ? 20 : 5)));
        p.sprint = false;
      } else {
        p.manual = p.idleT < 0.45 && !p.recv;
        if (p.manual) p.desired.multiplyScalar(Math.max(0, 1 - dt * 6));
      }
    }

    // first-time ball near feet
    const free = !ball.owner && this.phase === 'play';
    const nearFree = free && p.cool <= 0 && hdist(p.pos, ball.pos) < 1.6 && ball.pos.y < 1.3;
    const aim = mag > 0.2 ? wdir : p.fwd.clone();
    this._userAim = aim;
    const ourFlight = free && this.lastKick.team === team && this.lastKick.kind !== 'shot';
    const attackCtx = hasBall || nearFree || ourFlight || free; // a loose ball is always PASS/SHOOT, never SWITCH
    // remember what a press meant when it started (so a SWITCH press can't turn into a pass)
    if (B.pass.pressed) this._passCtx = attackCtx;
    if (B.through.pressed) this._thruCtx = attackCtx;
    const passFire = B.pass.fire && this._passCtx !== false;
    const thruFire = B.through.fire && this._thruCtx !== false;
    const passHeight = passFire ? (B.pass.fireType === 'up' ? 'high' : 'low') : (B.through.fireType === 'up' ? 'high' : 'low');

    if (hasBall || nearFree) {
      if (passFire || thruFire) {
        if (nearFree) this.gainBall(p, false, true);
        this.pass(p, aim, thruFire && !passFire ? 'through' : 'ground', nearFree, passHeight);
        return;
      }
      if (hasBall && B.skill.fire) { this.skillMove(p, B.skill.fireType); return; }
      if (B.shoot.pressed && nearFree) {
        this.gainBall(p, false, true);
        this.shoot(p, 0.75, mag > 0.2 ? wdir : null, true);
        return;
      }
      if (hasBall) {
        // swipe left on SHOOT = fake shot (cancels the strike)
        if (B.shoot.fire && B.shoot.fireType === 'left') { p.charging = false; this.skillMove(p, 'fake'); return; }
        if (B.shoot.pressed) { p.charging = true; p.charge = 0; }
        if (p.charging) {
          p.charge = Math.min(1, p.charge + dt / 0.8);
          const sd = B.shoot.flickDir;
          p.shotKind = sd === 'up' ? 'chip' : sd === 'down' ? 'low' : sd === 'right' ? 'power' : 'normal';
          p.chipping = p.shotKind === 'chip';
          if (!B.shoot.down) {
            p.charging = false;
            this.shoot(p, Math.max(0.25, p.charge), mag > 0.2 ? wdir : null, false, p.shotKind);
          }
        }
        return;
      }
    }
    p.charging = false;

    // one-touch: queue a pass/shot while our pass is on its way
    if (p.queued) { p.queued.t -= dt; if (p.queued.t <= 0) p.queued = null; }
    if ((ourFlight || free) && (passFire || thruFire || B.shoot.pressed)) {
      p.queued = { kind: B.shoot.pressed ? 'shoot' : thruFire && !passFire ? 'through' : 'ground', height: passHeight, t: 1.2, aim: mag > 0.2 ? wdir.clone() : null };
      this.hooks.event(B.shoot.pressed ? 'FIRST-TIME SHOT' : 'ONE-TOUCH');
      return;
    }

    const ourBall = ball.owner && ball.owner.team === team;
    if (!ourBall && !ourFlight) {
      if (B.pass.pressed && !free) this.switchPlayer(true);
      const q = team.controlled;
      if (B.shoot.pressed && !free) this.tackle(q, false);
      if (B.skill.pressed && !free) this.tackle(q, true);
      // SPRINT is also pressure: your teammates press with you; 2ND PRESS (through) sends one more
      const pressing = B.sprint.down || B.through.down;
      team.callPress = pressing;
      // hold SPRINT (no joystick): close the ball carrier down fast, then contain him goal-side
      q.userJockey = false;
      const carrier = ball.owner && ball.owner.team !== team ? ball.owner : null;
      const assist = this.settings.defAssist !== false && B.sprint.down && mag < 0.3 && q.busy <= 0 && q.stun <= 0;
      if (assist && (!carrier || hdist(q.pos, carrier.pos) > 3.2)) {
        const tgt = carrier ? carrier.pos.clone().addScaledVector(carrier.vel, 0.3) : this.interceptPoint(q);
        q.goTo(tgt, q.maxSpeed(true), 0.8);
        q.sprint = true; q.manual = true; q.idleT = 0;
        if (carrier) q.faceTo = carrier.pos;
      } else if (assist && carrier) {
        const og = new V3(team.goalX - carrier.pos.x, 0, -carrier.pos.z).normalize();
        const d = hdist(q.pos, carrier.pos);
        const tgt = carrier.pos.clone().addScaledVector(carrier.vel, 0.3).addScaledVector(og, d > 5 ? 0.8 : 1.6);
        const vmax = q.maxSpeed(true);
        q.desired.set(carrier.vel.x + (tgt.x - q.pos.x) * 2.4, 0, carrier.vel.z + (tgt.z - q.pos.z) * 2.4);
        const dl = Math.hypot(q.desired.x, q.desired.z);
        if (dl > vmax) q.desired.multiplyScalar(vmax / dl);
        q.sprint = true;
        q.manual = true;
        q.idleT = 0;
        q.faceTo = carrier.pos;
        q.userJockey = d < 7;
      }
      // auto switch to whoever is closest to the ball (eager when you're not steering)
      this._swCD = (this._swCD || 0) - dt;
      if (this.settings.autoSwitch !== false && !pressing && this._swCD <= 0 && q.busy <= 0) {
        const best = this.bestDefender(team, null);
        if (best && best !== q) {
          const tgt = ball.owner ? ball.owner.pos : this.pred[3];
          const margin = q.idleT > 0.25 ? 1.5 : 4.5;
          if (hdist(best.pos, tgt) + margin < hdist(q.pos, tgt)) { this.setControlled(best); this._swCD = 0.6; }
        }
      }
    } else team.callPress = false;
  }

  setControlled(p) {
    const t = this.home;
    if (t.controlled === p || p.isGK) return;
    if (t.controlled) { t.controlled.manual = false; t.controlled.charging = false; t.controlled.userJockey = false; }
    t.controlled = p;
    p.idleT = 9;
    p.manual = false;
  }

  bestDefender(team, exclude) {
    const tgt = this.ball.owner ? this.ball.owner.pos : this.pred[4];
    let best = null, bd = 1e9;
    for (const p of team.players) {
      if (p.isGK || p === exclude) continue;
      // prefer players goal-side of the ball
      const goalSide = (p.pos.x - tgt.x) * -team.dir > 0 ? -2 : 0;
      const d = hdist(p.pos, tgt) + goalSide;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  switchPlayer(manual) {
    const t = this.home;
    const best = this.bestDefender(t, manual ? t.controlled : null);
    if (best) this.setControlled(best);
    this._swCD = 1.0; // don't immediately undo a manual switch
  }

  // ---------------------------------------------------------------- actions
  groundSpeed(d) {
    let v = 5.5 + d * 0.1;
    const n = 24, dx = d / n;
    for (let i = 0; i < n; i++) v += (0.32 + 0.9 / v) * dx;
    return Math.min(v, 31);
  }

  loftVel(from, to, angle) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const d = Math.max(1, Math.hypot(dx, dz));
    const v = Math.sqrt(GRAVITY * d / Math.sin(2 * angle)) * (1 + d * 0.0042);
    const vh = v * Math.cos(angle), vy = v * Math.sin(angle);
    return new V3(dx / d * vh, vy, dz / d * vh);
  }

  laneRisk(from, to, oppTeam) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const L2 = dx * dx + dz * dz;
    const L = Math.sqrt(L2) || 1;
    let risk = 0;
    for (const o of oppTeam.players) {
      let t = ((o.pos.x - from.x) * dx + (o.pos.z - from.z) * dz) / (L2 || 1);
      if (t < 0.03) continue;
      t = Math.min(1, t);
      const cx = from.x + dx * t, cz = from.z + dz * t;
      const d = Math.hypot(o.pos.x - cx, o.pos.z - cz);
      const allowed = 1.0 + t * L * 0.08;
      const r = clamp((allowed + 0.9 - d) / (allowed + 0.9), 0, 1);
      if (r > risk) risk = r;
    }
    return risk;
  }

  // race check for a ground pass: can any opponent get to a point on the line before the ball does?
  passRisk(from, to, oppTeam, ballSpeed = 15) {
    const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1;
    let risk = 0;
    for (let i = 1; i <= 6; i++) {
      const f = i / 6, px = from.x + dx * f, pz = from.z + dz * f;
      const tb = (L * f) / (ballSpeed * (1 - 0.18 * f));
      for (const o of oppTeam.players) {
        if (o.isGK && f < 0.9) continue;
        const d = Math.max(0, Math.hypot(o.pos.x - px, o.pos.z - pz) - 0.8);
        const to2 = 0.3 + d / 7.2;
        const r = clamp((tb - to2) / 0.35 + 0.5, 0, 1);
        if (r > risk) risk = r;
      }
    }
    return risk;
  }

  nearestOpp(p, pos = p.pos) {
    let best = null, bd = 1e9;
    for (const o of p.team.opp.players) {
      const d = hdist(o.pos, pos);
      if (d < bd) { bd = d; best = o; }
    }
    return { p: best, d: bd };
  }

  // Pass assist: pick the teammate the player most likely means, favouring open,
  // unblocked options inside a generous cone around the aim direction.
  // would this team-mate be offside if the ball were played now?
  wouldBeOffside(p, m) {
    if (this.settings.offside === false) return false;
    const dir = p.team.dir;
    return offsidePosition({ x: m.pos.x, ballX: this.ball.pos.x, line: secondLastX(p.team.opp.players.map(q => q.pos.x), dir), dir });
  }

  passTarget(p, aim, type) {
    const team = p.team;
    const assist = team.isUser && this.settings.passAssist !== false;
    const cone = assist ? (type === 'through' ? 1.5 : 1.35) : (type === 'through' ? 1.15 : 1.0);
    let best = null, bestScore = 1e9;
    for (const m of team.players) {
      if (m === p) continue;
      const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 3 || d > 62) continue;
      const ang = Math.acos(clamp((dx * aim.x + dz * aim.z) / d, -1, 1));
      if (ang > cone) continue;
      let sc;
      if (assist) {
        const open = clamp(this.nearestOpp(m).d / 6, 0, 1);
        // the teammate you point at wins; distance/openness only break near-ties
        const miss = Math.max(0, ang - Math.atan2(1.6, d)); // how far the aim is off the player's body
        sc = miss * 3.2 + ang * 0.6 + d * 0.006 + this.laneRisk(p.pos, m.pos, team.opp) * 0.1 - open * 0.06;
        if (type === 'through' && FORWARDS.has(m.role)) sc -= 0.3;
      } else sc = ang * 2.2 + d * 0.02 + this.laneRisk(p.pos, m.pos, team.opp) * 0.5;
      if (m.isGK) sc += 1.5;
      if (this.wouldBeOffside(p, m)) sc += assist ? 0.45 : 0.15; // assist steers it to an onside man when there's one close by
      if (sc < bestScore) { bestScore = sc; best = m; }
    }
    if (!best && assist) {
      // nobody in the cone: give it to the nearest teammate rather than into touch
      let bd = 1e9;
      for (const m of team.players) {
        if (m === p || m.isGK) continue;
        const d = hdist(m.pos, p.pos);
        if (d > 3 && d < bd) { bd = d; best = m; }
      }
    }
    return best;
  }

  pass(p, aim, type, firstTime = false, height = null) {
    this.passTo(p, this.passTarget(p, aim, type), aim, type, firstTime, height);
  }

  // height: 'low' | 'high' for the user's explicit pass type, null = AI decides
  passTo(p, m, aim, type, firstTime = false, height = null) {
    const team = p.team;
    const from = this.ball.pos;
    let target, mode = 'ground', angle = 0.5;
    if (!m) {
      target = p.pos.clone().addScaledVector(aim, type === 'through' ? 22 : 15);
      if (type === 'long') { mode = 'loft'; angle = 0.6; }
    } else {
      const d = hdist(p.pos, m.pos);
      if (type === 'through') {
        const fwd = new V3(team.dir, 0, 0);
        const lead = aim.clone().multiplyScalar(0.35).addScaledVector(fwd, 0.65).normalize();
        target = m.pos.clone().addScaledVector(lead, clamp(4 + d * 0.22, 6, 13));
        if (d > 30 || this.laneRisk(from, target, team.opp) > 0.65) { mode = 'loft'; angle = 0.55; }
      } else {
        const t = d / 17;
        const assist = team.isUser && this.settings.passAssist !== false;
        target = m.pos.clone().addScaledVector(m.vel, t * (assist ? 0.95 : 0.7));
        if (type === 'long' || d > 34) { mode = 'loft'; angle = d > 45 ? 0.6 : 0.68; }
        else if (d > 12 && this.laneRisk(from, target, team.opp) > (assist ? 0.55 : 0.7)) { mode = 'loft'; angle = 0.5; }
      }
    }
    target.x = clamp(target.x, -HL + 0.8, HL - 0.8);
    target.z = clamp(target.z, -HW + 0.8, HW - 0.8);
    // the user's chosen pass type always wins: tap = along the ground, flick up = in the air
    if (height === 'low') mode = 'ground';
    else if (height === 'high') {
      const dd = hdist(from, target);
      mode = 'loft';
      angle = dd < 18 ? 0.8 : dd < 35 ? 0.62 : 0.55;
    }
    if (m) {
      m.recv = { point: target.clone(), t: 0 };
      if (type === 'through') m.runT = 0;
    }
    const assisted = team.isUser && this.settings.passAssist !== false;
    const err = (team.isUser ? (1.05 - p.st.pas) * (assisted ? 0.015 : 0.07) : this.diff.passErr * (1.25 - p.st.pas) * 1.4) * gauss();
    const d = hdist(from, target);
    const power = mode === 'loft' ? 0.65 : clamp(0.25 + d / 60, 0.25, 0.8);
    const speedMul = (type === 'through' ? 1.06 : 1) * (assisted && mode === 'ground' ? 1.08 : 1);
    this.kick(p, { mode, target, angle, err, speedMul, power, kind: 'pass', recv: m, first: firstTime, guarantee: assisted && m ? m : null });
    this.stats[team.key].passes++; p.ms.passAtt++;
    if (type === 'through') this.stats[team.key].through++;
    if (mode === 'loft') this.stats[team.key].long++;
    if (team.isUser && m && !m.isGK) {
      this.setControlled(m);
      m.recv.t = 0;
    }
  }

  // kind: 'normal' | 'chip' | 'low' (driven along the ground) | 'power' (big wind-up, very fast)
  shoot(p, power, aimDir, firstTime = false, kind = 'normal') {
    if (kind === true) kind = 'chip';
    const chip = kind === 'chip';
    const team = p.team;
    const gx = team.attackX;
    const from = this.ball.pos;
    const dist = Math.hypot(gx - from.x, from.z);
    const gk = team.opp.gk;
    let side;
    if (aimDir && Math.abs(aimDir.z) > 0.3) side = Math.sign(aimDir.z);
    else if (Math.abs(gk.pos.z) > 0.35) side = -Math.sign(gk.pos.z);
    else side = from.z > 0 ? -1 : 1;
    if (!team.isUser && Math.random() < 0.25) side = -side;
    let zT = side * (GW - (team.isUser ? 0.55 : rand(0.45, 1.1)));
    // normal shots are struck low/driven; only near-full power risks going over
    let yT = 0.2 + power * 0.85;
    if (power > 0.93) yT += (power - 0.93) * 14;
    if (!team.isUser) yT = rand(0.2, 1.9);
    const pressure = this.nearestOpp(p).d;
    let spread = (0.22 + dist * 0.028) * (1.4 - p.st.sho) * (pressure < 1.6 ? 1.35 : 1) * (0.75 + power * 0.5);
    if (!team.isUser) spread *= this.diff.shootErr;
    if (firstTime) spread *= 1.25;
    zT += gauss() * spread;
    yT = Math.max(0.15, yT + gauss() * spread * 0.45);
    if (chip) {
      // chip: a soft, high-arcing shot that drops under the bar (great vs a keeper off his line)
      const zc = clamp(side * (GW - 1.0) + gauss() * spread * 0.5, -GW + 0.3, GW - 0.3);
      const vhc = clamp(5 + dist * 0.28, 7.5, 14) * (0.92 + power * 0.16);
      this.kick(p, { mode: 'shot', target: new V3(gx, clamp(1.8 + gauss() * 0.25, 1.1, GH + 0.6), zc), vh: vhc, power: 0.35, kind: 'shot', first: firstTime });
      this.hooks.event('CHIP!');
      this.say('chip', { n: p.name }, 1);
      return;
    }
    if (kind === 'low') {
      // low driven: hit hard along the turf, aimed into the bottom corner you're pointing at
      const zl = clamp(side * (GW - 0.5) + gauss() * spread * 0.75, -GW - 1, GW + 1);
      const vhl = 19 + power * 9 + p.st.sho * 3;
      this.kick(p, { mode: 'shot', target: new V3(gx, clamp(0.18 + gauss() * 0.08, 0.12, 0.45), zl), vh: vhl, power: 0.55 + power * 0.35, kind: 'shot', first: firstTime });
      this.hooks.event('DRIVEN!');
      return;
    }
    if (kind === 'power') {
      // power shot: longer wind-up, rocket pace, less precise
      const zp = side * (GW - 0.75) + gauss() * spread * 1.25;
      const yp = clamp(0.55 + power * 1.1 + gauss() * spread * 0.55, 0.25, GH + 1.2);
      const vhp = 27 + power * 9 + p.st.sho * 4;
      this.kick(p, { mode: 'shot', target: new V3(gx, yp, zp), vh: vhp, power: 1, kind: 'shot', first: false, windup: 0.32 });
      this.hooks.event('POWER SHOT!');
      return;
    }
    const vh = 15 + power * 14 + p.st.sho * 3;
    this.kick(p, { mode: 'shot', target: new V3(gx, yT, zT), vh, power: 0.6 + power * 0.4, kind: 'shot', first: firstTime });
  }

  // queue a kick (with a wind-up so the animation leads the ball)
  kick(p, k) {
    k.t = k.windup || (k.first ? 0.06 : 0.14);
    p.pending = k;
    p.action = 'kick';
    p.busy = 0.42;
    p.actionT = 0;
    // start the swing part-way so the foot meets the ball exactly when it is released
    p.a.kickT = k.windup ? 0.02 : k.first ? 0.36 : 0.16;
    p.a.kickDur = k.windup ? 0.65 : 0.42;
    if (k.windup) p.busy = 0.6;
    p.a.kickPow = clamp(k.power, 0.2, 1);
    p.desired.multiplyScalar(0.4);
    const dx = k.target.x - p.pos.x, dz = k.target.z - p.pos.z;
    // which foot: the one the ball is on; if it's central, the foot that opens up the angle
    // (shooting across to the right is a left-footed strike, and vice versa)
    const L = Math.hypot(dx, dz) || 1, hx = dx / L, hz = dz / L;
    const side = (this.ball.pos.x - p.pos.x) * -hz + (this.ball.pos.z - p.pos.z) * hx;
    const turn = hx * -p.fwd.z + hz * p.fwd.x;
    p.a.kickFoot = side > 0.1 ? 'R' : side < -0.1 ? 'L' : turn > 0.15 ? 'L' : turn < -0.15 ? 'R' : (p.a.kickFoot || 'R');
    p.lockFacing = Math.atan2(dx, dz);
    p.charging = false;
  }

  releaseKick(p) {
    const k = p.pending;
    p.pending = null;
    const ball = this.ball;
    if (ball.owner !== p) return;
    const throwIn = k.kind === 'throw';
    ball.owner = null;
    ball.held = false;
    // from above his head, just inside the line (thrown from outside it, the ball would be out at once)
    if (throwIn) ball.pos.set(p.pos.x + p.fwd.x * 0.3, 2.1, clamp(p.pos.z + p.fwd.z * 0.3, -HW + 0.4, HW - 0.4));
    else if (p.isGK && k.fromHands) ball.pos.set(p.pos.x + p.fwd.x * 0.6, 0.5, p.pos.z + p.fwd.z * 0.6);
    else { ball.pos.y = Math.max(BALL_R, Math.min(ball.pos.y, 0.4)); }
    const from = ball.pos;
    let vel;
    if (k.mode === 'ground') {
      const d = hdist(from, k.target);
      const sp = this.groundSpeed(d) * (k.speedMul || 1);
      const a = Math.atan2(k.target.x - from.x, k.target.z - from.z) + (k.err || 0);
      vel = new V3(Math.sin(a) * sp, 0.4, Math.cos(a) * sp);
    } else if (k.mode === 'loft') {
      vel = this.loftVel(from, k.target, k.angle);
      if (k.err) vel.applyAxisAngle(THREE.Object3D.DEFAULT_UP, k.err);
    } else if (k.mode === 'shot') {
      const dx = k.target.x - from.x, dz = k.target.z - from.z;
      const dh = Math.hypot(dx, dz);
      const t0 = dh / k.vh;
      const t = dh / (k.vh * (1 - 0.0037 * k.vh * t0));
      const vy = (k.target.y - from.y) / t + 0.5 * GRAVITY * t;
      vel = new V3(dx / dh * k.vh, vy, dz / dh * k.vh);
    } else vel = k.vel.clone();
    ball.vel.copy(vel);
    // a set-piece strike is solved from where the ball actually is when the boot meets it
    if (k.mode === 'vel') { ball.pos.y = BALL_R; ball.vel.copy(aimCurl({ from: ball.pos.clone(), target: k.target, vh: Math.hypot(k.vel.x, k.vel.z), spin: k.spin })); }
    ball.spin = k.spin || (k.mode === 'shot' ? gauss() * 1.5 : 0);
    p.cool = 0.32;
    this.lastTouch = p;
    this.kickId++;
    this.lastKick = { kind: k.kind, team: p.team, id: this.kickId, by: p, setpiece: !!k.setpiece };
    // no offside from a throw-in, goal kick or corner
    if (k.kind === 'throw' || this.restartKick === 'goalkick' || this.restartKick === 'corner') this.offside = null;
    else this.offsideSnapshot(p);
    const fromRestart = this.restartKick;
    this.restartKick = null;
    if (k.setpiece) for (const q of p.team.opp.players) if (q.wall) q.a.headerT = 0; // the wall jumps
    this.guarantee = k.guarantee ? { to: k.guarantee, id: this.kickId, t: 0 } : null;
    this.sound.kick(k.power);
    if (k.kind === 'shot' && !this.inShootout) {
      const x = shotXg(ball.pos, p.team.attackX, { penalty: fromRestart === 'penalty' });
      this.stats[p.team.key].xg += x; p.ms.xg += x; if (x >= 0.3) this.stats[p.team.key].big++;
    }
    if (k.kind === 'shot' && !this.inShootout) { this.stats[p.team.key].shots++; p.ms.shots++; if (k.mode === 'shot' && k.power > 0.4) this.say('shot', { n: p.name }, 1); }
  }

  // ---------------------------------------------------------------- skill moves
  // Each move scripts the player's path, facing and the ball over its duration, in a frame fixed at
  // the start of the move (O = origin, f = forward, l = left). The leg animation (model.js) is keyed
  // to the same normalised time, so foot and ball stay in sync.
  //   tap   = step-over (feint one way, go the other)      left/right = La Croqueta drag across the body
  //   down  = sole drag-back + 180° turn                    up = rainbow flick (heel flick over the head)
  skillMove(p, type = 'tap') {
    if (p.skillCD > 0 || p.pending || p.skill) return;
    this.stats[p.team.key].skills++; p.ms.skills++;
    const ball = this.ball;
    const f = p.fwd.clone(), l = new V3(f.z, 0, -f.x);
    // go away from the nearest defender if the move has no direction of its own
    const near = this.nearestOpp(p);
    let side = type === 'left' ? 1 : type === 'right' ? -1 : 0;
    if (!side) side = near.p && ((near.p.pos.x - p.pos.x) * l.x + (near.p.pos.z - p.pos.z) * l.z) > 0 ? -1 : 1;
    const dur = { tap: 0.78, left: 0.52, right: 0.52, down: 0.82, up: 0.8, fake: 0.62 }[type] || 0.6;
    p.skill = {
      type, side, dur, t: 0, O: p.pos.clone(), f, l, face0: p.facing,
      v0: clamp(Math.hypot(p.vel.x, p.vel.z), 2.5, 7), released: false, beat: false,
    };
    p.skillCD = dur + 1.1;
    p.skillT = dur * 0.45; // brief protection from passive steals at the start of the move
    p.busy = dur;
    p.action = 'skill';
    p.charging = false;
    Object.assign(p.a, { skillT: 0, skillType: type, skillSide: side, skillDur: dur });
    ball.owner = p;
    ball.held = false;
    const names = { tap: 'STEP-OVER', left: 'LA CROQUETA', right: 'LA CROQUETA', down: 'DRAG-BACK', up: 'RAINBOW FLICK!', fake: 'FAKE SHOT!' };
    if (p.team.isUser) { this.hooks.event(names[type]); if (Math.random() < 0.5) this.say('skill', { n: p.name }, 1); }
  }

  updateSkill(p, dt) {
    const k = p.skill, ball = this.ball;
    const prevT = k.t;
    k.t = Math.min(k.dur, k.t + dt);
    const u = k.t / k.dur, s = k.side;
    const E = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const B = x => Math.sin(Math.PI * clamp(x, 0, 1));
    let px = 0, pz = 0, face = k.face0, bx = 0, bz = 0.55, by = BALL_R;
    const run = k.v0 * k.dur;
    switch (k.type) {
      case 'tap': // step over with the outside leg, then take it the other way with the other foot
        pz = run * 0.32 * u + 0.6 * E((u - 0.5) / 0.5);
        px = -s * 0.28 * B(u / 0.55) + s * 1.1 * E((u - 0.52) / 0.48);
        bz = 0.55 + run * 0.22 * u + 0.5 * E((u - 0.5) / 0.5);
        bx = s * 1.25 * E((u - 0.5) / 0.45);
        face = k.face0 + s * 0.6 * E((u - 0.55) / 0.4);
        break;
      case 'left': case 'right': // drag it across from one foot to the other
        pz = run * 0.45 * u;
        px = s * 1.35 * E((u - 0.05) / 0.85);
        bz = 0.5 + run * 0.5 * u;
        bx = -s * 0.12 + s * 1.55 * E((u - 0.08) / 0.62);
        face = k.face0 + s * 0.55 * E((u - 0.4) / 0.6);
        break;
      case 'fake': // shape to shoot, then drag it across the planted foot instead
        pz = run * 0.25 * u + 0.35 * E((u - 0.45) / 0.5);
        px = s * 1.05 * E((u - 0.4) / 0.55);
        bz = 0.5 + run * 0.25 * u + 0.25 * E((u - 0.45) / 0.5);
        bx = s * 1.2 * E((u - 0.38) / 0.45);
        face = k.face0 + s * 0.7 * E((u - 0.45) / 0.5);
        break;
      case 'down': // sole on top, roll it back, spin round
        pz = -0.55 * E(u / 0.55);
        bz = 0.55 - 1.65 * E((u - 0.12) / 0.48);
        face = k.face0 + s * Math.PI * E((u - 0.32) / 0.5);
        break;
      case 'up': { // roll it back between the feet, heel flick up the back of the standing leg
        pz = run * 0.45 * u;
        const rel = u < 0.32 ? 0.55 - 0.6 * E(u / 0.32) : -0.05 - 0.28 * E((u - 0.32) / 0.25);
        bz = pz + rel;
        by = u < 0.32 ? BALL_R : BALL_R + 0.95 * E((u - 0.32) / 0.25);
        break;
      }
    }
    const O = k.O, f = k.f, l = k.l;
    const nx = O.x + f.x * pz + l.x * px, nz = O.z + f.z * pz + l.z * px;
    p.vel.set((nx - p.pos.x) / Math.max(dt, 1e-3), 0, (nz - p.pos.z) / Math.max(dt, 1e-3));
    p.pos.x = nx; p.pos.z = nz;
    p.desired.copy(p.vel);
    p.facing = wrap(face);
    p.fwd.set(Math.sin(p.facing), 0, Math.cos(p.facing));
    p.turnRate = 0;
    if (!k.released && ball.owner === p) {
      const wx = O.x + f.x * bz + l.x * bx, wz = O.z + f.z * bz + l.z * bx;
      ball.vel.set((wx - ball.pos.x) / Math.max(dt, 1e-3), (by - ball.pos.y) / Math.max(dt, 1e-3), (wz - ball.pos.z) / Math.max(dt, 1e-3));
      ball.pos.set(wx, by, wz);
    }
    // the decisive moment: defenders who bit on it are wrong-footed
    const beatAt = { tap: 0.5, left: 0.3, right: 0.3, down: 0.45, up: 0.57, fake: 0.42 }[k.type];
    if (!k.beat && u >= beatAt) {
      k.beat = true;
      const goDir = new V3(p.vel.x, 0, p.vel.z).normalize();
      for (const o of p.team.opp.players) {
        const d = hdist(o.pos, p.pos);
        if (d > 3.4 || o.isGK) continue;
        // only defenders in front, committed to the challenge, can be wrong-footed
        const inFront = ((o.pos.x - p.pos.x) * k.f.x + (o.pos.z - p.pos.z) * k.f.z) / Math.max(d, 0.01);
        if (inFront < 0.2) continue;
        const chance = { tap: 0.48, left: 0.45, right: 0.45, down: 0.42, up: 0.6, fake: 0.68 }[k.type] - o.st.def * 0.35 + (d < 2 ? 0.08 : 0);
        if (Math.random() < chance) { o.stun = 0.42; o.a.hitT = 0; o.a.hitBig = false; o.vel.multiplyScalar(0.4); }
      }
      this.sound.kick(0.12);
      if (goDir.lengthSq() > 0) this.sound.ooh && k.type === 'up' && this.sound.ooh();
    }
    // rainbow: release the ball over the head
    if (k.type === 'up' && !k.released && u >= 0.57) {
      k.released = true;
      ball.owner = null;
      ball.vel.set(f.x * (k.v0 + 3.6), 6.3, f.z * (k.v0 + 3.6));
      ball.spin = 0;
      this.kickId++;
      this.lastKick = { kind: 'skill', team: p.team, id: this.kickId, by: p };
      this.guarantee = { to: p, id: this.kickId, t: 0, minT: 0.5, maxY: 0.9 };
      p.cool = 0.45;
      this.sound.kick(0.25);
    }
    if (prevT < k.dur && k.t >= k.dur) {
      // burst away in the new direction
      p.skill = null;
      p.busy = 0;
      p.action = null;
      const dir = k.type === 'up' ? f.clone() : p.fwd.clone();
      p.vel.copy(dir).multiplyScalar(p.maxSpeed(true) * (k.type === 'down' ? 0.7 : 0.92));
      p.desired.copy(p.vel);
    }
  }

  // aimAt: where to lunge (AI defenders aim where the ball is going); defaults to the ball
  tackle(p, slide, aimAt = null) {
    if (!p || p.busy > 0 || p.tackleCD > 0 || p.stun > 0) return;
    const ball = this.ball;
    const at = aimAt || ball.pos;
    const toBall = new V3(at.x - p.pos.x, 0, at.z - p.pos.z);
    const d = toBall.length();
    const dir = d < 5 && d > 0.01 ? toBall.normalize() : p.fwd.clone();
    p.action = slide ? 'slide' : 'tackle';
    p.busy = slide ? 1.0 : 0.5;
    p.actionT = 0;
    p.tackleDone = false;
    p.tackleCD = slide ? 1.3 : 0.6;
    p.lockFacing = Math.atan2(dir.x, dir.z);
    p.facing = p.lockFacing;
    p.fwd.copy(dir);
    if (slide) { p.vel.copy(dir).multiplyScalar(Math.max(p.vel.length(), 8)); p.a.slideT = 0; }
    else { p.vel.copy(dir).multiplyScalar(Math.max(p.vel.length() * 0.8, 3.5)); p.a.tackleT = 0; }
    p.desired.copy(p.vel);
  }

  resolveTackle(p) {
    const ball = this.ball;
    const slide = p.action === 'slide';
    const win = slide ? [0.08, 0.65] : [0.1, 0.32];
    const t = p.actionT;
    if (p.tackleDone || t < win[0] || t > win[1]) return;
    const foot = p.pos.clone().addScaledVector(p.fwd, slide ? 0.95 : 0.7);
    const o = ball.owner;
    if (ball.pos.y > 0.8 || hdist(foot, ball.pos) > (slide ? 1.15 : 0.95)) {
      // nowhere near the ball, but straight through the man
      if (o && o.team !== p.team && !ball.held && hdist(foot, o.pos) < (slide ? 0.9 : 0.6)) {
        p.tackleDone = true;
        this.maybeFoul(p, o, { slide, missed: true, bodyContact: true });
      }
      return;
    }
    if (o === p || (o && (o.pending || (o.skill && o.skill.type === 'up')))) return;
    if (!o && this.guarantee && this.guarantee.to !== p) return; // assisted pass in flight
    p.tackleDone = true;
    if (o && o.team === p.team) return;
    if (o && ball.held) return;
    if (!o) {
      if (slide) { ball.vel.copy(p.fwd).multiplyScalar(7); ball.vel.y = 0.5; this.lastTouch = p; this.sound.kick(0.3); }
      else this.gainBall(p, false);
      return;
    }
    let e = Math.max(0, exposure({ ball: ball.pos, body: o.pos, defender: p.pos }) - (o.skillT > 0 ? 0.35 : 0));
    if (!p.team.isUser) e += this.aiDefQuality();
    const res = tackleOutcome({ exposure: e, def: p.st.def, dri: o.st.dri, phy: o.st.phy || 0.7, slide, rnd: Math.random() });
    const contact = hdist(foot, o.pos) < 0.95;
    if (res === 'miss') {
      // mistimed: he's off balance and the dribbler is away (unless he took the man instead)
      p.stun = 0.5; p.a.hitT = 0; p.a.hitBig = false;
      this.maybeFoul(p, o, { slide, missed: true, bodyContact: contact });
      return;
    }
    if (this.maybeFoul(p, o, { slide, missed: false, bodyContact: contact })) return;
    o.stun = slide ? 0.9 : 0.45;
    o.a.hitT = 0; o.a.hitBig = slide;
    p.ms.tackles++; this.stats[p.team.key].tackles++;
    if (res === 'win' && !slide) { this.gainBall(p, false); this.sound.kick(0.3); }
    else this.knockLoose(o, p, rand(3, 6));
    if (p.team.isUser) { this.hooks.event('WON IT!'); this.say('tackle', { n: p.name }, 1); }
  }

  // ---------------------------------------------------------------- ball
  gainBall(p, hands, silent = false) {
    const ball = this.ball;
    if (this.offsideTouch(p)) return;
    const lk = this.lastKick;
    if (lk.by && lk.by !== p && lk.team === p.team && (lk.kind === 'pass' || lk.kind === 'throw') && this._passCounted !== lk.id) {
      this._passCounted = lk.id; lk.by.ms.passes++;
      if (lk.kind === 'pass') this.stats[p.team.key].passCmp++;
      this.assist = { by: lk.by, to: p };
    } else {
      if (!this.assist || this.assist.to !== p) this.assist = null;
      if (lk.kind === 'pass' && lk.team && lk.team !== p.team && this._passCounted !== lk.id && this.phase === 'play') {
        this._passCounted = lk.id; this.stats[p.team.key].intercepts++; p.ms.intercepts++;
      }
    }
    ball.owner = p;
    ball.held = !!hands;
    p.drib = null; // first touch is worked out from the incoming ball (see dribble)
    // a new possession: defenders' reaction timers start again
    for (const q of this.players) { q.exposedT = 0; q.tkSeen = 0; q.containT = 0; }
    if (hands) ball.vel.set(0, 0, 0); else ball.vel.y = 0;
    ball.spin = 0;
    this.lastTouch = p;
    p.recv = null;
    p.holdT = 0;
    p.ownT = 0;
    p.think = p.team.isUser ? 0.5 : this.diff.react * rand(0.8, 1.6);
    for (const q of p.team.players) if (q !== p) q.recv = null;
    for (const q of p.team.opp.players) q.recv = null;
    const changed = this.possTeam !== p.team;
    this.possTeam = p.team;
    if (p.team.isUser) {
      if (!p.isGK) this.setControlled(p);
      p.idleT = 0;
      const q = p.queued;
      p.queued = null;
      if (q && !hands && this.phase === 'play') {
        const aim = q.aim || (q.kind === 'shoot' ? new V3(p.team.dir, 0, 0) : p.fwd.clone());
        if (q.kind === 'shoot') this.shoot(p, 0.7, q.aim, true);
        else this.pass(p, aim, q.kind, true, q.height);
        return;
      }
    } else if (changed) {
      const c = this.home.controlled;
      const best = this.bestDefender(this.home, null);
      if (best && (!c || hdist(c.pos, p.pos) > hdist(best.pos, p.pos) + 5)) this.setControlled(best);
    }
    if (!silent && !hands) this.sound.kick(0.12);
  }

  updateBall(dt) {
    const ball = this.ball;
    const o = ball.owner;
    if (o && o.skill && !o.skill.released) {
      // ball path is scripted by updateSkill
    } else if (o) {
      if (ball.held) {
        if (o.a.throwReady || o.action === 'throw') ball.pos.set(o.pos.x + o.fwd.x * 0.05, 2.15, o.pos.z + o.fwd.z * 0.05);
        else ball.pos.set(o.pos.x + o.fwd.x * 0.36, 1.1, o.pos.z + o.fwd.z * 0.36);
        ball.vel.set(0, 0, 0);
      } else this.dribble(o, dt);
    } else {
      this.homePass(dt);
      const sub = Math.min(6, Math.max(1, Math.ceil(ball.speed * dt / 0.15)));
      for (let i = 0; i < sub; i++) {
        ball.step(dt / sub);
        this.goalFrame();
      }
    }
    ball.sync(dt);
  }

  // Close control (FC-style). The ball is a real object: touches give it velocity, then it rolls and
  // slows. A touch only happens when the ball is within reach of the feet; the body turns first and
  // the ball follows (redirect touch, or a sole drag round the body when slow). Run away from it or
  // overhit a sprint touch and it's loose.
  // Footstep dribbling: the ball is touched only when a foot lands (o.a.strike), and every touch
  // rolls it onto a slot in front of the next footfall (see js/dribble.js). It is never lost
  // without a challenge: tackles, pokes, passes and shots are the only ways it leaves him.
  // how much cleaner AI challenges are on harder levels (Beginner -0.10 … Legend +0.06)
  aiDefQuality() { return (this.diff.tackle - 1) * 0.15; }

  // AI defender's standing tackle, timed by the difficulty's reaction time.
  aiTackle(p, owner, d, dt) {
    if (p.tackleCD > 0 || d > 2.2) { p.tkSeen = 0; return; }
    // he reacts to what he sees: the ball out away from the dribbler's feet and within his reach.
    // Quick defenders (harder levels) go in while it's still out; slow ones arrive as it comes back.
    const b = this.ball.pos, bv = this.ball.vel;
    // already standing in the ball's path? stay put and let it run into him (no need to dive in)
    const bs = Math.hypot(bv.x, bv.z);
    if (bs > 1) {
      const rx = p.pos.x - b.x, rz = p.pos.z - b.z;
      const ahead = (rx * bv.x + rz * bv.z) / bs, off = Math.abs(rx * bv.z - rz * bv.x) / bs;
      if (ahead > 0 && ahead < 4 && off < 0.45) { p.tkSeen = 0; return; }
    }
    const e = exposure({ ball: b, body: owner.pos, defender: p.pos });
    // and never dive at a ball that's running away from him
    const rdx = b.x - p.pos.x, rdz = b.z - p.pos.z, rd = Math.hypot(rdx, rdz) || 1;
    const away = ((bv.x - p.vel.x) * rdx + (bv.z - p.vel.z) * rdz) / rd;
    // a standing tackle can't catch a runner from behind: he must be level with the ball or ahead of it
    const ov = owner.vel, os = Math.hypot(ov.x, ov.z);
    const level = os < 2 || (-rdx * ov.x - rdz * ov.z) / os > -0.3;
    if (e > 0.5 && rd < 1.6 && away < 2 && level) {
      if (!p.tkSeen) p.tkWait = this.diff.react * rand(0.6, 1.2);
      p.tkSeen = (p.tkSeen || 0) + dt;
      if (p.tkSeen >= p.tkWait) {
        p.tkSeen = 0;
        this.tackle(p, false, { x: b.x + bv.x * 0.15, z: b.z + bv.z * 0.15 });
        return;
      }
    } else p.tkSeen = 0;
    // weaker sides also lunge in hope
    if (d < 1.9 && Math.random() < dt * 1.4 * Math.max(0, 1.1 - this.diff.tackle)) this.tackle(p, false);
  }

  // The ball has got away from him (a long touch, then he turned): he goes and gets it before
  // following the stick again, so a dribbler never leaves the ball behind.
  collectSteer(p) {
    const b = this.ball.pos, bv = this.ball.vel;
    const dx = b.x - p.pos.x, dz = b.z - p.pos.z, d = Math.hypot(dx, dz);
    const reach = slotDistance(Math.hypot(p.vel.x, p.vel.z), p.st.dri) + 0.6;
    if (d <= reach) return;
    const dsp = Math.hypot(p.desired.x, p.desired.z);
    // already heading at it? leave him be
    if (dsp > 0.4 && (p.desired.x * dx + p.desired.z * dz) / (dsp * d) > 0.7) return;
    // aim where the ball will be, at the pace he wanted (at least a jog)
    const t = Math.min(0.6, d / 7);
    const tx = dx + bv.x * t, tz = dz + bv.z * t, tl = Math.hypot(tx, tz) || 1;
    const sp = Math.max(dsp, p.maxSpeed(false));
    p.desired.set(tx / tl * sp, 0, tz / tl * sp);
  }

  // the ball is knocked away from the dribbler by a challenge
  knockLoose(o, by, speed) {
    const ball = this.ball;
    ball.owner = null;
    o.drib = null;
    o.cool = 0.4;
    const dir = new V3(ball.pos.x - by.pos.x, 0, ball.pos.z - by.pos.z);
    if (dir.lengthSq() < 1e-6) dir.copy(by.fwd);
    dir.normalize();
    ball.vel.copy(dir).multiplyScalar(speed).add(new V3(gauss() * 1.2, 0.3, gauss() * 1.2));
    this.lastTouch = by;
    this.kickId++;
    this.lastKick = { kind: 'tackle', team: by.team, id: this.kickId, by };
    this.sound.kick(0.3);
  }

  dribble(o, dt) {
    const ball = this.ball, b = ball.pos;
    const sp = Math.hypot(o.vel.x, o.vel.z);
    const hx = sp > 0.4 ? o.vel.x / sp : o.fwd.x, hz = sp > 0.4 ? o.vel.z / sp : o.fwd.z;
    const rx = -hz, rz = hx; // right
    const dsp = Math.hypot(o.desired.x, o.desired.z);
    const ux = dsp > 0.4 ? o.desired.x / dsp : hx, uz = dsp > 0.4 ? o.desired.z / dsp : hz;
    const ctrl = o.st.dri;
    let D = o.drib;
    const touch = (vx, vz, foot, side = 0, T = 0) => {
      D.v.set(vx, 0, vz); D.lastTouchT = this.time; D.nextT = this.time + T;
      o.a.touchT = 0; o.a.touchFoot = foot; o.a.touchSide = side;
    };
    if (!D) {
      // first touch: cushion it straight into the slot he's heading for
      D = o.drib = { v: new V3(), lastTouchT: this.time, drag: false, plant: 0 };
      const { v, T } = planTouch({ ball: b, pos: o.pos, vel: o.vel, dir: { x: ux, z: uz }, sp, dri: ctrl, phase: o.a.gait });
      touch(v.x, v.z, o.a.strike || 'R', 0, T);
    }
    const r = this.restart;
    if (this.phase === 'restart' && r && r.ready && r.taker === o) { ball.vel.set(0, 0, 0); D.v.set(0, 0, 0); return; }
    if (o.pending || (o.skill && !o.skill.released)) {
      // wind-up: draw the ball onto the kicking foot
      const k = 1 - Math.exp(-dt * 14);
      const lat = (o.a.kickFoot === 'L' ? -1 : 1) * 0.1; // onto the kicking foot
      const tx = o.pos.x + o.fwd.x * 0.5 - o.fwd.z * lat, tz = o.pos.z + o.fwd.z * 0.5 + o.fwd.x * lat;
      b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.y = BALL_R;
      D.v.set(o.vel.x, 0, o.vel.z);
      ball.vel.copy(D.v);
      return;
    }
    let relX = b.x - o.pos.x, relZ = b.z - o.pos.z;
    const dist = Math.hypot(relX, relZ);
    if (dist > 4) {
      // safety net (collectSteer should never let this happen): no possession of a ball 4m away
      ball.owner = null; ball.vel.set(D.v.x, 0, D.v.z); o.drib = null; o.cool = 0.2;
      this.kickId++; this.lastKick = { kind: 'loose', team: o.team, id: this.kickId, by: o };
      return;
    }
    let ahead = relX * hx + relZ * hz, side = relX * rx + relZ * rz;
    const bAng = Math.atan2(side, ahead); // 0 = straight ahead of his run
    // FC Mobile-style close control (dribble assist, your team): the ball lives on the ring around
    // his feet, on the side he's heading, swings round the ring when he changes direction and
    // gets a small nudge on every footfall. It never rolls away from him.
    if (o.team.isUser && this.settings.dribAssist !== false) {
      if (D.ringA === undefined) { D.ringA = Math.atan2(relX, relZ); D.pulse = 0; }
      const moving = dsp > 0.4;
      const wantA = moving ? Math.atan2(ux, uz) : Math.atan2(o.fwd.x, o.fwd.z);
      const rate = (9 + 6 * ctrl) * dt;
      D.ringA += clamp(wrap(wantA - D.ringA), -rate, rate);
      const run = clamp(sp / 8.5, 0, 1);
      const strike = o.a.strike;
      if (strike && moving) {
        D.pulse = (0.07 + 0.15 * run) * (1.15 - 0.3 * ctrl);
        D.lastTouchT = this.time; o.a.touchT = 0; o.a.touchFoot = strike;
        o.a.touchSide = Math.sign(wrap(wantA - Math.atan2(hx, hz))) * (Math.abs(wrap(wantA - Math.atan2(hx, hz))) > 0.4 ? 1 : 0);
      }
      D.pulse *= Math.exp(-dt * 7);
      const R = (moving ? 0.34 + 0.2 * run : 0.3) + D.pulse;
      const tx = o.pos.x + Math.sin(D.ringA) * R, tz = o.pos.z + Math.cos(D.ringA) * R;
      // carried along with him, eased onto its spot on the ring
      const k = 1 - Math.exp(-dt * 16);
      const cx = b.x + o.vel.x * dt, cz = b.z + o.vel.z * dt;
      const nx = cx + (tx - cx) * k, nz = cz + (tz - cz) * k;
      D.v.set((nx - b.x) / dt, 0, (nz - b.z) / dt);
      b.x = nx; b.z = nz; b.y = BALL_R;
      ball.vel.copy(D.v);
      return;
    }
    if (D.plant > 0) {
      // sole on the ball while he stops: it stays under the planted foot
      D.plant -= dt;
      const k = 1 - Math.exp(-dt * 12);
      const tx = o.pos.x + D.px * 0.42, tz = o.pos.z + D.pz * 0.42;
      const nx = b.x + (tx - b.x) * k, nz = b.z + (tz - b.z) * k;
      D.v.set((nx - b.x) / dt, 0, (nz - b.z) / dt);
      b.x = nx; b.z = nz; b.y = BALL_R;
      ball.vel.copy(D.v);
      if (D.plant <= 0) D.v.set(0, 0, 0);
      return;
    }
    if (dist < 1.05 && (sp < 4.6 || (D.drag && sp < 8)) && (Math.abs(bAng) > 0.6 || (D.drag && Math.abs(bAng) > 0.2))) {
      // slow with the ball beside/behind him: drag it round with the sole towards where he's going
      const rad = dist + (0.47 - dist) * Math.min(1, dt * 10);
      const rate = (6 + 4 * ctrl) * (1 + sp * 0.12);
      const na = bAng + clamp(-bAng, -rate * dt, rate * dt);
      const nx = o.pos.x + (hx * Math.cos(na) + rx * Math.sin(na)) * rad, nz = o.pos.z + (hz * Math.cos(na) + rz * Math.sin(na)) * rad;
      D.v.set((nx - b.x) / dt, 0, (nz - b.z) / dt);
      b.x = nx; b.z = nz; b.y = BALL_R;
      if (!D.drag) { D.drag = true; touch(D.v.x, D.v.z, bAng > 0 ? 'R' : 'L', Math.sign(-bAng)); }
      ball.vel.copy(D.v);
      return;
    }
    if (D.drag) {
      // dragged round: the next footfall knocks it on; until then keep it at the feet
      D.drag = false;
      D.v.set(o.vel.x, 0, o.vel.z);
    }
    const strike = o.a.strike;
    // dribble assist (your team, on by default): closer ball, instant cuts, stronger steering
    const easy = o.team.isUser && this.settings.dribAssist !== false;
    const near = easy ? 0.75 : 1;
    const slot = slotDistance(sp, ctrl) * near;
    if (dsp < 0.4 && sp < 1.6) {
      // standing / stopping: sole on it, settled just in front (no footfalls needed)
      const k = 1 - Math.exp(-dt * 8);
      const tx = o.pos.x + o.fwd.x * 0.32, tz = o.pos.z + o.fwd.z * 0.32;
      const nx = b.x + (tx - b.x) * k, nz = b.z + (tz - b.z) * k;
      D.v.set((nx - b.x) / dt, 0, (nz - b.z) / dt);
      b.x = nx; b.z = nz; b.y = BALL_R;
      ball.vel.copy(D.v);
      if (strike) { D.lastTouchT = this.time; o.a.touchT = 0; o.a.touchFoot = strike; o.a.touchSide = 0; }
      return;
    }
    const errD = Math.abs(wrap(Math.atan2(ux, uz) - Math.atan2(hx, hz)));
    const sgnD = Math.sign(wrap(Math.atan2(ux, uz) - Math.atan2(hx, hz)));
    // a foot lands where the ball has rolled back to it, or he wants a new direction and can reach it
    // (the footfall the last touch was planned for, or sooner if he's about to run over it)
    const atFoot = ahead > -0.2 && Math.abs(side) < 0.5 &&
      ((this.time >= D.nextT - 0.05 && ahead < FOOT_REACH + 0.32) || ahead < FOOT_REACH + 0.04);
    const canCut = errD > (easy ? 0.25 : 0.35) && dist < slot + 0.5 && ahead > -0.2 && this.time - D.lastTouchT > 0.08;
    const letGo = dsp < 0.4 || (o.letGo && o.team.isUser && o === o.team.controlled);
    const runningAway = ahead > FOOT_REACH + 0.15 && D.v.x * hx + D.v.z * hz > sp;
    if ((strike || runningAway) && letGo && sp > 0.6 && dist < slot + 0.6 && ahead > -0.2) {
      // stick released: this footfall (or a stretch, if it's running away) traps it under the sole
      D.plant = clamp(sp * 0.08, 0.2, 0.6); D.px = hx; D.pz = hz;
      touch(0, 0, strike || (o.a.touchFoot === 'R' ? 'L' : 'R'));
    } else if ((strike && (atFoot || canCut)) || ((o.a.swing || easy) && canCut)) {
      if (errD > 1.9 && sp > 2.2) {
        // turning back: plant and stop it with the sole so it doesn't run away
        D.plant = clamp(sp * 0.06, 0.25, 0.5); D.px = hx; D.pz = hz;
        touch(0, 0, strike || o.a.swing || 'R');
      } else {
        // along the run, or into the turn with the inside/outside of the foot
        let dx = ux, dz = uz, vel = o.vel;
        if (errD > 0.45) {
          // a cut: push it into the turn and plan for where he'll be running, not where he was
          const a2 = Math.atan2(hx, hz) + sgnD * Math.min(errD, 1.1); dx = Math.sin(a2); dz = Math.cos(a2);
          const tsp = Math.min(dsp, sp);
          vel = { x: o.vel.x * 0.3 + dx * tsp * 0.7, z: o.vel.z * 0.3 + dz * tsp * 0.7 };
        }
        const { v, T } = planTouch({ ball: b, pos: o.pos, vel, dir: { x: dx, z: dz }, sp, dri: ctrl, phase: o.a.gait, scale: errD > 0.45 ? 0.45 : near });
        touch(v.x, v.z, strike || o.a.swing || (o.a.touchFoot === 'R' ? 'L' : 'R'), errD > 0.45 ? sgnD : 0, T);
      }
    }
    // between touches he guides it with the outside/inside of the foot: a rolling ball within his
    // circle bends toward where he's steering (freer left/right control, better dribblers more so)
    const gs = Math.hypot(D.v.x, D.v.z);
    if (dsp > 0.4 && gs > 0.5 && dist < slot + 0.5 && !letGo && D.plant <= 0 && errD < 0.6) {
      const cur = Math.atan2(D.v.x, D.v.z), want = Math.atan2(ux, uz);
      const rate = (easy ? 5 + 4 * ctrl : 3 + 3 * ctrl) * dt;
      const turn = clamp(wrap(want - cur), -rate, rate);
      D.v.set(Math.sin(cur + turn) * gs, 0, Math.cos(cur + turn) * gs);
    }
    // roll
    const bs = Math.hypot(D.v.x, D.v.z);
    if (bs > 0) { const n = Math.max(0, bs - ROLL_DECEL * dt); D.v.multiplyScalar(n / bs); }
    b.x += D.v.x * dt; b.z += D.v.z * dt; b.y = BALL_R;
    // he can't run through it: shins knock it on
    relX = b.x - o.pos.x; relZ = b.z - o.pos.z;
    ahead = relX * hx + relZ * hz; side = relX * rx + relZ * rz;
    if (ahead > -0.05 && ahead < 0.24 && Math.abs(side) < 0.22) {
      b.x += hx * (0.24 - ahead); b.z += hz * (0.24 - ahead);
      const along = D.v.x * hx + D.v.z * hz;
      if (along < sp) { D.v.x += hx * (sp - along); D.v.z += hz * (sp - along); }
    }
    ball.vel.copy(D.v);
  }



  // Assisted pass: steer the ball onto the receiver wherever he moves.
  homePass(dt) {
    const g = this.guarantee, ball = this.ball;
    if (!g || g.id !== this.lastKick.id || this.phase !== 'play') return;
    const r = g.to, v = ball.vel, b = ball.pos;
    const h = Math.hypot(v.x, v.z);
    const d0 = hdist(r.pos, b);
    const lead = clamp(d0 / Math.max(h, 6), 0, 1) * 0.8;
    // never lead him out of play: the ball waits on the pitch for him
    const tx = clamp(r.pos.x + r.vel.x * lead + r.fwd.x * 0.5, -HL + 1.2, HL - 1.2);
    const tz = clamp(r.pos.z + r.vel.z * lead + r.fwd.z * 0.5, -HW + 1.2, HW - 1.2);
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const onGround = b.y < 0.35;
    // keep enough pace to always arrive, even if he runs away from it
    let want = onGround ? clamp(Math.max(h, 4 + d * 0.55, Math.hypot(r.vel.x, r.vel.z) + 4), 0, 24) : h;
    if (onGround && d < 2.5) want = Math.min(want, 2 + d * 2); // settle at the target spot
    const k = 1 - Math.exp(-dt * (onGround ? 12 : 2.5));
    const nx = v.x + (dx / d * want - v.x) * k, nz = v.z + (dz / d * want - v.z) * k;
    v.x = nx; v.z = nz;
  }

  goalFrame() {
    const ball = this.ball, b = ball.pos, v = ball.vel;
    const pr = 0.06, R = BALL_R + pr;
    for (const s of [1, -1]) {
      if (Math.abs(b.x - s * HL) > GD + 1) continue;
      const px = s * (HL + pr);
      let hit = false;
      // posts
      if (b.y < GH + pr) {
        for (const sz of [1, -1]) {
          const pz = sz * (GW + pr);
          const dx = b.x - px, dz = b.z - pz;
          const d = Math.hypot(dx, dz);
          if (d < R && d > 1e-4) {
            const nx = dx / d, nz = dz / d;
            b.x = px + nx * R; b.z = pz + nz * R;
            const vn = v.x * nx + v.z * nz;
            if (vn < 0) { v.x -= 1.65 * vn * nx; v.z -= 1.65 * vn * nz; hit = true; }
          }
        }
      }
      // crossbar
      if (Math.abs(b.z) < GW + pr) {
        const dx = b.x - px, dy = b.y - (GH + pr);
        const d = Math.hypot(dx, dy);
        if (d < R && d > 1e-4) {
          const nx = dx / d, ny = dy / d;
          b.x = px + nx * R; b.y = GH + pr + ny * R;
          const vn = v.x * nx + v.y * ny;
          if (vn < 0) { v.x -= 1.6 * vn * nx; v.y -= 1.6 * vn * ny; hit = true; }
        }
      }
      if (hit && ball.speed > 4 && this.phase === 'play') {
        this.sound.post();
        if (this.lastKick.kind === 'shot' && this.lastKick.team) this.stats[this.lastKick.team.key].woodwork++;
        this.hooks.event('OFF THE WOODWORK!');
        this.say('post', {}, 2);
      }
      // inside the net
      if (s * b.x > HL && s * b.x < HL + GD + 0.5 && Math.abs(b.z) < GW + 0.2 && b.y < GH + 0.1) {
        const inside = this._wasInside;
        if (s * b.x > HL + GD - BALL_R) { b.x = s * (HL + GD - BALL_R); v.x *= -0.12; v.z *= 0.6; v.y *= 0.6; this.netHit(s); }
        if (inside || s * b.x > HL + 0.3) {
          if (Math.abs(b.z) > GW - BALL_R) { b.z = Math.sign(b.z) * (GW - BALL_R); v.z *= -0.2; v.x *= 0.7; }
          if (b.y > GH - BALL_R) { b.y = GH - BALL_R; v.y = -Math.abs(v.y) * 0.2; }
        }
      }
    }
  }

  netHit(s) {
    if (this._netT && this.time - this._netT < 0.5) return;
    this._netT = this.time;
    this.netBulge = { s, t: 0 };
    this.sound.net();
  }

  ballInteractions(dt) {
    const ball = this.ball;
    const o = ball.owner;
    if (o) {
      const al = o.team.along(o.pos);
      if (o.team.isUser && !o.inBoxCall && al > 0.8 && Math.abs(o.pos.z) < 22) { o.inBoxCall = true; this.say('attack', { n: o.name }, 1); }
      else if (al < 0.65) o.inBoxCall = false;
      if (ball.held || o.skillT > 0 || o.pending) return;
      for (const d of o.team.opp.players) {
        if (d.stun > 0 || d.busy > 0 || d.isGK) continue;
        // the ball (or the dribbler) runs into his legs: blocked. Standing next to a still ball isn't a block.
        if (hdist(d.pos, ball.pos) < 0.42) {
          const rx = d.pos.x - ball.pos.x, rz = d.pos.z - ball.pos.z, rl = Math.hypot(rx, rz) || 1;
          const ballIn = ((ball.vel.x - d.vel.x) * rx + (ball.vel.z - d.vel.z) * rz) / rl;
          const carrierIn = ((o.vel.x - d.vel.x) * rx + (o.vel.z - d.vel.z) * rz) / rl;
          if (ballIn < 1 && carrierIn < 1) continue;
          const facing = (ball.pos.x - d.pos.x) * d.fwd.x + (ball.pos.z - d.pos.z) * d.fwd.z > 0;
          if (facing) this.gainBall(d, false);
          else this.knockLoose(o, d, 2.5);
          if (d.team.isUser) this.hooks.event('BALL WON');
          return;
        }
        // a poke at an exposed ball (only when it's out away from the dribbler's feet)
        // he has to see it first: reaction time by difficulty (instant for the player's own man),
        // counted from when the ball is exposed near him, not from when it reaches his foot
        if (hdist(d.pos, ball.pos) > 2.5) { d.exposedT = 0; continue; }
        const e = exposure({ ball: ball.pos, body: o.pos, defender: d.pos });
        if (e <= 0.5) { d.exposedT = 0; continue; }
        d.exposedT = (d.exposedT || 0) + dt;
        const react = d.team.isUser ? (d === d.team.controlled ? 0 : 0.25) : this.diff.react * 0.6;
        if ((d.pokeCD || 0) > 0 || d.exposedT < react) continue;
        const fx = d.pos.x + d.fwd.x * 0.4, fz = d.pos.z + d.fwd.z * 0.4;
        if (Math.hypot(ball.pos.x - fx, ball.pos.z - fz) > 0.7) continue;
        d.pokeCD = 0.6;
        const res = tackleOutcome({ exposure: e + (d.team.isUser ? 0 : this.aiDefQuality()), def: d.st.def, dri: o.st.dri, phy: o.st.phy || 0.7, slide: false, rnd: Math.random() });
        if (res === 'miss') continue;
        o.stun = 0.35; o.a.hitT = 0; o.a.hitBig = false;
        if (res === 'win') this.gainBall(d, false);
        else this.knockLoose(o, d, rand(3, 5));
        if (d.team.isUser) this.hooks.event('BALL WON');
        return;
      }
      return;
    }

    const sp = ball.speed;
    if (this._kickSeen !== this.lastKick.id) { this._kickSeen = this.lastKick.id; this.kickAge = 0; }
    this.kickAge += dt;
    // assisted pass: it always reaches the intended teammate
    let g = this.guarantee;
    if (g && (g.id !== this.lastKick.id || g.t > 7)) g = this.guarantee = null;
    if (g) {
      g.t += dt;
      const r = g.to;
      if (g.t > (g.minT || 0) && hdist(r.pos, ball.pos) < 1.9 && ball.pos.y < (g.maxY || 2.7) && r.stun <= 0) { this.guarantee = null; this.gainBall(r, false); return; }
      if (sp < 0.6 && hdist(r.pos, ball.pos) > 3) g = this.guarantee = null;
    }
    const afterHeader = this.lastKick.header;
    let best = null, bd = 1e9, bestType = null;
    for (const p of this.players) {
      if (p.cool > 0 || p.stun > 0) continue;
      if (g && p !== g.to) continue;
      if (p.action === 'slide' || p.action === 'dive' || p.action === 'header') continue;
      const d = hdist(p.pos, ball.pos);
      if (d > 2.2) continue;
      const by = ball.pos.y;
      if (p.wall && this.lastKick.setpiece && this.kickAge < 1.2) {
        // the wall jumps together: anything under their heads is blocked, anything over is gone
        if (by < 2.15 && d < 0.55 && d < bd) { bd = d; best = p; bestType = 'wall'; }
        continue;
      }
      if (p.isGK && p.team.inOwnBox(ball.pos)) {
        if (p.save && !p.save.willSave) continue;
        if (by < 2.5 && d < 1.25) { if (d < bd) { bd = d; best = p; bestType = 'hands'; } }
        continue;
      }
      if (by > 1.2 && by < 2.6 && d < 0.8 && ball.vel.y < 4) {
        // a ball that was just headed gets chested down instead of headed again (no header ping-pong)
        if (d < bd) { bd = d; best = p; bestType = afterHeader ? 'control' : 'header'; }
      } else if (by < 1.2 && d < (sp < 5 ? 1.0 : 0.8)) {
        const isShot = this.lastKick.kind === 'shot' && this.lastKick.team !== p.team && sp > 11;
        if (isShot || sp > 22) {
          // a shot can only be blocked by someone right in its path
          const toP = ((p.pos.x - ball.pos.x) * ball.vel.x + (p.pos.z - ball.pos.z) * ball.vel.z) > 0;
          if (d < 0.5 && toP && d < bd) { bd = d; best = p; bestType = 'block'; }
        } else if (this.lastKick.kind === 'pass' && this.lastKick.team !== p.team) {
          // cutting out a pass: it has to leave the passer's foot first, and a firm pass is hard to read
          const reach = clamp(1.0 - (sp - 6) * 0.045, 0.5, 1.0);
          if (this.kickAge > 0.12 && d < reach && d < bd) { bd = d; best = p; bestType = 'control'; }
        } else if (d < bd) { bd = d; best = p; bestType = 'control'; }
      }
    }
    if (!best) return;
    if (bestType === 'control') this.gainBall(best, false);
    else if (bestType === 'hands') {
      this.gainBall(best, true);
      best.save = null;
    } else if (bestType === 'header') this.header(best);
    else if (bestType === 'wall') {
      ball.vel.set(-ball.vel.x * rand(0.2, 0.4) + gauss() * 2, rand(1.5, 4), -ball.vel.z * 0.3 + gauss() * 3);
      ball.spin = 0;
      this.lastTouch = best; best.cool = 0.5;
      if (this.lastKick.team) this.stats[this.lastKick.team.key].blocked++;
      this.kickId++;
      this.lastKick = { kind: 'block', team: best.team, id: this.kickId, by: best };
      this.sound.thud(6);
      this.hooks.event('OFF THE WALL!');
    } else if (bestType === 'block') {
      const blockChance = this.lastKick.kind === 'shot' ? 0.22 + best.st.def * 0.18 : 0.5;
      if (Math.random() < blockChance) {
        ball.vel.multiplyScalar(-rand(0.15, 0.35));
        ball.vel.x += gauss() * 3; ball.vel.z += gauss() * 3; ball.vel.y = rand(1, 4);
        this.lastTouch = best;
        best.cool = 0.4;
        this.sound.thud(6);
        if (this.lastKick.kind === 'shot' && this.lastKick.team) this.stats[this.lastKick.team.key].blocked++;
        this.hooks.event('BLOCKED!');
      } else best.cool = 0.3;
    }
  }

  header(p) {
    const ball = this.ball, team = p.team;
    if (this.offsideTouch(p)) return;
    this.stats[team.key].headers++; p.ms.headers++;
    p.a.headerT = 0;
    p.action = 'header';
    p.busy = 0.5;
    p.actionT = 0;
    p.cool = 0.45;
    this.lastTouch = p;
    const gx = team.attackX;
    const distGoal = Math.hypot(gx - ball.pos.x, ball.pos.z);
    let vel;
    let kind = 'pass';
    if (distGoal < 17 && Math.abs(ball.pos.z) < 13 && team.along(ball.pos) > 0.7) {
      const gk = team.opp.gk;
      const side = Math.abs(gk.pos.z) > 0.3 ? -Math.sign(gk.pos.z) : (Math.random() < 0.5 ? 1 : -1);
      const tgt = new V3(gx, rand(0.2, 1.4), side * rand(0.6, GW - 0.25) + gauss() * 0.9 * (1.3 - p.st.sho));
      const vh = 12 + p.st.sho * 6;
      const dx = tgt.x - ball.pos.x, dz = tgt.z - ball.pos.z, dh = Math.hypot(dx, dz);
      const t = dh / vh;
      vel = new V3(dx / dh * vh, (tgt.y - ball.pos.y) / t + 0.5 * GRAVITY * t, dz / dh * vh);
      kind = 'shot';
      this.stats[team.key].shots++; p.ms.shots++;
      const x = shotXg(ball.pos, gx, { header: true });
      this.stats[team.key].xg += x; p.ms.xg += x; if (x >= 0.3) this.stats[team.key].big++;
    } else if (team.along(ball.pos) < 0.42) {
      vel = new V3(team.dir * rand(10, 15), rand(5, 8), Math.sign(ball.pos.z || 1) * rand(2, 7));
    } else {
      let mate = null, bs = -1e9;
      for (const m of team.players) {
        if (m === p || m.isGK) continue;
        const d = hdist(m.pos, p.pos);
        if (d > 25 || d < 4) continue;
        const sc = (m.pos.x - p.pos.x) * team.dir * 0.2 - d * 0.05 - this.laneRisk(p.pos, m.pos, team.opp);
        if (sc > bs) { bs = sc; mate = m; }
      }
      if (mate) {
        vel = this.loftVel(ball.pos, mate.pos, 0.35).multiplyScalar(0.92);
        mate.recv = { point: mate.pos.clone(), t: 0 };
        if (team.isUser) this.setControlled(mate);
      } else vel = new V3(team.dir * 9, 4, 0);
    }
    ball.vel.copy(vel);
    ball.spin = 0;
    this.kickId++;
    this.lastKick = { kind, team, id: this.kickId, by: p, header: true };
    this.offsideSnapshot(p);
    this.guarantee = null;
    this.sound.kick(0.4);
  }

  // ---------------------------------------------------------------- rules
  checkGoalAndOut() {
    if (this.ball.held) return;
    if (this.drill && !this.drill.live()) return;
    const b = this.ball.pos;
    for (const s of [1, -1]) {
      if (s * b.x > HL + BALL_R) {
        const attackers = this.home.dir === s ? this.home : this.away;
        if (Math.abs(b.z) < GW && b.y < GH) { this.goalScored(attackers); return; }
        const defenders = attackers.opp;
        const lt = this.lastTouch ? this.lastTouch.team : attackers;
        if (this.lastKick.kind === 'shot' && this.lastKick.team === attackers && Math.abs(b.z) < GW + 4) {
          this.sound.ooh();
          this.hooks.event('SO CLOSE!');
          this.say('miss', {}, 2);
        }
        if (this.drill) { this.drill.onOut(); return; }
        if (lt === defenders) {
          this.startRestart('corner', attackers, new V3(s * (HL - 0.4), BALL_R, Math.sign(b.z || 1) * (HW - 0.4)));
        } else {
          this.startRestart('goalkick', defenders, new V3(s * (HL - F.SIX_L), BALL_R, Math.sign(b.z || 1) * 4));
        }
        return;
      }
    }
    if (Math.abs(b.z) > HW + BALL_R) {
      if (this.drill) { this.drill.onOut(); return; }
      const lt = this.lastTouch ? this.lastTouch.team : this.home;
      this.startRestart('throw', lt.opp, new V3(clamp(b.x, -HL + 1, HL - 1), BALL_R, Math.sign(b.z) * (HW + 0.3)));
    }
  }

  goalScored(team) {
    if (this.drill) { this.drill.onGoal(); return; }
    this.goalTime = this.time;
    team.score++;
    this.phase = 'goal';
    this.phaseT = 0;
    this.concede = team.opp;
    const lt = this.lastTouch;
    const own = lt && lt.team !== team;
    this.scorer = own || !lt ? team.striker : lt;
    this.events.push({ min: Math.max(1, Math.ceil(this.minute)), type: own ? 'og' : 'goal', team: team.key, name: own ? lt.name : this.scorer.name,
      assist: !own && this.assist && this.assist.to === lt && this.assist.by.team === team ? this.assist.by.name : null });
    if (!own && lt) {
      lt.ms.goals++;
      if (this.assist && this.assist.to === lt && this.assist.by.team === team) this.assist.by.ms.assists++;
    }
    this.assist = null;
    team.opp.gk.ms.conceded++;
    for (const q of team.opp.players) if (q.role !== 'GK') q.ms.conceded++;
    if (this.onCounted !== this.lastKick.id && this.lastKick.team === team) { this.onCounted = this.lastKick.id; this.stats[team.key].on++; }
    this.restart = null;
    this.ball.owner = null;
    this.hooks.hint('');
    // your scorer does your celebration (Settings, or tap one after the goal); theirs pick one
    this.celeb = { kind: pickCeleb(team.isUser ? this.settings.celebration : 'random'), t: 0, pick: team.isUser && !own ? 1.4 : 0 };
    this.hooks.goal(team, own ? `${lt.name} (OG)` : this.scorer.name, own);
    this.say(own ? 'ownGoal' : team.isUser ? 'goalHome' : 'goalAway', { n: this.scorer.name, s: this.scoreLine(), m: ordinal(Math.max(1, Math.ceil(this.minute))) }, 3);
    if (team.isUser) this.sound.cheer(); else { this.sound.swell(0.4, 3, 700); this.sound.ooh(); }
    this.sound.whistle(1);
    for (const p of this.players) {
      p.recv = null;
      p.a.celebrateStyle = Math.random() < 0.5 ? 0 : 1;
      p.a.celebClip = (Math.random() * 4) | 0;
      p.a.sadClip = Math.random() < 0.5 ? 1 : 0;
    }
    this.scorer.a.celebrateStyle = 0;
    this.celebSpot = new V3(team.dir * (HL - 3), 0, Math.sign(this.scorer.pos.z || 1) * (HW - 3));
  }

  setupKickoff(team) {
    this.celeb = null;
    this.placeKickoff(team);
    this.phase = 'restart';
    this.phaseT = 0;
    this.restart.wait = 0;
    this.sound.whistle(1);
    this.hooks.hint(team.isUser ? 'Tap PASS to kick off' : '');
    if (this.half === 2 && this.clock === 0) this.say('secondHalf', {}, 2);
  }

  startRestart(type, team, spot, opts = {}) {
    const ball = this.ball;
    this.offside = null;
    this.phase = 'restart';
    this.phaseT = 0;
    ball.owner = null;
    ball.vel.set(0, 0, 0);
    ball.spin = 0;
    for (const p of this.players) { p.recv = null; p.pending = null; p.charging = false; p.cornerSpot = null; p.wall = false; }
    this.adv = null;
    const toGoal = Math.hypot(team.attackX - spot.x, spot.z);
    const shooting = type === 'penalty' || (type === 'freekick' && !opts.indirect && toGoal < 33 && Math.abs(spot.z) < 24);
    let taker;
    if (type === 'goalkick') taker = team.gk;
    else if (opts.taker) taker = opts.taker;
    else if (shooting) taker = team.players.filter(q => !q.isGK).sort((a, b) => b.st.sho - a.st.sho)[0]; // the dead-ball specialist
    else {
      let bd = 1e9;
      for (const p of team.players) {
        if (p.isGK) continue;
        const d = hdist(p.pos, spot);
        if (d < bd) { bd = d; taker = p; }
      }
    }
    const aim = new V3(team.dir, 0, 0);
    if (type === 'throw') aim.set(team.dir * 0.5, 0, -Math.sign(spot.z)).normalize();
    if (type === 'corner') aim.set(-Math.sign(spot.x) * 0.6, 0, -Math.sign(spot.z)).normalize();
    if (shooting) aim.set(team.attackX - spot.x, 0, -spot.z).normalize();
    const r = { type, team, taker, spot: spot.clone(), aim, wait: 0, ready: false, shooting };
    this.restart = r;
    this.possTeam = team;
    if (!this.drill && type in this.stats[team.key]) this.stats[team.key][type]++;
    const labels = { throw: 'THROW-IN', corner: 'CORNER', goalkick: 'GOAL KICK', freekick: opts.indirect ? '' : 'FREE KICK', penalty: 'PENALTY!' };
    this.hooks.fade(() => {
      ball.pos.copy(spot);
      ball.pos.y = BALL_R;
      ball.vel.set(0, 0, 0);
      const behind = aim.clone().multiplyScalar(-0.7);
      if (type === 'throw') taker.pos.set(spot.x, 0, spot.z);
      else taker.pos.set(spot.x + behind.x, 0, spot.z + behind.z);
      taker.vel.set(0, 0, 0);
      taker.desired.set(0, 0, 0);
      taker.facing = Math.atan2(aim.x, aim.z);
      taker.fwd.set(Math.sin(taker.facing), 0, Math.cos(taker.facing));
      ball.owner = taker;
      ball.held = type === 'throw';
      taker.a.throwReady = type === 'throw';
      // keep opponents at a respectful distance (9.15 m at a free kick)
      const keep = type === 'freekick' ? 9.15 : 6;
      for (const p of team.opp.players) {
        const d = hdist(p.pos, spot);
        if (d < keep && !p.isGK) {
          const dx = p.pos.x - spot.x, dz = p.pos.z - spot.z;
          const l = Math.hypot(dx, dz) || 1;
          p.pos.x = clamp(spot.x + dx / l * keep, -HL + 0.5, HL - 0.5); p.pos.z = clamp(spot.z + dz / l * keep, -HW + 1, HW - 1);
        }
      }
      if (type === 'corner') this.arrangeCorner(team, spot);
      if (type === 'freekick' && shooting) this.arrangeWall(team, spot, toGoal);
      if (type === 'penalty') this.arrangePenalty(team, spot);
      if (team.isUser) {
        if (!taker.isGK) this.setControlled(taker);
        this.hooks.hint(type === 'corner' ? 'PASS = cross · THROUGH = short' : type === 'throw' ? 'Aim & tap PASS to throw'
          : type === 'penalty' ? 'Aim, then hold & release SHOOT'
          : shooting ? 'Hold SHOOT to curl it · PASS = short' : 'Tap PASS (or SHOOT for long)');
      } else if (type === 'penalty') this.hooks.hint('Your keeper picks a side…');
      r.ready = true;
      r.wait = 0;
    });
    if (type !== 'penalty') this.hooks.event(labels[type]);
    if (type === 'corner') this.say('corner', {}, 1);
    if (type === 'freekick' && shooting) this.say('freekick', { n: taker.name }, 2);
    if (type === 'penalty') this.say('penalty', { n: taker.name }, 3);
  }

  // ---------------------------------------------------------------- your player's ring
  // Like FC Mobile: run your player into the ball and you take it. A loose ball that comes inside
  // your ring is yours; an opponent's ball inside it is won off him (most of the time).
  userClaim(dt) {
    const team = this.home, q = team.controlled, ball = this.ball;
    if (!q || q.isGK || q.busy > 0 || q.stun > 0 || q.skill || ball.held || this.drill) return;
    this._claimCD = (this._claimCD || 0) - dt;
    const d = hdist(q.pos, ball.pos);
    if (d > 0.9 || ball.pos.y > 1.2) return;
    const o = ball.owner;
    if (!o) {
      const g = this.guarantee;
      if (g && g.to.team === team && g.to !== q) return; // our own pass on its way to a team-mate
      if (q.cool > 0 && this.lastKick.by === q) return;   // he's only just kicked it
      this.guarantee = null;
      this.gainBall(q, false);
      return;
    }
    if (o.team === team || this._claimCD > 0 || o.isGK) return;
    if (o.skill && o.skill.type === 'up') return; // a rainbow flick is over his head
    this._claimCD = 0.35;
    const toward = (ball.pos.x - q.pos.x) * q.vel.x + (ball.pos.z - q.pos.z) * q.vel.z > 0 ? 0.12 : 0;
    const chance = clamp(0.6 + (q.st.def - o.st.dri) * 0.5 + toward - (o.skillT > 0 ? 0.25 : 0), 0.3, 0.92);
    if (Math.random() < chance) {
      o.stun = 0.35; o.a.hitT = 0; o.a.hitBig = false;
      this.gainBall(q, false);
      q.ms.tackles++; this.stats[team.key].tackles++;
      this.sound.kick(0.3);
      this.hooks.event('WON IT!');
    }
  }

  // ---------------------------------------------------------------- offside
  // when a player plays the ball, note which team-mates are in an offside position
  offsideSnapshot(p) {
    this.offside = null;
    if (this.settings.offside === false || this.phase !== 'play') return;
    const team = p.team, dir = team.dir, bx = this.ball.pos.x;
    const line = secondLastX(team.opp.players.map(q => q.pos.x), dir);
    const set = new Set();
    for (const q of team.players) if (q !== p && offsidePosition({ x: q.pos.x, ballX: bx, line, dir })) set.add(q);
    if (set.size) this.offside = { team, set, line };
  }

  // a player touching the ball: offside if he was in an offside position when it was played.
  // Anyone else playing it (not a save or a block) starts a new phase.
  offsideTouch(p) {
    const o = this.offside;
    if (!o || this.phase !== 'play') return false;
    this.offside = null;
    if (o.team !== p.team || !o.set.has(p)) return false;
    const spot = p.pos.clone().setY(BALL_R);
    spot.x = clamp(spot.x, -HL + 1, HL - 1); spot.z = clamp(spot.z, -HW + 1, HW - 1);
    this.ball.owner = null;
    this.sound.whistle(1);
    this.hooks.event('OFFSIDE');
    this.say('offside', { n: p.name }, 2);
    this.stats[p.team.key].offsides = (this.stats[p.team.key].offsides || 0) + 1;
    this.startRestart('freekick', p.team.opp, spot, { indirect: true });
    return true;
  }

  // ---------------------------------------------------------------- fouls, cards, advantage
  // a challenge that may be a foul; returns true when the referee blows (or plays advantage)
  maybeFoul(def, victim, { slide, missed, bodyContact }) {
    if (this.phase !== 'play' || this.adv) return false;
    const behind = fromBehind(victim, def.pos);
    if (Math.random() >= foulChance({ slide, missed, bodyContact, behind })) return false;
    const team = victim.team, spot = victim.pos.clone().setY(BALL_R);
    spot.x = clamp(spot.x, -HL + 1, HL - 1); spot.z = clamp(spot.z, -HW + 1, HW - 1);
    const type = restartForFoul(spot, team.attackX);
    const s = Math.sign(team.attackX);
    const between = def.team.players.filter(q => !q.isGK && q !== def && (q.pos.x - spot.x) * s > 0).length;
    const dogso = between === 0 && team.along(spot) > 0.5 && isDogso({ spot, attackX: team.attackX, defendersBetween: between });
    let card = cardFor({ slide, behind, dogso, rnd: Math.random() });
    if (type === 'penalty' && card === 'red' && dogso && !(slide && behind)) card = 'yellow'; // a penalty already restores the chance
    this.stats[def.team.key].fouls++;
    victim.stun = Math.max(victim.stun, 0.9); victim.a.hitT = 0; victim.a.hitBig = true;
    // advantage: the fouled side still has the ball in the other half, so play on
    const b = this.ball;
    let near = b.owner ? b.owner.team === team && b.owner !== victim : false;
    if (!b.owner) {
      // loose: a team-mate (not the man on the floor) is first to it
      let best = null, bd = 4;
      for (const q of this.players) { const dq = hdist(q.pos, b.pos); if (q !== victim && dq < bd) { bd = dq; best = q; } }
      near = !!best && best.team === team;
    }
    if (type === 'freekick' && card !== 'red' && team.along(spot) > 0.5 && near) {
      this.adv = { t: 0, team, spot, def, card };
      this.hooks.event('ADVANTAGE');
      this.sound.whistle(0.4);
      this.say('advantage', {}, 2);
      return true;
    }
    this.sound.whistle(1);
    this.foulRestart(type, team, spot, def, card);
    return true;
  }

  foulRestart(type, team, spot, def, card) {
    if (card) this.giveCard(def, card);
    else { this.hooks.event('FOUL'); this.say('foul', { n: def.name }, 2); }
    this.startRestart(type, team, spot);
  }

  // play on for a few seconds; if the fouled side loses it straight away, back for the free kick
  updateAdvantage(dt) {
    const a = this.adv;
    if (!a) return;
    a.t += dt;
    const o = this.ball.owner;
    if (a.t < 2.5 && o && o.team !== a.team) {
      this.adv = null;
      this.sound.whistle(1);
      this.foulRestart('freekick', a.team, a.spot, a.def, a.card);
    } else if (a.t >= 2.5) {
      this.adv = null;
      if (a.card) this.giveCard(a.def, a.card); // booked at the next chance
    }
  }

  giveCard(p, card) {
    const key = p.team.key;
    if (card === 'yellow') {
      p.yellows = (p.yellows || 0) + 1;
      p.ms.yellow++;
      this.events.push({ min: Math.max(1, Math.ceil(this.minute)), type: p.yellows >= 2 ? 'red2' : 'yellow', team: key, name: p.name });
      this.stats[key].yellows++;
      if (p.yellows < 2) {
        this.hooks.banner('YELLOW CARD', p.name, 2200, 'card-yellow');
        this.say('yellow', { n: p.name }, 2);
        return;
      }
      card = 'red'; // second yellow
    }
    if (p.isGK) { this.hooks.banner('YELLOW CARD', p.name, 2200, 'card-yellow'); return; } // keepers stay on (no sub keeper)
    this.stats[key].reds++;
    p.ms.red++;
    if (!(p.yellows >= 2)) this.events.push({ min: Math.max(1, Math.ceil(this.minute)), type: 'red', team: key, name: p.name });
    this.hooks.banner('RED CARD', `${p.name}${p.yellows >= 2 ? ' · second yellow' : ''} — off!`, 2800, 'card-red');
    this.say('red', { n: p.name }, 3);
    this.sendOff(p);
  }

  get inShootout() { return !!(this.drill && this.drill.kind === 'shootout'); }

  // the shootout is over: that's full time
  endShootout(res) {
    this.shootoutResult = res;
    this.phase = 'fulltime';
    this.phaseT = 0;
    this.restart = null;
    this.sound.whistle(3, true);
    this.hooks.fullTime();
  }

  // a new shape mid-match: every player takes the slot of the same number in the new formation
  setFormation(team, name) {
    if (!FORMATIONS[name]) return;
    team.formationName = name;
    team.formation = FORMATIONS[name];
    team.kickoff = kickoffShape(team.formation);
    for (const p of [...team.players, ...this.sentOff.filter(q => q.team === team)]) { p.slot = team.formation[p.idx]; p.role = p.slot.role; }
  }

  // a skill game: take a player out of the scene entirely
  bench(p) {
    const t = p.team;
    t.players.splice(t.players.indexOf(p), 1);
    this.players.splice(this.players.indexOf(p), 1);
    (this.benched || (this.benched = [])).push(p);
    p.model.root.visible = false;
    if (this.ball.owner === p) this.ball.owner = null;
    if (this.blobs) this.blobs.count = this.players.length;
    this.recBuf = null;
  }

  sendOff(p) {
    const t = p.team;
    t.players.splice(t.players.indexOf(p), 1);
    this.players.splice(this.players.indexOf(p), 1);
    this.sentOff.push(p);
    p.model.root.visible = false;
    if (this.ball.owner === p) this.ball.owner = null;
    if (t.controlled === p) { t.controlled = null; this.setControlled(this.bestDefender(t) || t.players[1]); }
    if (this.blobs) this.blobs.count = this.players.length;
    this.recBuf = null; // the replay buffer is laid out per player
  }

  // the wall: 3–5 of the defending side, 9.15 m off, covering the near post
  arrangeWall(team, spot, toGoal) {
    const def = team.opp, n = toGoal < 20 ? 5 : toGoal < 26 ? 4 : 3;
    const spots = wallSpots(spot, team.attackX, n);
    const cx = spots.reduce((a, w) => a + w.x, 0) / n, cz = spots.reduce((a, w) => a + w.z, 0) / n;
    const men = def.players.filter(q => !q.isGK).sort((a, b) => Math.hypot(a.pos.x - cx, a.pos.z - cz) - Math.hypot(b.pos.x - cx, b.pos.z - cz)).slice(0, n);
    men.forEach((q, i) => { q.pos.set(spots[i].x, 0, spots[i].z); q.vel.set(0, 0, 0); q.cornerSpot = q.pos.clone(); q.wall = true; });
    const g = def.gk;
    g.pos.set(team.attackX - Math.sign(team.attackX) * 0.8, 0, clamp(-cz * 0.15 - Math.sign(spot.z || 1) * 0.9, -GW + 0.6, GW - 0.6));
    g.cornerSpot = g.pos.clone();
  }

  // everyone but the taker and the keeper outside the box, behind the ball
  arrangePenalty(team, spot) {
    const s = Math.sign(team.attackX), edge = team.attackX - s * (F.BOX_L + 1.5);
    let k = 0;
    for (const q of this.players) {
      if (q === this.restart.taker) continue;
      if (q === team.opp.gk) { q.pos.set(team.attackX - s * 0.3, 0, 0); q.vel.set(0, 0, 0); q.cornerSpot = q.pos.clone(); continue; }
      if (q.isGK) continue;
      const z = ((k++ % 9) - 4) * 3.2;
      q.pos.set(edge - s * (k > 9 ? 3 : 0) - s * Math.random(), 0, z);
      q.vel.set(0, 0, 0);
      q.cornerSpot = q.pos.clone();
    }
  }

  // a free kick or penalty struck at goal; aim picks the spot, power trades pace for accuracy
  setPieceShot(p, power, aim) {
    const r = this.restart, pen = r && r.type === 'penalty';
    const team = p.team, gx = team.attackX, b = this.ball.pos;
    const s = Math.sign(gx - b.x);
    // where the aim line meets the goal line (a sensible corner if he aims nowhere near it)
    let zT = aim && aim.x * s > 0.15 ? b.z + aim.z * (gx - b.x) / aim.x : Math.sign(-b.z || 1) * (GW - 0.6);
    zT = clamp(zT, -GW - 2, GW + 2);
    const toGoal = Math.hypot(gx - b.x, b.z);
    const spread = (pen ? 0.18 : 0.3 + toGoal * 0.018) * (1.45 - p.st.sho) * (0.7 + power * 0.6) * (team.isUser ? 1 : this.diff.shootErr);
    zT += gauss() * spread;
    let vel, yT, spin = 0;
    const vh = pen ? 20 + power * 9 : 17 + power * 8;
    if (pen) {
      yT = clamp(0.3 + power * 1.6 + gauss() * spread * 0.5, 0.15, GH + 0.8);
      vel = aimCurl({ from: b.clone(), target: new V3(gx, yT, zT), vh, spin: 0 });
    } else {
      // bend it toward the middle of the goal, and pick the lowest height that clears the wall
      spin = 6.5 * (Math.abs(zT) > 0.5 ? -Math.sign(zT) : (Math.random() < 0.5 ? 1 : -1)) * s;
      const wallX = b.x + (gx - b.x) / toGoal * 9.15;
      yT = GH + 0.3;
      for (let y = 1.0; y <= GH + 0.3; y += 0.1) {
        const v = aimCurl({ from: b.clone(), target: new V3(gx, y, zT), vh, spin });
        if (toGoal < 11 || fly(b.clone(), v, spin, wallX).y > 2.25) { yT = y; vel = v; break; }
      }
      yT += gauss() * spread * 0.45;
      vel = aimCurl({ from: b.clone(), target: new V3(gx, yT, zT), vh, spin });
    }
    this.takeRestart('setpiece');
    this.kick(p, { mode: 'vel', vel, spin, target: new V3(gx, yT, zT), power: 0.6 + power * 0.4, kind: 'shot', setpiece: true });
    if (pen) this.penaltyKeeper(team.opp.gk, zT);
  }

  // the keeper guesses at a penalty: a dive one way (or stays up) as it's struck
  penaltyKeeper(gk, zT) {
    const guess = Math.random();
    const right = guess < 0.4 ? 1 : guess < 0.8 ? -1 : 0;
    let side = right;
    // a good keeper reads it more often
    if (Math.random() < 0.15 + (gk.st.gk || 0.7) * 0.2) side = Math.abs(zT) < 1 ? 0 : Math.sign(zT);
    gk.penGuess = { side, id: this.kickId + 1 }; // for the kick about to be struck
  }

  arrangeCorner(att, spot) {
    const s = Math.sign(spot.x), sz = Math.sign(spot.z);
    const atkSpots = [[6, sz * 2.5], [7, -sz * 2.5], [11, 0], [9, sz * 6], [10, -sz * 6], [18, 0], [17, sz * 10]];
    // strikers and centre-backs attack the ball, then wide players and midfielders
    const pri = ['ST', 'CB', 'CAM', 'LW', 'RW', 'CM', 'LM', 'RM', 'DM'];
    const order = att.players.filter(q => !q.isGK && q !== this.restart.taker).sort((a, b) => pri.indexOf(a.role) - pri.indexOf(b.role)).slice(0, 7);
    order.forEach((p, i) => {
      if (p === this.restart.taker) return;
      const [dx, z] = atkSpots[i];
      p.pos.set(s * (HL - dx) + gauss() * 0.6, 0, z + gauss() * 0.6);
      p.cornerSpot = p.pos.clone();
    });
    const def = att.opp;
    const defSpots = [[1.5, sz * 3], [1.5, -sz * 3], [5.5, sz * 2], [6.5, -sz * 1.5], [8, sz * 5], [8.5, -sz * 5], [11, 1], [12, -4], [16, 3], [20, 0]];
    let j = 0;
    for (const p of def.players) {
      if (p.isGK) { p.pos.set(s * (HL - 0.8), 0, sz * 0.8); continue; }
      const [dx, z] = defSpots[j++] || [14, 0];
      p.pos.set(s * (HL - dx) + gauss() * 0.4, 0, z + gauss() * 0.4);
      p.cornerSpot = p.pos.clone();
    }
  }

  updateRestart(dt) {
    const r = this.restart;
    if (!r || !r.ready) return;
    r.wait += dt;
    const t = r.taker;
    t.desired.set(0, 0, 0);
    t.vel.set(0, 0, 0);
    t.lockFacing = null;
    t.facing = Math.atan2(r.aim.x, r.aim.z);
    t.fwd.set(Math.sin(t.facing), 0, Math.cos(t.facing));
    if ((!r.team.isUser || t.isGK) && r.wait > (r.type === 'kickoff' ? 1.2 : r.shooting ? 2.4 : 1.6)) this.aiTakeRestart();
    if (r.team.isUser && r.wait > 30 && !r.taker.isGK) this.takeRestart('ground'); // only if you've walked away
  }

  aiTakeRestart() {
    const r = this.restart;
    const p = r.taker, team = r.team;
    if (r.type === 'penalty' || (r.shooting && Math.random() < 0.6)) {
      // pick a corner and hit it
      const z = (Math.random() < 0.5 ? 1 : -1) * rand(1.6, GW - 0.4);
      this.setPieceShot(p, rand(0.4, 0.8), new V3(team.attackX - this.ball.pos.x, 0, z - this.ball.pos.z).normalize());
      return;
    }
    if (r.type === 'corner') {
      let best = null, bs = -1e9;
      for (const m of team.players) {
        if (m === p) continue;
        const inBox = Math.abs(m.pos.x - team.attackX) < 13 && Math.abs(m.pos.z) < 12;
        if (!inBox) continue;
        const sc = m.st.sho + rand(0, 0.6) - this.nearestOpp(m).d * -0.05;
        if (sc > bs) { bs = sc; best = m; }
      }
      r.aim.copy(best ? best.pos.clone().sub(p.pos).setY(0).normalize() : r.aim);
      this.takeRestart('ground', best);
    } else if (r.type === 'goalkick' && Math.random() < 0.45) {
      const m = team.players[Math.min(team.players.length - 1, rand(8, 11) | 0)];
      r.aim.copy(m.pos.clone().sub(p.pos).setY(0).normalize());
      this.takeRestart('long', m);
    } else {
      const m = this.aiBestPass(p, r.type === 'kickoff' ? 18 : 30, true);
      if (m) r.aim.copy(m.target.clone().sub(p.pos).setY(0).normalize());
      this.takeRestart('ground', m ? m.m : null);
    }
  }

  takeRestart(kind, forced = null) {
    const r = this.restart;
    if (!r) return;
    const p = r.taker, team = r.team;
    this.restart = null;
    this.phase = 'play';
    this.phaseT = 0;
    this.hooks.hint('');
    this.restartKick = r.type;
    p.a.throwReady = false;
    if (this.ball.owner !== p) this.ball.owner = p;
    if (kind === 'setpiece') return;
    const aim = r.aim.clone().normalize();
    if (r.type === 'throw') {
      const inward = -Math.sign(r.spot.z);
      if (aim.z * inward < 0.25) { aim.z = 0.25 * inward; aim.normalize(); }
      let m = forced;
      if (!m) {
        let bs = 1e9;
        for (const q of team.players) {
          if (q === p) continue;
          const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz);
          if (d < 3 || d > 26) continue;
          const ang = Math.acos(clamp((dx * aim.x + dz * aim.z) / d, -1, 1));
          if (ang > 1.1) continue;
          const sc = ang * 2 + d * 0.03;
          if (sc < bs) { bs = sc; m = q; }
        }
        // nobody where he's aiming: the nearest teammate rather than throwing it away
        if (!m) for (const q of team.players) { if (q === p || q.isGK) continue; const d = hdist(q.pos, p.pos); if (d > 3 && d < bs) { bs = d; m = q; } }
      }
      const target = m ? m.pos.clone().addScaledVector(m.vel, 0.6) : p.pos.clone().addScaledVector(aim, 12);
      target.z = clamp(target.z, -HW + 1, HW - 1);
      if (m) m.recv = { point: target.clone(), t: 0 };
      if (team.isUser && m) this.setControlled(m);
      p.action = 'throw'; p.busy = 0.55; p.actionT = 0; p.a.throwT = 0;
      // a throw to a teammate reaches him (markers can't nick it out of the air)
      p.pending = { mode: 'loft', target, angle: 0.42, power: 0.3, kind: 'throw', t: 0.28, guarantee: m || null };
      return;
    }
    if (r.type === 'corner' && kind !== 'through') {
      let m = forced;
      if (!m) {
        let bs = 1e9;
        for (const q of team.players) {
          if (q === p) continue;
          const inBox = Math.abs(q.pos.x - team.attackX) < 14 && Math.abs(q.pos.z) < 14;
          if (!inBox) continue;
          const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz);
          const ang = Math.acos(clamp((dx * aim.x + dz * aim.z) / d, -1, 1));
          const sc = ang * 3 + rand(0, 0.3);
          if (sc < bs) { bs = sc; m = q; }
        }
      }
      const target = m ? m.pos.clone() : new V3(team.attackX - team.dir * 8, 0, 0);
      if (m) { m.recv = { point: target.clone(), t: 0 }; if (team.isUser) this.setControlled(m); }
      this.kick(p, { mode: 'loft', target, angle: 0.5, err: gauss() * 0.03, power: 0.7, kind: 'pass' });
      return;
    }
    if (forced) this.passTo(p, forced, aim, kind === 'long' ? 'long' : 'ground');
    else this.pass(p, aim, kind === 'long' ? 'long' : kind);
  }

  // ---------------------------------------------------------------- AI
  interceptPoint(p) {
    const cached = this._interceptCache.get(p);
    if (cached) return cached;
    const sp = p.maxSpeed(true);
    let res = this.pred[PRED_N - 1];
    for (let i = 0; i < PRED_N; i++) {
      const b = this.pred[i];
      if (b.y > 2.3) continue;
      const d = Math.max(0, hdist(p.pos, b) - 0.6);
      if (d / sp + 0.12 <= (i + 1) * PRED_DT) { res = b; break; }
    }
    this._interceptCache.set(p, res);
    return res;
  }

  interceptTime(p) {
    const sp = p.maxSpeed(true);
    for (let i = 0; i < PRED_N; i++) {
      const b = this.pred[i];
      if (b.y > 2.3) continue;
      const d = Math.max(0, hdist(p.pos, b) - 0.6);
      if (d / sp + 0.12 <= (i + 1) * PRED_DT) return (i + 1) * PRED_DT;
    }
    return 3 + hdist(p.pos, this.pred[PRED_N - 1]) / sp;
  }

  bestInterceptor(team) {
    let best = null, bt = 1e9;
    const inBox = team.inOwnBox(this.pred[5]);
    for (const p of team.players) {
      if (p.isGK && !inBox) continue;
      if (p.busy > 0 || p.stun > 0) continue;
      const t = this.interceptTime(p) + (p.isGK ? 0.1 : 0);
      if (t < bt) { bt = t; best = p; }
    }
    return { p: best, t: bt };
  }

  formationTarget(p, attacking, aB, cB, out) {
    const team = p.team, s = p.slot;
    let a = s.a + (aB - 0.5) * 0.62 + (attacking ? 0.07 : -0.05);
    if (attacking) {
      if (DEFENDERS.has(p.role)) a = clamp(a, 0.06, p.role.endsWith('WB') ? 0.72 : 0.6);
      else if (FORWARDS.has(p.role)) a = clamp(a, 0.45, 0.92);
      else a = clamp(a, 0.15, 0.8);
    } else {
      // out of possession: one back line that drops with the ball, a midfield screen in front of it
      // (outside the box), forwards ready to counter — no camping in the six-yard box
      const line = clamp(aB - 0.13, 0.075, 0.42);
      if (DEFENDERS.has(p.role)) a = line + (s.a - 0.19) * 0.35;
      else if (FORWARDS.has(p.role)) a = clamp(a, 0.38, 0.92);
      else a = Math.max(line + 0.11 + (s.a - 0.38) * 0.45, p.role === 'DM' ? 0.135 : 0.17);
    }
    if (attacking && FORWARDS.has(p.role) && p.runT <= 0) {
      // hold the offside line
      let line = 0;
      for (const o of team.opp.players) if (!o.isGK) line = Math.max(line, team.along(o.pos));
      a = Math.min(a, Math.max(line, aB) + 0.005);
    }
    let c = s.c * (attacking ? 1.05 : 0.72) + cB * (attacking ? 0.22 : 0.35);
    c = clamp(c, -0.93, 0.93);
    return team.world(a, c, out);
  }

  teamAI(team, dt) {
    const ball = this.ball, r = this.restart;
    const owner = ball.owner;
    const attacking = this.possTeam === team;
    const bp = owner ? owner.pos : this.pred[3];
    const aB = team.along(bp), cB = team.across(bp);
    let chaser = null;
    if (!owner && this.phase === 'play') chaser = this.bestInterceptor(team).p;
    const g = this.guarantee;
    let marker = null;
    if (g && !owner && g.to.team !== team) {
      // can't cut out an assisted pass: close down the receiver instead
      chaser = null;
      let bd = 1e9;
      for (const p of team.players) { if (p.isGK) continue; const d = hdist(p.pos, g.to.pos); if (d < bd) { bd = d; marker = p; } }
    }
    let presser = null, cover = null;
    if (owner && owner.team !== team && this.phase === 'play' && !ball.held) {
      let d1 = 1e9, d2 = 1e9;
      for (const p of team.players) {
        if (p.isGK) continue;
        const d = hdist(p.pos, owner.pos) + ((p.pos.x - owner.pos.x) * -team.dir > 0 ? -2 : 2);
        if (d < d1) { d2 = d1; cover = presser; d1 = d; presser = p; }
        else if (d < d2) { d2 = d; cover = p; }
      }
    }
    const tgt = new V3();
    team._support = null;
    if (owner && owner.team === team && !team.isUser) {
      let sd = 1e9;
      for (const p of team.players) {
        if (p === owner || p.isGK || DEFENDERS.has(p.role) || FORWARDS.has(p.role)) continue;
        const d = hdist(p.pos, owner.pos);
        if (d < sd) { sd = d; team._support = p; }
      }
    }
    for (const p of team.players) {
      p.jockey = false;
      if (p !== presser && p !== cover) p.tkSeen = 0;
      if (p.isGK) { p.jockey = true; this.gkAI(p, dt); continue; }
      if (p.busy > 0 || p.stun > 0) continue;
      const userCtl = team.isUser && p === team.controlled;
      if (userCtl && p.manual) continue;
      if (owner === p) { if (!team.isUser) this.ownerAI(p, dt); continue; }
      if (r) { this.restartPositioning(p, r, tgt); continue; }

      p.faceTo = ball.pos;
      if (p.recv) {
        p.recv.t += dt;
        if (p.recv.t > 3.5 || (owner && owner !== p)) p.recv = null;
        else {
          const ip = ball.owner ? p.recv.point : this.interceptPoint(p);
          p.goToAuto(ip, true);
          continue;
        }
      }
      if (p === marker) {
        const og = new V3(team.goalX, 0, 0).sub(g.to.pos).setY(0).normalize();
        p.goTo(tgt.copy(g.to.pos).addScaledVector(og, 1.6), p.maxSpeed(true), 1);
        continue;
      }
      if (p === chaser) {
        p.goTo(this.interceptPoint(p), p.maxSpeed(true), 0.6);
        continue;
      }
      if (p === presser) {
        const og = new V3(team.goalX, 0, 0);
        const toGoal = og.sub(owner.pos).setY(0).normalize();
        const userTeamPassive = team.isUser && !team.callPress;
        const d = hdist(p.pos, owner.pos);
        // AI: contain first (stand off ~1.6m), then step in and stand in his path. Good defenders
        // (harder levels) stay patient; weaker ones rush in and get turned. A carrier who isn't
        // sprinting gets closed down faster.
        if (p.containOn !== owner || d > 6) { p.containOn = owner; p.containT = 0; }
        if (d < 4.5) p.containT += dt * (owner.sprint ? 1 : 1.6) * (1.5 - 0.6 * this.diff.press);
        const standOff = userTeamPassive ? 1.5 : team.isUser ? 1.0 : Math.max(0.55, 1.6 - p.containT * 0.9);
        tgt.copy(owner.pos).addScaledVector(owner.vel, d > 4 ? 0.55 : 0.3).addScaledVector(toGoal, standOff);
        // is he goal-side (between the carrier and goal)? if not, race to get there first
        const goalSide = ((p.pos.x - owner.pos.x) * toGoal.x + (p.pos.z - owner.pos.z) * toGoal.z) > 0.6;
        // brake into the jockey: arrive gently instead of flying past him
        p.goTo(tgt, d > 5 || !goalSide ? p.maxSpeed(true) * (team.isUser ? 1 : this.diff.press) : p.maxSpeed(true) * 0.95, team.isUser || !goalSide ? 0.8 : 3);
        if (d < 4.5 && (goalSide || team.isUser)) {
          // jockey: match the carrier's run while closing the gap
          const ov = owner.vel;
          p.desired.x = p.desired.x * 0.55 + ov.x * 0.5;
          p.desired.z = p.desired.z * 0.55 + ov.z * 0.5;
          p.faceTo = owner.pos;
          p.jockey = true;
        }
        if (!team.isUser) this.aiTackle(p, owner, d, dt);
        if (team.isUser && d < 1.7 && p.tackleCD <= 0 && Math.random() < dt * (team.callPress ? 1.5 : 0.55)) this.tackle(p, false);
        continue;
      }
      if (p === cover) {
        const og = new V3(team.goalX, 0, 0);
        const toGoal = og.sub(owner.pos).setY(0);
        const L = toGoal.length();
        toGoal.normalize();
        const danger = team.inOwnBox(owner.pos, 8);
        tgt.copy(owner.pos).addScaledVector(owner.vel, 0.4).addScaledVector(toGoal, danger ? 3.2 : Math.min(7, L * 0.35));
        p.goToAuto(tgt, danger);
        const dc = hdist(p.pos, owner.pos);
        if (!team.isUser) this.aiTackle(p, owner, dc, dt);
        continue;
      }
      this.formationTarget(p, attacking, aB, cB, tgt);
      if (attacking) {
        // runs in behind
        if (FORWARDS.has(p.role) || (ATT_MIDS.has(p.role) && Math.random() < 0.3) || ((p.role === 'LWB' || p.role === 'RWB') && Math.random() < 0.15)) {
          if (p.runT > 0) {
            p.runT -= dt;
            tgt.copy(p.runTarget);
          } else if (owner && owner.team === team && aB > 0.35 && Math.random() < dt * 0.22) {
            p.runT = rand(1.8, 3);
            p.runTarget = new V3(clamp(p.pos.x + team.dir * rand(12, 20), -HL + 4, HL - 4), 0, clamp(p.pos.z * 0.6 + gauss() * 5, -HW + 3, HW - 3));
          }
        }
        // show for it: the nearest midfielder comes short at an angle to give the carrier an outlet
        if (owner && owner.team === team && p === team._support) {
          tgt.copy(owner.pos).add(new V3(-team.dir * 4, 0, owner.pos.z > 0 ? -7 : 7));
        }
        // get free of the marker
        if (!DEFENDERS.has(p.role) || p.role.endsWith('WB')) {
          const n = this.nearestOpp(p, tgt);
          if (n.p && n.d < 4.5) {
            const ax = tgt.x - n.p.pos.x, az = tgt.z - n.p.pos.z, l = Math.hypot(ax, az) || 1;
            const push = (4.5 - n.d) * 0.9;
            tgt.x += ax / l * push; tgt.z += az / l * push * 1.3;
          }
        }
        // spread from teammates
        for (const q of team.players) {
          if (q === p) continue;
          const d = hdist(q.pos, tgt);
          if (d < 6 && d > 0.01) { tgt.x += (tgt.x - q.pos.x) / d * (6 - d) * 0.4; tgt.z += (tgt.z - q.pos.z) / d * (6 - d) * 0.4; }
        }
      } else {
        p.runT = 0;
        // goal-side marking of the nearest attacker
        let mark = null, md = 11;
        for (const o of team.opp.players) {
          if (o.isGK || o === owner) continue;
          const d = hdist(o.pos, tgt);
          if (d < md) { md = d; mark = o; }
        }
        if (mark) {
          const og = new V3(team.goalX, 0, 0);
          const dir = og.sub(mark.pos).setY(0).normalize();
          const mx = mark.pos.x + dir.x * 1.6, mz = mark.pos.z + dir.z * 1.6;
          const w = DEFENDERS.has(p.role) ? 0.6 : 0.45;
          tgt.x += (mx - tgt.x) * w; tgt.z += (mz - tgt.z) * w;
        }
      }
      tgt.x = clamp(tgt.x, -HL + 1, HL - 1);
      tgt.z = clamp(tgt.z, -HW + 1, HW - 1);
      p.goToAuto(tgt);
    }
  }

  restartPositioning(p, r, tgt) {
    p.faceTo = this.ball.pos;
    if (p === r.taker) return;
    if (r.type === 'kickoff') { p.desired.set(0, 0, 0); return; }
    if ((r.type === 'freekick' || r.type === 'penalty') && p.cornerSpot) {
      tgt.copy(p.cornerSpot);
      p.goTo(tgt, p.maxSpeed(false) * 0.5, 0.6);
      return;
    }
    if (r.type === 'corner' && p.cornerSpot) {
      // small jostling around the spot
      tgt.copy(p.cornerSpot);
      tgt.x += Math.sin(this.time * 1.3 + p.idx) * 0.6;
      tgt.z += Math.cos(this.time * 1.1 + p.idx * 2) * 0.6;
      p.goTo(tgt, p.maxSpeed(false) * 0.4, 1);
      return;
    }
    const attacking = r.team === p.team;
    const aB = p.team.along(r.spot), cB = p.team.across(r.spot);
    this.formationTarget(p, attacking, aB, cB, tgt);
    if (r.type === 'throw' && attacking) {
      // two nearest teammates come short
      const d = hdist(p.pos, r.spot);
      if (d < 20) {
        tgt.lerp(r.spot, 0.45);
        tgt.z = clamp(tgt.z, -HW + 4, HW - 4);
      }
    }
    if (r.type === 'goalkick' && !attacking) tgt.x = clamp(tgt.x, -HL + F.BOX_L + 2, HL - F.BOX_L - 2);
    p.goToAuto(tgt);
  }

  aiBestPass(p, maxD = 40, safe = false) {
    const team = p.team;
    let best = null, bs = -1e9;
    const a0 = team.along(p.pos);
    for (const m of team.players) {
      if (m === p) continue;
      if (m.isGK && !safe) continue;
      const d = hdist(p.pos, m.pos);
      if (d < 5 || d > maxD) continue;
      const lane = Math.max(this.laneRisk(p.pos, m.pos, team.opp), this.passRisk(p.pos, m.pos, team.opp, 9 + d * 0.25));
      const open = this.nearestOpp(m).d;
      const prog = team.along(m.pos) - a0;
      const care = 1.5 + Math.max(0, this.diff.press - 0.6) * 2.4; // better sides don't force it into traffic
      let sc = prog * (prog < 0 && a0 > 0.6 ? 3.6 : 2.6) + clamp(open / 7, 0, 1) * 0.9 - lane * care - (lane > 0.7 ? care * 0.5 : 0) - (d > 30 ? 0.25 : 0) + 0.1;
      if (safe) sc = -lane * 2 + clamp(open / 7, 0, 1) - d * 0.01;
      if (Math.abs(m.pos.x - team.attackX) < 18 && Math.abs(m.pos.z) < 18) sc += a0 > 0.8 ? 0.6 : 0.25;
      if (this.wouldBeOffside(p, m)) sc -= 2.5 * this.diff.press + 0.5; // good sides spot the flag
      if (sc > bs) { bs = sc; best = { m, sc, type: 'ground', target: m.pos.clone() }; }
      if (!safe && (FORWARDS.has(m.role) || ATT_MIDS.has(m.role)) && prog > -0.05) {
        const tp = m.pos.clone().add(new V3(team.dir * 8, 0, -m.pos.z * 0.1));
        if (Math.abs(tp.x) < HL - 2) {
          const free = this.nearestOpp(m, tp).d > hdist(m.pos, tp) * 0.9;
          if (free) {
            const sc2 = (team.along(tp) - a0) * 2.6 + 0.5 - this.laneRisk(p.pos, tp, team.opp) * (1.3 + Math.max(0, this.diff.press - 0.6) * 2);
            if (this.wouldBeOffside(p, m)) continue;
            if (sc2 > bs) { bs = sc2; best = { m, sc: sc2, type: 'through', target: tp }; }
          }
        }
      }
    }
    return best;
  }

  ownerAI(p, dt) {
    const team = p.team, ball = this.ball;
    if (p.pending) return;
    const goal = new V3(team.attackX, 0, 0);
    const distGoal = hdist(p.pos, goal);
    const near = this.nearestOpp(p);
    p.think -= dt;
    p.ownT = (p.ownT || 0) + dt;
    p.faceTo = null;
    if (p.think <= 0) {
      p.think = this.diff.think * rand(0.7, 1.3);
      const stall = p.ownT > 3.2 || (Math.abs(p.pos.x) > HL - 5 && Math.abs(p.pos.z) > F.BOX_W - 4);
      let choice = { type: 'dribble', sc: stall ? -9 : 0 };
      // shooting
      if (distGoal < 28 && team.along(p.pos) > 0.65) {
        let sc = 2.6 - distGoal / 14 + p.st.sho * 0.3 + (this.diff.press - 1) * 0.8;
        if (distGoal < 14) sc += 0.6;
        if (this.laneRisk(p.pos, goal, team.opp) < 0.4) sc += 0.5; // sight of goal: hit it
        if (Math.abs(p.pos.z) > 15) sc -= 0.6;
        if (this.laneRisk(p.pos, goal, team.opp) > 0.85 && distGoal > 12) sc -= 0.35;
        if (near.d < 1.4) sc -= 0.15;
        sc += rand(0, 0.25);
        if (sc > choice.sc) choice = { type: 'shoot', sc };
      }
      const bp = this.aiBestPass(p);
      if (bp) {
        const sc = bp.sc + rand(0, 0.25) + (near.d < 2 ? 0.35 : 0);
        if (sc > choice.sc) choice = { type: bp.type, sc, bp };
      }
      // dribble value: space ahead
      let space = 30;
      for (const o of team.opp.players) {
        const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (dx * team.dir > 0 && Math.abs(dz) < d * 0.8) space = Math.min(space, d);
      }
      const dsc = (stall ? -5 : 0) + 0.25 + clamp(space / 14, 0, 1) * (0.65 + Math.max(0, this.diff.press - 1) * 1.2) - (near.d < 1.8 ? 0.45 : 0) + p.st.dri * 0.2 + rand(0, 0.2);
      // drive into space instead of recycling it sideways
      const carry = clamp((space - 5) / 10, 0, 0.6) * (0.6 + p.st.dri * 0.6) * (team.along(p.pos) < 0.8 ? 1 : 0.5);
      if (dsc + carry > choice.sc) choice = { type: 'dribble', sc: dsc + carry };
      if (choice.type === 'shoot') { this.shoot(p, rand(0.5, 0.92), null); return; }
      if (choice.type === 'ground' || choice.type === 'through') {
        const aim = choice.bp.target.clone().sub(p.pos).setY(0).normalize();
        this.passTo(p, choice.bp.m, aim, choice.type);
        return;
      }
      // dribble direction
      const base = goal.clone().sub(p.pos).setY(0).normalize();
      if (Math.abs(team.across(p.pos)) > 0.45 && team.along(p.pos) < 0.78) base.set(team.dir, 0, -Math.sign(p.pos.z) * 0.25).normalize();
      for (const o of team.opp.players) {
        const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 7 || d < 0.01) continue;
        const ahead = -(dx * base.x + dz * base.z) > 0;
        if (!ahead) continue;
        const w = 2.2 / (d * d);
        base.x += dx * w * 0.6; base.z += dz * w;
      }
      if (Math.abs(p.pos.z) > HW - 4) base.z -= Math.sign(p.pos.z) * 0.8;
      p.dribbleDir.copy(base.setY(0).normalize());
      p.sprint = space > 7 && near.d > 2.2;
    }
    // don't run the ball into a defender: cut away from one standing in the path
    p.evadeCD = (p.evadeCD || 0) - dt;
    if (near.p && near.d < 7 && p.evadeCD <= 0) {
      const ox = near.p.pos.x - p.pos.x, oz = near.p.pos.z - p.pos.z;
      const dd = p.dribbleDir, along = (ox * dd.x + oz * dd.z) / near.d;
      // how soon will we meet? (closing speed along the line between us)
      const close = ((p.vel.x - near.p.vel.x) * ox + (p.vel.z - near.p.vel.z) * oz) / near.d;
      const ttc = close > 0.5 ? (near.d - 1) / close : near.d < 2.2 ? 0 : 9;
      if (along > 0.4 && ttc < 0.6) {
        const side = Math.sign(ox * dd.z - oz * dd.x) || 1; // which side of my path he's on
        const a = Math.atan2(dd.x, dd.z) + side * (along > 0.85 ? rand(1.2, 1.7) : rand(0.8, 1.2));
        p.dribbleDir.set(Math.sin(a), 0, Math.cos(a));
        if (Math.abs(p.pos.z + p.dribbleDir.z * 4) > HW - 2) p.dribbleDir.z *= -1;
        p.evadeCD = rand(0.5, 0.8);
        p.think = 0; // and look for a pass right now
      }
    }
    if (near.d < 2.4 && (p.skillCD || 0) <= 0 && Math.random() < dt * 0.9 * p.st.dri * this.diff.press) {
      this.skillMove(p, Math.random() < 0.5 ? 'left' : 'right');
      p.dribbleDir.copy(p.fwd);
      return;
    }
    const sp = p.maxSpeed(p.sprint) * (near.d < 1.3 ? 0.7 : 1);
    p.desired.copy(p.dribbleDir).multiplyScalar(sp);
    // don't dribble out of play
    if (Math.abs(p.pos.z + p.desired.z * 0.5) > HW - 1) p.desired.z *= -0.5;
    if (Math.abs(p.pos.x + p.desired.x * 0.5) > HL - 1) p.desired.x *= -0.5;
  }

  gkAI(gk, dt) {
    const team = gk.team, ball = this.ball;
    const ownX = team.goalX, s = Math.sign(ownX);
    gk.faceTo = ball.pos;
    if (ball.owner === gk) {
      gk.holdT += dt;
      gk.desired.set(0, 0, 0);
      gk.lockFacing = team.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (this.phase === 'play' && !this.drill && gk.holdT > (ball.held ? 1.4 : 0.6) && !gk.pending) this.gkDistribute(gk);
      return;
    }
    if (this.phase === 'restart') {
      if (this.restart && this.restart.taker === gk) return;
      gk.goToAuto(new V3(ownX - s * 1.2, 0, 0));
      return;
    }
    if (gk.busy > 0) return;
    // shot detection
    if (!ball.owner && this.phase === 'play') this.gkReadShot(gk);
    if (gk.save) {
      gk.save.t -= dt;
      if (gk.save.t <= 0) this.gkDive(gk);
      if (gk.save) return;
    }
    // positioning on the ball-goal line
    const bp = ball.owner ? ball.owner.pos : ball.pos;
    const dx = bp.x - ownX, dz = bp.z;
    const dist = Math.hypot(dx, dz) || 1;
    const out = dist < 40 ? clamp(0.8 + (40 - dist) * 0.07, 0.8, 3.2) : 0.8;
    const tgt = new V3(ownX + dx / dist * out, 0, clamp(dz / dist * out * 1.4, -GW + 0.4, GW - 0.4));
    // claim loose balls in the box / rush 1v1
    const looseInBox = !ball.owner && team.inOwnBox(this.pred[4]) && ball.speed < 14;
    if (looseInBox) {
      const me = this.interceptTime(gk);
      const them = this.bestInterceptor(team.opp).t;
      if (me < them + 0.15) tgt.copy(this.interceptPoint(gk));
    } else if (ball.owner && ball.owner.team !== team && team.inOwnBox(ball.owner.pos, -3) && Math.abs(ball.owner.pos.x - ownX) < 13) {
      const o = ball.owner;
      const dir = new V3(o.pos.x - ownX, 0, o.pos.z).normalize();
      tgt.set(ownX + dir.x * Math.min(dist - 1.6, 6), 0, dir.z * Math.min(dist - 1.6, 6));
    }
    gk.goTo(tgt, gk.maxSpeed(hdist(gk.pos, tgt) > 3), 1.2);
  }

  gkReadShot(gk) {
    if (this.guarantee) return; // assisted passes aren't shots
    const ball = this.ball, team = gk.team;
    const s = Math.sign(team.goalX);
    if (gk.lastKickSeen === this.kickId) return;
    if (ball.vel.x * s < 5) return;
    let cross = null, tc = 0;
    for (let i = 0; i < PRED_N; i++) if (this.pred[i].x * s >= HL) { cross = this.pred[i]; tc = (i + 1) * PRED_DT; break; }
    if (!cross) return;
    gk.lastKickSeen = this.kickId;
    const onTarget = Math.abs(cross.z) < GW + 0.15 && cross.y < GH + 0.15;
    if (!onTarget) return;
    if (this.lastKick.team === team.opp && this.lastKick.kind === 'shot' && this.onCounted !== this.lastKick.id && !this.inShootout) { this.onCounted = this.lastKick.id; this.stats[team.opp.key].on++; if (this.lastKick.by) this.lastKick.by.ms.onTarget++; }
    let gp = cross, tg = tc;
    for (let i = 0; i < PRED_N; i++) if (this.pred[i].x * s >= gk.pos.x * s - 0.2) { gp = this.pred[i]; tg = (i + 1) * PRED_DT; break; }
    const lateral = gp.z - gk.pos.z;
    const h = gp.y;
    const skill = team.isUser ? 0.74 : this.diff.gk;
    const react = team.isUser ? 0.2 : this.diff.react * 0.75;
    const avail = Math.max(0, tg - react);
    const reach = Math.min(3.9, 1.1 + avail * 7.5);
    const sp = ball.speed;
    let pSave = 0;
    if (Math.abs(lateral) <= reach && h < 2.65) {
      pSave = skill + 0.42 - clamp((sp - 16) / 35, 0, 0.3) - (Math.abs(lateral) / reach) * 0.3 - (h > 1.8 ? 0.06 : 0);
      if (tg < 0.3) pSave -= 0.15;
      if (this.lastKick.kind !== 'shot') pSave += 0.25;
      pSave = clamp(pSave, 0.04, 0.97);
    }
    // a penalty: he's already guessed a side; the right guess gives him a chance, the wrong one none
    const g = gk.penGuess && gk.penGuess.id === this.kickId ? gk.penGuess.side : null;
    let guessedRight = true;
    if (g != null) {
      gk.penGuess = null;
      guessedRight = g === 0 ? Math.abs(lateral) < 1 : Math.sign(lateral) === g && Math.abs(lateral) > 0.5;
      pSave = guessedRight ? clamp(0.62 - (Math.abs(lateral) > GW - 0.9 ? 0.28 : 0) - (h > 1.6 ? 0.15 : 0) - clamp((sp - 22) / 30, 0, 0.2), 0.08, 0.8) : 0.02;
    }
    const willSave = Math.random() < pSave;
    gk.save = {
      t: react, lateral, h, tg, willSave, gp: gp.clone(),
      catch: willSave && sp < 24 && Math.random() < 0.45 + skill * 0.35 - (h > 1.8 ? 0.3 : 0) - Math.abs(lateral) * 0.08,
      started: false, until: this.time + tg + 0.6, readTime: this.time,
    };
    if (!willSave) gk.cool = tg + 0.4;
    if (!guessedRight) { gk.save.lateral = g === 0 ? 0 : g * 2.6; gk.save.t = 0; } // committed the wrong way
  }

  gkDive(gk) {
    const sv = gk.save;
    if (sv.started) return;
    sv.started = true;
    const team = gk.team;
    const timeLeft = Math.max(0.12, sv.tg - (this.time - sv.readTime));
    const lat = sv.lateral;
    const reachZ = sv.willSave ? lat : lat * rand(0.45, 0.75);
    gk.lockFacing = team.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    gk.facing = gk.lockFacing;
    gk.fwd.set(Math.sin(gk.facing), 0, Math.cos(gk.facing));
    if (Math.abs(lat) < 0.7 && sv.h < 1.9) {
      // body save / catch in front
      gk.action = 'set'; gk.busy = 0.6; gk.actionT = 0;
      gk.vel.set(0, 0, reachZ / timeLeft);
      gk.a.ready = true;
      return;
    }
    gk.action = 'dive';
    gk.busy = 1.25;
    gk.actionT = 0;
    gk.a.diveT = 0;
    // model left (+x local) in world = (fwd.z, 0, -fwd.x)
    const leftZ = -gk.fwd.x;
    gk.a.diveSide = Math.sign(lat) * Math.sign(leftZ) || 1;
    gk.a.diveHigh = sv.h > 1.75 && Math.abs(lat) < 1.4;
    const maxDive = sv.willSave ? 13 : 8;
    gk.vel.set((sv.gp.x - gk.pos.x) * 0.5, 0, clamp(reachZ / timeLeft, -maxDive, maxDive));
    gk.desired.copy(gk.vel);
  }

  gkSaveContact(gk) {
    const sv = gk.save, ball = this.ball;
    if (!sv) return;
    if (this.guarantee) { gk.save = null; return; }
    if (this.time > sv.until) { gk.save = null; return; }
    if (!sv.willSave || ball.owner) return;
    if (Math.abs(ball.pos.x - gk.pos.x) > 0.9 || Math.abs(ball.pos.z - gk.pos.z) > (gk.action === 'dive' ? 1.6 : 1.0) || ball.pos.y > 2.8) return;
    gk.save = null;
    if (!this.inShootout) { gk.ms.saves++; this.stats[gk.team.key].saves++; }
    this.lastTouch = gk;
    this.kickId++;
    this.lastKick = { kind: 'save', team: gk.team, id: this.kickId, by: gk };
    if (sv.catch) {
      this.gainBall(gk, true);
      this.hooks.event('SAVED!');
      this.say('catch', { k: gk.name }, 2);
    } else {
      const s = Math.sign(gk.team.goalX);
      ball.vel.set(-s * rand(3, 8), rand(2, 6), Math.sign(sv.lateral || 1) * rand(3, 8));
      gk.cool = 0.6;
      this.hooks.event('WHAT A SAVE!');
      this.say('save', { k: gk.name }, 2);
    }
    this.sound.thud(8);
    this.sound.ooh();
  }

  gkDistribute(gk) {
    const team = gk.team;
    const bp = this.aiBestPass(gk, 45, true);
    const aim = new V3(team.dir, 0, 0);
    gk.a.hold = false;
    const ballHeld = this.ball.held;
    if (bp && bp.sc > -0.4 && Math.random() < 0.7) {
      aim.copy(bp.target).sub(gk.pos).setY(0).normalize();
      this.passTo(gk, bp.m, aim, 'ground');
    } else {
      const fw = team.forwards;
      const m = fw[(Math.random() * fw.length) | 0];
      aim.copy(m.pos).sub(gk.pos).setY(0).normalize();
      this.passTo(gk, m, aim, 'long');
    }
    if (gk.pending) gk.pending.fromHands = ballHeld;
  }

  celebrationAI(dt) {
    const sc = this.scorer;
    const team = sc.team;
    for (const p of this.players) {
      if (!(p === sc && p.a.celebKind)) p.busy = Math.min(p.busy, 0);
      if (p === sc) {
        this.scorerCelebration(p, dt);
      } else if (p.team === team && !p.isGK) {
        const d = hdist(p.pos, sc.pos);
        const t = sc.pos.clone().add(new V3(Math.sin(p.idx * 2.1) * 2, 0, Math.cos(p.idx * 2.1) * 2));
        p.goTo(t, p.maxSpeed(d > 10), 2);
        p.faceTo = sc.pos;
        if (d < 5) p.a.celebrate = Math.min(1, p.a.celebrate + dt * 2), p.a.celebrateStyle = 1;
      } else if (p.team !== team) {
        p.a.sad = Math.min(1, p.a.sad + dt);
        const home = new V3(p.team.dir * -10 + p.pos.x * 0.6, 0, p.pos.z * 0.8);
        p.goTo(home, 1.4, 2);
        p.faceTo = null;
      } else {
        p.desired.set(0, 0, 0);
        p.a.celebrate = Math.min(1, p.a.celebrate + dt);
        p.a.celebrateStyle = 1;
      }
    }
  }

  // the run-up: the routine's own, or longer while you get the chance to pick one
  celebRun() { const c = this.celeb; return Math.max(CELEB[c.kind].run, c.pick || 0); }
  celebEnd() {
    const c = this.celeb;
    if (!c) return 3.4;
    return c.kind === 'aeroplane' ? Math.max(3.4, c.pick + 2) : Math.min(6.5, Math.max(celebLength(c.kind), this.celebRun() + CELEB[c.kind].dur + 0.4));
  }
  // everyone who played (sent-off players too), for ratings and the player of the match
  matchPlayers() {
    return [...this.players, ...this.sentOff].map(p => ({ name: p.name, role: p.role, team: p.team.key, num: p.num, data: p.data, ms: p.ms, off: this.sentOff.includes(p) }));
  }

  // pick the celebration while he's still running to the fans
  chooseCeleb(kind) {
    const c = this.celeb;
    if (this.phase !== 'goal' || !c || !CELEB[kind] || c.t >= this.celebRun()) return false;
    c.kind = kind;
    return true;
  }

  scorerCelebration(p, dt) {
    const c = this.celeb, def = CELEB[c.kind], a = p.a;
    c.t += dt;
    p.faceTo = null;
    if (c.kind === 'aeroplane' || c.t < this.celebRun()) {
      // the run to the fans (arms out for the aeroplane)
      const d = p.goTo(this.celebSpot, p.maxSpeed(true) * 0.9, 2);
      a.celebrate = Math.min(1, a.celebrate + dt * 2);
      a.celebrateStyle = c.kind === 'aeroplane' ? 0 : 2;
      if (c.kind === 'aeroplane' && d < 1) a.celebrateStyle = 1;
      return;
    }
    const t = c.t - this.celebRun();
    if (a.celebKind !== c.kind) {
      // the routine starts
      a.celebKind = c.kind; a.celebT = 0;
      a.celebClipName = def.clip || null;
      a.celebrateStyle = def.clip ? 1 : 2;
      if (c.kind === 'slide') { p.action = 'kneeslide'; p.busy = 9; p.actionT = 0; p.lockFacing = p.facing; p.vel.setLength(Math.max(6.5, p.vel.length())); }
      if (c.kind === 'siu') { p.lockFacing = p.facing; p.busy = 9; }
    }
    if (c.kind === 'siu' && a.celebT < 0.98 && t >= 0.98) this.sound.cheer(); // the crowd roar the landing
    a.celebT = t;
    a.celebrate = 1;
    if (c.kind !== 'slide') p.desired.set(0, 0, 0);
    else p.desired.copy(p.vel);
  }

  idleAI() {
    for (const p of this.players) {
      p.desired.multiplyScalar(0.9);
      if (this.phase === 'intro') { p.faceTo = null; p.lockFacing = 0; continue; }
      p.faceTo = this.ball.pos;
    }
  }

  // walk-out: both teams in a line across the centre circle, facing the main stand (camera side)
  lineupPose() {
    const line = (team, side) => team.players.forEach((p, i) => {
      p.pos.set(side * (1.2 + i * 0.95), 0, 2.2);
      p.vel.set(0, 0, 0); p.desired.set(0, 0, 0);
      p.facing = 0; p.fwd.set(0, 0, 1); p.lockFacing = 0; p.faceTo = null;
      p.busy = 0; p.action = null; p.pending = null; p.skill = null;
    });
    line(this.home, -1);
    line(this.away, 1);
    this.ball.owner = null;
    this.ball.pos.set(0, BALL_R, -1.5);
    this.ball.vel.set(0, 0, 0);
    this.ball.sync(0);
  }

  // ---------------------------------------------------------------- simulation
  movePlayers(dt) {
    const ball = this.ball;
    for (const p of this.players) {
      if (p.skill) {
        if (ball.owner !== p && !p.skill.released) { p.skill = null; p.busy = 0; p.action = null; }
        else { this.updateSkill(p, dt); continue; }
      }
      if (p.pending) {
        p.pending.t -= dt;
        if (p.pending.t <= 0) this.releaseKick(p);
      }
      if (p.busy > 0) {
        p.actionT += dt;
        if (p.action === 'tackle' || p.action === 'slide') this.resolveTackle(p);
      } else if (p.action) {
        p.action = null;
        p.lockFacing = null;
      }
      if (p.isGK && p.save) this.gkSaveContact(p);

      const free = p.action !== 'slide' && p.action !== 'dive' && p.action !== 'kneeslide';
      if (p.stun > 0) p.desired.multiplyScalar(0.25);
      if (free) {
        if (ball.owner === p && p.drib) this.collectSteer(p);
        this.locomote(p, dt, ball.owner === p);
      } else {
        const fr = p.action === 'kneeslide' ? 4.2 : p.action === 'slide' ? 7 : (p.actionT > 0.55 ? 14 : 1.5);
        const sp = Math.hypot(p.vel.x, p.vel.z);
        if (sp > 0) { const ns = Math.max(0, sp - fr * dt); p.vel.x *= ns / sp; p.vel.z *= ns / sp; }
      }
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      if (this.phase === 'play' && !this.drill) {
        const v = Math.hypot(p.vel.x, p.vel.z), st = this.stats[p.team.key];
        p.ms.dist += v * dt; st.dist += v * dt;
        if (v > p.ms.topSpd) p.ms.topSpd = v;
        if (v > st.topSpd) st.topSpd = v;
      }
      p.pos.x = clamp(p.pos.x, -HL - 3, HL + 3);
      p.pos.z = clamp(p.pos.z, -HW - 3, HW + 3);

      // facing
      const sp = Math.hypot(p.vel.x, p.vel.z);
      let tf = null;
      const snappy = p.team.isUser && p === p.team.controlled && this.settings.dribAssist !== false && p.busy <= 0;
      if (p.lockFacing !== null && p.busy > 0) tf = p.lockFacing;
      else if ((p.jockey || p.userJockey) && p.faceTo && sp < 7.5 && ball.owner !== p) {
        // jockeying defenders / keepers shuffle while still facing the ball
        const fx = p.faceTo.x - p.pos.x, fz = p.faceTo.z - p.pos.z;
        if (fx * fx + fz * fz > 0.5) tf = Math.atan2(fx, fz);
      }
      else if (snappy && Math.hypot(p.desired.x, p.desired.z) > 0.8) tf = Math.atan2(p.desired.x, p.desired.z);
      else if (ball.owner === p && sp < 1.2 && Math.hypot(p.desired.x, p.desired.z) > 0.8) tf = Math.atan2(p.desired.x, p.desired.z);
      else if (sp > 0.8) tf = Math.atan2(p.vel.x, p.vel.z);
      else if (p.lockFacing !== null) tf = p.lockFacing;
      else if (p.faceTo) {
        const fx = p.faceTo.x - p.pos.x, fz = p.faceTo.z - p.pos.z;
        if (fx * fx + fz * fz > 0.5) tf = Math.atan2(fx, fz);
      }
      p.turnRate = 0;
      if (tf !== null) {
        const userCtl = p.team.isUser && p === p.team.controlled;
        const rate = snappy ? 16 : ball.owner === p ? (userCtl ? (p.sprint ? 9 : 12) : (p.sprint ? 7 : 9)) : userCtl ? 13 : 10;
        const d = wrap(tf - p.facing);
        const step = clamp(d, -rate * dt, rate * dt);
        p.facing = wrap(p.facing + step);
        p.turnRate = step / Math.max(dt, 1e-3);
        p.fwd.set(Math.sin(p.facing), 0, Math.cos(p.facing));
      }
      // one gait clock per player: footfalls drive dribble touches and the running animation
      const g = advanceGait(p.a.gait, sp, dt);
      p.a.gait = g.phase; p.a.strike = g.strike; p.a.swing = g.swing;
      const sprinting = p.sprint && sp > RUN * 0.92;
      p.stamina = p.team.isUser ? 1 : clamp(p.stamina + (sprinting ? -0.03 : 0.022) * dt, 0.2, 1);
    }
    // separation
    const P = this.players;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      for (let j = i + 1; j < P.length; j++) {
        const b = P[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.5 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (0.707 - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          // shoulder to shoulder: the stronger man holds his line
          const pa = (a.st.phy || 0.7) ** 2, pb = (b.st.phy || 0.7) ** 2;
          const wa = 2 * pb / (pa + pb), wb = 2 * pa / (pa + pb);
          a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
          b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
        }
      }
    }
  }

  // Momentum-based running (FC-style): speed and heading are separate. Heading can only change as
  // fast as grip allows (lateral accel / speed), so the turning circle grows with pace; wide turns
  // bleed speed, and turning back forces a plant — brake, pivot, go. Agility comes from Dribbling
  // with the ball and Pace without it.
  locomote(p, dt, hasBall) {
    const v = p.vel, d = p.desired;
    const sp = Math.hypot(v.x, v.z), ds = Math.hypot(d.x, d.z);
    if (p.busy > 0) {
      // in an action: drift towards the requested velocity gently
      const dx = d.x - v.x, dz = d.z - v.z, dl = Math.hypot(dx, dz), mx = 4 * dt;
      if (dl > mx) { v.x += dx / dl * mx; v.z += dz / dl * mx; } else { v.x = d.x; v.z = d.z; }
      return;
    }
    if (p.team.isUser && p === p.team.controlled && this.settings.dribAssist !== false) { this.snappyMove(p, dt, hasBall, sp, ds); return; }
    const agility = hasBall ? 0.72 + 0.5 * p.st.dri : 0.8 + 0.35 * p.st.spd;
    const accel = (hasBall ? 6.2 : 7.5) * (0.82 + 0.36 * p.st.spd) * (sp < 3 ? 1.45 : 1);
    const brake = hasBall ? 15 : 17;
    if (ds < 0.15) {
      const ns = Math.max(0, sp - brake * dt);
      if (sp > 0) { v.x *= ns / sp; v.z *= ns / sp; }
      return;
    }
    const tx = d.x / ds, tz = d.z / ds;
    if (sp < 0.9) {
      // from (almost) standing: step off in the new direction
      const ns = Math.min(ds, sp + accel * dt);
      v.x = tx * ns; v.z = tz * ns;
      return;
    }
    const ah = Math.atan2(v.x, v.z);
    const err = wrap(Math.atan2(tx, tz) - ah);
    const ae = Math.abs(err);
    let target = ds;
    if (ae > 1.9) target = Math.min(ds, 1.4);                                        // turn back: plant
    else if (ae > 0.3) target = ds * (1 - (hasBall ? 0.5 : 0.35) * Math.min(1, (ae - 0.3) / 1.2)); // ease off into the turn
    const ns = sp < target ? Math.min(target, sp + accel * dt) : Math.max(target, sp - brake * dt);
    const grip = (hasBall ? 10.5 : 15) * agility;
    const maxYaw = Math.min(sp < 2.6 ? 11 * agility : 99, grip / Math.max(sp, 0.9));
    const ang = ah + clamp(err, -maxYaw * dt, maxYaw * dt);
    v.x = Math.sin(ang) * ns; v.z = Math.cos(ang) * ns;
  }

  // Your controlled player (with dribble assist): game-like, responsive movement. Quick to get
  // going and to stop, turns fast with only a small speed dip on big changes of direction.
  snappyMove(p, dt, hasBall, sp, ds) {
    const v = p.vel, d = p.desired;
    const accel = 24 * (0.85 + 0.3 * p.st.spd), brake = 28;
    if (ds < 0.15) {
      const ns = Math.max(0, sp - brake * dt);
      if (sp > 0) { v.x *= ns / sp; v.z *= ns / sp; }
      return;
    }
    const tx = d.x / ds, tz = d.z / ds;
    if (sp < 0.9) { const ns = Math.min(ds, sp + accel * dt); v.x = tx * ns; v.z = tz * ns; return; }
    const ah = Math.atan2(v.x, v.z), err = wrap(Math.atan2(tx, tz) - ah), ae = Math.abs(err);
    const yaw = (hasBall ? 11 : 13) * (0.85 + 0.3 * (hasBall ? p.st.dri : p.st.spd));
    const ang = ah + clamp(err, -yaw * dt, yaw * dt);
    const target = ds * (1 - 0.4 * clamp((ae - 0.6) / 2.5, 0, 1));
    const ns = sp < target ? Math.min(target, sp + accel * dt) : Math.max(target, sp - brake * dt);
    v.x = Math.sin(ang) * ns; v.z = Math.cos(ang) * ns;
  }

  animate(dt) {
    const ball = this.ball;
    let i = 0;
    for (const p of this.players) {
      const a = p.a;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      a.speed = sp;
      const adv = (k, dur) => { if (a[k] >= 0) { a[k] += dt / dur; if (a[k] > 1) a[k] = -1; } };
      adv('kickT', a.kickDur || 0.42); adv('tackleT', 0.5); adv('slideT', 1.0); adv('headerT', 0.5); adv('throwT', 0.55); adv('hitT', 0.7); adv('touchT', 0.28); adv('skillT', a.skillDur || 0.6);
      a.moveAngle = sp > 0.3 ? wrap(Math.atan2(p.vel.x, p.vel.z) - p.facing) : 0;
      a.turnRate = p.turnRate || 0;
      if (a.diveT >= 0) { a.diveT += dt / 1.25; if (a.diveT > 1 || p.action !== 'dive') a.diveT = -1; }
      a.hold = ball.owner === p && ball.held && !a.throwReady && p.action !== 'throw';
      a.ready = p.isGK && this.phase === 'play' && ball.owner !== p && HL - Math.abs(ball.pos.x) < 35 && Math.sign(ball.pos.x) === Math.sign(p.team.goalX) && sp < 3;
      if (this.phase !== 'goal') { a.celebrate = Math.max(0, a.celebrate - dt * 2); a.sad = Math.max(0, a.sad - dt); }
      animateModel(p.model, a, this.time, dt);
      const root = p.model.root;
      root.position.set(p.pos.x, 0, p.pos.z);
      root.rotation.y = p.facing;
      if (this.blobs) {
        const sx = 1.0, sz = 1.25;
        this._m4.makeScale(sx, 1, sz);
        this._m4.setPosition(p.pos.x + 0.15, 0.02, p.pos.z - 0.1);
        this.blobs.setMatrixAt(i, this._m4);
      }
      i++;
    }
    if (this.blobs) this.blobs.instanceMatrix.needsUpdate = true;
  }

  updateIndicators(dt) {
    const c = this.home.controlled;
    const show = c && (this.phase === 'play' || this.phase === 'restart');
    this.ring.visible = this.arrow.visible = !!show;
    if (show) {
      this.ring.position.set(c.pos.x, 0.03, c.pos.z);
      const s = 1 + Math.sin(this.time * 6) * 0.06;
      this.ring.scale.set(s, s, s);
      this.arrow.position.set(c.pos.x, 2.45 + Math.sin(this.time * 5) * 0.08, c.pos.z);
      this.arrow.rotation.y = this.time * 2;
      const hasBall = this.ball.owner === c;
      this.ring.material.color.setHex(hasBall ? 0x45e0ff : 0xffffff);
    }
    // receiver highlight, or a live preview of who the pass will go to
    let rcv = null;
    for (const p of this.home.players) if (p.recv && p !== c) rcv = p;
    let preview = false;
    if (!rcv && c && this.ball.owner === c && this.phase === 'play' && this._userAim) {
      this._prevT = (this._prevT || 0) - dt;
      if (this._prevT <= 0) { this._prevT = 0.12; this._preview = this.passTarget(c, this._userAim, 'ground'); }
      rcv = this._preview;
      preview = true;
    }
    this.recvRing.visible = !!rcv;
    if (rcv) {
      this.recvRing.position.set(rcv.pos.x, 0.03, rcv.pos.z);
      const k = preview ? 0.9 + Math.sin(this.time * 8) * 0.1 : 1.1;
      this.recvRing.scale.set(k, k, k);
      this.recvRing.material.opacity = preview ? 0.6 : 0.9;
    }
    // ball trail on hard-hit balls
    this.updateTrail(dt);
    // set-piece aim arrow
    const r = this.restart;
    this.aimArrow.visible = !!(r && r.ready && r.team.isUser && this.phase === 'restart');
    if (this.aimArrow.visible) {
      this.aimArrow.position.set(r.spot.x, 0.05, r.spot.z);
      this.aimArrow.rotation.y = Math.atan2(r.aim.x, r.aim.z);
    }
  }

  updateTrail(dt) {
    if (!this.trail) {
      const N = 18;
      this.trailPts = Array.from({ length: N }, () => new V3());
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const al = new Float32Array(N * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(al, 3));
      this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.trail.frustumCulled = false;
      this.scene.add(this.trail);
      this.objects.push(this.trail);
    }
    const ball = this.ball;
    const sp = ball.owner ? 0 : ball.speed;
    const target = clamp((sp - 14) / 12, 0, 1);
    this.trailK = (this.trailK || 0) + (target - (this.trailK || 0)) * Math.min(1, dt * 8);
    const pts = this.trailPts;
    for (let i = pts.length - 1; i > 0; i--) pts[i].copy(pts[i - 1]);
    pts[0].set(ball.pos.x, ball.pos.y + 0.05, ball.pos.z);
    const pa = this.trail.geometry.attributes.position, ca = this.trail.geometry.attributes.color;
    for (let i = 0; i < pts.length; i++) {
      pa.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
      const f = (1 - i / pts.length) * this.trailK;
      ca.setXYZ(i, f, f * 0.95, f * 0.7);
    }
    pa.needsUpdate = ca.needsUpdate = true;
    this.trail.visible = this.trailK > 0.02;
  }

  // camera focus
  focus(out) {
    const ball = this.ball;
    if (this.phase === 'goal' && this.scorer) return out.copy(this.scorer.pos);
    const r = this.restart;
    if (r && this.phase === 'restart') {
      const t = r.team;
      if (r.type === 'corner') return out.set(t.attackX - t.dir * 13, 0, r.spot.z * 0.3);
      if (r.type === 'goalkick') return out.set(r.spot.x + t.dir * 14, 0, r.spot.z * 0.5);
      if (r.type === 'throw') return out.set(r.spot.x + t.dir * 3, 0, r.spot.z * 0.75);
    }
    if (ball.owner) {
      const o = ball.owner;
      return out.set(ball.pos.x + o.vel.x * 0.35, 0, ball.pos.z + o.vel.z * 0.25);
    }
    return out.set(ball.pos.x + ball.vel.x * 0.15, 0, ball.pos.z + ball.vel.z * 0.1);
  }

  // free kicks and penalties at goal: a low camera behind the ball, held while the shot flies
  setPieceView(pos, look) {
    const r = this.restart;
    let spot, team;
    if (r && this.phase === 'restart' && r.shooting && r.ready) { spot = r.spot; team = r.team; this._spView = { spot: spot.clone(), team, t: 0 }; }
    else if (this._spView && this.lastKick.setpiece && this.phase === 'play' && (this._spView.t += 1 / 60) < 1.8) { spot = this._spView.spot; team = this._spView.team; }
    else { this._spView = null; return false; }
    const gx = team.attackX, dx = gx - spot.x, dz = -spot.z, L = Math.hypot(dx, dz) || 1;
    const back = r && r.type === 'penalty' ? 5.5 : 7.5;
    pos.set(spot.x - dx / L * back, 2.4, spot.z - dz / L * back);
    look.set(gx - Math.sign(dx) * 4, 1.1, spot.z * 0.15);
    return true;
  }

  uiMode() {
    const c = this.home.controlled, ball = this.ball;
    if (!ball.owner && this.phase === 'play') return 'attack'; // loose or in the air: PASS / SHOOT
    if (this.phase === 'restart' && this.restart && this.restart.team === this.home) return 'attack';
    if (ball.owner === c) return 'attack';
    if (!ball.owner && c && hdist(c.pos, ball.pos) < 1.6) return 'attack';
    if (ball.owner && ball.owner.team === this.home) return 'attack';
    if (!ball.owner && this.possTeam === this.home && this.lastKick.team === this.home) return 'attack';
    return 'defend';
  }
}
