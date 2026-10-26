// Match commentary through the browser's speech synthesiser (works offline on iOS and Android).
// Two voices: a lead commentator and a co-commentator who reacts after the big moments.
// The best-sounding installed voice is picked (Enhanced / Premium / Natural voices first).

// lead lines. {n} player, {k} keeper, {t} opponent club, {s} score line, {m} minute
const LEAD = {
  kickoff: ['And we are under way!', 'ZorpFC against {t}. Here we go!', 'The referee blows, and we are off!', 'Kick off, and what an atmosphere for this one.'],
  secondHalf: ['The second half is under way.', 'Back under way for the second half.', 'Forty five minutes to decide it. Here we go again.'],
  goalHome: [['GOAL!', '{n}!', 'What a finish!'], ['It\'s in!', '{n} scores!'], ['GOAL for ZorpFC!', '{n} with the finish!'], ['Oh, that is magnificent!', '{n}!'], ['He\'s done it!', '{n}!', 'Get in!']],
  goalAway: [['{t} score.', '{n} finds the net.'], ['Oh no.', '{n} puts {t} in front of the cameras.'], ['That\'s a goal for {t}.', '{n} with the finish.']],
  ownGoal: [['Oh dear!', 'It\'s gone in off a defender!'], ['Disaster!', 'An own goal!']],
  score: ['{s}, in the {m} minute.', 'That makes it {s}.', '{s}.'],
  save: ['Great save from {k}!', 'What a stop by {k}!', 'Denied! {k} gets down well.', '{k} says no!', 'Brilliant from {k}!'],
  catch: ['{k} gathers.', 'Comfortable for {k}.', 'Straight into the arms of {k}.'],
  post: ['Off the woodwork!', 'It hits the post!', 'The frame of the goal saves them!'],
  miss: ['Just wide!', 'Inches away!', 'Oh, so close!', 'Dragged wide.', 'Over the bar.'],
  shot: ['{n} shoots!', '{n}!', 'A strike from {n}!', '{n} lets fly!'],
  chip: ['{n} tries the chip!', 'Cheeky from {n}!'],
  tackle: ['Superb tackle.', 'Wins it back cleanly.', 'Great timing on the challenge.', 'Robbed him!'],
  skill: ['Lovely skill from {n}!', 'What a piece of skill!', '{n} leaves his man for dead!', 'Oh, that is gorgeous from {n}!'],
  attack: ['{n}, driving forward.', '{n} into the box!', '{n}, can he find a way through?', 'Here\'s {n}...'],
  corner: ['Corner kick.', 'It\'s a corner.', 'Corner, ZorpFC.'],
  halfTime: ['That\'s half time. {s}.', 'The referee blows for half time. {s}.'],
  fullTimeWin: [['It\'s all over!', 'ZorpFC win it!', '{s}.'], ['Full time!', 'A brilliant win for ZorpFC.']],
  fullTimeLose: [['Full time.', '{t} take the win.', '{s}.'], ['It\'s over.', 'A night to forget for ZorpFC.']],
  fullTimeDraw: [['Full time,', 'and the points are shared.', '{s}.'], ['All square at the final whistle.']],
  replay: ['Let\'s see that again.', 'Here\'s the replay.', 'Have another look at this.'],
};

// the co-commentator's reaction a moment later (not every time)
const CO = {
  goalHome: ['Look at the composure there. Picks his spot, and the keeper has no chance.', 'That\'s what top players do. One chance, and it\'s in the back of the net.', 'Oh, I love that. Absolutely no hesitation.', 'The movement to create that was superb.'],
  goalAway: ['That\'s poor defending, if I\'m honest. Far too much space.', 'ZorpFC will be disappointed with that. Nobody tracked the run.', 'You can\'t give a player of that quality that much time.'],
  save: ['Top drawer goalkeeping, that.', 'He had no right to get to that one.', 'Fantastic reflexes.'],
  miss: ['He\'ll feel he should have hit the target there.', 'Good chance, that. He\'ll want it back.', 'So close. The keeper was beaten.'],
  post: ['The width of the post away from a goal!', 'Unlucky. That deserved to go in.'],
  skill: ['The defender just didn\'t know where he was!', 'You pay to watch players like that.'],
  tackle: ['Perfectly timed. Got the ball, nothing else.'],
};

const PRIORITY_CO_CHANCE = { goalHome: 0.8, goalAway: 0.6, save: 0.4, miss: 0.35, post: 0.6, skill: 0.25, tackle: 0.15 };

// score a voice: natural / enhanced voices sound far less robotic
function scoreVoice(v) {
  let s = 0;
  if (/^en/i.test(v.lang)) s += 10; else return -1;
  if (/en-GB/i.test(v.lang)) s += 4;
  if (/natural|neural|enhanced|premium|online/i.test(v.name)) s += 8;
  if (/google uk english male|daniel|arthur|ryan|george|oliver|thomas|james/i.test(v.name)) s += 5;
  if (/google/i.test(v.name)) s += 2;
  if (/female|samantha|karen|moira|tessa|zira|susan|hazel|libby|sonia/i.test(v.name)) s -= 2;
  if (/compact|novelty|whisper|bad news|bells|boing|bubbles|cellos|zarvox|trinoids|albert|fred|junior|ralph/i.test(v.name)) s -= 30;
  return s;
}

export class Commentary {
  constructor() {
    this.enabled = true;
    this.synth = window.speechSynthesis || null;
    this.lead = null;
    this.co = null;
    this.queue = [];
    this.speaking = false;
    this.curPriority = 0;
    this.recent = {};
    this.lastSaid = 0;
    if (this.synth) {
      const choose = () => {
        const vs = this.synth.getVoices().map(v => ({ v, s: scoreVoice(v) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s);
        this.lead = vs[0] ? vs[0].v : null;
        // a different voice for the co-commentator if there is one
        const other = vs.find(x => x.v !== this.lead && x.v.name !== (this.lead && this.lead.name));
        this.co = other ? other.v : this.lead;
      };
      choose();
      if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', choose);
    }
  }

  // iOS only allows speech after a user gesture: call from a tap handler
  unlock() {
    if (!this.synth) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; this.synth.speak(u); } catch (_) { /* ignore */ }
  }

  // pick a line without repeating the last couple used for this key
  pick(table, key) {
    const opts = table[key];
    if (!opts) return null;
    const used = this.recent[key] || (this.recent[key] = []);
    const fresh = opts.map((o, i) => i).filter(i => !used.includes(i));
    const i = (fresh.length ? fresh : opts.map((o, j) => j))[(Math.random() * (fresh.length || opts.length)) | 0];
    used.push(i); if (used.length > Math.min(2, opts.length - 1)) used.shift();
    return opts[i];
  }

  // priority: 1 = colour, 2 = notable, 3 = must say (goals, results)
  say(key, vars = {}, priority = 1) {
    if (!this.enabled || !this.synth) return;
    const now = performance.now();
    if (this.speaking && priority <= this.curPriority) return;
    if (priority === 1 && now - this.lastSaid < 2500) return; // don't chatter over the game
    let line = this.pick(LEAD, key);
    if (!line) return;
    const fill = t => t.replace(/\{(\w)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
    const parts = (Array.isArray(line) ? line : [line]).map(fill);
    if (priority >= 2 || this.speaking) this.stop();
    const hype = key === 'goalHome' || key === 'ownGoal' ? 2 : key === 'goalAway' ? 0.5 : priority >= 2 ? 1 : 0;
    // goals come out in excited bursts, rising
    parts.forEach((t, i) => this.queue.push({ t, voice: 'lead', rate: 1.0 + hype * 0.07 + (i === 0 ? hype * 0.05 : 0), pitch: 1 + hype * 0.12 - i * 0.04, gap: 120 }));
    if ((key === 'goalHome' || key === 'goalAway' || key === 'ownGoal') && vars.s) this.queue.push({ t: fill(this.pick(LEAD, 'score')), voice: 'lead', rate: 1.0, pitch: 1.0, gap: 350 });
    if (Math.random() < (PRIORITY_CO_CHANCE[key] || 0)) {
      const c = this.pick(CO, key === 'ownGoal' ? 'goalAway' : key);
      if (c) this.queue.push({ t: fill(c), voice: 'co', rate: 0.98, pitch: 0.9, gap: 700 });
    }
    this.curPriority = priority;
    this.lastSaid = now;
    if (!this.speaking) this.next();
  }

  next() {
    const item = this.queue.shift();
    if (!item) { this.speaking = false; this.curPriority = 0; return; }
    this.speaking = true;
    const gen = this.gen = (this.gen || 0) + 1;
    const go = () => {
      if (gen !== this.gen) return;
      const u = new SpeechSynthesisUtterance(item.t);
      const v = item.voice === 'co' ? this.co : this.lead;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
      u.rate = item.rate; u.pitch = item.pitch; u.volume = 1;
      u.onend = u.onerror = () => { if (gen === this.gen) this.next(); };
      try { this.synth.speak(u); } catch (_) { this.next(); }
    };
    this._gapT = setTimeout(go, item.gap || 0);
  }

  stop() {
    this.gen = (this.gen || 0) + 1; // callbacks from cancelled lines are ignored
    this.queue.length = 0;
    clearTimeout(this._gapT);
    if (this.synth) this.synth.cancel();
    this.speaking = false;
    this.curPriority = 0;
  }
}
