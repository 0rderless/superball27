// Set-piece maths: launching a curled free kick so it bends onto the spot the taker picked.
import * as THREE from '../lib/three.module.min.js';
import { airStep } from './ball.js';

const DT = 1 / 240;

// where a ball launched from `from` with `vel` and side `spin` is when it reaches x = lineX
// (or, if it never gets there, where it lands)
export function fly(from, vel, spin, lineX) {
  const p = from.clone(), v = vel.clone(), sx = Math.sign(lineX - from.x);
  let s = spin, t = 0;
  while ((lineX - p.x) * sx > 0 && t < 4) {
    const px = p.x, py = p.y, pz = p.z;
    s = airStep(v, s, DT);
    p.addScaledVector(v, DT);
    t += DT;
    if ((lineX - p.x) * sx <= 0) {
      const f = (lineX - px) / (p.x - px);
      return new THREE.Vector3(lineX, py + (p.y - py) * f, pz + (p.z - pz) * f);
    }
    if (p.y < 0) break;
  }
  return p;
}

// launch velocity (horizontal speed vh) whose curling flight passes through target
export function aimCurl({ from, target, vh, spin }) {
  let yaw = Math.atan2(target.z - from.z, target.x - from.x);
  const dh = Math.hypot(target.x - from.x, target.z - from.z);
  let vy = (target.y - from.y) / (dh / vh) + 4.9 * dh / vh;
  const vel = new THREE.Vector3();
  for (let i = 0; i < 12; i++) {
    vel.set(Math.cos(yaw) * vh, vy, Math.sin(yaw) * vh);
    const at = fly(from, vel, spin, target.x);
    const ez = target.z - at.z, ey = target.y - at.y;
    if (Math.abs(ez) < 0.02 && Math.abs(ey) < 0.02) break;
    // turn by the angle the miss subtends, and lift by the height missed over the flight time
    yaw += Math.atan2(ez, dh) * Math.sign(target.x - from.x);
    vy += ey / (dh / vh);
  }
  return vel;
}
