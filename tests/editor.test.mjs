import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const SQ = await import('../js/squad.js');

test('editing one of your players sets exactly the stats you chose (training not counted twice)', () => {
  const id = SQ.profile().lineup[5];
  SQ.profile().coins = 1e9;
  SQ.train(id, 'pac'); SQ.train(id, 'pac');
  const shown = SQ.attrs(id); // what the editor shows
  const p = SQ.DB[id];
  SQ.savePlayer(id, { name: 'Edited Man', pos: p.pos, num: 77, skin: p.skin, hair: p.hair, style: p.style, a: { ...shown, sho: 91 }, base: 0, card: 'toty' });
  const a = SQ.attrs(id);
  assert.equal(a.pac, shown.pac);
  assert.equal(a.sho, 91);
  assert.equal(SQ.DB[id].num, 77);
  assert.equal(SQ.DB[id].card, 'toty');
  assert.equal(SQ.DB[id].name, 'Edited Man');
  assert.ok(SQ.isEdited(id));
});
