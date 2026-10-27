// Goal celebrations. 'clip' ones play a motion-captured clip; the rest are posed in model.js.
export const CELEBS = [
  { key: 'siu', name: 'Siu', icon: '🦘', run: 0.9, dur: 2.6 },
  { key: 'slide', name: 'Knee slide', icon: '🧎', run: 1.1, dur: 2.4 },
  { key: 'backflip', name: 'Backflip', icon: '🤸', run: 0.8, dur: 2.2, clip: 'BackFlip' },
  { key: 'cold', name: 'Cold', icon: '🥶', run: 0.8, dur: 2.6, clip: 'Idle_FoldArms_Loop' },
  { key: 'dance', name: 'Dance', icon: '🕺', run: 0.8, dur: 2.6, clip: 'Dance_Loop' },
  { key: 'aeroplane', name: 'Aeroplane', icon: '✈️', run: 3.0, dur: 0 },
];
export const CELEB = Object.fromEntries(CELEBS.map(c => [c.key, c]));

// 'random' (or anything unknown) picks one; rnd ∈ [0, 1)
export function pickCeleb(choice, rnd = Math.random()) {
  if (CELEB[choice]) return choice;
  return CELEBS[Math.min(CELEBS.length - 1, Math.floor(rnd * CELEBS.length))].key;
}

// how long the goal phase lasts before the replay: run-up + routine, never shorter than before
export function celebLength(key) {
  const c = CELEB[key];
  return c ? Math.min(6, Math.max(3.4, c.run + c.dur + 0.4)) : 3.4;
}
