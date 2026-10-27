import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xg, teamFacts } from '../js/facts.js';

test('xG: closer and more central is better; penalties ~0.76; headers worth less', () => {
  const g = 52.5;
  const six = xg({ x: 47, z: 0 }, g), pen = xg({ x: 41.5, z: 0 }, g), far = xg({ x: 27.5, z: 0 }, g), wide = xg({ x: 47, z: 15 }, g);
  assert.ok(six > pen && pen > far && six > wide);
  assert.ok(far < 0.07 && six > 0.4 && six < 0.8);
  assert.equal(xg({ x: 41.5, z: 0 }, g, { penalty: true }), 0.76);
  assert.ok(xg({ x: 47, z: 0 }, g, { header: true }) < six);
  assert.ok(xg({ x: -47, z: 0 }, -52.5) === six);
});

test('team facts: rows for both sides, derived percentages', () => {
  const blank = () => ({ poss: 0, shots: 0, on: 0, passes: 0, passCmp: 0, xg: 0, blocked: 0, saves: 0, dist: 0 });
  const h = { ...blank(), poss: 30, shots: 10, on: 4, blocked: 2, passes: 50, passCmp: 40, xg: 1.234, dist: 52000, goals: 2 };
  const a = { ...blank(), poss: 10, shots: 4, on: 1, passes: 20, passCmp: 10, xg: 0.3, dist: 48000, goals: 0 };
  const rows = teamFacts(h, a);
  const get = n => rows.find(r => r.label === n);
  assert.deepEqual([get('Possession').h, get('Possession').a], ['75%', '25%']);
  assert.equal(get('Expected goals (xG)').h, '1.23');
  assert.equal(get('Pass accuracy').h, '80%');
  assert.equal(get('Shots off target').h, 4);
  assert.equal(get('Distance covered').h, '52.0 km');
  assert.ok(rows.length >= 25);
});
