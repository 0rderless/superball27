import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import * as SkeletonUtils from '../lib/SkeletonUtils.js';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';

// Footballers built on Quaternius' CC0 Universal Animation Library mannequin (assets/player.glb):
// motion-captured locomotion + one-shot clips, with football moves (kicks, dives, holds) layered on
// procedurally. Kits, skin, hair and faces are painted in the shader from each vertex's body region,
// so every player is a single skinned draw call.

export const SKINS = ['#f2cdb0', '#e1ae8a', '#c78b63', '#a56a43', '#7a4a2b', '#55331f'];
export const HAIRS = ['#15100c', '#3a2616', '#6a4324', '#b5834a', '#e0be78', '#0a0a0a'];

// body regions (aRegion attribute)
const R = { SKIN: 0, HEAD: 1, SHIRT: 2, ARM: 3, HAND: 4, SHORTS: 5, LEG: 6, SOCKTOP: 7, SOCK: 8, BOOT: 9 };

let A = null; // loaded assets

export async function loadPlayerAssets(url = 'assets/player.glb', onProgress) {
  if (A) return A;
  const gltf = await new GLTFLoader().loadAsync(url, e => { if (onProgress && e.total) onProgress(e.loaded / e.total); });
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const base = meshes[0];
  const bones = {};
  base.skeleton.bones.forEach(b => { bones[b.name] = b; });
  const bp = n => bones[n].getWorldPosition(new THREE.Vector3());

  // merge the body + joint primitives into one geometry (both use the same skeleton)
  const geos = meshes.map(m => {
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(k, m.geometry.attributes[k]);
    g.setIndex(m.geometry.index);
    return g;
  });
  const geo = mergeGeometries(geos, false);

  // classify every vertex by its dominant bone (and how far along that bone it sits)
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const n = pos.count;
  const region = new Float32Array(n), bind = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const along = (p, a, b) => { const ab = bp(b).sub(bp(a)); return p.clone().sub(bp(a)).dot(ab) / ab.lengthSq(); };
  const names = base.skeleton.bones.map(b => b.name);
  const pelvisY = bp('pelvis').y;
  const stats = { headMaxZ: -1, headTop: 0, backZ: 1, chestZ: -1 };
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    v.fromBufferAttribute(pos, i).applyMatrix4(base.matrixWorld);
    bind[i * 3] = v.x; bind[i * 3 + 1] = v.y; bind[i * 3 + 2] = v.z;
    const nm = names[best];
    const side = nm.endsWith('_l') ? 'l' : 'r';
    let r;
    if (nm === 'Head') r = R.HEAD;
    else if (nm === 'neck_01') r = R.SKIN;
    else if (/^spine|^clavicle/.test(nm)) r = R.SHIRT;
    else if (nm === 'pelvis' || nm === 'root') r = v.y > pelvisY + 0.08 ? R.SHIRT : R.SHORTS;
    else if (/^upperarm/.test(nm)) r = along(v, 'upperarm_' + side, 'lowerarm_' + side) < 0.5 ? R.SHIRT : R.ARM;
    else if (/^lowerarm/.test(nm)) r = R.ARM;
    else if (/^(hand|index|middle|pinky|ring|thumb)/.test(nm)) r = R.HAND;
    else if (/^thigh/.test(nm)) r = along(v, 'thigh_' + side, 'calf_' + side) < 0.42 ? R.SHORTS : R.LEG;
    else if (/^calf/.test(nm)) { const t = along(v, 'calf_' + side, 'foot_' + side); r = t < 0.1 ? R.LEG : t < 0.2 ? R.SOCKTOP : R.SOCK; }
    else if (/^(foot|ball)/.test(nm)) r = R.BOOT;
    else r = R.SKIN;
    region[i] = r;
    if (r === R.HEAD) { stats.headMaxZ = Math.max(stats.headMaxZ, v.z); stats.headTop = Math.max(stats.headTop, v.y); }
    if (r === R.SHIRT && Math.abs(v.y - (pelvisY + 0.32)) < 0.05 && Math.abs(v.x) < 0.06) { stats.backZ = Math.min(stats.backZ, v.z); stats.chestZ = Math.max(stats.chestZ, v.z); }
  }
  geo.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
  geo.setAttribute('aBind', new THREE.BufferAttribute(bind, 3));
  geo.computeBoundingSphere();

  const skinned = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  skinned.name = 'Footballer';
  skinned.bind(base.skeleton, base.bindMatrix);
  base.parent.add(skinned);
  for (const m of meshes) m.parent.remove(m);

  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  const headY = bp('Head').y;
  A = {
    scene, clips, stats,
    face: { eyeX: 0.034, eyeY: headY + (stats.headTop - headY) * 0.47, frontZ: stats.headMaxZ },
    hairY: headY + (stats.headTop - headY) * 0.78,
    numY: pelvisY + 0.33,
    pelvisY,
  };
  A.poses = {
    hold: samplePose('Walk_Carry_Loop', 0.2, /^(upperarm|lowerarm|hand|clavicle)/),
    throw: samplePose('OverhandThrow', 0.32, /^(upperarm|lowerarm|hand|clavicle|spine)/),
  };
  return A;
}

// sample a clip at time t into { boneName: quaternion } (optionally only some bones)
function samplePose(clipName, t, filter) {
  const clip = A.clips[clipName];
  if (!clip) return null;
  const tmp = SkeletonUtils.clone(A.scene);
  const mixer = new THREE.AnimationMixer(tmp);
  mixer.clipAction(clip).play();
  mixer.setTime(clip.duration * t);
  const pose = {};
  tmp.traverse(o => { if (o.isBone && (!filter || filter.test(o.name))) pose[o.name] = o.quaternion.clone(); });
  return pose;
}

function restPose(filter) {
  const pose = {};
  A.scene.traverse(o => { if (o.isBone && filter.test(o.name)) pose[o.name] = o.quaternion.clone(); });
  return pose;
}

function numberTexture(num, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 104px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.strokeText(String(num), 64, 70);
  g.fillStyle = color;
  g.fillText(String(num), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT_HEAD = /* glsl */`
attribute float aRegion;
attribute vec3 aBind;
varying float vRegion;
varying vec3 vBind;
`;
const FRAG_HEAD = /* glsl */`
varying float vRegion;
varying vec3 vBind;
uniform vec3 uSkin, uHair, uShirt, uShirt2, uTrim, uShorts, uSocks, uSockTop, uBoots, uGloves, uNumCol;
uniform float uPattern, uLong, uHairY, uBackZ, uChestZ, uNumY, uCollarY;
uniform vec3 uEye;
uniform sampler2D uNumTex;
`;
const FRAG_COLOR = /* glsl */`
vec3 kc = uSkin;
float rg = floor(vRegion + 0.5);
if (rg == 1.0) {
  // head: hair line drops lower at the back, procedural face at the front
  float hy = uHairY - max(0.0, -vBind.z) * 1.3 - max(0.0, abs(vBind.x) - 0.05) * 0.4;
  kc = mix(uSkin, uHair, smoothstep(hy - 0.006, hy + 0.006, vBind.y));
  if (vBind.z > uEye.z - 0.06) {
    vec2 e = vec2(abs(vBind.x) - uEye.x, (vBind.y - uEye.y) * 1.7);
    float eye = 1.0 - smoothstep(0.008, 0.011, length(e));
    kc = mix(kc, vec3(0.97), (1.0 - smoothstep(0.011, 0.014, length(e))) * 0.85);
    kc = mix(kc, vec3(0.05, 0.035, 0.03), eye);
    float brow = (1.0 - smoothstep(0.0025, 0.005, abs(vBind.y - uEye.y - 0.021 + abs(vBind.x) * 0.08))) * (1.0 - smoothstep(0.011, 0.02, abs(abs(vBind.x) - uEye.x)));
    kc = mix(kc, uHair * 0.9, brow);
    float mouth = (1.0 - smoothstep(0.0018, 0.004, abs(vBind.y - uEye.y + 0.058 - vBind.x * vBind.x * 4.0))) * (1.0 - smoothstep(0.012, 0.02, abs(vBind.x)));
    kc = mix(kc, kc * vec3(0.62, 0.42, 0.42), mouth);
    float nose = (1.0 - smoothstep(0.004, 0.012, abs(vBind.x))) * (1.0 - smoothstep(0.0, 0.03, abs(vBind.y - uEye.y + 0.03)));
    kc *= 1.0 - nose * 0.12;
  }
} else if (rg == 2.0) {
  kc = uShirt;
  if (uPattern > 0.5 && uPattern < 1.5) {
    // vertical stripes
    float f = fract(vBind.x * 8.0 + 0.5);
    float s = smoothstep(0.42, 0.46, f) * (1.0 - smoothstep(0.66, 0.7, f));
    kc = mix(uShirt, uShirt2, s);
  } else if (uPattern > 2.5 && uPattern < 3.5) {
    // horizontal hoops
    float f = fract(vBind.y * 6.5);
    kc = mix(uShirt, uShirt2, smoothstep(0.46, 0.5, f) * (1.0 - smoothstep(0.96, 1.0, f)));
  } else if (uPattern > 3.5) {
    // halves: left and right in the two colours
    kc = mix(uShirt, uShirt2, smoothstep(-0.004, 0.004, vBind.x));
  } else if (uPattern > 1.5) {
    // diagonal sash across the front + darker side panels
    float d = vBind.x * 0.85 + (vBind.y - uNumY);
    float sash = (1.0 - smoothstep(0.045, 0.055, abs(d))) * step(0.0, vBind.z);
    kc = mix(kc, uShirt2, smoothstep(0.13, 0.16, abs(vBind.x)) * 0.8);
    kc = mix(kc, uTrim, sash * 0.9);
  }
  kc = mix(kc, uTrim, smoothstep(uCollarY - 0.01, uCollarY, vBind.y));
  // number on the back, small crest on the left chest
  if (vBind.z < uBackZ + 0.05) {
    vec2 uv = vec2(0.5 - vBind.x / 0.24, (vBind.y - uNumY) / 0.24 + 0.5);
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      vec4 nt = texture2D(uNumTex, uv);
      kc = mix(kc, nt.rgb, nt.a);
    }
  }
  if (vBind.z > uChestZ - 0.05) {
    float crest = 1.0 - smoothstep(0.016, 0.02, length(vec2(vBind.x - 0.075, vBind.y - uNumY - 0.1)));
    kc = mix(kc, uTrim, crest);
  }
} else if (rg == 3.0) kc = mix(uSkin, uShirt, uLong);
else if (rg == 4.0) kc = uGloves;
else if (rg == 5.0) kc = uShorts;
else if (rg == 6.0) kc = uSkin;
else if (rg == 7.0) kc = uSockTop;
else if (rg == 8.0) kc = uSocks;
else if (rg == 9.0) kc = uBoots;
vec4 diffuseColor = vec4( kc, opacity );
`;

function kitMaterial(kit, skinHex, hairHex, hairStyle, number) {
  const C = h => new THREE.Color(h);
  const hairOffset = [0.0, 0.03, -0.012, -0.03, -0.02, 0.06][hairStyle % 6]; // 1 = buzz, 5 = shaved
  const u = {
    uSkin: { value: C(skinHex) }, uHair: { value: C(hairHex) },
    uShirt: { value: C(kit.shirt) }, uShirt2: { value: C(kit.shirt2) }, uTrim: { value: C(kit.trim) },
    uShorts: { value: C(kit.shorts) }, uSocks: { value: C(kit.socks) }, uSockTop: { value: C(kit.sockTop) },
    uBoots: { value: C(kit.boots) }, uGloves: { value: C(kit.gloves || skinHex) }, uNumCol: { value: C(kit.number) },
    uPattern: { value: { stripes: 1, sash: 2, hoops: 3, halves: 4 }[kit.pattern] || 0 },
    uLong: { value: kit.longSleeve ? 1 : 0 },
    uHairY: { value: A.hairY + hairOffset },
    uBackZ: { value: A.stats.backZ }, uChestZ: { value: A.stats.chestZ },
    uNumY: { value: A.numY }, uCollarY: { value: A.numY + 0.235 },
    uEye: { value: new THREE.Vector3(A.face.eyeX, A.face.eyeY, A.face.frontZ) },
    uNumTex: { value: numberTexture(number, kit.number) },
  };
  const m = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, envMapIntensity: 0.9 });
  m.userData.u = u;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;\nvBind = aBind;');
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', FRAG_COLOR);
  };
  m.customProgramCacheKey = () => 'footballer-v1';
  return m;
}

// ----------------------------------------------------------------------------------------------
const LOCO = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jog_Bwd_Loop', 'Jog_Left_Loop', 'Jog_Right_Loop', 'Crouch_Idle_Loop'];
// metres travelled per animation cycle, used to keep the feet planted at any speed
const STRIDE = { Walk_Loop: 1.9, Jog_Fwd_Loop: 3.6, Sprint_Loop: 5.4, Jog_Bwd_Loop: 2.6, Jog_Left_Loop: 2.6, Jog_Right_Loop: 2.6 };

export function createPlayerModel({ kit, skin, hair, style, number }) {
  if (!A) throw new Error('loadPlayerAssets() first');
  const inner = SkeletonUtils.clone(A.scene);
  let mesh = null;
  inner.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  mesh.material = kitMaterial(kit, SKINS[skin % SKINS.length], HAIRS[hair % HAIRS.length], style, number);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const bones = {};
  inner.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const root = new THREE.Group();
  const body = new THREE.Group(); // lean / dive / jump offsets
  root.add(body);
  body.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = {};
  for (const name of Object.keys(A.clips)) {
    const act = mixer.clipAction(A.clips[name]);
    act.enabled = true;
    act.setEffectiveWeight(0);
    actions[name] = act;
  }
  for (const n of LOCO) actions[n].play();
  return {
    root, body, inner, mesh, mixer, actions, bones,
    w: Object.fromEntries(LOCO.map(n => [n, n === 'Idle_Loop' ? 1 : 0])),
    phase: Math.random(), shot: null, prev: {}, lean: 0,
    _q: new THREE.Quaternion(),
  };
}

export function disposePlayerModel(m) {
  m.mixer.stopAllAction();
  m.mesh.material.userData.u.uNumTex.value.dispose();
  m.mesh.material.dispose();
}

const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
// bone axes on this rig: thigh/calf/upperarm/lowerarm/spine X = swing (+ backward for legs, + forward
// for arms & spine), upperarm Z = raise sideways (+ for left, - for right)
function rot(m, bone, axis, angle) {
  if (!angle) return;
  const b = m.bones[bone];
  if (!b) return;
  m._q.setFromAxisAngle(AX[axis], angle);
  b.quaternion.multiply(m._q);
}
function blendPose(m, pose, w) {
  if (!pose || w <= 0) return;
  for (const k in pose) { const b = m.bones[k]; if (b) b.quaternion.slerp(pose[k], w); }
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const bell = t => Math.sin(Math.PI * Math.min(1, Math.max(0, t)));

// start a one-shot (or looping) clip that takes over the whole body, fading over the locomotion
function playShot(m, name, { fadeIn = 0.12, speed = 1, from = 0, loop = false } = {}) {
  const act = m.actions[name];
  if (!act) return;
  if (m.shot && m.shot.name !== name) { m.shot.act.setEffectiveWeight(0); m.shot.act.stop(); }
  const keepW = m.shot && m.shot.name === name ? m.shot.w : 0;
  act.reset();
  act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  act.clampWhenFinished = true;
  act.timeScale = speed;
  act.time = from * act.getClip().duration;
  act.play();
  m.shot = { name, act, w: keepW, fadeIn, loop };
}
function stopShot(m) { if (m.shot) m.shot.fadingOut = true; }

// a: animation state written by the match each frame. dt in seconds.
export function animateModel(m, a, time, dt) {
  dt = Math.min(dt || 0.016, 0.05);
  const P = m.prev;
  const started = k => a[k] >= 0 && !(P[k] >= 0);
  // posed celebrations stand (or glide) on the spot: no running legs underneath
  const sp = a.celebT >= 0 && (a.celebKind === 'siu' || a.celebKind === 'slide') ? 0 : a.speed;

  // ---------------- one-shot triggers ----------------
  if (started('slideT')) playShot(m, 'Slide_Loop', { fadeIn: 0.08, from: 0.05, speed: 1.2 });
  if (started('throwT')) playShot(m, 'OverhandThrow', { fadeIn: 0.05, from: 0.25, speed: 1.25 });
  if (started('hitT')) playShot(m, a.hitBig ? 'Hit_Knockback' : 'Hit_Chest', { fadeIn: 0.05, speed: 1.2 });
  const celebrating = a.celebrate > 0.5 && a.celebrateStyle === 1;
  if (celebrating && !(m.shot && m.shot.celeb)) {
    const list = ['Celebration', 'Yes', 'Dance_Loop', 'BackFlip'];
    const name = a.celebClipName || list[(a.celebClip || 0) % list.length];
    playShot(m, name, { fadeIn: 0.25, loop: name !== 'BackFlip' });
    m.shot.celeb = true;
  }
  if (m.shot && m.shot.celeb && !celebrating) stopShot(m);
  if (a.sad > 0.6 && sp < 0.6 && !(m.shot && m.shot.sad)) { playShot(m, a.sadClip ? 'Idle_No_Loop' : 'Idle_Tired_Loop', { fadeIn: 0.4, loop: true }); m.shot.sad = true; }
  if (m.shot && m.shot.sad && (a.sad < 0.3 || sp > 0.8)) stopShot(m);
  if (m.shot && m.shot.name === 'Slide_Loop' && a.slideT < 0) stopShot(m);
  if (m.shot && !m.shot.loop && !m.shot.fadingOut) {
    const act = m.shot.act;
    if (act.time >= act.getClip().duration - 0.12 || !act.isRunning()) stopShot(m);
  }
  for (const k of ['slideT', 'throwT', 'hitT', 'skillT']) P[k] = a[k];

  // ---------------- one-shot weight ----------------
  let shotW = 0;
  if (m.shot) {
    const s = m.shot;
    s.w = s.fadingOut ? s.w - dt / 0.18 : Math.min(1, s.w + dt / s.fadeIn);
    if (s.w <= 0) { s.act.setEffectiveWeight(0); s.act.stop(); m.shot = null; }
    else { s.act.setEffectiveWeight(s.w); shotW = s.w; }
  }

  // ---------------- locomotion blend ----------------
  const ang = a.moveAngle || 0; // velocity direction relative to facing
  const fw = Math.cos(ang), sd = Math.sin(ang);
  const W = { Idle_Loop: 0, Walk_Loop: 0, Jog_Fwd_Loop: 0, Sprint_Loop: 0, Jog_Bwd_Loop: 0, Jog_Left_Loop: 0, Jog_Right_Loop: 0, Crouch_Idle_Loop: 0 };
  if (sp < 0.25) W.Idle_Loop = 1;
  else if (sp < 1.6) { const k = (sp - 0.25) / 1.35; W.Idle_Loop = 1 - k; W.Walk_Loop = k; }
  else if (sp < 4.0) { const k = (sp - 1.6) / 2.4; W.Walk_Loop = 1 - k; W.Jog_Fwd_Loop = k; }
  else if (sp < 7.0) { const k = (sp - 4.0) / 3.0; W.Jog_Fwd_Loop = 1 - k; W.Sprint_Loop = k; }
  else W.Sprint_Loop = 1;
  // jockeying / back-pedalling: redistribute the moving weight by direction
  if (sp > 0.6 && fw < 0.75) {
    const mv = 1 - W.Idle_Loop;
    for (const k of ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop']) W[k] *= Math.max(0, fw);
    W.Jog_Bwd_Loop = mv * Math.max(0, -fw);
    W.Jog_Left_Loop = mv * Math.max(0, sd) * 0.9;
    W.Jog_Right_Loop = mv * Math.max(0, -sd) * 0.9;
  }
  if (a.ready) { W.Crouch_Idle_Loop = 0.45 * W.Idle_Loop; W.Idle_Loop *= 0.55; }
  // smooth weights so transitions never pop
  const kw = 1 - Math.exp(-dt * 10);
  for (const n of LOCO) {
    m.w[n] += (W[n] - m.w[n]) * kw;
  }
  // the simulation's gait clock (a.gait) keeps every blended clip on the same foot as the touches
  for (const n of LOCO) {
    const act = m.actions[n];
    act.setEffectiveWeight(m.w[n] * (1 - shotW));
    if (STRIDE[n]) { act.timeScale = 0; act.time = (a.gait || 0) * act.getClip().duration; }
  }
  m.mixer.update(dt);

  // ---------------- procedural layers on top of the mocap ----------------
  const body = m.body;
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  // lean into turns
  m.lean += ((a.turnRate || 0) * Math.min(1, sp / 7) * 0.09 - m.lean) * Math.min(1, dt * 8);
  body.rotation.z = -Math.max(-0.28, Math.min(0.28, m.lean));

  if (a.kickT >= 0) {
    const t = a.kickT, p = a.kickPow;
    let h, kn;
    if (t < 0.38) { const w = ease(t / 0.38); h = lerp(0, 0.75 + 0.35 * p, w); kn = lerp(0.1, 1.5, w); }
    else if (t < 0.58) { const w = ease((t - 0.38) / 0.2); h = lerp(0.75 + 0.35 * p, -0.9 - 0.6 * p, w); kn = lerp(1.5, 0.05, w); }
    else { const w = ease((t - 0.58) / 0.42); h = lerp(-0.9 - 0.6 * p, 0, w); kn = lerp(0.05, 0.1, w); }
    const b = bell(t);
    const fade = Math.min(1, t * 6, (1 - t) * 4);
    // take the kicking leg out of the run cycle, then swing it through the ball (either foot)
    const left = a.kickFoot === 'L', k = left ? '_l' : '_r', s = left ? '_r' : '_l', mir = left ? -1 : 1;
    blendPose(m, left ? (A.restLegL || (A.restLegL = restPose(/^(thigh_l|calf_l|foot_l)$/))) : (A.restLeg || (A.restLeg = restPose(/^(thigh_r|calf_r|foot_r)$/))), 0.85 * fade);
    rot(m, 'thigh' + k, 'x', h * fade);
    rot(m, 'calf' + k, 'x', kn * fade);
    rot(m, 'foot' + k, 'x', -0.3 * b);
    rot(m, 'thigh' + s, 'x', -0.15 * b);
    rot(m, 'calf' + s, 'x', 0.35 * b);
    rot(m, 'upperarm' + s, 'z', 0.75 * b * mir);
    rot(m, 'upperarm' + k, 'z', -0.45 * b * mir);
    rot(m, 'spine_02', 'x', -0.12 * b * p);
    rot(m, 'spine_02', 'y', -0.25 * b * mir);
    body.position.y -= 0.03 * b;
  }
  if (a.tackleT >= 0) {
    const b = bell(a.tackleT);
    rot(m, 'thigh_r', 'x', -1.0 * b);
    rot(m, 'calf_r', 'x', -0.3 * b);
    rot(m, 'calf_l', 'x', 0.8 * b);
    rot(m, 'spine_02', 'x', 0.35 * b);
    rot(m, 'upperarm_l', 'z', 0.6 * b);
    body.position.y -= 0.18 * b;
  }
  if (a.headerT >= 0) {
    const b = bell(a.headerT);
    body.position.y += 0.5 * b;
    rot(m, 'thigh_l', 'x', -0.6 * b); rot(m, 'calf_l', 'x', 1.2 * b);
    rot(m, 'thigh_r', 'x', -0.2 * b); rot(m, 'calf_r', 'x', 0.9 * b);
    rot(m, 'upperarm_l', 'z', 0.9 * b); rot(m, 'upperarm_r', 'z', -0.9 * b);
    const nod = a.headerT < 0.45 ? -0.35 * ease(a.headerT / 0.45) : lerp(-0.35, 0.55, ease((a.headerT - 0.45) / 0.3));
    rot(m, 'spine_03', 'x', nod * b);
    rot(m, 'neck_01', 'x', nod * 0.8 * b);
  }
  if (a.diveT >= 0) {
    const t = a.diveT;
    const w = t < 0.22 ? ease(t / 0.22) : 1;
    const side = a.diveSide;
    if (a.diveHigh) {
      body.position.y += 0.6 * bell(Math.min(1, t * 1.6));
      body.rotation.z += -side * 0.3 * w;
    } else {
      body.rotation.z += -side * 1.3 * w;
      body.position.y += (t < 0.5 ? Math.sin(t / 0.5 * Math.PI * 0.5) * 0.4 : 0.4 * (1 - (t - 0.5) * 1.7)) * w;
      body.position.x += side * 0.25 * w;
    }
    rot(m, 'upperarm_l', 'z', 2.5 * w); rot(m, 'upperarm_r', 'z', -2.5 * w);
    rot(m, 'lowerarm_l', 'x', -0.3 * w); rot(m, 'lowerarm_r', 'x', -0.3 * w);
    rot(m, 'thigh_l', 'x', -0.3 * w); rot(m, 'calf_l', 'x', 0.5 * w); rot(m, 'calf_r', 'x', 0.7 * w);
  }
  if (a.touchT >= 0 && a.kickT < 0 && a.skillT < 0) {
    // dribble touch: quick flick of the foot that touched it (outside/inside for a turn)
    const b2 = bell(a.touchT), sd = a.touchSide || 0;
    const f = a.touchFoot === 'L' ? '_l' : '_r', mir = a.touchFoot === 'L' ? -1 : 1;
    rot(m, 'thigh' + f, 'x', -0.35 * b2);
    rot(m, 'calf' + f, 'x', 0.25 * b2);
    rot(m, 'thigh' + f, 'z', sd * 0.3 * b2 * mir);
    rot(m, 'foot' + f, 'y', sd * 0.4 * b2 * mir);
  }
  if (a.skillT >= 0) skillPose(m, a);
  if (a.hold) blendPose(m, A.poses.hold, 0.9);
  if (a.throwReady) blendPose(m, A.poses.throw, 0.9);
  if (a.celebrate > 0 && a.celebrateStyle === 0) {
    // aeroplane run
    rot(m, 'upperarm_l', 'z', 1.25 * a.celebrate); rot(m, 'upperarm_r', 'z', -1.25 * a.celebrate);
    body.rotation.z += Math.sin(time * 3) * 0.16 * a.celebrate;
  }
  if (a.sad > 0 && sp > 0.4) { rot(m, 'neck_01', 'x', 0.4 * a.sad); rot(m, 'spine_03', 'x', 0.15 * a.sad); }
  if (a.celebT >= 0) {
    if (a.celebKind === 'siu') siuPose(m, a.celebT);
    else if (a.celebKind === 'slide') kneeSlidePose(m, a.celebT, time);
    else if (a.celebKind === 'cold') {
      // Palmer: arms folded, shivering, rubbing his arms
      m.body.rotation.z += Math.sin(time * 38) * 0.018;
      rot(m, 'upperarm_l', 'y', Math.sin(time * 9) * 0.12); rot(m, 'upperarm_r', 'y', -Math.sin(time * 9) * 0.12);
      rot(m, 'neck_01', 'x', 0.12);
    }
  }
}

// ---- goal celebrations posed by hand (t = seconds into the routine) ----
// The Siu: a little run-in, jump with a half turn, land legs apart, arms thrust down and back.
function siuPose(m, t) {
  const body = m.body, E = x => ease(Math.min(1, Math.max(0, x)));
  const crouch = t < 0.3 ? E(t / 0.3) : t < 0.42 ? 1 - E((t - 0.3) / 0.12) : 0;
  const air = t >= 0.38 && t < 0.98 ? (t - 0.38) / 0.6 : -1;
  const land = t >= 0.98 ? E((t - 0.98) / 0.18) : 0;
  const squash = t >= 0.98 && t < 1.3 ? Math.sin((t - 0.98) / 0.32 * Math.PI) : 0;
  // crouch to jump
  rot(m, 'thigh_l', 'x', -0.55 * crouch); rot(m, 'thigh_r', 'x', -0.55 * crouch);
  rot(m, 'calf_l', 'x', 1.0 * crouch); rot(m, 'calf_r', 'x', 1.0 * crouch);
  body.position.y -= 0.16 * crouch + 0.1 * squash;
  if (air >= 0) {
    body.position.y += 0.75 * Math.sin(air * Math.PI);
    body.rotation.y += Math.PI * E(air * 1.15);
    const up = Math.sin(Math.min(1, air * 1.6) * Math.PI * 0.5);
    rot(m, 'upperarm_l', 'z', 2.5 * up); rot(m, 'upperarm_r', 'z', -2.5 * up);
    rot(m, 'thigh_l', 'x', -0.35 * up); rot(m, 'thigh_r', 'x', -0.2 * up); rot(m, 'calf_l', 'x', 0.7 * up); rot(m, 'calf_r', 'x', 0.5 * up);
  }
  if (land > 0) {
    body.rotation.y += Math.PI;
    // legs apart, knees soft, chest out, arms down and back, chin up
    rot(m, 'thigh_l', 'z', -0.38 * land); rot(m, 'thigh_r', 'z', 0.38 * land);
    rot(m, 'thigh_l', 'x', -0.15 * land); rot(m, 'thigh_r', 'x', -0.15 * land);
    rot(m, 'calf_l', 'x', 0.3 * land); rot(m, 'calf_r', 'x', 0.3 * land);
    rot(m, 'foot_l', 'z', 0.3 * land); rot(m, 'foot_r', 'z', -0.3 * land);
    rot(m, 'upperarm_l', 'z', 0.55 * land); rot(m, 'upperarm_r', 'z', -0.55 * land);
    rot(m, 'upperarm_l', 'x', -0.55 * land); rot(m, 'upperarm_r', 'x', -0.55 * land);
    rot(m, 'lowerarm_l', 'x', -0.15 * land); rot(m, 'lowerarm_r', 'x', -0.15 * land);
    rot(m, 'spine_02', 'x', -0.18 * land); rot(m, 'spine_03', 'x', -0.2 * land);
    rot(m, 'neck_01', 'x', -0.25 * land);
    body.position.y -= 0.05 * land;
  }
}

// Knee slide: drop onto the knees at speed and glide, leaning back with the arms spread wide.
function kneeSlidePose(m, t, time) {
  const body = m.body, k = ease(Math.min(1, t / 0.22));
  body.position.y -= 0.5 * k;
  rot(m, 'thigh_l', 'x', 0.1 * k); rot(m, 'thigh_r', 'x', 0.1 * k);
  rot(m, 'thigh_l', 'z', -0.12 * k); rot(m, 'thigh_r', 'z', 0.12 * k);
  rot(m, 'calf_l', 'x', 1.75 * k); rot(m, 'calf_r', 'x', 1.75 * k);
  rot(m, 'foot_l', 'x', 0.6 * k); rot(m, 'foot_r', 'x', 0.6 * k);
  rot(m, 'spine_01', 'x', -0.2 * k); rot(m, 'spine_02', 'x', -0.15 * k); rot(m, 'spine_03', 'x', -0.2 * k);
  rot(m, 'neck_01', 'x', -0.35 * k);
  const roar = 0.15 * Math.sin(time * 6) * k;
  rot(m, 'upperarm_l', 'z', (1.75 + roar) * k); rot(m, 'upperarm_r', 'z', -(1.75 + roar) * k);
  rot(m, 'lowerarm_l', 'x', 0.35 * k); rot(m, 'lowerarm_r', 'x', 0.35 * k);
}

// ---- skill moves: hand-keyed leg work, timed to the ball path scripted in match.updateSkill ----
// outward(leg): sign of the thigh Z rotation that moves that foot away from the body
const outward = leg => (leg === 'r' ? 1 : -1);
function skillPose(m, a) {
  const u = a.skillT, s = a.skillSide; // s > 0: the move finishes going to the player's left
  const B = x => Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
  const E = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const fade = Math.min(1, u * 7, (1 - u) * 5);
  blendPose(m, A.restLegs || (A.restLegs = restPose(/^(thigh|calf|foot)_[lr]$/)), 0.8 * fade);
  const body = m.body;
  const T = (leg, x, z = 0, calf = 0, foot = 0) => {
    rot(m, 'thigh_' + leg, 'x', x * fade); rot(m, 'thigh_' + leg, 'z', z * fade);
    rot(m, 'calf_' + leg, 'x', calf * fade); rot(m, 'foot_' + leg, 'x', foot * fade);
  };
  switch (a.skillType) {
    case 'tap': { // step-over: outside leg circles over the ball, the other foot takes it away
      const feint = s > 0 ? 'r' : 'l', push = s > 0 ? 'l' : 'r';
      const u1 = u / 0.52, u2 = (u - 0.5) / 0.42;
      T(feint, -0.95 * B(u1), outward(feint) * 0.75 * Math.sin(Math.PI * Math.min(1, Math.max(0, u1))) * (u1 < 1 ? 1 : 0), 1.25 * B(u1), -0.2 * B(u1));
      T(push, -0.6 * B(u2) + 0.1 * B(u1), outward(push) * 0.4 * B(u2), 0.55 * B(u2) + 0.3 * B(u1), 0);
      body.rotation.z += (feint === 'r' ? 1 : -1) * (0.24 * B(u / 0.55) - 0.22 * B(u2));
      rot(m, 'spine_02', 'y', (feint === 'r' ? -1 : 1) * 0.35 * B(u / 0.55));
      body.position.y -= 0.06 * B(u1);
      rot(m, 'upperarm_l', 'z', 0.45 * B(u)); rot(m, 'upperarm_r', 'z', -0.45 * B(u));
      break;
    }
    case 'left': case 'right': { // La Croqueta: inside of one foot drags it across to the other
      const sweep = s > 0 ? 'r' : 'l', recv = s > 0 ? 'l' : 'r';
      const u1 = u / 0.48, u2 = (u - 0.25) / 0.6;
      T(sweep, -0.5 * B(u1), -outward(sweep) * 0.55 * B(u1), 0.45 * B(u1), 0);
      T(recv, -0.55 * B(u2), outward(recv) * 0.45 * B(u2), 0.55 * B(u2), 0);
      body.rotation.z += (recv === 'r' ? 1 : -1) * 0.2 * B(u);
      body.position.y += 0.05 * B(u * 2 % 1);
      rot(m, 'upperarm_l', 'z', 0.5 * B(u)); rot(m, 'upperarm_r', 'z', -0.5 * B(u));
      break;
    }
    case 'fake': { // fake shot: big back-lift, swing stops short, ball dragged across the standing foot
      const back = u < 0.36 ? E(u / 0.36) : 1 - E((u - 0.36) / 0.22);
      T('r', 0.85 * back - 0.25 * B((u - 0.45) / 0.4), -0.35 * B((u - 0.45) / 0.45) * (s > 0 ? -1 : 1), 1.35 * back + 0.3 * B((u - 0.45) / 0.4), 0);
      T('l', -0.12 * B(u), 0, 0.3 * B(u), 0);
      rot(m, 'upperarm_l', 'z', 0.8 * B(u / 0.7)); rot(m, 'upperarm_r', 'z', -0.5 * B(u / 0.7));
      rot(m, 'spine_02', 'y', -0.3 * back);
      body.rotation.z += (s > 0 ? 1 : -1) * 0.18 * B((u - 0.4) / 0.6);
      break;
    }
    case 'down': { // drag-back: sole on the ball, roll it back, spin
      const reach = u < 0.2 ? -0.8 * E(u / 0.2) : u < 0.56 ? -0.8 + 1.1 * E((u - 0.2) / 0.36) : 0.3 * (1 - E((u - 0.56) / 0.3));
      T('r', reach, 0, 0.5 * B(u / 0.75), 0.45 * B(u / 0.7));
      T('l', 0.05, 0, 0.4 * B(u / 0.8), 0);
      body.position.y += 0.08 * B((u - 0.18) / 0.42);
      rot(m, 'spine_02', 'x', -0.12 * B(u / 0.4) + 0.2 * B((u - 0.45) / 0.5));
      rot(m, 'upperarm_l', 'z', 0.55 * B(u)); rot(m, 'upperarm_r', 'z', -0.55 * B(u));
      break;
    }
    case 'up': { // rainbow flick: roll it back with the right sole, heel flick with the left
      const u1 = u / 0.34, u2 = (u - 0.3) / 0.42;
      T('r', u < 0.34 ? -0.7 + 0.85 * E(u1) : 0.15 * (1 - E((u - 0.34) / 0.3)), 0, 0.45 * B(u1), 0.45 * B(u1));
      T('l', 0.5 * B(u2), 0, 2.2 * B(u2), 0.7 * B(u2));
      rot(m, 'spine_02', 'x', 0.45 * B(u2));
      rot(m, 'neck_01', 'x', -0.35 * B(u2));
      body.position.y += 0.1 * B((u - 0.45) / 0.3);
      rot(m, 'upperarm_l', 'z', 0.8 * B(u2)); rot(m, 'upperarm_r', 'z', -0.8 * B(u2));
      break;
    }
  }
}
