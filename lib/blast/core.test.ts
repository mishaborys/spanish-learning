import { test } from "node:test";
import assert from "node:assert/strict";
import { accuracy, createGame, maxScore, pointsForHit, tap, type BlastWord } from "./core";

/** Детермінований «рандом» для тестів. */
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
const ws = (...keys: string[]): BlastWord[] => keys.map(k => ({ key: k, prompt: `переклад ${k}` }));

// ─── Очки ─────────────────────────────────────────────────────────────────────

test("влучання: 100 + бонус за швидкість — повний до 2 с, нуль після 8 с, між ними лінійно", () => {
  assert.equal(pointsForHit(1500, 0), 200);
  assert.equal(pointsForHit(2000, 0), 200);
  assert.equal(pointsForHit(5000, 0), 150);
  assert.equal(pointsForHit(8000, 0), 100);
  assert.equal(pointsForHit(30000, 0), 100);
});

test("серія множить очки: ×2 після 3 влучань поспіль, ×3 після 6", () => {
  assert.equal(pointsForHit(8000, 2), 100); // 3-тє влучання поспіль — ще без множника
  assert.equal(pointsForHit(8000, 3), 200); // 4-те — ×2
  assert.equal(pointsForHit(1000, 5), 400); // 6-те — ×2
  assert.equal(pointsForHit(1000, 6), 600); // 7-ме — ×3
  assert.equal(pointsForHit(8000, 20), 300);
});

// ─── Гра ──────────────────────────────────────────────────────────────────────

test("старт: на полі до 4 астероїдів, решта чекає в черзі; підказка — про один із видимих", () => {
  const g = createGame(ws("a", "b", "c", "d", "e", "f"), seq(0.3, 0.7, 0.1));
  assert.equal(g.visible.length, 4);
  assert.equal(g.queue.length, 2);
  assert.ok(g.visible.includes(g.target!));
  assert.equal(new Set([...g.visible, ...g.queue]).size, 6);
  assert.deepEqual([g.score, g.streak, g.hits, g.misses, g.done], [0, 0, 0, 0, false]);
});

test("старт: у групі з 3 слів — на полі одразу всі", () => {
  const g = createGame(ws("a", "b", "c"), seq(0.5));
  assert.equal(g.visible.length, 3);
  assert.equal(g.queue.length, 0);
});

test("влучання в правильний: +очки, серія росте, збитий зникає, на його місце прилітає наступне слово з черги", () => {
  const g = createGame(ws("a", "b", "c", "d", "e", "f"), seq(0.5));
  const target = g.target!;
  const next = g.queue[0];
  const r = tap(g, target, 1000, seq(0.5));
  assert.equal(r.correct, true);
  assert.equal(r.points, 200);
  const s = r.game;
  assert.deepEqual([s.score, s.streak, s.hits, s.misses], [200, 1, 1, 0]);
  assert.ok(!s.visible.includes(target));
  assert.ok(s.visible.includes(next));
  assert.equal(s.visible.length, 4);
  assert.ok(s.visible.includes(s.target!));
});

test("промах: −50 очок, серія обнуляється, астероїд і підказка лишаються", () => {
  let g = createGame(ws("a", "b", "c", "d", "e"), seq(0.5));
  g = tap(g, g.target!, 1000, seq(0.5)).game; // 200 очок, серія 1
  const wrong = g.visible.find(k => k !== g.target)!;
  const r = tap(g, wrong, 500, seq(0.5));
  assert.equal(r.correct, false);
  assert.equal(r.points, -50);
  assert.deepEqual([r.game.score, r.game.streak, r.game.misses, r.game.hits], [150, 0, 1, 1]);
  assert.deepEqual(r.game.visible, g.visible);
  assert.equal(r.game.target, g.target);
});

test("промах на старті не робить рахунок від'ємним", () => {
  const g = createGame(ws("a", "b"), seq(0.5));
  const wrong = g.visible.find(k => k !== g.target)!;
  const r = tap(g, wrong, 500);
  assert.equal(r.game.score, 0);
  assert.equal(r.points, 0);
});

test("астероїд із тим самим перекладом, що й підказка, — теж влучання (напр. два слова «відповідати»)", () => {
  const words: BlastWord[] = [
    { key: "responder", prompt: "відповідати" },
    { key: "contestar", prompt: "Відповідати " },
    { key: "hablar", prompt: "говорити" },
  ];
  const g = createGame(words, seq(0.5));
  const twin = g.target === "responder" ? "contestar" : g.target === "contestar" ? "responder" : null;
  const start = twin ? g : { ...g, target: "responder" };
  const r = tap(start, twin ?? "contestar", 1000, seq(0.5));
  assert.equal(r.correct, true);
  assert.equal(r.game.hits, 1);
  assert.ok(!r.game.visible.includes(twin ?? "contestar"));
});

test("повна гра: кожне слово стає підказкою рівно раз, після останнього — кінець; точність у відсотках", () => {
  const keys = "abcdefghij".split("");
  let g = createGame(ws(...keys), seq(0.42, 0.13, 0.77));
  const targets: string[] = [];
  let missed = false;
  while (!g.done) {
    if (!missed) { // один промах за гру
      g = tap(g, g.visible.find(k => k !== g.target) ?? g.target!, 3000).game;
      missed = true;
      continue;
    }
    targets.push(g.target!);
    g = tap(g, g.target!, 3000, seq(0.42, 0.13, 0.77)).game;
  }
  assert.deepEqual([...targets].sort(), keys);
  assert.equal(g.target, null);
  assert.deepEqual([g.hits, g.misses], [10, 1]);
  assert.equal(accuracy(g), 91); // 10 з 11
  assert.deepEqual(tap(g, "a", 100).game, g); // після кінця тапи нічого не міняють
});

test("максимально можливий рахунок: усі влучання найшвидші, серія без промахів", () => {
  assert.equal(maxScore(0), 0);
  assert.equal(maxScore(3), 600);            // 200 × 3, ще без множника
  assert.equal(maxScore(5), 600 + 400 * 2);  // 4-те й 5-те — ×2
  assert.equal(maxScore(8), 600 + 400 * 3 + 600 * 2); // 7-ме й 8-ме — ×3
});
