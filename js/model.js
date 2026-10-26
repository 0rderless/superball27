import * as THREE from '../lib/three.module.min.js';

// Procedural footballer: jointed humanoid with kit textures, faces and hair.
// The model faces +z; its left side is +x.

export const SKINS = ['#f2cdb0', '#e1ae8a', '#c78b63', '#a56a43', '#7a4a2b', '#55331f'];
export const HAIRS = ['#15100c', '#3a2616', '#6a4324', '#b5834a', '#e0be78', '#0a0a0a'];

const G = {};
function geos() {
  if (G.ready) return G;
  G.ready = true;
  G.torso = new THREE.CylinderGeometry(0.205, 0.165, 0.56, 20, 1);
  G.chest = new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.shoulder = new THREE.SphereGeometry(0.095, 12, 8);
  G.waist = new THREE.CylinderGeometry(0.172, 0.19, 0.16, 16);
  G.shortsLeg = new THREE.CylinderGeometry(0.105, 0.1, 0.2, 12);
  G.neck = new THREE.CylinderGeometry(0.055, 0.062, 0.13, 10);
  G.head = new THREE.SphereGeometry(0.115, 22, 16);
  G.hair = new THREE.SphereGeometry(0.122, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.hairBack = new THREE.SphereGeometry(0.12, 16, 10, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.42);
  G.ear = new THREE.SphereGeometry(0.026, 8, 6);
  G.nose = new THREE.SphereGeometry(0.022, 8, 6);
  G.upperArm = new THREE.CapsuleGeometry(0.05, 0.21, 4, 10);
  G.sleeve = new THREE.CylinderGeometry(0.068, 0.06, 0.17, 12);
  G.forearm = new THREE.CapsuleGeometry(0.041, 0.19, 4, 10);
  G.hand = new THREE.SphereGeometry(0.048, 10, 8);
  G.thigh = new THREE.CapsuleGeometry(0.082, 0.29, 4, 12);
  G.shin = new THREE.CapsuleGeometry(0.057, 0.3, 4, 12);
  G.sockTop = new THREE.CylinderGeometry(0.066, 0.064, 0.05, 12);
  const boot = new THREE.BoxGeometry(0.1, 0.075, 0.27, 1, 1, 2);
  // taper the toe a little
  const p = boot.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z > 0.1) { p.setX(i, p.getX(i) * 0.75); if (p.getY(i) > 0) p.setY(i, p.getY(i) * 0.4); }
  }
  boot.computeVertexNormals();
  G.boot = boot;
  return G;
}

// ---- texture atlas (512x512): shirt [0..256]x[0..256], face [256..512]x[0..128], white patch bottom-right ----
function drawShirt(g, kit, number, teamTag) {
  g.fillStyle = kit.shirt;
  g.fillRect(0, 0, 256, 256);
  if (kit.pattern === 'stripes') {
    g.fillStyle = kit.shirt2;
    for (let x = 0; x < 256; x += 32) g.fillRect(x + 22, 0, 10, 256);
  } else if (kit.pattern === 'sash') {
    g.fillStyle = kit.shirt2;
    g.fillRect(56, 0, 14, 256);
    g.fillRect(186, 0, 14, 256);
    g.beginPath();
    g.moveTo(0, 60); g.lineTo(26, 60); g.lineTo(-10, 200); g.lineTo(-36, 200); g.closePath();
    g.moveTo(256, 60); g.lineTo(282, 60); g.lineTo(246, 200); g.lineTo(220, 200); g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fill();
  }
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = kit.trim;
  g.fillRect(0, 0, 256, 9);
  g.font = '900 118px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.strokeText(String(number), 128, 140);
  g.fillStyle = kit.number;
  g.fillText(String(number), 128, 140);
  g.fillStyle = kit.trim;
  g.beginPath(); g.arc(30, 62, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = kit.shirt2;
  g.beginPath(); g.arc(30, 62, 6, 0, Math.PI * 2); g.fill();
  g.font = '900 26px Arial, sans-serif';
  g.fillStyle = kit.number;
  g.fillText(teamTag, 0, 112);
  g.fillText(teamTag, 256, 112);
}

function drawFace(g, skin) {
  g.fillStyle = skin;
  g.fillRect(0, 0, 256, 128);
  const cx = 64; // u = 0.25 is the front of a THREE sphere
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 96, 256, 32);
  g.fillStyle = 'rgba(30,18,10,0.85)';
  g.fillRect(cx - 17, 50, 12, 3);
  g.fillRect(cx + 5, 50, 12, 3);
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(cx - 11, 58, 5, 3, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + 11, 58, 5, 3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a1a10';
  g.beginPath(); g.arc(cx - 11, 58, 2.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 11, 58, 2.4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(90,30,30,0.8)';
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx - 8, 80); g.quadraticCurveTo(cx, 83, cx + 8, 80); g.stroke();
}

function atlasTexture(kit, number, teamTag, skin) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  drawShirt(g, kit, number, teamTag);
  g.save();
  g.translate(256, 0);
  drawFace(g, skin);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// uv remap into atlas regions (v is bottom-up)
const REGION = {
  shirt: [0, 0.5, 0.5, 0.5],      // u0, v0, du, dv
  face: [0.5, 0.75, 0.5, 0.25],
  white: [0.8, 0.1, 0, 0],
};

const BONE_NAMES = ['body', 'hips', 'spine', 'head', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKnee', 'lAnk', 'rHip', 'rKnee', 'rAnk'];

function mergeParts(parts, boneIndex) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const [u0, v0, du, dv] = REGION[p.region];
    const bi = boneIndex[p.bone];
    for (let i = 0; i < P.count; i++) {
      const o = vo + i;
      pos[o * 3] = P.getX(i); pos[o * 3 + 1] = P.getY(i); pos[o * 3 + 2] = P.getZ(i);
      nor[o * 3] = N.getX(i); nor[o * 3 + 1] = N.getY(i); nor[o * 3 + 2] = N.getZ(i);
      uv[o * 2] = u0 + U.getX(i) * du; uv[o * 2 + 1] = v0 + U.getY(i) * dv;
      col[o * 3] = p.color.r; col[o * 3 + 1] = p.color.g; col[o * 3 + 2] = p.color.b;
      si[o * 4] = bi; sw[o * 4] = 1;
    }
    const I = g.index;
    for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo;
    vo += P.count; io += I.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// One rigidly-skinned mesh per player: a single draw call, animated through bones.
export function createPlayerModel({ kit, skin, hair, style, number, teamTag }) {
  const g = geos();
  const skinCol = SKINS[skin % SKINS.length];
  const hairCol = HAIRS[hair % HAIRS.length];
  const C = hex => new THREE.Color(hex);
  const WHITE = C('#ffffff');
  const cShirt = C(kit.shirt), cSkin = C(skinCol), cShorts = C(kit.shorts), cSocks = C(kit.socks);
  const cSockTop = C(kit.sockTop), cBoots = C(kit.boots), cHair = C(hairCol), cHand = kit.gloves ? C(kit.gloves) : cSkin;
  const cArm = kit.longSleeve ? cShirt : cSkin;

  // ---- skeleton ----
  const B = {};
  for (const n of BONE_NAMES) { B[n] = new THREE.Bone(); B[n].name = n; }
  B.body.add(B.hips); B.hips.position.y = 0.97;
  B.hips.add(B.spine); B.spine.position.y = 0.03;
  B.spine.add(B.head); B.head.position.y = 0.69;
  B.spine.add(B.lSh); B.lSh.position.set(0.235, 0.5, 0);
  B.spine.add(B.rSh); B.rSh.position.set(-0.235, 0.5, 0);
  B.lSh.add(B.lEl); B.lEl.position.y = -0.3;
  B.rSh.add(B.rEl); B.rEl.position.y = -0.3;
  B.hips.add(B.lHip); B.lHip.position.set(0.1, -0.05, 0);
  B.hips.add(B.rHip); B.rHip.position.set(-0.1, -0.05, 0);
  B.lHip.add(B.lKnee); B.lKnee.position.y = -0.44;
  B.rHip.add(B.rKnee); B.rKnee.position.y = -0.44;
  B.lKnee.add(B.lAnk); B.lAnk.position.y = -0.4;
  B.rKnee.add(B.rAnk); B.rAnk.position.y = -0.4;
  B.body.updateMatrixWorld(true);

  const parts = [];
  const tmpObj = new THREE.Object3D();
  // add a primitive in a bone's local space
  const add = (geo, bone, color, region, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0) => {
    tmpObj.position.set(x, y, z);
    tmpObj.rotation.set(rx, 0, 0);
    tmpObj.scale.set(sx, sy, sz);
    tmpObj.updateMatrix();
    const ge = geo.clone();
    ge.applyMatrix4(tmpObj.matrix);
    ge.applyMatrix4(B[bone].matrixWorld);
    parts.push({ geo: ge, bone, color, region });
  };

  add(g.waist, 'hips', cShorts, 'white', 0, -0.03, 0);
  add(g.torso, 'spine', WHITE, 'shirt', 0, 0.28, 0, 1, 1, 0.62);
  add(g.chest, 'spine', cShirt, 'white', 0, 0.555, 0, 1.02, 0.32, 0.63);
  for (const sx of [1, -1]) add(g.shoulder, 'spine', cShirt, 'white', sx * 0.205, 0.5, 0, 1.05, 0.85, 0.95);
  add(g.neck, 'spine', cSkin, 'white', 0, 0.63, 0);
  add(g.head, 'head', WHITE, 'face', 0, 0.1, 0.005, 0.9, 1.08, 0.98);
  add(g.nose, 'head', cSkin, 'white', 0, 0.085, 0.115);
  for (const sx of [1, -1]) add(g.ear, 'head', cSkin, 'white', sx * 0.103, 0.095, 0);
  if (style === 1) add(g.hair, 'head', cHair.clone().lerp(cSkin, 0.25), 'white', 0, 0.1, 0, 0.9, 1.0, 0.97, -0.35);
  else if (style === 3) add(g.hair, 'head', cHair, 'white', 0, 0.115, -0.008, 1.12, 1.2, 1.12, -0.32);
  else if (style === 2) add(g.hair, 'head', cHair, 'white', 0, 0.115, -0.008, 0.93, 1.18, 1.0, -0.32);
  else add(g.hair, 'head', cHair, 'white', 0, 0.115, -0.008, 0.92, 1.02, 1.0, -0.32);
  if (style === 4) add(g.hairBack, 'head', cHair, 'white', 0, 0.07, -0.01, 1.0, 1.25, 1.05);
  for (const s of ['l', 'r']) {
    add(g.sleeve, s + 'Sh', cShirt, 'white', 0, -0.07, 0);
    add(g.upperArm, s + 'Sh', cArm, 'white', 0, -0.15, 0);
    add(g.forearm, s + 'El', cArm, 'white', 0, -0.13, 0);
    add(g.hand, s + 'El', cHand, 'white', 0, -0.285, 0.005, 0.8, 1.15, 1);
    add(g.shortsLeg, s + 'Hip', cShorts, 'white', 0, -0.07, 0);
    add(g.thigh, s + 'Hip', cSkin, 'white', 0, -0.22, 0);
    add(g.shin, s + 'Knee', cSocks, 'white', 0, -0.19, 0);
    add(g.sockTop, s + 'Knee', cSockTop, 'white', 0, -0.035, 0);
    add(g.boot, s + 'Ank', cBoots, 'white', 0, -0.035, 0.05);
  }

  const boneIndex = {};
  BONE_NAMES.forEach((n, i) => { boneIndex[n] = i; });
  const geo = mergeParts(parts, boneIndex);
  for (const p of parts) p.geo.dispose();
  const material = new THREE.MeshStandardMaterial({ map: atlasTexture(kit, number, teamTag, skinCol), vertexColors: true, roughness: 0.62, envMapIntensity: 0.9 });
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(B.body);
  mesh.bind(new THREE.Skeleton(BONE_NAMES.map(n => B[n])));
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  const root = new THREE.Group();
  root.add(mesh);
  return {
    root, mesh, body: B.body, hips: B.hips, spine: B.spine, head: B.head,
    lSh: B.lSh, lEl: B.lEl, rSh: B.rSh, rEl: B.rEl,
    lHip: B.lHip, lKnee: B.lKnee, lAnk: B.lAnk,
    rHip: B.rHip, rKnee: B.rKnee, rAnk: B.rAnk,
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const bell = t => Math.sin(Math.PI * Math.min(1, Math.max(0, t)));

// a: animation state from the player. Writes joint rotations.
export function animateModel(m, a, time) {
  const speed = a.speed;
  const run = Math.min(1, speed / 8.6);
  const amp = Math.min(1, speed * 0.55) * (0.38 + 0.62 * run);
  const ph = a.phase;
  const s = Math.sin(ph), c = Math.cos(ph);

  // ---- base locomotion ----
  let lHip = -s * amp * 0.95, rHip = s * amp * 0.95;
  let lKnee = 0.08 + (0.35 + 1.25 * run) * amp * Math.max(0, c);
  let rKnee = 0.08 + (0.35 + 1.25 * run) * amp * Math.max(0, -c);
  let lHipZ = 0.05 * (1 - amp), rHipZ = -0.05 * (1 - amp);
  let lSh = s * amp * 0.85, rSh = -s * amp * 0.85;
  let lShZ = 0.1 + 0.05 * amp, rShZ = -0.1 - 0.05 * amp;
  let lEl = -(0.25 + 1.05 * amp), rEl = -(0.25 + 1.05 * amp);
  let spineX = 0.04 + 0.2 * run * amp + Math.sin(time * 2.1 + ph) * 0.008;
  let spineY = s * 0.14 * amp;
  let spineZ = 0;
  let headX = -spineX * 0.55;
  let bodyY = (Math.abs(c) * 0.06 - 0.025) * amp;
  let bodyX = 0, bodyZ = 0;
  let lAnk = 0, rAnk = 0;

  if (a.ready) {
    // goalkeeper / defensive crouch
    lKnee += 0.45; rKnee += 0.45; lHip -= 0.3; rHip -= 0.3;
    spineX += 0.25; bodyY -= 0.08;
    lSh -= 0.45; rSh -= 0.45; lShZ += 0.35; rShZ -= 0.35; lEl = -0.7; rEl = -0.7;
    lHipZ += 0.12; rHipZ -= 0.12;
  }
  if (a.hold) {
    lSh = -0.95; rSh = -0.95; lEl = -1.25; rEl = -1.25; lShZ = 0.05; rShZ = -0.05;
  }
  if (a.sad > 0) {
    headX += 0.45 * a.sad; spineX += 0.12 * a.sad;
    lShZ = lerp(lShZ, 0.3, a.sad); rShZ = lerp(rShZ, -0.3, a.sad);
    lEl = lerp(lEl, -1.9, a.sad); rEl = lerp(rEl, -1.9, a.sad);
    lSh = lerp(lSh, 0.35, a.sad); rSh = lerp(rSh, 0.35, a.sad);
  }
  if (a.celebrate > 0) {
    const k = a.celebrate;
    if (a.celebrateStyle === 0) { // aeroplane
      lShZ = lerp(lShZ, 1.45, k); rShZ = lerp(rShZ, -1.45, k); lSh = lerp(lSh, 0, k); rSh = lerp(rSh, 0, k);
      lEl = lerp(lEl, -0.1, k); rEl = lerp(rEl, -0.1, k); bodyZ = Math.sin(time * 3) * 0.18 * k;
    } else { // jumping fists
      const j = Math.abs(Math.sin(time * 6));
      lSh = lerp(lSh, -2.9, k); rSh = lerp(rSh, -2.9 + Math.sin(time * 6) * 0.3, k);
      lEl = lerp(lEl, -0.4, k); rEl = lerp(rEl, -0.4, k);
      bodyY += j * 0.25 * k; lKnee += j * 0.5 * k; rKnee += j * 0.5 * k;
    }
  }

  // ---- kick ----
  if (a.kickT >= 0) {
    const t = a.kickT, p = a.kickPow;
    let h, k;
    if (t < 0.38) { const w = ease(t / 0.38); h = lerp(0, 0.75 + 0.3 * p, w); k = lerp(0.1, 1.5, w); }
    else if (t < 0.58) { const w = ease((t - 0.38) / 0.2); h = lerp(0.75 + 0.3 * p, -0.85 - 0.55 * p, w); k = lerp(1.5, 0.05, w); }
    else { const w = ease((t - 0.58) / 0.42); h = lerp(-0.85 - 0.55 * p, 0, w); k = lerp(0.05, 0.12, w); }
    const b = bell(t);
    rHip = h; rKnee = k; lHip = -0.18 * b; lKnee = 0.25 * b;
    lShZ = 0.1 + 0.75 * b; rShZ = -0.1 - 0.45 * b; lSh = -0.35 * b; rSh = 0.3 * b; lEl = -0.4; rEl = -0.5;
    spineX = 0.05 - 0.12 * b * p; spineY = -0.25 * b;
    bodyY = -0.03 * b; rAnk = 0.4 * b;
  }
  // ---- header jump ----
  if (a.headerT >= 0) {
    const b = bell(a.headerT);
    bodyY += 0.45 * b; lKnee += 0.8 * b; rKnee += 0.6 * b; lHip -= 0.3 * b;
    lSh = -0.5 * b; rSh = -0.5 * b; lShZ = 0.8 * b; rShZ = -0.8 * b;
    spineX = -0.25 * b + 0.5 * Math.max(0, a.headerT - 0.4); headX = 0.3 * b;
  }
  // ---- standing tackle ----
  if (a.tackleT >= 0) {
    const b = bell(a.tackleT);
    rHip = lerp(rHip, -1.05, b); rKnee = lerp(rKnee, 0.1, b); lKnee = lerp(lKnee, 0.75, b); lHip = lerp(lHip, 0.25, b);
    bodyY -= 0.16 * b; spineX = lerp(spineX, 0.35, b); lShZ = 0.6 * b + 0.1; rShZ = -0.4 * b - 0.1;
  }
  // ---- slide tackle ----
  if (a.slideT >= 0) {
    const t = a.slideT;
    const w = t < 0.15 ? ease(t / 0.15) : t > 0.8 ? ease((1 - t) / 0.2) : 1;
    bodyY = lerp(bodyY, -0.66, w); spineX = lerp(spineX, -0.85, w);
    rHip = lerp(rHip, -1.45, w); rKnee = lerp(rKnee, 0.05, w);
    lHip = lerp(lHip, -1.1, w); lKnee = lerp(lKnee, 1.4, w);
    lSh = lerp(lSh, 0.9, w); lShZ = lerp(lShZ, 0.5, w); lEl = lerp(lEl, -0.1, w);
    rSh = lerp(rSh, -0.6, w); rShZ = lerp(rShZ, -0.8, w);
    headX = lerp(headX, 0.6, w);
  }
  // ---- goalkeeper dive ----
  if (a.diveT >= 0) {
    const t = a.diveT;
    const w = t < 0.25 ? ease(t / 0.25) : t > 0.85 ? 1 : 1;
    const side = a.diveSide; // +1 = to model's left (+x)
    if (a.diveHigh) {
      bodyY += 0.55 * bell(Math.min(1, t * 1.6));
      lSh = -3.0 * w; rSh = -3.0 * w; lEl = -0.1; rEl = -0.1; lShZ = 0.1; rShZ = -0.1;
      bodyZ = -side * 0.35 * w;
    } else {
      bodyZ = -side * 1.35 * w;
      bodyY += (t < 0.5 ? Math.sin(t / 0.5 * Math.PI * 0.5) * 0.35 : 0.35 * (1 - (t - 0.5) * 1.6)) * w;
      lSh = -3.0 * w; rSh = -3.0 * w; lEl = -0.1 * w; rEl = -0.1 * w;
      lShZ = side > 0 ? 0.3 * w : 0.1; rShZ = side < 0 ? -0.3 * w : -0.1;
      lHip = -0.2 * w; rHip = 0.1 * w; lKnee = 0.3 * w; rKnee = 0.5 * w;
      spineY = 0;
    }
  }
  // ---- throw-in ----
  if (a.throwT >= 0) {
    const t = a.throwT;
    const arm = t < 0.5 ? lerp(-2.6, -3.4, ease(t / 0.5)) : lerp(-3.4, -1.4, ease((t - 0.5) / 0.5));
    lSh = arm; rSh = arm; lEl = t < 0.5 ? -1.2 : -0.2; rEl = lEl; lShZ = 0.15; rShZ = -0.15;
    spineX = t < 0.5 ? -0.25 : 0.2;
  } else if (a.throwReady) {
    lSh = -2.7; rSh = -2.7; lEl = -1.3; rEl = -1.3; lShZ = 0.15; rShZ = -0.15; spineX = -0.1;
  }

  m.lHip.rotation.set(lHip, 0, lHipZ);
  m.rHip.rotation.set(rHip, 0, rHipZ);
  m.lKnee.rotation.x = lKnee;
  m.rKnee.rotation.x = rKnee;
  m.lAnk.rotation.x = lAnk - 0.1 * lKnee;
  m.rAnk.rotation.x = rAnk - 0.1 * rKnee;
  m.lSh.rotation.set(lSh, 0, lShZ);
  m.rSh.rotation.set(rSh, 0, rShZ);
  m.lEl.rotation.x = lEl;
  m.rEl.rotation.x = rEl;
  m.spine.rotation.set(spineX, spineY, spineZ);
  m.head.rotation.x = headX;
  m.body.position.y = bodyY;
  m.body.rotation.set(bodyX, 0, bodyZ);
}
