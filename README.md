# Superball 27 ⚽
*by Ontronop Games*

A 3D mobile football game built with plain **HTML + CSS + JavaScript + Three.js**. No build step.
**ZorpFC** (blue) vs **Varcelona** (red), 11 v 11, you against the bots.

## Play on your phone
1. Turn on GitHub Pages: repo **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
2. Open `https://0rderless.github.io/superball27/` on your phone.
3. **iPhone:** Safari → Share → *Add to Home Screen*. **Android:** Chrome menu → *Add to Home screen / Install app*.
   It launches full-screen in landscape like a real app, and works offline after the first load.

## Controls
| | Attack | Defend |
|---|---|---|
| Left thumb | Floating joystick (push to the edge = sprint) | same |
| PASS | Tap = low pass · flick up = high pass | SWITCH player |
| THROUGH | Tap = ground through ball · flick up = lobbed | Hold to PRESS |
| SHOOT | Hold for power, release = low driven shot · flick up while holding = chip | TACKLE |
| SKILL | Tap = step-over · swipe ◀ ▶ = La Croqueta · ▲ = rainbow flick · ▼ = drag-back | SLIDE tackle |
| SPRINT | Hold to sprint (ZorpFC never tire) | same |

Press PASS/SHOOT while a pass is still travelling to you for a **one-touch pass / first-time shot**.
After a goal, tap to skip the replay. Keyboard: WASD/arrows, Space pass / U high pass, K shoot / O chip,
L through / Y lobbed through, Shift sprint, E skill, P pause.

## Features
- Motion-captured players (run, sprint, jockeying, slides, celebrations, stumbles) with football moves layered on top
- Kits, numbers, skin, hair and faces painted in a custom shader — one draw call per player
- Assisted passing that follows the receiver; explicit low/high passes; driven shots and chips; hand-animated skill moves with scripted ball control
- Slow-motion goal replays with cinematic cameras
- 6 cameras (Close, Broadcast, Wide, Tele, Dynamic, Pro end-to-end) — switch from the pause menu
- Ontronop Games studio intro, title loading screen, eFootball-style pre-match screen, settings for gameplay / camera / audio / graphics / controls
- Live spoken commentary (browser speech), crowd chants, air horns, net sounds
- Team AI in a 4-3-3: pressing, jockeying, cover, marking, runs in behind, crosses, keeper positioning and saves
- Corners, throw-ins, goal kicks, kick-offs, half time, full-time stats
- 3 difficulties, 4/6/10 minute matches, 3 camera distances, Smooth/HD graphics, assists on/off

## Credits
- Player model and animations: [Quaternius — Universal Animation Library 1 & 2](https://quaternius.com/packs/universalanimationlibrary.html), CC0 (`assets/LICENSE-Quaternius.txt`). `tools/build-players.mjs` rebuilds `assets/player.glb` from the original packs.
- [Three.js](https://threejs.org) r170 and its GLTFLoader / SkeletonUtils, MIT.

## Files
`index.html` · `css/style.css` · `js/` (`main` app/camera/HUD, `match` rules + AI + replays, `model` players + animation, `commentary`, `ball`, `stadium`, `input`, `audio`, `config` teams) · `lib/three.module.min.js` (Three.js r170, MIT) · `sw.js` + `manifest.json` (home-screen app).
After changing files, bump `VERSION` in `sw.js` so installed copies update.
