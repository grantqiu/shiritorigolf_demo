// Run: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const KZ = require('../sumo/engine.js');

const src = fs.readFileSync(path.join(__dirname, '../sumo/data.js'), 'utf8');
const DATA = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const dict = KZ.makeDict(DATA);

function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function entry(ans) { for (const t of DATA.topics) for (const e of t.e) if (e[0] === ans) return e; throw new Error(ans); }

test('grading tiers', () => {
  const e = entry('地震');
  assert.strictEqual(KZ.grade(e, 'easy', '地震', dict).kind, 'exact');
  assert.strictEqual(KZ.grade(e, 'easy', ' 地震 ', dict).kind, 'exact');
  assert.strictEqual(KZ.grade(e, 'easy', 'じしん', dict).kind, 'kana');
  assert.strictEqual(KZ.grade(e, 'easy', '自信', dict).kind, 'homophone');
  assert.strictEqual(KZ.grade(e, 'hard', '自信', dict).kind, 'wrong');
  assert.strictEqual(KZ.grade(e, 'hard', '地面', dict).kind, 'close');
  assert.strictEqual(KZ.grade(e, 'hard', 'xx', dict).kind, 'notword');
  assert.strictEqual(KZ.grade(entry('力士'), 'hard', '関取', dict).kind, 'alt');
});

test('every clue has a reading and no description leaks its answer', () => {
  for (const t of DATA.topics) for (const e of t.e) {
    assert.ok(e[1], e[0]);
    for (const ch of e[0]) assert.ok(e[2].indexOf(ch) < 0, e[0] + ' leaks ' + ch);
  }
});

function newBout(rank, seed, events) {
  const rng = seeded(seed);
  const rk = KZ.makeRikishi(KZ.ROSTER.find((r) => r[2] === rank));
  return new KZ.Bout({ cpu: KZ.makeCpu(rk, rng), topics: DATA.topics, dict, rng, introTime: 0.1,
    onEvent: (t, d) => events && events.push([t, d]) });
}
function runUntil(b, pred, maxT = 60) { let t = 0; while (!pred() && t < maxT && b.phase !== 'over') { b.update(1 / 60); t += 1 / 60; } }

test('false start twice hands the charge to the opponent', () => {
  const ev = [];
  const b = newBout(0, 1, ev);
  runUntil(b, () => b.phase === 'miai');
  b.press(); b.press();
  const ta = ev.find((e) => e[0] === 'tachiai');
  assert.strictEqual(ta[1].winner, 1);
  assert.ok(ta[1].foul);
});

test('a quick tachiai press wins the charge', () => {
  const ev = [];
  const b = newBout(0, 2, ev);
  runUntil(b, () => b.phase === 'hakkeyoi');
  runUntil(b, () => b.t - b.goAt >= 0.15);
  b.press();
  assert.strictEqual(ev.find((e) => e[0] === 'tachiai')[1].winner, 0);
  assert.ok(b.pos > 0);
});

test('a perfect player beats a low-rank opponent', () => {
  let wins = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const b = newBout(0, seed);
    let t = 0;
    while (b.phase !== 'over' && t < 600) {
      if (b.phase === 'hakkeyoi' && b.t - b.goAt > 0.15) b.press();
      if (b.phase === 'neutral') b.playerMove(b.canAfford(0, 'tsuki') ? 'tsuki' : 'oshi');
      if (b.phase === 'qte') {
        const q = b.qte;
        if (q.type === 'word' && q.left < q.T - 1) b.answer(q.pick.e[0]);
        if (q.type === 'mash') b.press();
        if (q.type === 'timing' && Math.abs(q.left) < 0.05) b.press();
      }
      b.update(1 / 60); t += 1 / 60;
    }
    assert.strictEqual(b.phase, 'over', 'bout should end');
    if (b.winner === 0) wins++;
  }
  assert.ok(wins >= 18, 'wins=' + wins);
});

test('a player who never answers loses', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const b = newBout(5, seed);
    runUntil(b, () => false, 300);
    assert.strictEqual(b.phase, 'over');
    assert.strictEqual(b.winner, 1);
  }
});

test('wrong answers lock input briefly and are logged on resolve', () => {
  const b = newBout(0, 3);
  runUntil(b, () => b.phase === 'neutral');
  b.playerMove('oshi');
  const r = b.answer('全然違う');
  assert.strictEqual(r.g, 0);
  assert.strictEqual(b.answer(b.qte.pick.e[0]).kind, 'locked');
  runUntil(b, () => b.phase !== 'qte');
  assert.ok(b.log.some((l) => l.why === 'timeout'));
});

test('throw needs grip and spirit', () => {
  const b = newBout(0, 4);
  runUntil(b, () => b.phase === 'neutral');
  b.s[0].ki = 100;
  assert.strictEqual(b.playerMove('nage'), false);
  b.s[0].grip = 1;
  assert.strictEqual(b.playerMove('nage'), true);
});

test('pressing faster than human reaction counts as a false start', () => {
  const ev = [];
  const b = newBout(0, 5, ev);
  runUntil(b, () => b.phase === 'hakkeyoi');
  b.press();
  assert.ok(ev.some((e) => e[0] === 'matta'));
  assert.strictEqual(b.phase, 'miai');
});
