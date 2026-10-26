import * as THREE from '../lib/three.module.min.js';
import { F, BALL_R, GRAVITY, FORMATION, KICKOFF, DIFFICULTY, TEAMS } from './config.js';
import { createPlayerModel, animateModel } from './model.js';
import { Ball } from './ball.js';

const V3 = THREE.Vector3;
const { HL, HW, GW, GH, GD } = F;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73;
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const RUN = 6.3, SPRINT = 8.7;
const PRED_N = 30, PRED_DT = 0.1;
const FORWARDS = new Set(['LW', 'ST', 'RW']);
const DEFENDERS = new Set(['LB', 'CB', 'RB']);

// ---------------------------------------------------------------------------
class Player {
  constructor(match, team, data, idx) {
    this.m = match;
    this.team = team;
    this.data = data;
    this.st = data.st;
    this.idx = idx;
    this.slot = FORMATION[idx];
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
      headerT: -1, throwT: -1, throwReady: false, celebrate: 0, celebrateStyle: 0, sad: 0, hold: false, ready: false,
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
    this.players = this.cfg.players.map((d, i) => new Player(match, this, d, i));
    this.opp = null;
  }
  get gk() { return this.players[0]; }
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
    this.stats = { home: { shots: 0, on: 0, poss: 0, passes: 0 }, away: { shots: 0, on: 0, poss: 0, passes: 0 } };
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
    for (const p of this.players) {
      this.scene.remove(p.model.root);
      const mesh = p.model.mesh;
      mesh.geometry.dispose();
      mesh.material.map.dispose();
      mesh.material.dispose();
      mesh.skeleton.dispose();
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
      t.players.forEach((p, i) => {
        const k = KICKOFF[i];
        t.world(k.a, k.c, p.pos);
        p.vel.set(0, 0, 0);
        p.desired.set(0, 0, 0);
        p.facing = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        p.fwd.set(Math.sin(p.facing), 0, Math.cos(p.facing));
        p.busy = 0; p.action = null; p.pending = null; p.recv = null; p.stun = 0; p.save = null;
        p.a.celebrate = 0; p.a.sad = 0; p.a.diveT = -1; p.a.slideT = -1; p.a.kickT = -1; p.a.throwReady = false; p.a.hold = false;
      });
    }
    const st = kickTeam.players[9], partner = kickTeam.players[8];
    st.pos.set(-kickTeam.dir * 0.45, 0, 0.3);
    partner.pos.set(-kickTeam.dir * 1.0, 0, -6);
    this.ball.pos.set(0, BALL_R, 0);
    this.ball.vel.set(0, 0, 0);
    this.ball.owner = st;
    this.ball.held = false;
    this.restart = { type: 'kickoff', team: kickTeam, taker: st, spot: new V3(0, BALL_R, 0), aim: new V3(-kickTeam.dir, 0, 0), wait: 0, ready: true };
    this.possTeam = kickTeam;
    if (kickTeam.isUser) this.home.controlled = st;
    else this.home.controlled = this.home.players[9];
  }

  startMatch() {
    this.phase = 'restart';
    this.phaseT = 0;
    this.placeKickoff(this.home);
    this.hooks.hint('Tap PASS to kick off');
    this.sound.whistle(1);
  }

  // ---------------------------------------------------------------- main update
  update(dt, input) {
    this.time += dt;
    this.phaseT += dt;
    const ball = this.ball;

    for (const p of this.players) {
      p.cool -= dt; p.stun -= dt; p.tackleCD -= dt; p.skillT -= dt;
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
      if (this.phaseT > 5.2 && !this._transition) {
        this._transition = true;
        this.hooks.fade(() => { this._transition = false; this.setupKickoff(this.concede); });
      }
    } else if (ph === 'halftime') {
      this.idleAI(dt);
      if (this.phaseT > 4 && !this._transition) {
        this._transition = true;
        this.hooks.fade(() => {
          this._transition = false;
          this.home.dir *= -1; this.away.dir *= -1;
          this.half = 2; this.clock = 0; this.stoppage = 0;
          this.setupKickoff(this.away);
        });
      }
    } else if (ph === 'fulltime' || ph === 'menu' || ph === 'intro') {
      this.idleAI(dt);
    }

    this.movePlayers(dt);
    this.updateBall(dt);
    if (this.phase === 'play') {
      this.ballInteractions(dt);
      this.checkGoalAndOut();
      if (this.possTeam) this.stats[this.possTeam.key].poss += dt;
    }
    if (this.phase === 'play' || this.phase === 'restart') this.updateClock(dt);

    // crowd excitement: ball near a goal
    const dg = HL - Math.abs(ball.pos.x);
    const ex = this.phase === 'goal' ? 1 : clamp(1 - dg / 30, 0, 1) * (Math.abs(ball.pos.z) < 25 ? 1 : 0.5);
    this.excite += (ex - this.excite) * Math.min(1, dt * 2);

    this.animate(dt);
    this.updateIndicators(dt);
  }

  updateClock(dt) {
    this.clock += dt;
    if (this.clock < this.halfLen) return;
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
      this.hooks.banner('HALF TIME', `${this.home.cfg.name} ${this.home.score} - ${this.away.score} ${this.away.cfg.name}`, 3500);
    } else {
      this.phase = 'fulltime';
      this.phaseT = 0;
      this.hooks.fullTime();
    }
    this.sound.applause();
  }

  get minute() {
    const m = Math.min(45, this.clock / this.halfLen * 45) + (this.half - 1) * 45;
    return m;
  }

  // ---------------------------------------------------------------- user control
  userControl(dt, input) {
    const team = this.home, ball = this.ball;
    const p = team.controlled;
    if (!p) return;
    const mag = input.mag;
    const wdir = new V3(input.move.x, 0, -input.move.y);
    if (mag > 0) wdir.normalize();
    const B = input.b;
    const sprint = B.sprint.down || (this.settings.autoSprint && mag > 0.93);
    const r = this.restart;

    if (this.phase === 'restart' && r) {
      if (r.team === team && r.taker === p) {
        if (mag > 0.2) r.aim.copy(wdir);
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
    if (mag > 0) {
      p.idleT = 0;
      p.manual = true;
      const sp = p.maxSpeed(sprint) * Math.min(1, 0.3 + mag);
      p.desired.copy(wdir).multiplyScalar(sp);
      p.sprint = sprint;
    } else {
      p.idleT += dt;
      if (hasBall) {
        p.manual = true;
        p.desired.multiplyScalar(Math.max(0, 1 - dt * 5));
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
    const attackCtx = hasBall || nearFree || ourFlight;
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
      if (hasBall && B.skill.pressed) { this.skillMove(p, mag > 0.2 ? wdir : null); return; }
      if (B.shoot.pressed && nearFree) {
        this.gainBall(p, false, true);
        this.shoot(p, 0.75, mag > 0.2 ? wdir : null, true);
        return;
      }
      if (hasBall) {
        if (B.shoot.pressed) { p.charging = true; p.charge = 0; }
        if (p.charging) {
          p.charge = Math.min(1, p.charge + dt / 0.8);
          p.chipping = B.shoot.flick;
          if (!B.shoot.down) {
            p.charging = false;
            this.shoot(p, Math.max(0.25, p.charge), mag > 0.2 ? wdir : null, false, B.shoot.flick);
          }
        }
        return;
      }
    }
    p.charging = false;

    // one-touch: queue a pass/shot while our pass is on its way
    if (p.queued) { p.queued.t -= dt; if (p.queued.t <= 0) p.queued = null; }
    if (ourFlight && (passFire || thruFire || B.shoot.pressed)) {
      p.queued = { kind: B.shoot.pressed ? 'shoot' : thruFire && !passFire ? 'through' : 'ground', height: passHeight, t: 1.2, aim: mag > 0.2 ? wdir.clone() : null };
      this.hooks.event(B.shoot.pressed ? 'FIRST-TIME SHOT' : 'ONE-TOUCH');
      return;
    }

    const ourBall = ball.owner && ball.owner.team === team;
    if (!ourBall && !ourFlight) {
      if (B.pass.pressed) this.switchPlayer(true);
      const q = team.controlled;
      if (B.shoot.pressed) this.tackle(q, false);
      if (B.skill.pressed) this.tackle(q, true);
      team.callPress = B.through.down;
      if (B.through.down && mag === 0 && q.busy <= 0) {
        // auto-press the ball
        const tgt = ball.owner ? ball.owner.pos.clone().addScaledVector(ball.owner.vel, 0.25) : this.interceptPoint(q);
        q.goTo(tgt, q.maxSpeed(true), 0.8);
        q.manual = true;
        q.idleT = 0;
      }
      // auto switch to whoever is closest to the ball (eager when you're not steering)
      this._swCD = (this._swCD || 0) - dt;
      if (this.settings.autoSwitch !== false && !B.through.down && this._swCD <= 0 && q.busy <= 0) {
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
    if (t.controlled) { t.controlled.manual = false; t.controlled.charging = false; }
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
    this.stats[team.key].passes++;
    if (team.isUser && m && !m.isGK) {
      this.setControlled(m);
      m.recv.t = 0;
    }
  }

  shoot(p, power, aimDir, firstTime = false, chip = false) {
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
      return;
    }
    const vh = 15 + power * 14 + p.st.sho * 3;
    this.kick(p, { mode: 'shot', target: new V3(gx, yT, zT), vh, power: 0.6 + power * 0.4, kind: 'shot', first: firstTime });
  }

  // queue a kick (with a wind-up so the animation leads the ball)
  kick(p, k) {
    k.t = k.first ? 0.06 : 0.14;
    p.pending = k;
    p.action = 'kick';
    p.busy = 0.42;
    p.actionT = 0;
    p.a.kickT = 0;
    p.a.kickPow = clamp(k.power, 0.2, 1);
    p.desired.multiplyScalar(0.4);
    const dx = k.target.x - p.pos.x, dz = k.target.z - p.pos.z;
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
    if (throwIn) ball.pos.set(p.pos.x + p.fwd.x * 0.3, 2.1, p.pos.z + p.fwd.z * 0.3);
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
    ball.spin = k.spin || (k.mode === 'shot' ? gauss() * 1.5 : 0);
    p.cool = 0.32;
    this.lastTouch = p;
    this.kickId++;
    this.lastKick = { kind: k.kind, team: p.team, id: this.kickId, by: p };
    this.guarantee = k.guarantee ? { to: k.guarantee, id: this.kickId, t: 0 } : null;
    this.sound.kick(k.power);
    if (k.kind === 'shot') this.stats[p.team.key].shots++;
  }

  skillMove(p, dir) {
    // quick feint + burst: sharp cut, briefly unstealable, wrong-foots nearby defenders
    const ang = dir ? Math.atan2(dir.x, dir.z) : p.facing + (Math.random() < 0.5 ? 1 : -1) * 1.2;
    p.facing = ang;
    p.fwd.set(Math.sin(ang), 0, Math.cos(ang));
    p.vel.copy(p.fwd).multiplyScalar(p.maxSpeed(true) * 0.95);
    p.skillT = 0.55;
    p.a.kickT = 0.5;
    p.a.kickPow = 0.25;
    this.ball.pos.copy(p.pos).addScaledVector(p.fwd, 0.9);
    this.ball.pos.y = BALL_R;
    for (const o of p.team.opp.players) {
      if (hdist(o.pos, p.pos) < 3.5 && Math.random() < 0.75 - o.st.def * 0.35) o.stun = 0.45;
    }
    this.sound.kick(0.15);
  }

  tackle(p, slide) {
    if (!p || p.busy > 0 || p.tackleCD > 0 || p.stun > 0) return;
    const ball = this.ball;
    const toBall = new V3(ball.pos.x - p.pos.x, 0, ball.pos.z - p.pos.z);
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
    if (ball.pos.y > 0.8 || hdist(foot, ball.pos) > (slide ? 1.15 : 0.95)) return;
    const o = ball.owner;
    if (o === p || (o && o.pending)) return;
    if (!o && this.guarantee && this.guarantee.to !== p) return; // assisted pass in flight
    p.tackleDone = true;
    if (o && o.team === p.team) return;
    if (o && ball.held) return;
    if (!o) {
      if (slide) { ball.vel.copy(p.fwd).multiplyScalar(7); ball.vel.y = 0.5; this.lastTouch = p; this.sound.kick(0.3); }
      else this.gainBall(p, false);
      return;
    }
    let chance = 0.42 + 0.45 * p.st.def - 0.28 * o.st.dri + (o.sprint ? 0.12 : 0) + (slide ? 0.15 : 0);
    if (!p.team.isUser) chance *= 0.65 + 0.35 * this.diff.tackle;
    if (o.skillT > 0) chance -= 0.35;
    if (Math.random() < chance) {
      o.stun = slide ? 0.9 : 0.45;
      if (!slide && Math.random() < 0.6) { this.gainBall(p, false); }
      else {
        ball.owner = null;
        ball.vel.copy(p.fwd).multiplyScalar(rand(3, 6)).add(new V3(gauss() * 1.5, 0.3, gauss() * 1.5));
        this.lastTouch = p;
        o.cool = 0.4;
      }
      this.sound.kick(0.3);
      if (p.team.isUser) this.hooks.event('WON IT!');
    }
  }

  // ---------------------------------------------------------------- ball
  gainBall(p, hands, silent = false) {
    const ball = this.ball;
    ball.owner = p;
    ball.held = !!hands;
    ball.vel.set(0, 0, 0);
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
    if (o) {
      if (ball.held) {
        if (o.a.throwReady || o.action === 'throw') ball.pos.set(o.pos.x + o.fwd.x * 0.05, 2.15, o.pos.z + o.fwd.z * 0.05);
        else ball.pos.set(o.pos.x + o.fwd.x * 0.36, 1.1, o.pos.z + o.fwd.z * 0.36);
        ball.vel.set(0, 0, 0);
      } else {
        const sp = Math.hypot(o.vel.x, o.vel.z);
        const n = Math.min(1, sp / 8.6);
        const stride = 0.5 + 0.5 * Math.sin(o.a.phase * 0.5);
        const ahead = 0.48 + n * 0.32 + (o.sprint ? n * 1.0 * stride : n * 0.28 * stride);
        const rx = -o.fwd.z, rz = o.fwd.x;
        const tx = o.pos.x + o.fwd.x * ahead + rx * 0.07;
        const tz = o.pos.z + o.fwd.z * ahead + rz * 0.07;
        const k = 1 - Math.exp(-dt * (o.pending ? 25 : 16));
        const nx = ball.pos.x + (tx - ball.pos.x) * k;
        const nz = ball.pos.z + (tz - ball.pos.z) * k;
        ball.vel.set((nx - ball.pos.x) / dt, 0, (nz - ball.pos.z) / dt);
        ball.pos.set(nx, Math.max(BALL_R, ball.pos.y - dt * 4), nz);
      }
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
        this.hooks.event('OFF THE WOODWORK!');
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
  }

  ballInteractions(dt) {
    const ball = this.ball;
    const o = ball.owner;
    if (o) {
      if (ball.held || o.skillT > 0 || o.pending) return;
      for (const d of o.team.opp.players) {
        if (d.stun > 0 || d.busy > 0 || d.isGK) continue;
        const fx = d.pos.x + d.fwd.x * 0.4, fz = d.pos.z + d.fwd.z * 0.4;
        const dist = Math.hypot(ball.pos.x - fx, ball.pos.z - fz);
        if (dist > 0.8) continue;
        let rate;
        if (d.team.isUser) rate = d === d.team.controlled ? 1.1 : 0.4;
        else rate = 1.25 * this.diff.tackle * this.diff.press;
        rate *= (0.55 + d.st.def * 0.8) * (1.35 - o.st.dri * 0.65) * (o.sprint ? 1.35 : 1);
        if (Math.random() < rate * dt) {
          o.stun = 0.35;
          this.gainBall(d, false);
          if (d.team.isUser) this.hooks.event('BALL WON');
          return;
        }
      }
      return;
    }

    const sp = ball.speed;
    // assisted pass: it always reaches the intended teammate
    let g = this.guarantee;
    if (g && (g.id !== this.lastKick.id || g.t > 7)) g = this.guarantee = null;
    if (g) {
      g.t += dt;
      const r = g.to;
      if (hdist(r.pos, ball.pos) < 1.9 && ball.pos.y < 2.7 && r.stun <= 0) { this.guarantee = null; this.gainBall(r, false); return; }
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
      if (p.isGK && p.team.inOwnBox(ball.pos)) {
        if (p.save && !p.save.willSave) continue;
        if (by < 2.5 && d < 1.25) { if (d < bd) { bd = d; best = p; bestType = 'hands'; } }
        continue;
      }
      if (by > 1.2 && by < 2.6 && d < 0.8 && ball.vel.y < 4) {
        // a ball that was just headed gets chested down instead of headed again (no header ping-pong)
        if (d < bd) { bd = d; best = p; bestType = afterHeader ? 'control' : 'header'; }
      } else if (by < 1.2 && d < (sp < 5 ? 1.0 : 0.8)) {
        if (sp > 22 && by > 0.3) {
          if (d < 0.55 && d < bd) { bd = d; best = p; bestType = 'block'; }
        } else if (d < bd) { bd = d; best = p; bestType = 'control'; }
      }
    }
    if (!best) return;
    if (bestType === 'control') this.gainBall(best, false);
    else if (bestType === 'hands') {
      this.gainBall(best, true);
      best.save = null;
    } else if (bestType === 'header') this.header(best);
    else if (bestType === 'block') {
      if (Math.random() < 0.55) {
        ball.vel.multiplyScalar(-rand(0.15, 0.35));
        ball.vel.x += gauss() * 3; ball.vel.z += gauss() * 3; ball.vel.y = rand(1, 4);
        this.lastTouch = best;
        best.cool = 0.4;
        this.sound.thud(6);
        this.hooks.event('BLOCKED!');
      } else best.cool = 0.3;
    }
  }

  header(p) {
    const ball = this.ball, team = p.team;
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
      this.stats[team.key].shots++;
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
    this.guarantee = null;
    this.sound.kick(0.4);
  }

  // ---------------------------------------------------------------- rules
  checkGoalAndOut() {
    if (this.ball.held) return;
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
        }
        if (lt === defenders) {
          this.startRestart('corner', attackers, new V3(s * (HL - 0.4), BALL_R, Math.sign(b.z || 1) * (HW - 0.4)));
        } else {
          this.startRestart('goalkick', defenders, new V3(s * (HL - F.SIX_L), BALL_R, Math.sign(b.z || 1) * 4));
        }
        return;
      }
    }
    if (Math.abs(b.z) > HW + BALL_R) {
      const lt = this.lastTouch ? this.lastTouch.team : this.home;
      this.startRestart('throw', lt.opp, new V3(clamp(b.x, -HL + 1, HL - 1), BALL_R, Math.sign(b.z) * (HW + 0.3)));
    }
  }

  goalScored(team) {
    team.score++;
    this.phase = 'goal';
    this.phaseT = 0;
    this.concede = team.opp;
    const lt = this.lastTouch;
    const own = lt && lt.team !== team;
    this.scorer = own || !lt ? team.players[9] : lt;
    if (this.onCounted !== this.lastKick.id && this.lastKick.team === team) { this.onCounted = this.lastKick.id; this.stats[team.key].on++; }
    this.restart = null;
    this.ball.owner = null;
    this.hooks.hint('');
    this.hooks.goal(team, own ? `${lt.name} (OG)` : this.scorer.name, own);
    if (team.isUser) this.sound.cheer(); else { this.sound.swell(0.4, 3, 700); this.sound.ooh(); }
    this.sound.whistle(1);
    for (const p of this.players) {
      p.recv = null;
      p.a.celebrateStyle = Math.random() < 0.5 ? 0 : 1;
    }
    this.scorer.a.celebrateStyle = 0;
    this.celebSpot = new V3(team.dir * (HL - 3), 0, Math.sign(this.scorer.pos.z || 1) * (HW - 3));
  }

  setupKickoff(team) {
    this.placeKickoff(team);
    this.phase = 'restart';
    this.phaseT = 0;
    this.restart.wait = 0;
    this.sound.whistle(1);
    this.hooks.hint(team.isUser ? 'Tap PASS to kick off' : '');
  }

  startRestart(type, team, spot) {
    const ball = this.ball;
    this.phase = 'restart';
    this.phaseT = 0;
    ball.owner = null;
    ball.vel.set(0, 0, 0);
    ball.spin = 0;
    for (const p of this.players) { p.recv = null; p.pending = null; p.charging = false; }
    let taker;
    if (type === 'goalkick') taker = team.gk;
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
    const r = { type, team, taker, spot: spot.clone(), aim, wait: 0, ready: false };
    this.restart = r;
    this.possTeam = team;
    const labels = { throw: 'THROW-IN', corner: 'CORNER', goalkick: 'GOAL KICK' };
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
      // keep opponents at a respectful distance
      for (const p of team.opp.players) {
        const d = hdist(p.pos, spot);
        if (d < 6 && !p.isGK) {
          const dx = p.pos.x - spot.x, dz = p.pos.z - spot.z;
          const l = Math.hypot(dx, dz) || 1;
          p.pos.x = spot.x + dx / l * 6; p.pos.z = clamp(spot.z + dz / l * 6, -HW + 1, HW - 1);
        }
      }
      if (type === 'corner') this.arrangeCorner(team, spot);
      if (team.isUser) {
        if (!taker.isGK) this.setControlled(taker);
        this.hooks.hint(type === 'corner' ? 'PASS = cross · THROUGH = short' : type === 'throw' ? 'Aim & tap PASS to throw' : 'Tap PASS (or SHOOT for long)');
      }
      r.ready = true;
      r.wait = 0;
    });
    this.hooks.event(labels[type]);
  }

  arrangeCorner(att, spot) {
    const s = Math.sign(spot.x), sz = Math.sign(spot.z);
    const atkSpots = [[6, sz * 2.5], [7, -sz * 2.5], [11, 0], [9, sz * 6], [10, -sz * 6], [18, 0], [17, sz * 10]];
    const order = [9, 3, 8, 10, 2, 7, 5];
    order.forEach((idx, i) => {
      const p = att.players[idx];
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
    if ((!r.team.isUser || t.isGK) && r.wait > (r.type === 'kickoff' ? 1.2 : 1.6)) this.aiTakeRestart();
    if (r.team.isUser && r.wait > 10) this.takeRestart('ground');
  }

  aiTakeRestart() {
    const r = this.restart;
    const p = r.taker, team = r.team;
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
      const m = team.players[rand(8, 11) | 0];
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
    p.a.throwReady = false;
    if (this.ball.owner !== p) this.ball.owner = p;
    const aim = r.aim.clone().normalize();
    if (r.type === 'throw') {
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
      }
      const target = m ? m.pos.clone().addScaledVector(m.vel, 0.6) : p.pos.clone().addScaledVector(aim, 12);
      target.z = clamp(target.z, -HW + 1, HW - 1);
      if (m) m.recv = { point: target.clone(), t: 0 };
      if (team.isUser && m) this.setControlled(m);
      p.action = 'throw'; p.busy = 0.55; p.actionT = 0; p.a.throwT = 0;
      p.pending = { mode: 'loft', target, angle: 0.42, power: 0.3, kind: 'throw', t: 0.28 };
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
    if (DEFENDERS.has(p.role)) a = clamp(a, 0.06, attacking ? 0.6 : 0.45);
    else if (FORWARDS.has(p.role)) a = clamp(a, attacking ? 0.45 : 0.38, 0.92);
    else a = clamp(a, 0.15, 0.8);
    if (!attacking && !FORWARDS.has(p.role)) a = Math.min(a, aB - 0.03);
    if (!attacking) a = Math.max(a, 0.05);
    if (attacking && FORWARDS.has(p.role) && p.runT <= 0) {
      // hold the offside line
      let line = 0;
      for (const o of team.opp.players) if (!o.isGK) line = Math.max(line, team.along(o.pos));
      a = Math.min(a, Math.max(line, aB) + 0.005);
    }
    let c = s.c * (attacking ? 1.05 : 0.78) + cB * (attacking ? 0.22 : 0.35);
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
    for (const p of team.players) {
      if (p.isGK) { this.gkAI(p, dt); continue; }
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
        const standOff = userTeamPassive ? 1.5 : 1.0;
        const d = hdist(p.pos, owner.pos);
        tgt.copy(owner.pos).addScaledVector(owner.vel, d > 4 ? 0.55 : 0.3).addScaledVector(toGoal, standOff);
        p.goTo(tgt, d > 5 ? p.maxSpeed(true) * (team.isUser ? 1 : this.diff.press) : p.maxSpeed(true) * 0.95, 0.8);
        if (d < 4.5) {
          // jockey: match the carrier's run while closing the gap
          const ov = owner.vel;
          p.desired.x = p.desired.x * 0.55 + ov.x * 0.5;
          p.desired.z = p.desired.z * 0.55 + ov.z * 0.5;
          p.faceTo = owner.pos;
        }
        if (!team.isUser && d < 1.9 && p.tackleCD <= 0 && Math.random() < dt * 1.4 * this.diff.tackle) this.tackle(p, false);
        if (team.isUser && d < 1.7 && p.tackleCD <= 0 && Math.random() < dt * (team.callPress ? 1.5 : 0.55)) this.tackle(p, false);
        continue;
      }
      if (p === cover) {
        const og = new V3(team.goalX, 0, 0);
        const toGoal = og.sub(owner.pos).setY(0);
        const L = toGoal.length();
        toGoal.normalize();
        const danger = team.inOwnBox(owner.pos, 8);
        tgt.copy(owner.pos).addScaledVector(owner.vel, 0.4).addScaledVector(toGoal, danger ? 1.5 : Math.min(7, L * 0.35));
        p.goToAuto(tgt, danger);
        const dc = hdist(p.pos, owner.pos);
        if (!team.isUser && dc < 1.7 && p.tackleCD <= 0 && Math.random() < dt * 0.9 * this.diff.tackle) this.tackle(p, false);
        continue;
      }
      this.formationTarget(p, attacking, aB, cB, tgt);
      if (attacking) {
        // runs in behind
        if (FORWARDS.has(p.role) || (p.role === 'CM' && Math.random() < 0.3)) {
          if (p.runT > 0) {
            p.runT -= dt;
            tgt.copy(p.runTarget);
          } else if (owner && owner.team === team && aB > 0.35 && Math.random() < dt * 0.22) {
            p.runT = rand(1.8, 3);
            p.runTarget = new V3(clamp(p.pos.x + team.dir * rand(12, 20), -HL + 4, HL - 4), 0, clamp(p.pos.z * 0.6 + gauss() * 5, -HW + 3, HW - 3));
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
      const lane = this.laneRisk(p.pos, m.pos, team.opp);
      const open = this.nearestOpp(m).d;
      const prog = team.along(m.pos) - a0;
      let sc = prog * (prog < 0 && a0 > 0.6 ? 3.6 : 2.6) + clamp(open / 7, 0, 1) * 0.6 - lane * 1.5 - (d > 30 ? 0.25 : 0) + 0.1;
      if (safe) sc = -lane * 2 + clamp(open / 7, 0, 1) - d * 0.01;
      if (Math.abs(m.pos.x - team.attackX) < 18 && Math.abs(m.pos.z) < 18) sc += a0 > 0.8 ? 0.9 : 0.25;
      if (sc > bs) { bs = sc; best = { m, sc, type: 'ground', target: m.pos.clone() }; }
      if (!safe && (FORWARDS.has(m.role) || m.role === 'CM') && prog > -0.05) {
        const tp = m.pos.clone().add(new V3(team.dir * 8, 0, -m.pos.z * 0.1));
        if (Math.abs(tp.x) < HL - 2) {
          const free = this.nearestOpp(m, tp).d > hdist(m.pos, tp) * 0.9;
          if (free) {
            const sc2 = (team.along(tp) - a0) * 2.6 + 0.5 - this.laneRisk(p.pos, tp, team.opp) * 1.3;
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
        let sc = 1.65 - distGoal / 17 + p.st.sho * 0.25;
        if (distGoal < 14) sc += 0.5;
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
      const dsc = (stall ? -5 : 0) + 0.25 + clamp(space / 14, 0, 1) * 0.65 - (near.d < 1.8 ? 0.45 : 0) + p.st.dri * 0.2 + rand(0, 0.2);
      if (dsc > choice.sc) choice = { type: 'dribble', sc: dsc };
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
      if (this.phase === 'play' && gk.holdT > (ball.held ? 1.4 : 0.6) && !gk.pending) this.gkDistribute(gk);
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
    if (this.lastKick.team === team.opp && this.lastKick.kind === 'shot' && this.onCounted !== this.lastKick.id) { this.onCounted = this.lastKick.id; this.stats[team.opp.key].on++; }
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
    const willSave = Math.random() < pSave;
    gk.save = {
      t: react, lateral, h, tg, willSave, gp: gp.clone(),
      catch: willSave && sp < 24 && Math.random() < 0.45 + skill * 0.35 - (h > 1.8 ? 0.3 : 0) - Math.abs(lateral) * 0.08,
      started: false, until: this.time + tg + 0.6, readTime: this.time,
    };
    if (!willSave) gk.cool = tg + 0.4;
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
    this.lastTouch = gk;
    this.kickId++;
    this.lastKick = { kind: 'save', team: gk.team, id: this.kickId, by: gk };
    if (sv.catch) {
      this.gainBall(gk, true);
      this.hooks.event('SAVED!');
    } else {
      const s = Math.sign(gk.team.goalX);
      ball.vel.set(-s * rand(3, 8), rand(2, 6), Math.sign(sv.lateral || 1) * rand(3, 8));
      gk.cool = 0.6;
      this.hooks.event('WHAT A SAVE!');
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
      const m = team.players[[8, 9, 10][rand(0, 3) | 0]];
      aim.copy(m.pos).sub(gk.pos).setY(0).normalize();
      this.passTo(gk, m, aim, 'long');
    }
    if (gk.pending) gk.pending.fromHands = ballHeld;
  }

  celebrationAI(dt) {
    const sc = this.scorer;
    const team = sc.team;
    for (const p of this.players) {
      p.busy = Math.min(p.busy, 0);
      if (p === sc) {
        const d = p.goTo(this.celebSpot, p.maxSpeed(true) * 0.9, 2);
        p.a.celebrate = Math.min(1, p.a.celebrate + dt * 2);
        p.faceTo = null;
        if (d < 1) p.a.celebrateStyle = 1;
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

  idleAI() {
    for (const p of this.players) {
      p.desired.multiplyScalar(0.9);
      p.faceTo = this.ball.pos;
    }
  }

  // ---------------------------------------------------------------- simulation
  movePlayers(dt) {
    const ball = this.ball;
    for (const p of this.players) {
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

      const free = p.action !== 'slide' && p.action !== 'dive';
      if (p.stun > 0) p.desired.multiplyScalar(0.25);
      if (free) {
        const acc = p.busy > 0 ? 4 : ball.owner === p ? 12 : 15;
        const dx = p.desired.x - p.vel.x, dz = p.desired.z - p.vel.z;
        const dl = Math.hypot(dx, dz);
        const mx = acc * dt;
        if (dl > mx) { p.vel.x += dx / dl * mx; p.vel.z += dz / dl * mx; }
        else { p.vel.x = p.desired.x; p.vel.z = p.desired.z; }
      } else {
        const fr = p.action === 'slide' ? 7 : (p.actionT > 0.55 ? 14 : 1.5);
        const sp = Math.hypot(p.vel.x, p.vel.z);
        if (sp > 0) { const ns = Math.max(0, sp - fr * dt); p.vel.x *= ns / sp; p.vel.z *= ns / sp; }
      }
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.pos.x = clamp(p.pos.x, -HL - 3, HL + 3);
      p.pos.z = clamp(p.pos.z, -HW - 3, HW + 3);

      // facing
      const sp = Math.hypot(p.vel.x, p.vel.z);
      let tf = null;
      if (p.lockFacing !== null && p.busy > 0) tf = p.lockFacing;
      else if (sp > 0.8) tf = Math.atan2(p.vel.x, p.vel.z);
      else if (p.lockFacing !== null) tf = p.lockFacing;
      else if (p.faceTo) {
        const fx = p.faceTo.x - p.pos.x, fz = p.faceTo.z - p.pos.z;
        if (fx * fx + fz * fz > 0.5) tf = Math.atan2(fx, fz);
      }
      if (tf !== null) {
        const rate = ball.owner === p ? (p.sprint ? 5.5 : 7.5) : 10;
        const d = wrap(tf - p.facing);
        p.facing = wrap(p.facing + clamp(d, -rate * dt, rate * dt));
        p.fwd.set(Math.sin(p.facing), 0, Math.cos(p.facing));
      }
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
          const wa = a === this.ball.owner ? 0.8 : 1, wb = b === this.ball.owner ? 0.8 : 1;
          a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
          b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
        }
      }
    }
  }

  animate(dt) {
    const ball = this.ball;
    let i = 0;
    for (const p of this.players) {
      const a = p.a;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      a.speed = sp;
      if (sp > 0.15) a.phase += dt * (4.3 + sp * 0.66);
      const adv = (k, dur) => { if (a[k] >= 0) { a[k] += dt / dur; if (a[k] > 1) a[k] = -1; } };
      adv('kickT', 0.42); adv('tackleT', 0.5); adv('slideT', 1.0); adv('headerT', 0.5); adv('throwT', 0.55);
      if (a.diveT >= 0) { a.diveT += dt / 1.25; if (a.diveT > 1 || p.action !== 'dive') a.diveT = -1; }
      a.hold = ball.owner === p && ball.held && !a.throwReady && p.action !== 'throw';
      a.ready = p.isGK && this.phase === 'play' && ball.owner !== p && HL - Math.abs(ball.pos.x) < 35 && Math.sign(ball.pos.x) === Math.sign(p.team.goalX) && sp < 3;
      if (this.phase !== 'goal') { a.celebrate = Math.max(0, a.celebrate - dt * 2); a.sad = Math.max(0, a.sad - dt); }
      animateModel(p.model, a, this.time);
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

  uiMode() {
    const c = this.home.controlled, ball = this.ball;
    if (this.phase === 'restart' && this.restart && this.restart.team === this.home) return 'attack';
    if (ball.owner === c) return 'attack';
    if (!ball.owner && c && hdist(c.pos, ball.pos) < 1.6) return 'attack';
    if (ball.owner && ball.owner.team === this.home) return 'attack';
    if (!ball.owner && this.possTeam === this.home && this.lastKick.team === this.home) return 'attack';
    return 'defend';
  }
}
