import * as THREE from '../lib/three.module.min.js';
import { BALL_R, GRAVITY } from './config.js';

export const BALL_VIS_R = BALL_R * 1.5; // drawn a bit larger so it reads on a phone screen

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f7f7';
  g.fillRect(0, 0, 512, 256);
  // icosahedron vertices in lat/long → classic panels
  const pts = [[90, 0], [-90, 0]];
  for (let i = 0; i < 5; i++) {
    pts.push([26.57, i * 72]);
    pts.push([-26.57, i * 72 + 36]);
  }
  for (const [lat, lon] of pts) {
    const y = (90 - lat) / 180 * 256;
    const stretch = 1 / Math.max(0.25, Math.cos(lat * Math.PI / 180));
    for (const off of [-512, 0, 512]) {
      const x = lon / 360 * 512 + off;
      g.save();
      g.translate(x, y);
      g.scale(stretch, 1);
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * 26, py = Math.sin(a) * 26;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = '#121a33';
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = '#2f6bff';
      g.stroke();
      g.restore();
    }
  }
  // pole caps
  g.fillStyle = '#121a33';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 246, 512, 10);
  // seams
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    g.beginPath(); g.moveTo(i * 51.2 + 25, 0); g.lineTo(i * 51.2 + 25, 256); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Ball {
  constructor(scene, shadows) {
    this.pos = new THREE.Vector3(0, BALL_R, 0);
    this.vel = new THREE.Vector3();
    this.spin = 0;         // side spin (rad/s about y) → curl
    this.owner = null;
    this.held = false;     // in a goalkeeper's / thrower's hands
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_VIS_R, 28, 18),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.38, metalness: 0.0, emissive: 0x222222 })
    );
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d');
    const grd = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grd;
    sg.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    this.shadow.visible = !shadows;
    scene.add(this.shadow);
    this._axis = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._last = this.pos.clone();
    this.onBounce = null;
  }

  get speed() { return this.vel.length(); }

  // Free-flight physics step.
  step(dt) {
    const v = this.vel, p = this.pos;
    const onGround = p.y <= BALL_R + 0.005 && Math.abs(v.y) < 0.6;
    if (!onGround) {
      v.y -= GRAVITY * dt;
      const sp = v.length();
      const drag = 0.0075 * sp * dt;
      v.multiplyScalar(Math.max(0, 1 - drag));
      // magnus curl: lateral acceleration perpendicular to horizontal velocity
      if (this.spin !== 0) {
        const hx = v.x, hz = v.z;
        const k = this.spin * 0.045 * dt;
        v.x += -hz * k;
        v.z += hx * k;
      }
      this.spin *= Math.max(0, 1 - 0.6 * dt);
    } else {
      v.y = 0;
      p.y = BALL_R;
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const dec = (0.32 * sp + 0.9) * dt;
        const ns = Math.max(0, sp - dec);
        v.x *= ns / sp; v.z *= ns / sp;
      }
      this.spin *= Math.max(0, 1 - 3 * dt);
    }
    p.addScaledVector(v, dt);
    if (p.y < BALL_R) {
      p.y = BALL_R;
      if (v.y < -1.0) {
        const impact = -v.y;
        v.y = impact * 0.58;
        v.x *= 0.86; v.z *= 0.86;
        if (this.onBounce) this.onBounce(impact);
      } else v.y = 0;
    }
  }

  // Predict free-flight positions (ignores players). Fills out[] with Vector3s every stepDt.
  predict(out, steps, stepDt) {
    const p = this.pos.clone(), v = this.vel.clone();
    let spin = this.spin;
    for (let i = 0; i < steps; i++) {
      const sub = 2, dt = stepDt / sub;
      for (let k = 0; k < sub; k++) {
        const onGround = p.y <= BALL_R + 0.005 && Math.abs(v.y) < 0.6;
        if (!onGround) {
          v.y -= GRAVITY * dt;
          v.multiplyScalar(Math.max(0, 1 - 0.0075 * v.length() * dt));
          if (spin) { const kk = spin * 0.045 * dt; const hx = v.x; v.x += -v.z * kk; v.z += hx * kk; }
          spin *= 1 - 0.6 * dt;
        } else {
          v.y = 0; p.y = BALL_R;
          const sp = Math.hypot(v.x, v.z);
          if (sp > 0) { const ns = Math.max(0, sp - (0.32 * sp + 0.9) * dt); v.x *= ns / sp; v.z *= ns / sp; }
        }
        p.addScaledVector(v, dt);
        if (p.y < BALL_R) { p.y = BALL_R; if (v.y < -1) { v.y *= -0.58; v.x *= 0.86; v.z *= 0.86; } else v.y = 0; }
      }
      out[i].copy(p);
    }
  }

  sync(dt) {
    const p = this.pos;
    this.mesh.position.set(p.x, p.y + (BALL_VIS_R - BALL_R), p.z);
    const dx = p.x - this._last.x, dz = p.z - this._last.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-5 && !this.held) {
      this._axis.set(dz, 0, -dx).normalize();
      this._q.setFromAxisAngle(this._axis, d / BALL_VIS_R);
      this.mesh.quaternion.premultiply(this._q);
    }
    if (this.spin && !this.held && p.y > BALL_R + 0.05) {
      this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.spin * dt * 0.5);
      this.mesh.quaternion.premultiply(this._q);
    }
    this._last.copy(p);
    const h = Math.max(0, p.y - BALL_R);
    const s = BALL_VIS_R * 2.6 * (1 + h * 0.15);
    this.shadow.scale.set(s, s, 1);
    this.shadow.position.set(p.x + h * 0.25, 0.02, p.z - h * 0.15);
    this.shadow.material.opacity = Math.max(0.15, 1 - h * 0.12);
  }
}
