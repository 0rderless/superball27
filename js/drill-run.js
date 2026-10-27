// Runs a skill game on top of a Match: sets up each attempt, watches how it ends, keeps score.
// The match calls onGoal / onOut / update; everything else (shooting, curl, keepers) is the real engine.
import * as THREE from '../lib/three.module.min.js';
import { F, BALL_R } from './config.js';
import { DRILL, shotPoints, crossedGate, coneCourse, fmtScore } from './drills.js';

const { HL, GW } = F;
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);

export class DrillRun {
  constructor(match, kind, hooks) {
    this.m = match; this.kind = kind; this.def = DRILL[kind]; this.hooks = hooks;
    this.score = 0; this.attempt = 0; this.goals = 0;
    this.t = 0; this.state = 'idle'; this.wait = 0; this.done = false;
    match.drill = this;
    const home = match.home;
    // the taker: your best finisher, or your best dribbler for the cones
    const out = home.players.filter(p => !p.isGK);
    this.taker = out.sort((a, b) => kind === 'cones' ? b.st.dri - a.st.dri : b.st.sho - a.st.sho)[0];
    // everyone else sits it out (the keeper stays in for shots; a wall for free kicks)
    const keep = new Set([this.taker, home.gk, match.away.gk]);
    if (kind === 'freekicks') match.away.players.filter(p => !p.isGK).slice(0, 5).forEach(p => keep.add(p));
    for (const p of [...match.players]) if (!keep.has(p)) match.bench(p);
    if (kind === 'cones') this.buildCones();
    match.phase = 'play';
    match.restart = null;
    home.controlled = this.taker;
    this.next();
  }

  get attackX() { return this.m.home.attackX; }

  hud() {
    const d = this.def;
    let info;
    if (this.kind === 'shooting') info = `${Math.max(0, Math.ceil(d.time - this.t))}s left`;
    else if (this.kind === 'cones') info = `Gate ${Math.min(this.gate + 1, this.course.gates.length)}/${this.course.gates.length}${this.gate >= this.course.gates.length ? ' · now score!' : ''}`;
    else info = `Kick ${Math.min(this.attempt, d.attempts)}/${d.attempts} · ${this.goals} scored`;
    const score = this.kind === 'cones' ? `${this.t.toFixed(1)}s` : String(this.score);
    this.hooks.drillHud({ title: d.name, score, info });
  }

  // ---- attempts
  next() {
    const m = this.m, s = m.home.dir, p = this.taker, ball = m.ball;
    if (this.kind !== 'cones' && this.def.attempts && this.attempt >= this.def.attempts) return this.finish();
    if (this.kind === 'shooting' && this.t >= this.def.time) return this.finish();
    this.attempt++;
    this.state = 'ready'; this.stateT = 0; this.kick0 = m.kickId; this.saved = false;
    m.adv = null; m.offside = null; m.guarantee = null;
    for (const q of m.players) { q.busy = 0; q.stun = 0; q.pending = null; q.recv = null; q.action = null; q.save = null; q.vel.set(0, 0, 0); q.desired.set(0, 0, 0); q.a.diveT = -1; q.a.slideT = -1; }
    m.away.gk.pos.set(m.away.goalX - m.away.dir * 0.8, 0, 0);
    if (this.kind === 'shooting') {
      m.phase = 'play'; m.restart = null;
      const d = rand(16, 25), ang = rand(-0.7, 0.7);
      p.pos.set(this.attackX - s * d * Math.cos(ang), 0, d * Math.sin(ang));
      p.facing = Math.atan2(this.attackX - p.pos.x, -p.pos.z);
      p.fwd.set(Math.sin(p.facing), 0, Math.cos(p.facing));
      ball.owner = null; ball.pos.set(p.pos.x + p.fwd.x * 0.45, BALL_R, p.pos.z + p.fwd.z * 0.45); ball.vel.set(0, 0, 0);
      m.gainBall(p, false, true);
      m.hooks.hint('Shoot! Hold SHOOT for power');
    } else if (this.kind === 'freekicks') {
      const d = rand(19, 30), z = rand(-14, 14);
      m.phase = 'play';
      m.startRestart('freekick', m.home, new V3(this.attackX - s * Math.sqrt(Math.max(1, d * d - z * z)), BALL_R, z));
    } else if (this.kind === 'penalties') {
      m.phase = 'play';
      m.startRestart('penalty', m.home, new V3(this.attackX - s * F.PEN, BALL_R, 0));
    } else if (this.kind === 'cones') {
      const st = this.gate > 0 ? this.course.gates[this.gate - 1].a : this.course.start;
      m.phase = 'play'; m.restart = null;
      p.pos.set(st.x - s * (this.gate > 0 ? -1.5 : 0), 0, st.z + (this.gate > 0 ? 1.3 : 0));
      p.facing = s > 0 ? Math.PI / 2 : -Math.PI / 2; p.fwd.set(s, 0, 0);
      ball.owner = null; ball.pos.set(p.pos.x + s * 0.45, BALL_R, p.pos.z); ball.vel.set(0, 0, 0);
      m.gainBall(p, false, true);
      if (this.attempt === 1) m.hooks.hint('Through every gate in order, then score');
    }
    this.hud();
  }

  resolve(label, pts) {
    if (this.state !== 'flight' && this.state !== 'ready') return;
    this.state = 'between'; this.wait = 1.3;
    this.score += pts;
    if (pts >= 100) this.goals++;
    this.hooks.event(pts > 0 ? `${label} +${pts}` : label);
    this.m.hooks.hint('');
    this.hud();
  }

  // the match only reports goals and outs while an attempt is live
  live() { return this.state === 'ready' || this.state === 'flight'; }

  // ---- called by the match
  onGoal() {
    const b = this.m.ball.pos;
    if (this.kind === 'cones') {
      if (this.gate < this.course.gates.length) { this.hooks.event('GATES FIRST!'); this.state = 'between'; this.wait = 1; this.reset = true; return; }
      this.m.sound.cheer();
      return this.finish();
    }
    const pts = shotPoints({ goal: true, y: b.y, z: b.z });
    this.m.sound.cheer();
    this.resolve(pts > 100 ? 'TOP BINS!' : 'GOAL!', pts);
  }

  onOut() {
    if (this.kind === 'cones') { this.state = 'between'; this.wait = 0.6; this.reset = true; return; }
    this.resolve(this.saved ? 'SAVED' : 'MISSED', this.saved ? 10 : 0);
  }

  update(dt) {
    if (this.done) return;
    const m = this.m, ball = m.ball, p = this.taker;
    if (this.kind === 'cones') {
      if (this.state !== 'between') this.t += dt; // the clock runs while you dribble
      this.conesUpdate();
    } else if (this.kind === 'shooting') this.t += dt;
    this.stateT += dt;
    if (this.state === 'between') {
      this.wait -= dt;
      if (this.wait <= 0) {
        if (this.kind === 'cones') { if (this.reset) { this.reset = false; this.attempt = 0; } this.state = 'ready'; this.next(); }
        else this.next();
      }
      this.hud();
      return;
    }
    if (this.kind === 'cones') {
      // keeper gathers your finish: go again from the last gate (the clock keeps running)
      if (ball.owner === m.away.gk) { this.hooks.event('SAVED · AGAIN!'); this.state = 'between'; this.wait = 0.8; this.reset = true; }
      this.hud();
      return;
    }
    // a shot is away: watch how it ends
    const lk = m.lastKick;
    if (this.state === 'ready' && lk.kind === 'shot' && lk.by === p && m.kickId > this.kick0) { this.state = 'flight'; this.stateT = 0; }
    if (this.state === 'ready') {
      if (this.kind === 'shooting' && this.t >= this.def.time) return this.finish();
      // the set piece was played short instead of shot
      if (this.kind !== 'shooting' && !m.restart && this.stateT > 3) this.resolve('NO SHOT', 0);
      if (this.kind === 'shooting' && this.stateT > 7) this.resolve('TOO SLOW', 0);
      this.hud();
      return;
    }
    if (lk.kind === 'save') this.saved = true;
    const gk = m.away.gk;
    if (ball.owner === gk || (this.saved && this.stateT > 1.2) || (lk.kind === 'block' && this.stateT > 1)) this.resolve(this.saved || ball.owner === gk ? 'SAVED' : 'BLOCKED', this.saved || ball.owner === gk ? 10 : 0);
    else if (this.stateT > 4) this.resolve('MISSED', 0);
    this.hud();
  }

  finish() {
    if (this.done) return;
    this.done = true; this.state = 'done';
    this.m.hooks.hint('');
    const score = this.kind === 'cones' ? Math.round(this.t * 10) / 10 : this.score;
    this.hooks.drillEnd({ kind: this.kind, score, text: fmtScore(this.kind, score), goals: this.goals, attempts: this.attempt });
  }

  // ---- dribbling cones
  buildCones() {
    const m = this.m;
    this.course = coneCourse(m.home.dir);
    this.gate = 0;
    const geo = new THREE.ConeGeometry(0.22, 0.55, 14);
    this.coneMats = this.course.gates.map(() => new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
    this.course.gates.forEach((g, i) => {
      for (const c of [g.a, g.b]) {
        const mesh = new THREE.Mesh(geo, this.coneMats[i]);
        mesh.position.set(c.x, 0.275, c.z);
        mesh.castShadow = true;
        m.scene.add(mesh); m.objects.push(mesh);
      }
    });
    this.prev = null;
    this.paintCones();
  }

  paintCones() {
    this.coneMats.forEach((mat, i) => mat.color.setHex(i < this.gate ? 0x19c37d : i === this.gate ? 0x45e0ff : 0xff7a1a));
  }

  conesUpdate() {
    const m = this.m, p = this.taker, ball = m.ball;
    const cur = { x: p.pos.x, z: p.pos.z };
    if (this.prev && this.gate < this.course.gates.length && this.state !== 'between') {
      const withBall = ball.owner === p || Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z) < 1.6;
      if (withBall && crossedGate(this.prev, cur, this.course.gates[this.gate])) {
        this.gate++;
        this.paintCones();
        m.sound.kick(0.2);
        this.hooks.event(this.gate === this.course.gates.length ? 'ALL GATES · SCORE!' : `GATE ${this.gate}`);
      }
    }
    this.prev = cur;
  }
}
