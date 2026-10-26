// Touch (floating joystick + action buttons) and keyboard input.
const BTN = ['pass', 'shoot', 'through', 'sprint', 'skill'];

export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };
    this.mag = 0;
    this.b = {};
    // fire: the action triggers (tap on release, or the moment you flick up); fireType 'tap' | 'up'
    for (const k of BTN) this.b[k] = { down: false, pressed: false, released: false, held: 0, fire: false, fireType: 'tap', flick: false, fired: false, sx: 0, sy: 0 };
    this.keys = new Set();
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchMode = false;
    this.enabled = false;

    this.base = document.getElementById('joy-base');
    this.knob = document.getElementById('joy-knob');
    this.zone = document.getElementById('joy-zone');

    const zone = this.zone;
    zone.addEventListener('pointerdown', e => {
      if (this.joy.id !== null) return;
      e.preventDefault();
      this.touchMode = true;
      zone.setPointerCapture(e.pointerId);
      this.joy.id = e.pointerId;
      this.joy.ox = e.clientX; this.joy.oy = e.clientY;
      this.joy.x = e.clientX; this.joy.y = e.clientY;
      this.base.style.left = e.clientX + 'px';
      this.base.style.top = e.clientY + 'px';
      this.base.classList.add('active');
      this._updateKnob();
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== this.joy.id) return;
      e.preventDefault();
      this.joy.x = e.clientX; this.joy.y = e.clientY;
      // drag the base along if the thumb wanders far (keeps the stick responsive)
      const R = this.radius();
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > R * 1.6) {
        const k = (d - R * 1.6) / d;
        this.joy.ox += dx * k; this.joy.oy += dy * k;
        this.base.style.left = this.joy.ox + 'px';
        this.base.style.top = this.joy.oy + 'px';
      }
      this._updateKnob();
    });
    const end = e => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = null;
      this.base.classList.remove('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);

    document.querySelectorAll('[data-btn]').forEach(el => {
      const k = el.dataset.btn;
      const st = this.b[k];
      const ids = new Set();
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.touchMode = true;
        el.setPointerCapture(e.pointerId);
        ids.add(e.pointerId);
        if (!st.down) { st.down = true; st.pressed = true; st.held = 0; st.flick = false; st.fired = false; st.sx = e.clientX; st.sy = e.clientY; }
        el.classList.add('down');
        if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) { /* ignore */ }
      });
      el.addEventListener('pointermove', e => {
        if (!ids.has(e.pointerId) || !st.down || st.flick) return;
        const dx = e.clientX - st.sx, dy = e.clientY - st.sy;
        if (dy < -22 && -dy > Math.abs(dx) * 0.8) {
          // flick up: high pass / lob through / chip shot
          st.flick = true;
          el.classList.add('flicked');
          setTimeout(() => el.classList.remove('flicked'), 350);
          if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) { /* ignore */ }
          if (k === 'pass' || k === 'through') { st.fire = true; st.fireType = 'up'; st.fired = true; }
        }
      });
      const up = e => {
        if (!ids.has(e.pointerId)) return;
        ids.delete(e.pointerId);
        if (ids.size === 0 && st.down) {
          st.down = false; st.released = true; el.classList.remove('down');
          if (!st.fired) { st.fire = true; st.fireType = st.flick ? 'up' : 'tap'; st.fired = true; }
        }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    });

    // U = high pass, Y = lofted through ball, O = chip shot (hold for power)
    const map = {
      Space: 'pass', KeyJ: 'pass', KeyU: 'pass', KeyK: 'shoot', KeyO: 'shoot', KeyL: 'through', KeyY: 'through',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyI: 'skill', KeyE: 'skill',
    };
    const highKeys = new Set(['KeyU', 'KeyO', 'KeyY']);
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const k = map[e.code];
      if (k) {
        e.preventDefault();
        const st = this.b[k];
        if (!st.down) {
          st.down = true; st.pressed = true; st.held = 0;
          st.flick = highKeys.has(e.code);
          st.fire = true; st.fireType = st.flick ? 'up' : 'tap'; st.fired = true;
        }
      }
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      const k = map[e.code];
      if (k) { const st = this.b[k]; if (st.down) { st.down = false; st.released = true; } }
    });
    window.addEventListener('blur', () => this.reset());
  }

  radius() { return Math.min(70, Math.max(46, window.innerHeight * 0.11)); }

  _updateKnob() {
    const R = this.radius();
    let dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  reset() {
    for (const k of BTN) Object.assign(this.b[k], { down: false, pressed: false, released: false, held: 0, fire: false, flick: false, fired: false });
    this.keys.clear();
    this.joy.id = null;
    this.base.classList.remove('active');
    document.querySelectorAll('[data-btn]').forEach(el => el.classList.remove('down'));
  }

  update(dt) {
    let x = 0, y = 0;
    if (this.joy.id !== null) {
      const R = this.radius();
      x = (this.joy.x - this.joy.ox) / R;
      y = -(this.joy.y - this.joy.oy) / R;
    } else {
      const K = this.keys;
      if (K.has('KeyA') || K.has('ArrowLeft')) x -= 1;
      if (K.has('KeyD') || K.has('ArrowRight')) x += 1;
      if (K.has('KeyW') || K.has('ArrowUp')) y += 1;
      if (K.has('KeyS') || K.has('ArrowDown')) y -= 1;
    }
    let m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; m = 1; }
    const dead = 0.12;
    if (m < dead) { x = 0; y = 0; m = 0; }
    this.move.x = x; this.move.y = y; this.mag = m;
    for (const k of BTN) if (this.b[k].down) this.b[k].held += dt;
  }

  endFrame() {
    for (const k of BTN) { this.b[k].pressed = false; this.b[k].released = false; this.b[k].fire = false; }
  }
}
