# Footstep dribbling — design

Goal: dribbling that feels at least like DLS 26. The ball stays at your feet, every touch
lines up with a foot in the animation, you never lose it on your own, and you can't
run through everyone. Turning feel stays as it is.

User-reported problems: ball drifts away, touches look fake, difficulty is both too easy
and too hard (random losses, and running through defenders).

## 1. Ball control

- **One step clock per player in the simulation** (`p.gait`, 0..1, foot strikes at 0 and 0.5),
  advanced from speed / stride length. `js/model.js` reads this phase instead of keeping its
  own, so the animation and touches never drift apart.
- **Touch on footfall.** When the gait crosses a foot strike and the ball is within reach of
  that foot, the foot touches it: right and left alternate, and the existing touch flick plays
  on the matching leg (currently always the right).
- **Slot targeting.** Between touches the ball rolls freely with friction. Each touch picks a
  velocity so the ball arrives at a slot in front of the *next* foot strike, at the moment of
  that strike. Slot distance: walk 0.4m, jog 0.6m, sprint ~1.0m, scaled by
  `1 - 0.2 * dribbling`.
- **Turns.** Locomotion turning is unchanged. A touch during a direction change aims the slot
  along the new desired direction (inside/outside of the foot). A turn-back uses the
  sole drag-back with a matching pose.
- **Stop.** With no stick input, the next foot strike traps the ball under the sole.
- **No self-loss.** The `dist > 2.6 → looseBall` rule is removed. Possession ends only by
  a tackle, poke, block, collision, pass or shot.

## 2. Winning the ball

- **Exposure.** Every frame the ball has an exposure value: high just after a touch (ball out
  ahead of the foot), low when it's at the feet. Shielding (dribbler's body between defender
  and ball) makes it zero.
- **Poke replaces the random passive steal** in `ballInteractions`. A defender whose foot is
  within ~0.7m of an exposed ball wins it, or pokes it loose.
- **Tackles are about timing.** A tackle succeeds when the ball is exposed during the
  tackle's contact window. Stats widen the reach and window slightly, with a little
  randomness (±10%). A missed tackle leaves the tackler off balance for ~0.5s.
- **Body contact.** Players can't pass through each other. On contact, the stronger player
  (PHY) holds his line and the weaker one is nudged.
- **AI defenders** jockey 1.5–2m away, match the carrier's speed and time their tackle to the
  touch. Difficulty sets their reaction delay and timing error.
- The same rules apply to both teams.

## 3. Testing

Playwright headless scripts (scratchpad) drive the match directly:

- **Jog/sprint:** the ball stays within the slot range, touches land within 1 frame of a foot
  strike, and the ball is never lost over 10s of free running with random stick input.
- **Turns:** 90° cut and turn-back keep the ball.
- **Sprint into a jockeying defender:** the ball is lost most of the time. A cut just before
  contact keeps it most of the time.
- **Full-match soaks** on Amateur/Pro/Legend: no errors, and possession changes come from
  tackles/pokes/interceptions, not loose balls.
- **Screenshot/frame strip** of a dribble to check visually that the foot meets the ball.

## Out of scope

Skill moves, shooting, passing and turning feel stay as they are, except where they read
the new touch state.
