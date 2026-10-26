// Synthesised stadium audio (no asset downloads): crowd bed, kicks, whistle, cheers.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.excite = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    // brown-ish noise buffer
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5 + w * 0.08;
    }
    this.noise = buf;
    const white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const wd = white.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this.white = white;

    // crowd bed
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.22;
    src.connect(bp).connect(this.crowdGain).connect(this.master);
    src.start();
    this.crowdFilter = bp;

    // second layer for murmur variation
    const src2 = ctx.createBufferSource();
    src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 1.37;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass'; bp2.frequency.value = 1300; bp2.Q.value = 1.2;
    this.murmur = ctx.createGain();
    this.murmur.gain.value = 0.06;
    src2.connect(bp2).connect(this.murmur).connect(this.master);
    src2.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // excitement 0..1 driven by how close the ball is to goal
  update(excite) {
    if (!this.ctx) return;
    this.excite += (excite - this.excite) * 0.02;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.16 + this.excite * 0.22, t, 0.3);
    this.crowdFilter.frequency.setTargetAtTime(560 + this.excite * 400, t, 0.3);
  }

  kick(power = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140 + power * 60, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 + power * 0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.18);
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800 + power * 1500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18 + power * 0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f).connect(ng).connect(this.master);
    n.start(t, Math.random() * 0.5, 0.06);
  }

  thud(v = 0.3) { this.kick(Math.min(0.4, v * 0.1)); }

  post() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const fr of [880, 1320, 2210]) {
      const o = ctx.createOscillator();
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.85);
    }
    this.ooh();
  }

  whistle(times = 1, long = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let i = 0; i < times; i++) {
      const t = ctx.currentTime + i * 0.42;
      const dur = long && i === times - 1 ? 0.9 : 0.3;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 2650;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const lg = ctx.createGain();
      lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2700; f.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + dur - 0.04);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f).connect(g).connect(this.master);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
    }
  }

  swell(peak, dur, freq = 900) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.25);
    g.gain.setValueAtTime(peak, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.1);
  }

  ooh() { this.swell(0.45, 1.8, 520); }
  cheer() { this.swell(0.9, 5.5, 900); this.swell(0.5, 6, 1600); this.horn(); }
  applause() { this.swell(0.35, 2.5, 2200); }
  groan() { this.swell(0.35, 2.2, 380); }

  // stadium air horn
  horn() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.15;
    for (const fr of [233, 294, 349]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(fr, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.05);
      g.gain.setValueAtTime(0.05, t + 1.1);
      g.gain.linearRampToValueAtTime(0, t + 1.4);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1800;
      o.connect(f).connect(g).connect(this.master);
      o.start(t); o.stop(t + 1.45);
    }
  }

  // ball hitting the net
  net() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, 0, 0.4);
  }

  // rhythmic crowd chant: clap clap ... clap clap clap "Zorp-F-C!"
  chant() {
    if (!this.ctx || this._chanting) return;
    this._chanting = true;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const beats = [0, 0.32, 0.96, 1.12, 1.28, 1.92, 2.24, 2.88, 3.04, 3.2];
    for (let r = 0; r < 2; r++) {
      for (const b of beats) {
        const t = t0 + r * 3.84 + b;
        const n = ctx.createBufferSource();
        n.buffer = this.white;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        n.connect(f).connect(g).connect(this.master);
        n.start(t, Math.random() * 0.5, 0.15);
      }
      // sung "Zorp - F - C" as three voiced vowels
      [[1.92, 196, 0.28], [2.24, 196, 0.28], [2.56, 247, 0.5]].forEach(([b, fr, d]) => {
        const t = t0 + r * 3.84 + b;
        for (const det of [-6, 0, 5, 11]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = fr * Math.pow(2, det / 1200);
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.5;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.035, t + 0.04);
          g.gain.setValueAtTime(0.035, t + d - 0.05);
          g.gain.linearRampToValueAtTime(0, t + d);
          o.connect(f).connect(g).connect(this.master);
          o.start(t); o.stop(t + d + 0.02);
        }
      });
    }
    setTimeout(() => { this._chanting = false; }, 8500);
  }
}
