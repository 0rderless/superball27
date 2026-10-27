// Penalty shootout after a drawn cup tie: takers alternate (ZorpFC first), you take ours (aim, hold
// and release SHOOT), their keeper guesses; your keeper guesses for theirs. Best of five, then sudden death.
import * as THREE from '../lib/three.module.min.js';
import { F, BALL_R } from './config.js';
import { shootoutWinner } from './cup.js';

export class Shootout {
  constructor(match, hooks) {
    this.m = match; this.hooks = hooks; this.kind = 'shootout';
    this.kicks = { home: [], away: [] };
    this.order = {};
    for (const t of [match.home, match.away]) this.order[t.key] = t.players.filter(p => !p.isGK).sort((a, b) => b.st.sho - a.st.sho);
    this.turn = 'home'; this.state = 'idle'; this.done = false; this.stateT = 0;
    match.drill = this;
    match.phase = 'play';
    match.hooks.banner('PENALTIES', 'Sudden death after five each', 2400);
    this.wait = 2.4; this.state = 'between';
    this.hud();
  }

  live() { return this.state === 'ready' || this.state === 'flight'; }
  team() { return this.m[this.turn]; }

  hud() {
    const dots = k => this.kicks[k].map(x => (x ? '●' : '○')).join('');
    const sh = this.kicks.home.filter(Boolean).length, sa = this.kicks.away.filter(Boolean).length;
    this.hooks.drillHud({ title: 'Penalties', score: `${sh} - ${sa}`, info: `ZFC ${dots('home') || '–'}  ·  ${this.m.away.cfg.short} ${dots('away') || '–'}` });
  }

  next() {
    const m = this.m, team = this.team(), list = this.order[this.turn];
    const taker = list[this.kicks[this.turn].length % list.length];
    this.state = 'ready'; this.stateT = 0; this.kick0 = m.kickId; this.saved = false;
    m.adv = null; m.offside = null;
    m.phase = 'play';
    m.startRestart('penalty', team, new THREE.Vector3(team.attackX - team.dir * F.PEN, BALL_R, 0), { taker });
    this.hud();
  }

  record(scored) {
    if (!this.live()) return;
    this.kicks[this.turn].push(scored);
    this.hooks.event(scored ? 'SCORED!' : 'MISSED!');
    if (scored) this.m.sound.cheer(); else this.m.sound.ooh();
    this.state = 'between'; this.wait = 1.6;
    this.hud();
    const w = shootoutWinner(this.kicks.home, this.kicks.away);
    if (w) { this.winner = w; this.wait = 1.8; this.ending = true; return; }
    this.turn = this.turn === 'home' ? 'away' : 'home';
  }

  onGoal() { this.record(true); }
  onOut() { this.record(false); }

  update(dt) {
    if (this.done) return;
    const m = this.m, ball = m.ball;
    this.stateT += dt;
    // nobody but the taker and the keeper moves, and there are no rebounds
    const r = m.restart, gk = this.team().opp.gk;
    for (const p of m.players) {
      if (p === gk || (r && p === r.taker) || p.pending) continue;
      if (!r) { p.vel.set(0, 0, 0); p.desired.set(0, 0, 0); p.cool = Math.max(p.cool, 0.5); }
    }
    if (this.state === 'between') {
      this.wait -= dt;
      if (this.wait <= 0) {
        if (this.ending) return this.finish();
        this.next();
      }
      return;
    }
    const lk = m.lastKick;
    if (this.state === 'ready' && lk.kind === 'shot' && m.kickId > this.kick0) { this.state = 'flight'; this.stateT = 0; }
    if (this.state !== 'flight') return;
    if (lk.kind === 'save') this.saved = true;
    if (ball.owner === gk || (this.saved && this.stateT > 1.0) || this.stateT > 3) this.record(false);
  }

  finish() {
    this.done = true; this.state = 'done';
    const sh = this.kicks.home.filter(Boolean).length, sa = this.kicks.away.filter(Boolean).length;
    this.m.drill = null;
    this.m.endShootout({ home: sh, away: sa, winner: this.winner });
  }
}
