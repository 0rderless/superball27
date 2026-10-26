// Prints the gait phase at which each foot lands in the forward locomotion clips of
// assets/player.glb, so js/dribble.js STRIKES matches the animation.
// Needs the site served at http://localhost:8127 (python3 -m http.server 8127).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8127/index.html');
const out = await page.evaluate(async () => {
  const THREE = await import('./lib/three.module.min.js');
  const { GLTFLoader } = await import('./lib/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync('./assets/player.glb');
  const res = {};
  for (const name of ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop']) {
    const clip = gltf.animations.find(c => c.name === name);
    if (!clip) continue;
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const act = mixer.clipAction(clip); act.play(); act.timeScale = 0;
    const foot = { R: gltf.scene.getObjectByName('foot_r'), L: gltf.scene.getObjectByName('foot_l') };
    const N = 80, ys = { R: [], L: [] }, v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      act.time = i / N * clip.duration; mixer.update(0); gltf.scene.updateMatrixWorld(true);
      for (const k of ['R', 'L']) ys[k].push(foot[k].getWorldPosition(v).y);
    }
    // a footfall = the foot arriving at its lowest height: the first sample within 1 cm of the
    // minimum after a stretch of being higher
    const strike = k => {
      const y = ys[k], lo = Math.min(...y);
      for (let i = 0; i < N; i++) if (y[i] - lo < 0.01 && y[(i - 1 + N) % N] - lo >= 0.01) return +(i / N).toFixed(3);
      return null;
    };
    res[name] = { R: strike('R'), L: strike('L') };
  }
  return res;
});
console.log(JSON.stringify(out));
await browser.close();
