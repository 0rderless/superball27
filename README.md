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
| SHOOT | Hold for power and release · while holding swipe ▲ chip · ▼ low driven (aim with joystick) · ▶ power shot · ◀ fake shot | TACKLE |
| SKILL | Tap = step-over · swipe ◀ ▶ = La Croqueta · ▲ = rainbow flick · ▼ = drag-back | SLIDE tackle |
| SPRINT | Hold to sprint (ZorpFC never tire) | Hold with no joystick = defence assist (shadows the ball carrier) |

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
- Footstep dribbling: every touch happens when a foot lands, in time with the running animation. Each touch rolls the ball out (about 0.5m jogging, about 1m sprinting) and back to a later footfall. A sharp cut is a short touch into the turn; a turn-back plants the sole and drags it round; let go of the stick and the next step traps it. You never lose the ball on your own: if it gets away, the player goes back for it
- Fair ball-winning: defenders can only nick the ball when it's out away from the dribbler's feet, shielding protects it, and dribbling straight into a defender gets it blocked. Tackles are about timing, a missed tackle leaves the defender off balance, and the stronger player wins shoulder-to-shoulder contact
- Momentum-based movement: players accelerate, brake and plant to change direction instead of spinning on the spot
- 7 formations (4-3-3, 4-4-2, 4-2-3-1, 4-1-2-1-2, 3-5-2, 3-4-3, 5-3-2) for you and every club, with out-of-position penalties
- Pre-match line-ups on a pitch showing both formations, then a walk-out with both teams lined up at the halfway line
- Team AI: pressing (contain, then step in), jockeying, tackles timed by difficulty, dribblers who cut away from a challenge, cover, marking, runs in behind, crosses, keeper positioning and saves. Defenders hold a line and step up instead of camping in the box, and only block shots that hit them
- Corners, throw-ins, goal kicks, kick-offs, half time, full-time stats
- 5 difficulties (Beginner to Legend), 4/6/10 minute matches, 3 camera distances, Smooth/HD graphics, assists on/off

## Matchmaking
Find Match pairs you against one of 11 AI clubs — Real Madrid, Manchester City, Bayern Munich, Liverpool, PSG, Arsenal, Inter Milan, Chelsea, Juventus, AC Milan, Manchester United — using their real names and kit colours (crests are generic shields; squads are generated). Stronger clubs play harder. Five difficulties: Beginner, Amateur, Pro, Elite, Legend.

## Squad, shop & progression
- **Squad**: drag-free tap-to-swap on the pitch in your chosen formation; reserves bench; FC-style player cards with tiers (bronze/silver/gold/rare/icon/superstar).
- **Stars**: Ronaldo (ST, 99) and Germain Silver (LW, 99) start for ZorpFC.
- **Shop**: 17 players to sign with coins; daily 750-coin reward.
- **Attribute upgrades**: train Pace, Shooting, Passing, Dribbling, Defending, Physical (or Goalkeeping) individually, up to +10 each.
- **Coins**: earned every match (win/draw, goals, clean sheet; Legend pays 1.5x). Progress is saved on the device.

## Tests
- `node --test tests/*.test.mjs`: unit tests for the dribbling maths (`js/dribble.js`)
- With the site served on port 8127 (`python3 -m http.server 8127`), run the in-game Playwright checks: `node tests/e2e/gait.e2e.mjs`, `dribble.e2e.mjs`, `duel.e2e.mjs`, `defend.e2e.mjs`, `soak.e2e.mjs` (full matches), and `framestrip.mjs` (writes `tests/e2e/out/strip.png` for a visual check)

## Credits
- Player model and animations: [Quaternius — Universal Animation Library 1 & 2](https://quaternius.com/packs/universalanimationlibrary.html), CC0 (`assets/LICENSE-Quaternius.txt`). `tools/build-players.mjs` rebuilds `assets/player.glb` from the original packs.
- [Three.js](https://threejs.org) r170 and its GLTFLoader / SkeletonUtils, MIT.

## Files
`index.html` · `css/style.css` · `js/` (`main` app/camera/HUD, `match` rules + AI + replays, `model` players + animation, `commentary`, `ball`, `stadium`, `input`, `audio`, `config` teams) · `lib/three.module.min.js` (Three.js r170, MIT) · `sw.js` + `manifest.json` (home-screen app).
After changing files, bump `VERSION` in `sw.js` so installed copies update.
