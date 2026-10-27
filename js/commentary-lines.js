// Commentary script. Every line is a list of parts that are played back to back:
//   plain text      a recorded phrase (lead voice; CO lines use the co-commentator)
//   '@n' / '@n!'    the player's name, calm / excited       '@k' / '@k!'  the keeper's name
//   '@sc'           the score ("It's two-one to ZorpFC")
//   '{t}' in text   the opponent club (recorded once per club)
// tools/voice-list.mjs reads this file to know which clips to record (tools/gen-voice.py).

export const LEAD = {
  kickoff: [['And we are under way!'], ['Here we go!'], ['The referee gets us started.'], ['Kick off, and what an atmosphere tonight!']],
  secondHalf: [['The second half is under way.'], ['Here we go again. Second half.']],
  goalHome: [['GOAL!', '@n!'], ["It's in!", '@n!'], ['What a finish!', '@n!'], ["GOAL! He's done it!", '@n!'], ['Oh, that is magnificent!', '@n!'], ['GOAL for ZorpFC!', '@n!'], ['GOAL for ZorpFC!', 'What a finish!'], ['GOAL!', 'Oh, that is magnificent!']],
  goalAway: [['{t} score.', '@n.'], ["Oh no. That's a goal for {t}."], ['{t} have scored.', 'The finish from', '@n.']],
  ownGoal: [["Oh dear! It's an own goal!"], ['Disaster! It goes in off a defender!']],
  score: [['@sc']],
  save: [['Great save!', '@k!'], ['What a stop!'], ['Denied!', 'Brilliant from', '@k!'], ['Brilliant goalkeeping!'], ['@k', 'says no!']],
  catch: [['@k', 'gathers.'], ['Comfortable for the keeper.'], ['Straight into the gloves.']],
  post: [['Off the woodwork!'], ['It hits the post!'], ['The frame of the goal saves them!']],
  miss: [['Just wide!'], ['Inches away!'], ['Oh, so close!'], ['Dragged wide.'], ['Over the bar.']],
  shot: [['@n', 'shoots!'], ['@n', 'has a go!'], ['@n', 'lets fly!']],
  chip: [['@n', 'tries the chip!'], ['Cheeky chip!']],
  tackle: [['Superb tackle.'], ['Wins it back cleanly.'], ['Great timing on the challenge.'], ['Robbed him!']],
  skill: [['Lovely skill from', '@n!'], ['What a piece of skill!'], ['@n', 'leaves his man for dead!'], ['Oh, that is gorgeous!']],
  attack: [['@n', 'driving forward.'], ['@n', 'into the box!'], ["Here's", '@n.'], ['@n', 'can he find a way through?']],
  corner: [['Corner kick.'], ["It's a corner."]],
  halfTime: [["That's half time.", '@sc'], ['The referee blows for half time.', '@sc']],
  fullTimeWin: [["It's all over! ZorpFC win it!", '@sc'], ['Full time! A brilliant win for ZorpFC.']],
  fullTimeLose: [['Full time.', '{t} take the win.'], ["It's over. A night to forget for ZorpFC.", '@sc']],
  fullTimeDraw: [['Full time, and the points are shared.', '@sc'], ['All square at the final whistle.']],
  replay: [["Let's see that again."], ["Here's the replay."], ['Have another look at this.']],
  foul: [['Foul.'], ['The referee blows for a foul.'], ["That's a foul by", '@n.']],
  yellow: [['Yellow card for', '@n.'], ['@n', 'goes into the book.'], ["That's a booking."]],
  red: [['Red card!', '@n!'], ["He's been sent off!"], ['Off he goes!', '@n', 'is sent off!']],
  advantage: [['The referee plays advantage.'], ['Advantage. Play on.']],
  freekick: [['Free kick, in a dangerous position.'], ['@n', 'stands over this one.'], ['Free kick. This is within range.']],
  penalty: [['PENALTY!'], ["It's a penalty!", '@n', 'to take it.'], ['The referee points to the spot!']],
};

// the co-commentator's reaction a moment later (not every time)
export const CO = {
  goalHome: [['Look at the composure there. Picks his spot, and the keeper has no chance.'], ["That's what top players do. One chance, and it's in the back of the net."], ['Oh, I love that. Absolutely no hesitation.'], ['The movement to create that was superb.']],
  goalAway: [["That's poor defending, if I'm honest. Far too much space."], ['ZorpFC will be disappointed with that. Nobody tracked the run.'], ["You can't give a player of that quality that much time."]],
  save: [['Top drawer goalkeeping, that.'], ['He had no right to get to that one.'], ['Fantastic reflexes.']],
  miss: [["He'll feel he should have hit the target there."], ["Good chance, that. He'll want it back."], ['So close. The keeper was beaten.']],
  post: [['The width of the post away from a goal!'], ['Unlucky. That deserved to go in.']],
  skill: [["The defender just didn't know where he was!"], ['You pay to watch players like that.']],
  tackle: [['Perfectly timed. Got the ball, nothing else.']],
  foul: [['Clumsy challenge, that.'], ['He never got near the ball.']],
  yellow: [['No complaints. He had to stop him.'], ['Cynical. He knew exactly what he was doing.']],
  red: [["You can't do that. He's left his team with ten men."], ['Reckless. The referee had no choice.']],
  penalty: [['Stonewall penalty. He clipped his heels.'], ["He's gone straight through the back of him."]],
};
export const CO_CHANCE = { goalHome: 0.8, goalAway: 0.6, save: 0.4, miss: 0.35, post: 0.6, skill: 0.25, tackle: 0.15, ownGoal: 0.6, foul: 0.3, yellow: 0.5, red: 0.8, penalty: 0.7 };

const NUM = ['nil', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
// spoken score line, from ZorpFC's point of view
export function scoreText(h, a) {
  if (h === 0 && a === 0) return 'Still goalless.';
  if (h === a) return `It's ${NUM[h]} all.`;
  return h > a ? `It's ${NUM[h]}, ${NUM[a]} to ZorpFC.` : `ZorpFC trail ${NUM[a]}, ${NUM[h]}.`;
}
export const MAX_SCORE = 7;

// how a name is said, when the spelling would trip the voice up
export const SAY_AS = {
  'Z. Zorp': 'Zorp', 'Ødegaard': 'Oodegaard', 'Çalhanoğlu': 'Chalhanoglu', 'Šeško': 'Shesko', 'Gyökeres': 'Yokeresh',
  'Szoboszlai': 'Soboslai', 'Kvaratskhelia': 'Kvaratskelia', 'Tchouaméni': 'Chuameni', 'Vlahović': 'Vlahovich', 'Modrić': 'Modrich',
  'Yıldız': 'Yildiz', 'Mbappé': 'Mbappay', 'Konaté': 'Konatay', 'Dembélé': 'Dembelay', 'Sørensen': 'Sorensen', 'Hallström': 'Hallstrom',
  'Huijsen': 'Howsen', 'Upamecano': 'Upamecano', 'Kerkez': 'Kerkez', 'Doué': 'Dooay', 'Pacho': 'Pacho',
};
export const spoken = name => SAY_AS[name] || name.replace(/ /g, ' ');
