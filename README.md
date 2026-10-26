# Superball 27 ⚽

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
| PASS | Ground pass toward the joystick direction | SWITCH player |
| THROUGH | Pass into space / lofted through ball | Hold to PRESS |
| SHOOT | Hold for power, release to shoot (aim with joystick) | TACKLE |
| SKILL | Feint & burst past a defender | SLIDE tackle |
| SPRINT | Hold to sprint | same |

Press PASS/SHOOT while a pass is still travelling to you for a **one-touch pass / first-time shot**.
Keyboard: WASD/arrows, Space pass, K shoot, L through, Shift sprint, E skill, P pause.

## Features
- Jointed, animated players (run, kick, tackle, slide, headers, keeper dives, celebrations), with numbered kits
- Ball physics with spin, bounce, drag, posts, crossbar and net
- Team AI in a 4-3-3: pressing, cover, marking, runs in behind, crosses, keeper positioning and saves
- Corners, throw-ins, goal kicks, kick-offs, half time, full-time stats
- 3 difficulties, 4/6/10 minute matches, 3 camera distances, Smooth/HD graphics
- Floodlit stadium, LED ad boards, crowd and synthesized crowd audio

## Files
`index.html` · `css/style.css` · `js/` (`main` app/camera/HUD, `match` rules + AI, `model` players, `ball`, `stadium`, `input`, `audio`, `config` teams) · `lib/three.module.min.js` (Three.js r170, MIT) · `sw.js` + `manifest.json` (home-screen app).
After changing files, bump `VERSION` in `sw.js` so installed copies update.
