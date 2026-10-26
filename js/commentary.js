// Match commentary through the browser's speech synthesiser (works on iOS and Android, no downloads).
const pick = a => a[(Math.random() * a.length) | 0];

const LINES = {
  kickoff: ['And we are under way here at Superball Stadium!', 'ZorpFC against {t}, the referee gets us started.', 'Kick off! Big atmosphere tonight.'],
  secondHalf: ['The second half is under way.', 'Here we go again, forty five minutes to play.'],
  goalHome: ['GOAL! {n} scores for ZorpFC!', 'What a finish from {n}! ZorpFC score!', 'It\'s in! {n}! The home fans go wild!', 'GOAL! Unstoppable from {n}!'],
  goalAway: ['{t} score. {n} finds the net.', 'Oh no, {n} scores for {t}.', 'Goal for {t}, {n} with the finish.'],
  ownGoal: ['Oh dear, that is an own goal!', 'Disaster! It goes in off a defender!'],
  save: ['Great save!', 'What a stop from the keeper!', 'Denied! Brilliant goalkeeping.', 'The keeper gets down well to that one.'],
  catch: ['Comfortable for the keeper.', 'Straight into the gloves.', 'The goalkeeper gathers it.'],
  post: ['Off the woodwork!', 'It hits the post! So close!', 'The frame of the goal comes to the rescue!'],
  miss: ['Just wide!', 'Inches away!', 'Oh, that was so close!', 'Dragged wide of the post.'],
  shot: ['{n} shoots!', 'A strike from {n}!', '{n} has a go!'],
  chip: ['Cheeky chip from {n}!', 'He tries the chip!'],
  tackle: ['Great tackle!', 'Superbly timed challenge.', 'Wins it back cleanly.'],
  skill: ['Lovely skill from {n}!', 'What a piece of skill!', '{n} leaves his man for dead!', 'Oh, the rainbow flick!'],
  corner: ['Corner kick.', 'It\'s a corner.'],
  halfTime: ['That\'s half time. {s}.', 'The referee blows for half time. {s}.'],
  fullTimeWin: ['Full time! ZorpFC win it! {s}.', 'It\'s all over, and ZorpFC take the victory!'],
  fullTimeLose: ['Full time. {t} take the win. {s}.', 'It\'s over, and it\'s {t}\'s night.'],
  fullTimeDraw: ['Full time, and the points are shared. {s}.', 'All square at the final whistle.'],
  replay: ['Let\'s see that again.', 'Here\'s the replay.', 'Take another look at this.'],
  pressure: ['ZorpFC are knocking on the door.', 'The pressure is building now.'],
};

export class Commentary {
  constructor() {
    this.enabled = true;
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    this.busyUntil = 0;
    this.lastPriority = 0;
    if (this.synth) {
      const choose = () => {
        const vs = this.synth.getVoices();
        this.voice = vs.find(v => /en-GB/i.test(v.lang) && /male|daniel|arthur|george|google uk english male/i.test(v.name))
          || vs.find(v => /en-GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
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

  // priority: 1 = colour, 2 = notable, 3 = must say (goals, results)
  say(key, vars = {}, priority = 1) {
    if (!this.enabled || !this.synth || !LINES[key]) return;
    const now = performance.now();
    const speaking = now < this.busyUntil;
    if (speaking && priority <= this.lastPriority) return;
    if (speaking) this.synth.cancel();
    let text = pick(LINES[key]);
    for (const k in vars) text = text.replace('{' + k + '}', vars[k]);
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice ? this.voice.lang : 'en-GB';
    u.rate = priority >= 3 ? 1.12 : 1.05;
    u.pitch = priority >= 3 ? 1.08 : 0.95;
    u.volume = 1;
    this.busyUntil = now + 600 + text.length * 70;
    this.lastPriority = priority;
    u.onend = () => { this.busyUntil = 0; this.lastPriority = 0; };
    try { this.synth.speak(u); } catch (_) { /* ignore */ }
  }

  stop() { if (this.synth) this.synth.cancel(); this.busyUntil = 0; }
}
