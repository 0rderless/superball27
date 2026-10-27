import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.min.js';
import { airStep } from '../js/ball.js';
import { aimCurl, fly } from '../js/setpiece.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('aimCurl: a curled shot launched with the solved velocity arrives on target', () => {
  for (const [from, target, spin] of [[V(30, 0.11, 6), V(52.5, 2.0, -2.8), 7], [V(25, 0.11, -10), V(52.5, 1.5, 3), -7], [V(-28, 0.11, 0), V(-52.5, 2.2, 2.5), 6]]) {
    const vel = aimCurl({ from, target, vh: 21, spin });
    const at = fly(from, vel, spin, target.x);
    assert.ok(Math.abs(at.z - target.z) < 0.12 && Math.abs(at.y - target.y) < 0.12, JSON.stringify({ at, target }));
  }
});

test('aimCurl: the ball really bends (it does not just fly straight at the target)', () => {
  const from = V(30, 0.11, 0), target = V(52.5, 1.8, 2.8), spin = -7;
  const vel = aimCurl({ from, target, vh: 21, spin });
  const straight = Math.atan2(target.z - from.z, target.x - from.x), launched = Math.atan2(vel.z, vel.x);
  assert.ok(Math.abs(launched - straight) > 0.04);
});

test('fly uses the same physics as the ball (airStep)', () => {
  const from = V(0, 0.11, 0), vel = V(20, 6, 1), spin = 5, p = from.clone(), v = vel.clone();
  let s = spin; const dt = 1 / 240;
  while (p.x < 15) { s = airStep(v, s, dt); p.addScaledVector(v, dt); }
  const at = fly(from, vel, spin, 15);
  assert.ok(Math.abs(at.z - p.z) < 0.05 && Math.abs(at.y - p.y) < 0.05);
});
