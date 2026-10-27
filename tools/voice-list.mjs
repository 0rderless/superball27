// Lists every commentary clip the game can play, as JSON for tools/gen-voice.py:
//   [{ file, voice: 'lead'|'co', text, mood: 'excited'|'calm' }]
// and writes the lookup the game uses (assets/voice/manifest.json: key -> file).
//   node tools/voice-list.mjs > /tmp/clips.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { LEAD, CO, scoreText, MAX_SCORE, spoken } from '../js/commentary-lines.js';
import { CLUBS, clubSquad } from '../js/clubs.js';

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { DB } = await import('../js/squad.js');

const clips = [], manifest = {};
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
// file names come from the line itself, so adding lines never renames (or re-records) the others
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return (h >>> 0).toString(36).slice(0, 5); };
function add(key, voice, text, mood) {
  if (manifest[key]) return;
  const file = `${voice === 'co' ? 'c' : 'l'}_${slug(text)}_${hash(key + mood)}.mp3`;
  manifest[key] = file;
  clips.push({ file, voice, text, mood });
}
const excited = t => /!/.test(t);
const teams = ['ZorpFC', ...CLUBS.map(c => c.name)];

for (const [table, voice] of [[LEAD, 'lead'], [CO, 'co']]) {
  for (const lines of Object.values(table)) for (const line of lines) for (const part of line) {
    if (part.startsWith('@')) continue;
    if (part.includes('{t}')) { for (const t of teams) add(`${voice}|${part.replace('{t}', t)}`, voice, part.replace('{t}', t), excited(part) ? 'excited' : 'calm'); }
    else add(`${voice}|${part}`, voice, part, excited(part) ? 'excited' : 'calm');
  }
}
for (let h = 0; h <= MAX_SCORE; h++) for (let a = 0; a <= MAX_SCORE; a++) add(`score|${h}-${a}`, 'lead', scoreText(h, a), 'calm');

const names = new Set(Object.values(DB).map(p => p.name));
for (const c of CLUBS) for (const p of clubSquad(c)) names.add(p.name);
for (const name of names) {
  add(`name!|${name}`, 'lead', spoken(name) + '!', 'excited');
  add(`name|${name}`, 'lead', spoken(name) + '.', 'calm');
}

mkdirSync(new URL('../assets/voice/', import.meta.url), { recursive: true });
writeFileSync(new URL('../assets/voice/manifest.json', import.meta.url), JSON.stringify(manifest));
process.stdout.write(JSON.stringify(clips));
