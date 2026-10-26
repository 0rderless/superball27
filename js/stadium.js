import * as THREE from '../lib/three.module.min.js';
import { F } from './config.js';

const { HL, HW, GW, GH, GD } = F;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function grassTexture() {
  // covers 126m x 88m; mown stripes aligned to the pitch
  const W = 2048, H = 1024, mW = 126, mH = 88;
  const [c, g] = canvas(W, H);
  const pxm = W / mW;
  const x0 = (mW / 2 - HL) * pxm;
  g.fillStyle = '#2f7d32';
  g.fillRect(0, 0, W, H);
  const stripe = 105 / 18;
  for (let i = -3; i < 22; i++) {
    g.fillStyle = i % 2 ? '#3a8f3c' : '#2e7a31';
    g.fillRect(x0 + i * stripe * pxm, 0, stripe * pxm + 1, H);
  }
  // fine noise
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] += n * 0.6; d[i + 1] += n; d[i + 2] += n * 0.4;
  }
  g.putImageData(img, 0, 0);
  // light wear patches in the goalmouths and centre
  const wear = (x, z, r) => {
    const cx = (x + mW / 2) * pxm, cy = (z + mH / 2) * pxm;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r * pxm);
    grd.addColorStop(0, 'rgba(120,110,60,0.22)');
    grd.addColorStop(1, 'rgba(120,110,60,0)');
    g.fillStyle = grd;
    g.fillRect(cx - r * pxm, cy - r * pxm, r * 2 * pxm, r * 2 * pxm);
  };
  wear(HL - 3, 0, 5); wear(-HL + 3, 0, 5); wear(0, 0, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function netTexture() {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(64, 64);
  g.moveTo(64, 0); g.lineTo(0, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function crowdTexture() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#1a1f2e';
  g.fillRect(0, 0, W, H);
  const rows = 34, rh = H / rows;
  const pal = ['#1d5cff', '#1d5cff', '#3b7bff', '#ffffff', '#0b2a8f', '#d8141e', '#ffd23f', '#222', '#e6e6e6', '#555', '#8fb0ff', '#1d5cff'];
  const skins = ['#f2cdb0', '#c78b63', '#7a4a2b', '#e1ae8a'];
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    g.fillStyle = r % 2 ? '#20263a' : '#1b2133';
    g.fillRect(0, y, W, rh);
    let x = Math.random() * 6;
    while (x < W) {
      const w = 9 + Math.random() * 5;
      if (Math.random() < 0.94) {
        const col = pal[(Math.random() * pal.length) | 0];
        g.fillStyle = col;
        g.fillRect(x, y + rh * 0.45, w - 2, rh * 0.55);
        g.fillStyle = skins[(Math.random() * skins.length) | 0];
        g.beginPath();
        g.arc(x + w / 2 - 1, y + rh * 0.33, rh * 0.2, 0, Math.PI * 2);
        g.fill();
        if (Math.random() < 0.06) { // scarves / flags up
          g.fillStyle = Math.random() < 0.7 ? '#1d5cff' : '#ffffff';
          g.fillRect(x - 2, y, w + 6, rh * 0.25);
        }
      }
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function adTexture() {
  const W = 2048, H = 64;
  const [c, g] = canvas(W, H);
  const ads = [
    ['SUPERBALL 27', '#0a1440', '#ffffff'],
    ['ZORP ENERGY', '#1557ff', '#ffffff'],
    ['VARCA AIR', '#d8141e', '#ffd23f'],
    ['GOAL.TV', '#111111', '#39ff88'],
    ['ZORPFC', '#ffffff', '#1557ff'],
    ['NEON BOOTS', '#ff3d7f', '#ffffff'],
    ['PLAY ON', '#0f0f0f', '#ffd21f'],
    ['MEGA KICKS', '#00a0ff', '#ffffff'],
  ];
  const w = W / ads.length;
  ads.forEach(([txt, bg, fg], i) => {
    g.fillStyle = bg;
    g.fillRect(i * w, 0, w, H);
    g.fillStyle = fg;
    g.font = 'italic 900 40px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, i * w + w / 2, H / 2 + 2);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function skyTexture() {
  const [c, g] = canvas(16, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#02040d');
  grd.addColorStop(0.35, '#0a1638');
  grd.addColorStop(0.47, '#2a2f6a');
  grd.addColorStop(0.5, '#ff7a3d');
  grd.addColorStop(0.53, '#1a1a2a');
  grd.addColorStop(1, '#05060a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Rounded-rectangle (superellipse) ring around the pitch: [x, z, nx, nz] per point.
function ringPath(hx, hz, n) {
  const pts = [], e = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const x = hx * Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
    const z = hz * Math.sign(s) * Math.pow(Math.abs(s), 2 / e);
    let nx = Math.sign(x) * Math.pow(Math.abs(x / hx), e - 1) / hx;
    let nz = Math.sign(z) * Math.pow(Math.abs(z / hz), e - 1) / hz;
    const l = Math.hypot(nx, nz) || 1;
    pts.push([x, z, nx / l, nz / l]);
  }
  return pts;
}

function bowl(path, inner, outer, y0, y1, tex, repeatLen) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i <= path.length; i++) {
    const p = path[i % path.length];
    if (i > 0) {
      const q = path[i - 1];
      acc += Math.hypot(p[0] - q[0], p[1] - q[1]);
    }
    pos.push(p[0] + p[2] * inner, y0, p[1] + p[3] * inner);
    pos.push(p[0] + p[2] * outer, y1, p[1] + p[3] * outer);
    uv.push(acc / repeatLen, 0, acc / repeatLen, 1);
  }
  for (let i = 0; i < path.length; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, tex);
}

export function buildStadium(scene, quality) {
  const root = new THREE.Group();
  scene.add(root);
  const high = quality === 'high';

  // ---- sky ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  root.add(sky);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x26401f, 1.15);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-30, 60, 40);
  root.add(sun);
  root.add(sun.target);
  const fill = new THREE.DirectionalLight(0xbcd0ff, 0.9);
  fill.position.set(40, 45, -50);
  root.add(fill);
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 10; sc.far = 160;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
  }

  // ---- ground / grass ----
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(126, 88),
    new THREE.MeshLambertMaterial({ map: grassTexture() })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  root.add(grass);
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0x1d4a22 })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  root.add(surround);

  // ---- markings ----
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, polygonOffset: true, polygonOffsetFactor: -2 });
  const LW = 0.12;
  const lines = new THREE.Group();
  root.add(lines);
  const rect = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    lines.add(m);
  };
  const ring = (x, z, r, a0 = 0, al = Math.PI * 2, seg = 64) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - LW / 2, r + LW / 2, seg, 1, a0, al), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    lines.add(m);
  };
  const disc = (x, z, r) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    lines.add(m);
  };
  rect(0, HW, HL * 2 + LW, LW); rect(0, -HW, HL * 2 + LW, LW);
  rect(HL, 0, LW, HW * 2); rect(-HL, 0, LW, HW * 2);
  rect(0, 0, LW, HW * 2);
  ring(0, 0, F.CIRCLE); disc(0, 0, 0.18);
  const arcA = Math.acos((F.BOX_L - F.PEN) / F.CIRCLE);
  for (const s of [1, -1]) {
    const bx = s * (HL - F.BOX_L);
    rect(bx, 0, LW, F.BOX_W * 2);
    rect(s * (HL - F.BOX_L / 2), F.BOX_W, F.BOX_L, LW);
    rect(s * (HL - F.BOX_L / 2), -F.BOX_W, F.BOX_L, LW);
    const sx = s * (HL - F.SIX_L);
    rect(sx, 0, LW, F.SIX_W * 2);
    rect(s * (HL - F.SIX_L / 2), F.SIX_W, F.SIX_L, LW);
    rect(s * (HL - F.SIX_L / 2), -F.SIX_W, F.SIX_L, LW);
    const px = s * (HL - F.PEN);
    disc(px, 0, 0.15);
    // after rotation -PI/2 about x, ring angle theta maps to direction (cos, -sin)
    ring(px, 0, F.CIRCLE, s > 0 ? Math.PI - arcA : -arcA, arcA * 2, 32);
    for (const sz of [1, -1]) {
      // corner arcs
      const cx = s * HL, cz = sz * HW;
      const dirX = -s, dirZ = -sz;
      const a0 = Math.atan2(-dirZ, dirX); // centre angle of the quarter
      ring(cx, cz, 1, a0 - Math.PI / 4, Math.PI / 2, 10);
    }
  }

  // ---- goals ----
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.6 });
  const netMap = netTexture();
  const goals = [];
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    const pr = 0.06;
    const postGeo = new THREE.CylinderGeometry(pr, pr, GH + pr, 12);
    for (const sz of [1, -1]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(s * (HL + pr), (GH + pr) / 2, sz * (GW + pr));
      p.castShadow = true;
      g.add(p);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, GH * 0.9, 6), frameMat);
      back.position.set(s * (HL + GD), GH * 0.45, sz * (GW + pr));
      g.add(back);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, GD, 6), frameMat);
      top.rotation.z = Math.PI / 2;
      top.position.set(s * (HL + GD / 2), GH * 0.9, sz * (GW + pr));
      g.add(top);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, GW * 2 + pr * 4, 12), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(s * (HL + pr), GH + pr, 0);
    bar.castShadow = true;
    g.add(bar);
    const mkNet = (w, h, rep) => {
      const t = netMap.clone();
      t.needsUpdate = true;
      t.repeat.set(w / 0.16, h / 0.16);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 }));
      return m;
    };
    const back = mkNet(GW * 2, GH * 0.9);
    back.rotation.y = Math.PI / 2;
    back.position.set(s * (HL + GD), GH * 0.45, 0);
    g.add(back);
    const roof = mkNet(GD, GW * 2);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(s * (HL + GD / 2), GH * 0.95, 0);
    g.add(roof);
    for (const sz of [1, -1]) {
      const side = mkNet(GD, GH);
      side.position.set(s * (HL + GD / 2), GH / 2, sz * (GW + 0.06));
      g.add(side);
    }
    root.add(g);
    goals.push({ group: g, back });
  }

  // ---- corner flags ----
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xffd21f, side: THREE.DoubleSide });
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), postMat);
    pole.position.set(sx * HL, 0.75, sz * HW);
    root.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), flagMat);
    flag.position.set(sx * HL + 0.2, 1.35, sz * HW);
    root.add(flag);
  }

  // ---- advertising boards (LED, scrolling) ----
  const adTex = adTexture();
  const adMat = new THREE.MeshBasicMaterial({ map: adTex });
  const boards = new THREE.Group();
  const board = (x, z, len, ry, rep) => {
    const t = adMat;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), t);
    m.geometry.attributes.uv.array.forEach((v, i, arr) => { if (i % 2 === 0) arr[i] = v * rep; });
    m.position.set(x, 0.45, z);
    m.rotation.y = ry;
    boards.add(m);
  };
  board(0, -(HW + 4), HL * 2 + 10, 0, 4);
  board(0, HW + 4, HL * 2 + 10, Math.PI, 4);
  for (const s of [1, -1]) {
    board(s * (HL + 4.5), -(HW / 2 + 6), HW - 8, s * Math.PI / 2, 1.2);
    board(s * (HL + 4.5), HW / 2 + 6, HW - 8, s * Math.PI / 2, 1.2);
  }
  root.add(boards);

  // ---- dugouts ----
  const dugMat = new THREE.MeshStandardMaterial({ color: 0x18213a, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.85 });
  for (const s of [1, -1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(9, 1.8, 2), dugMat);
    d.position.set(s * 9, 0.9, HW + 6.5);
    root.add(d);
  }

  // ---- stands (continuous bowl) ----
  const crowdMat = new THREE.MeshLambertMaterial({ map: crowdTexture(), side: THREE.DoubleSide });
  const path = ringPath(HL + 6, HW + 6, 160);
  const lower = bowl(path, 4, 26, 1.2, 15, crowdMat, 26);
  root.add(lower);
  const upperTex = crowdMat.map.clone();
  upperTex.needsUpdate = true;
  upperTex.offset.y = 0.37;
  const upperMat = new THREE.MeshLambertMaterial({ map: upperTex, side: THREE.DoubleSide });
  const upper = bowl(path, 30, 52, 19, 38, upperMat, 30);
  root.add(upper);
  const concreteMat = new THREE.MeshLambertMaterial({ color: 0x2a3042, side: THREE.DoubleSide });
  root.add(bowl(path, 0.5, 4, 1.2, 1.2, concreteMat, 10));  // front walkway
  root.add(bowl(path, 26, 30, 15, 19, concreteMat, 10));    // fascia between tiers
  const bandMat = new THREE.MeshBasicMaterial({ color: 0x1d5cff, side: THREE.DoubleSide });
  root.add(bowl(path, 26.1, 26.2, 15.0, 16.2, bandMat, 10)); // glowing ribbon
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x141826, side: THREE.DoubleSide });
  root.add(bowl(path, 22, 54, 50, 42, roofMat, 10));
  const lightStrip = new THREE.MeshBasicMaterial({ color: 0xfff6dd, side: THREE.DoubleSide });
  root.add(bowl(path, 23, 25, 49.6, 49.3, lightStrip, 10));

  // ---- floodlight glows ----
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 128;
  const gg = glowC.getContext('2d');
  const grd = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,240,1)');
  grd.addColorStop(0.2, 'rgba(255,250,220,0.6)');
  grd.addColorStop(1, 'rgba(255,240,200,0)');
  gg.fillStyle = grd;
  gg.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowC);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 60, 8), roofMat);
    tower.position.set(sx * (HL + 42), 30, sz * (HW + 40));
    root.add(tower);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 1), new THREE.MeshBasicMaterial({ color: 0xfffbe8 }));
    panel.position.set(sx * (HL + 41), 62, sz * (HW + 39));
    panel.lookAt(0, 0, 0);
    root.add(panel);
    const sp = new THREE.Sprite(glowMat);
    sp.scale.set(40, 40, 1);
    sp.position.copy(panel.position);
    root.add(sp);
  }

  scene.fog = new THREE.Fog(0x0a1230, 170, 520);

  let t0 = 0;
  return {
    root, sun, goals,
    update(dt, excitement, focus) {
      t0 += dt;
      adTex.offset.x = (adTex.offset.x + dt * 0.03) % 1;
      // crowd bounce
      const j = excitement > 0.5 ? Math.abs(Math.sin(t0 * 9)) * 0.004 * excitement : Math.sin(t0 * 2) * 0.0005;
      crowdMat.map.offset.y = j;
      upperTex.offset.y = 0.37 + j;
      if (high && focus) {
        sun.position.set(focus.x - 30, 60, focus.z + 40);
        sun.target.position.set(focus.x, 0, focus.z);
      }
    },
  };
}
