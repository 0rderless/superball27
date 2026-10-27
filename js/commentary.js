// Match commentary from recorded clips (assets/voice, made with tools/gen-voice.py): a lead
// commentator and a co-commentator who reacts after the big moments. Lines are stitched from
// phrase, name and score clips (see js/commentary-lines.js) and played through Web Audio.
import { LEAD, CO, CO_CHANCE, MAX_SCORE } from './commentary-lines.js';

const BASE = 'assets/voice/';

export class Commentary {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.manifest = null;
    this.buffers = new Map(); // file -> Promise<AudioBuffer>
    this.queue = [];
    this.speaking = false;
    this.curPriority = 0;
    this.recent = {};
    this.lastSaid = 0;
    this.gen = 0;
    fetch(BASE + 'manifest.json').then(r => r.json()).then(m => { this.manifest = m; }).catch(() => {});
  }

  // browsers (iOS especially) only start audio from a tap: call from a tap handler
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC({ sampleRate: 24000 }); } catch (_) { this.ctx = new AC(); }
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    try { const s = this.ctx.createBufferSource(); s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate); s.connect(this.out); s.start(); } catch (_) { /* ignore */ }
  }

  // warm the cache with this match's clips (phrases + both teams' names) so they play instantly
  prefetch(names = []) {
    if (!this.manifest) return;
    const files = Object.entries(this.manifest).filter(([k]) => !k.startsWith('name') || names.some(n => k.endsWith('|' + n))).map(([, f]) => f);
    let i = 0;
    const next = () => { if (i < files.length) fetch(BASE + files[i++]).catch(() => {}).finally(next); };
    for (let k = 0; k < 4; k++) next();
  }

  buffer(file) {
    let p = this.buffers.get(file);
    if (!p) {
      p = fetch(BASE + file).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => this.ctx.decodeAudioData(b, ok, no)));
      p.catch(() => this.buffers.delete(file));
      this.buffers.set(file, p);
    }
    return p;
  }

  // a line's parts -> clip files (null when a clip is missing, e.g. a name made in the editor)
  resolve(parts, voice, vars) {
    const m = this.manifest;
    return parts.map(part => {
      if (part.startsWith('@n') || part.startsWith('@k')) {
        const name = part.startsWith('@n') ? vars.n : vars.k;
        return name ? m[`name${part.endsWith('!') ? '!' : ''}|${name}`] || null : null;
      }
      if (part === '@sc') {
        const h = Math.min(vars.h ?? 0, MAX_SCORE), a = Math.min(vars.a ?? 0, MAX_SCORE);
        return m[`score|${h}-${a}`] || null;
      }
      return m[`${voice}|${part.replace('{t}', vars.t || '')}`] || null;
    });
  }

  // pick a variant whose clips all exist (no half sentences) without repeating the last couple
  pick(table, key, voice, vars) {
    const opts = table[key];
    if (!opts) return null;
    const resolved = opts.map(o => this.resolve(o, voice, vars));
    const idx = resolved.map((r, i) => i).filter(i => resolved[i].every(Boolean));
    if (!idx.length) return null;
    const used = this.recent[voice + key] || (this.recent[voice + key] = []);
    const fresh = idx.filter(i => !used.includes(i));
    const i = (fresh.length ? fresh : idx)[(Math.random() * (fresh.length || idx.length)) | 0];
    used.push(i); if (used.length > Math.min(2, opts.length - 1)) used.shift();
    return resolved[i];
  }

  // priority: 1 = colour, 2 = notable, 3 = must say (goals, results)
  say(key, vars = {}, priority = 1) {
    if (!this.enabled || !this.ctx || !this.manifest) return;
    const now = performance.now();
    if (this.speaking && priority <= this.curPriority) return;
    if (priority === 1 && now - this.lastSaid < 2500) return; // don't chatter over the game
    const files = this.pick(LEAD, key, 'lead', vars);
    if (!files || !files.length) return;
    if (priority >= 2 || this.speaking) this.stop();
    files.forEach((f, i) => this.queue.push({ f, gap: i ? 40 : 0 }));
    if (key === 'goalHome' || key === 'goalAway' || key === 'ownGoal') {
      const sc = this.pick(LEAD, 'score', 'lead', vars);
      if (sc) sc.forEach(f => this.queue.push({ f, gap: 350 }));
    }
    if (Math.random() < (CO_CHANCE[key] || 0)) {
      const co = this.pick(CO, key === 'ownGoal' ? 'goalAway' : key, 'co', vars);
      if (co) co.forEach(f => this.queue.push({ f, gap: 650 }));
    }
    this.curPriority = priority;
    this.lastSaid = now;
    if (!this.speaking) this.next();
  }

  next() {
    const item = this.queue.shift();
    if (!item) { this.speaking = false; this.curPriority = 0; return; }
    this.speaking = true;
    const gen = this.gen;
    const fetched = this.buffer(item.f);
    setTimeout(() => {
      fetched.then(buf => {
        if (gen !== this.gen) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.out);
        src.onended = () => { if (gen === this.gen) this.next(); };
        this.src = src;
        src.start();
      }).catch(() => { if (gen === this.gen) this.next(); });
    }, item.gap);
  }

  stop() {
    this.gen++; // callbacks from cancelled lines are ignored
    this.queue.length = 0;
    if (this.src) { try { this.src.stop(); } catch (_) { /* already stopped */ } this.src = null; }
    this.speaking = false;
    this.curPriority = 0;
  }
}
