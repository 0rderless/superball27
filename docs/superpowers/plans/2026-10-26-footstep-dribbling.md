# Footstep Dribbling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace timer-based, loose-ball dribbling with touches on footsteps, slot-targeted ball control and exposure-based (fair) ball winning.

**Architecture:** The new pure module `js/dribble.js` (no imports; plain `{x, z}` objects) owns the maths: gait clock, slot distance, touch planning, exposure and tackle outcome. It's unit-tested with `node --test`. `js/match.js` calls it from `dribble()`, `ballInteractions()` and `resolveTackle()`, and `js/model.js` reads the simulation's gait phase so animation and touches share one clock. Behaviour in the real game is checked by Playwright scripts in `tests/e2e/`.

**Tech Stack:** Vanilla ES modules, Three.js r170 (vendored), Node 18+ `node:test`, Playwright (pre-installed) against `python3 -m http.server 8127`.

**Spec:** `docs/superpowers/specs/2026-10-26-footstep-dribbling-design.md`

## Global Constraints

- Slot distance: walk 0.4m, jog 0.6m, sprint ~1.0m, multiplied by `1 - 0.2 * dribbling` (`st.dri`, 0..1).
- Foot strikes happen twice per gait cycle. Touches happen only on a strike, never on a timer.
- No self-loss: possession ends only by a tackle, poke, block, collision, pass or shot.
- Poke reach ~0.7m from the defender's foot. Missed tackle: tackler off balance ~0.5s. Stat randomness ±10%.
- AI jockey distance 1.5–2m. Difficulty sets the AI's reaction delay and timing error (`DIFFICULTY[*].react`).
- Turning feel (`locomote`) is unchanged. Skills, shooting and passing are unchanged except where they read touch state.
- Relative imports only, no build step, and the game must run from a static server (GitHub Pages).
- Bump `sw.js` `VERSION` when shipping.

## Review Focus

1. **Frame-rate spikes on phones (dt up to 0.1s):** a strike that falls inside a long frame must still fire, and fire once. Test in Task 1 (`advanceGait` with dt 0.1).
2. **Standing still with the ball (speed ≈ 0, gait not advancing):** the ball must stay under the sole, not drift or freeze away from the feet. Test in Task 3 (`idle keeps ball`).
3. **Fast pass reception (ball arriving at 15–20 m/s):** the first touch must leave the ball within reach and never loose. Test in Task 3 (`fast reception`).
4. **Restart taker / shot wind-up / skill move:** the existing branches that hold the ball still or draw it to the kicking foot must still run before footstep logic. Test in Task 3 (`windup draws ball`).
5. **Gait phase drives animation even when the player doesn't own the ball:** off-ball runners must still animate smoothly from `p.a.gait`. Covered by the frame strip in Task 6 (check off-ball legs too).

---

### Task 1: Pure dribble core (gait clock, slot, touch plan)

**Files:**
- Create: `js/dribble.js`
- Create: `tests/dribble.test.mjs`

**Interfaces:**
- Produces:
  - `export const STRIKES = [0, 0.5]` (gait phases at which a foot lands; index 0 = right, 1 = left; Task 2 may recalibrate the values)
  - `export const ROLL_DECEL = 2.0` (m/s², constant ball deceleration while dribbled)
  - `export function strideLength(sp: number): number` (metres per full gait cycle; walk 1.9 @ ≤2 m/s, jog 3.6 @ 5.5, sprint 5.4 @ ≥8.5, linear between)
  - `export function advanceGait(phase: number, sp: number, dt: number): { phase: number, strike: 'R'|'L'|null }` (phase advances by `dt * sp / strideLength(sp)`, wraps to [0, 1); reports the *last* strike crossed this frame; `sp < 0.15` → no advance)
  - `export function timeToNextStrike(phase: number, sp: number): number` (seconds; `Infinity` when `sp < 0.15`)
  - `export function slotDistance(sp: number, dri: number): number`
  - `export function planTouch(o: { ball: {x,z}, pos: {x,z}, vel: {x,z}, dir: {x,z}, sp: number, dri: number, T: number }): { x: number, z: number }` (ball velocity such that, under `ROLL_DECEL`, the ball reaches `pos + vel*T + dir*slotDistance(sp, dri)` after `T` seconds; `dir` is the unit desired direction; T clamped to ≥ 0.12)

- [ ] **Step 1: Write the failing tests** in `tests/dribble.test.mjs` (`node:test` + `node:assert`):
  - `strideLength`: `strideLength(2)===1.9`, `strideLength(5.5)===3.6`, `strideLength(9)===5.4`, monotonic between them.
  - `advanceGait basic`: from phase 0.45, sp 5.5, dt 0.05 → `strike === 'L'`, phase ≈ 0.45 + 0.05*5.5/3.6.
  - `advanceGait big dt` (Review Focus 1): from phase 0.9, sp 9, dt 0.1 → phase wraps past 0, `strike === 'R'`. From phase 0.4, sp 9, dt 0.1 → `'L'`. Over 600 steps of dt 1/60 at sp 5.5, the strike count equals `2 * floor(total cycles)` ±1.
  - `advanceGait idle`: sp 0.1 → phase unchanged, strike null.
  - `slotDistance`: `(1.5,0)≈0.4`, `(5.5,0)≈0.6`, `(8.5,0)≈1.0`, `(5.5,1)≈0.48`.
  - `planTouch lands on slot`: simulate the returned velocity with `ROLL_DECEL` for T and assert the end point is within 0.05m of the slot, for (sp 5.5, T 0.33) and (sp 8.5, T 0.3, dir rotated 60°).
- [ ] **Step 2: Run to verify they fail.** `node --test tests/` → FAIL (module not found).
- [ ] **Step 3: Implement `js/dribble.js`** with the interfaces above. `planTouch` uses `v = (d + 0.5*ROLL_DECEL*T²)/T` along the vector to the slot (if the result would need the ball to stop before T, cap at `d/T*2` and let it settle).
- [ ] **Step 4: Run tests.** `node --test tests/` → all PASS.
- [ ] **Step 5: Commit** `feat: pure footstep dribble core`.

### Task 2: One gait clock for simulation and animation

**Files:**
- Create: `tools/measure-strikes.mjs`
- Modify: `js/match.js` `animate()` (~line 2462: replace `a.phase += …` with `advanceGait`; store `a.gait`, `a.strike`)
- Modify: `js/model.js` `animateModel` (~line 372: use `a.gait` instead of `m.phase`; touch flick at ~line 444 uses `a.touchFoot` 'L'|'R' to pick `thigh_l/calf_l/foot_l` or `_r`)
- Modify: `js/dribble.js` (`STRIKES` values from measurement)

**Interfaces:**
- Consumes: `advanceGait`, `STRIKES` (Task 1)
- Produces: `p.a.gait: number`, `p.a.strike: 'R'|'L'|null` (set each sim frame, before `dribble()` reads it), `p.a.touchFoot: 'R'|'L'`.

- [ ] **Step 1: Measure.** `tools/measure-strikes.mjs` loads `assets/player.glb` in Playwright, samples `Jog_Fwd_Loop` and `Sprint_Loop` at 40 phases and prints the phase where each `foot_r` / `foot_l` world Y is lowest and moving backward. Run: `node tools/measure-strikes.mjs` → prints e.g. `R 0.0x L 0.5x` for both clips (they must agree within 0.05; if not, use the average).
- [ ] **Step 2: Write `STRIKES`** into `js/dribble.js` from the output. Re-run `node --test tests/` → PASS (adjust the Task 1 tests that hard-code 0/0.5 to read `STRIKES`).
- [ ] **Step 3: Move the gait to the simulation.** Since `match.update` runs before `animate`, compute the gait in `update` per player (`p.a.gait`, `p.a.strike`). `animateModel` sets `act.time = a.gait * duration` and stops advancing `m.phase`.
- [ ] **Step 4: Verify in-game.** Playwright: start a match, `__sb27.match.home.players[9]` jogging for 3s. Assert `a.gait` changes and the count of `a.strike` events is 2 per `strideLength/sp` seconds ±1. Take a screenshot; legs animate (not frozen).
- [ ] **Step 5: Commit** `feat: shared gait clock drives animation`.

### Task 3: Footstep touches in `dribble()`

**Files:**
- Modify: `js/match.js` `dribble(o, dt)` (line ~1187) and `looseBall` callers
- Create: `tests/e2e/harness.mjs`, `tests/e2e/dribble.e2e.mjs`

**Interfaces:**
- Consumes: `planTouch`, `timeToNextStrike`, `slotDistance`, `ROLL_DECEL` (Task 1); `p.a.strike`, `p.a.gait` (Task 2)
- Produces: `o.drib = { v: V3, lastTouchT: number, drag: boolean, plant: number }` (`lastTouchT` = sim time of the last touch; Task 4 reads it); sets `o.a.touchT = 0` and `o.a.touchFoot` on each touch.
- `tests/e2e/harness.mjs` exports `async function openMatch({ difficulty = 'pro' } = {}): Promise<{ page, browser }>` (boots to `state === 'game'` with `__sb27.skipBoot/startGame/skipIntro`), and `isolateSnippet` (a string of JS defining `iso(c)` that moves everyone but `c` far away, as in the scratchpad `drib2.js`).

- [ ] **Step 1: Write the failing e2e** `tests/e2e/dribble.e2e.mjs` (exits non-zero on failure), with these cases:
  - `jog`: 4s of stick held. The ball's distance ahead of the body stays in [0.25, 0.9] after the first second. Every touch frame has `a.strike !== null`.
  - `sprint`: ahead in [0.5, 1.5].
  - `random stick 10s` (no defenders): owner never changes.
  - `cut90` and `turn-back` at sprint: ball kept.
  - `idle keeps ball` (Review Focus 2): stop the stick for 3s; ball within 0.55m of the body throughout.
  - `fast reception` (Review Focus 3): fire a ground pass at 18 m/s to an isolated player; after `gainBall`, owner kept for 2s.
  - `windup draws ball` (Review Focus 4): call `match.shoot(c, 0.8, null)` while dribbling; the ball is within 0.6m of the kicking foot at release.
  Run: `node tests/e2e/dribble.e2e.mjs` → FAIL (touches don't line up with strikes; random-stick loses the ball).
- [ ] **Step 2: Rewrite `dribble()`.**
  - Keep the restart-taker branch and the `pending`/skill wind-up branch as they are.
  - Keep the drag-back and plant (`D.plant`) branches; the plant now starts on a strike.
  - Remove the `dist > 2.6 → looseBall` self-loss and the timer (`D.cd`) touches.
  - On `o.a.strike` with the ball in reach (`dist < slotDistance + 0.45`, not behind the body by more than 0.3m), set `D.v = planTouch({... dir: desired direction or heading, T: timeToNextStrike(...)})` and set `touchFoot = strike`.
  - With no stick input, a strike traps the ball: target the slot at 0.3m in front with velocity = player velocity.
  - Between strikes, the ball rolls with `ROLL_DECEL`.
  - Keep the shin-collision rule.
  - First touch (`!o.drib`) also uses `planTouch` toward the slot.
- [ ] **Step 3: Run** `node tests/e2e/dribble.e2e.mjs` → all PASS. Tune slot reach / plant only within the Global Constraints values.
- [ ] **Step 4: Commit** `feat: touches on footsteps with slot targeting`.

### Task 4: Exposure, pokes and timed tackles

**Files:**
- Modify: `js/dribble.js` (add the two functions below), `tests/dribble.test.mjs`
- Modify: `js/match.js` `ballInteractions()` owner branch (~line 1370; replaces the random `rate` steal), `resolveTackle()` (~line 1090)
- Modify: `tests/e2e/dribble.e2e.mjs` (two duel cases)

**Interfaces:**
- Consumes: `o.drib.lastTouchT`, `slotDistance` (Task 1, Task 3)
- Produces:
  - `export function exposure(o: { ball: {x,z}, body: {x,z}, heading: {x,z}, defender: {x,z}, sp: number }): number` (0..1). It's 0 when the ball is within 0.35m of the body, rising to 1 at 1.1m; multiplied by 0 when the attacker's body lies between defender and ball (shield: angle defender→body vs body→ball < 60°).
  - `export function tackleOutcome(o: { exposure: number, def: number, dri: number, phy: number, slide: boolean, rnd: number }): 'win'|'loose'|'miss'`. `rnd` in [0, 1) is passed in for tests. Score = exposure + 0.15*(def − dri) + (slide ? 0.1 : 0) + (rnd − 0.5)*0.2. Score ≥ 0.55 → 'win' (if phy-adjusted roll keeps it, else 'loose'), ≥ 0.35 → 'loose', else 'miss'.

- [ ] **Step 1: Write failing unit tests**:
  - `exposure`: ball at the body 0.2m → 0. Ball 1.0m ahead with the defender in front → > 0.8. Same ball with the defender directly behind the attacker → 0.
  - `tackleOutcome`: (exp 0.9, def 0.8, dri 0.8, rnd 0.5) → 'win'. (exp 0.05, rnd 0.5) → 'miss'. (exp 0.4) → 'loose'.
- [ ] **Step 2: Write failing e2e duels** in `dribble.e2e.mjs`, with 20 trials each:
  - `sprint straight at jockeying CB`: the attacker loses the ball in ≥ 12 of 20.
  - `cut 2m before contact`: keeps it in ≥ 12 of 20.
  Run → FAIL.
- [ ] **Step 3: Implement.**
  - **ballInteractions:** for each defender whose foot (`pos + fwd*0.4`) is within 0.7m of the ball and has `exposure > 0.5`, the defender pokes. Use `tackleOutcome` with `slide: false`. 'win' → `gainBall(d)`, 'loose' → ball knocked 3–5 m/s away from the attacker.
  - **resolveTackle:** replace the `chance` dice with `tackleOutcome`. On 'miss', set `p.stun = 0.5` (off balance) and play `a.hitT`.
- [ ] **Step 4: Run** `node --test tests/` and `node tests/e2e/dribble.e2e.mjs` → PASS.
- [ ] **Step 5: Commit** `feat: exposure-based pokes and timed tackles`.

### Task 5: Body contact by strength, AI jockey and tackle timing

**Files:**
- Modify: `js/match.js` separation (~line 2395), presser branch in `teamAI` (~line 1870), AI tackle triggers (~lines 1867, 1880)
- Modify: `tests/e2e/dribble.e2e.mjs`

**Interfaces:**
- Consumes: `exposure` (Task 4), `this.diff.react`
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write failing e2e:**
  - `contact`: a 0.9 PHY attacker vs a 0.5 PHY defender, walking into each other. The defender is displaced more than twice as far as the attacker.
  - `AI times tackles`: over 20 Legend duels, ≥ 70% of AI tackle starts happen within 0.15s after an attacker touch. On Beginner it's ≤ 50%.
  Run → FAIL.
- [ ] **Step 2: Implement.**
  - **Separation:** push weights ∝ the other player's `st.phy`. The ball owner is no longer special-cased.
  - **Presser:** stands off at 1.5–2m and matches the carrier's velocity.
  - **AI tackle trigger:** when `exposure` toward the presser > 0.5, it starts a tackle after a delay of `diff.react * rand(0.6, 1.2)`. Remove the random per-second tackle rolls.
- [ ] **Step 3: Run** the e2e → PASS.
- [ ] **Step 4: Soak.** Add `tests/e2e/soak.e2e.mjs`, ported from the scratchpad `soak3.js`/`soak5.js`. It runs 7 minutes on Amateur, Pro and Legend. It asserts no page errors, no stall > 6s, and that "loose" possession changes are fewer than 15% of all changes. Run → PASS, and print the scores.
- [ ] **Step 5: Commit** `feat: strength contact and timed AI tackles`.

### Task 6: Visual check, docs, ship

**Files:**
- Create: `tests/e2e/framestrip.mjs`
- Modify: `README.md` (Features: dribbling bullets), `sw.js` (`VERSION` → `sb27-v13`)

- [ ] **Step 1:** `framestrip.mjs` films a close camera on a jogging dribbler for 1s (12 frames) and an off-ball runner. It saves `tests/e2e/out/strip.png`. Check by eye that the touching foot meets the ball on touch frames and the off-ball legs animate (Review Focus 5).
- [ ] **Step 2:** Update the README and bump `sw.js`.
- [ ] **Step 3:** Run `node --test tests/`, all three e2e scripts, and `node --check js/*.js` → all pass.
- [ ] **Step 4: Commit and push** `feat: footstep dribbling` to `main`.
