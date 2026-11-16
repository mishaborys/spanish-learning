import { test } from "node:test";
import assert from "node:assert/strict";
import { accuracy, createGame, endRound, goalFor, minScoreToReach, multiplierFor, pointsForHit, tap, type BlastWord } from "./core";

/** Детермінований «рандом» для тестів. */
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
const ws = (...keys: string[]): BlastWord[] => keys.map(k => ({ key: k, prompt: `переклад ${k}` }));

// ─── Бали (відновлено з рахунку реальної гри Quizlet: 5, 11, 18, 26, 35, 45, 56, 68, 80, 92) ───

test("бали за влучання: 5 × множник; множник росте на 0.2 за кожне влучання поспіль і впирається в ×2.4", () => {
  const gains = Array.from({ length: 10 }, (_, streak) => pointsForHit(streak));
  assert.deepEqual(gains, [5, 6, 7, 8, 9, 10, 11, 12, 12, 12]);
  assert.equal(multiplierFor(0), 1);
  assert.equal(multiplierFor(5), 2);
  assert.equal(multiplierFor(30), 2.4);
});

// ─── Рівні ────────────────────────────────────────────────────────────────────

test("ціль рівня: 50 балів на першому, далі +25 за кожен рівень", () => {
  assert.deepEqual([1, 2, 3, 4].map(goalFor), [50, 75, 100, 125]);
});

test("щоб дійти до рівня, треба було набрати цілі всіх попередніх: до 3-го — 50 + 75", () => {
  assert.deepEqual([1, 2, 3].map(minScoreToReach), [0, 50, 125]);
});

test("старт: рівень 1, на полі до 4 різних слів, підказка — про одне з них, рахунок нульовий", () => {
  const g = createGame(ws("a", "b", "c", "d", "e", "f"), seq(0.3, 0.7, 0.1));
  assert.equal(g.level, 1);
  assert.equal(g.visible.length, 4);
  assert.equal(new Set(g.visible).size, 4);
  assert.ok(g.visible.includes(g.target!));
  assert.deepEqual([g.levelScore, g.totalScore, g.streak, g.hits, g.misses, g.over], [0, 0, 0, 0, 0, false]);
});

test("старт: у групі з 3 слів на полі одразу всі", () => {
  assert.equal(createGame(ws("a", "b", "c"), seq(0.5)).visible.length, 3);
});

// ─── Влучання й промахи ───────────────────────────────────────────────────────

test("десять влучань поспіль дають рахунок як у реальній грі: 92", () => {
  let g = createGame(ws("a", "b", "c", "d", "e", "f"), seq(0.42, 0.13, 0.77));
  const totals: number[] = [];
  for (let i = 0; i < 10; i++) {
    g = tap(g, g.target!, seq(0.42, 0.13, 0.77)).game;
    totals.push(g.levelScore);
  }
  assert.deepEqual(totals, [5, 11, 18, 26, 35, 45, 56, 68, 80, 92]);
  assert.equal(g.totalScore, 92);
});

test("влучання: збитий зникає, на його місце прилітає інше слово; підказка — знову про видиме", () => {
  const g = createGame(ws("a", "b", "c", "d", "e", "f"), seq(0.5));
  const hit = g.target!;
  const r = tap(g, hit, seq(0.5));
  assert.equal(r.correct, true);
  assert.equal(r.points, 5);
  assert.ok(!r.game.visible.includes(hit));
  assert.equal(r.game.visible.length, 4);
  assert.equal(new Set(r.game.visible).size, 4);
  assert.ok(r.game.visible.includes(r.game.target!));
});

test("промах: −3 бали (не нижче нуля), серія з початку, астероїд і підказка лишаються", () => {
  let g = createGame(ws("a", "b", "c", "d", "e"), seq(0.5));
  g = tap(g, g.target!, seq(0.5)).game;
  g = tap(g, g.target!, seq(0.5)).game; // 11 балів, серія 2
  const wrong = g.visible.find(k => k !== g.target)!;
  const r = tap(g, wrong, seq(0.5));
  assert.equal(r.correct, false);
  assert.equal(r.points, -3);
  assert.deepEqual([r.game.levelScore, r.game.totalScore, r.game.streak, r.game.misses], [8, 8, 0, 1]);
  assert.deepEqual(r.game.visible, g.visible);
  assert.equal(r.game.target, g.target);
  const fresh = createGame(ws("a", "b"), seq(0.5));
  assert.equal(tap(fresh, fresh.visible.find(k => k !== fresh.target)!).game.levelScore, 0);
});

test("слова йдуть по колу: гра довша за колоду не зупиняється, а підказка не повторюється двічі поспіль", () => {
  let g = createGame(ws("a", "b", "c", "d", "e"), seq(0.42, 0.13, 0.77));
  let prev: string | null = null;
  for (let i = 0; i < 40; i++) {
    assert.notEqual(g.target, prev);
    prev = g.target;
    g = tap(g, g.target!, seq(0.42, 0.13, 0.77)).game;
  }
  assert.equal(g.hits, 40);
  assert.equal(g.visible.length, 4);
});

test("мала група (3 слова): поле не порожніє — збите слово повертається", () => {
  let g = createGame(ws("a", "b", "c"), seq(0.42, 0.13, 0.77));
  for (let i = 0; i < 12; i++) g = tap(g, g.target!, seq(0.42, 0.13, 0.77)).game;
  assert.equal(g.visible.length, 3);
  assert.equal(g.hits, 12);
});

test("астероїд із тим самим перекладом, що й підказка, — теж влучання (два слова «відповідати»)", () => {
  const words: BlastWord[] = [
    { key: "responder", prompt: "відповідати" },
    { key: "contestar", prompt: "Відповідати " },
    { key: "hablar", prompt: "говорити" },
  ];
  const g = { ...createGame(words, seq(0.5)), target: "responder" };
  const r = tap(g, "contestar", seq(0.5));
  assert.equal(r.correct, true);
  assert.equal(r.game.hits, 1);
});

test("та сама підказка не з'являється двічі поспіль навіть через слово-близнюка («відповідати» × 2)", () => {
  const words: BlastWord[] = [
    { key: "responder", prompt: "відповідати" },
    { key: "contestar", prompt: "відповідати" },
    { key: "hablar", prompt: "говорити" },
    { key: "gritar", prompt: "кричати" },
  ];
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const g = { ...createGame(words, seq(r)), target: "responder" };
    const next = tap(g, "responder", seq(r)).game;
    assert.notEqual(next.words.find(w => w.key === next.target)?.prompt, "відповідати");
  }
});

// ─── Кінець раунду ────────────────────────────────────────────────────────────

test("кінець раунду: ціль набрано — наступний рівень з новою ціллю, бали рівня з нуля, загальні лишаються", () => {
  let g = createGame(ws("a", "b", "c", "d", "e", "f"), seq(0.42, 0.13));
  for (let i = 0; i < 10; i++) g = tap(g, g.target!, seq(0.42, 0.13)).game; // 92 ≥ 50
  const next = endRound(g, seq(0.3));
  assert.equal(next.over, false);
  assert.equal(next.level, 2);
  assert.equal(goalFor(next.level), 75);
  assert.deepEqual([next.levelScore, next.totalScore], [0, 92]);
  assert.equal(next.streak, 10); // серія не обривається між рівнями
  assert.equal(next.visible.length, 4);
});

test("кінець раунду: ціль не набрано — гру завершено", () => {
  let g = createGame(ws("a", "b", "c", "d", "e", "f"), seq(0.42, 0.13));
  for (let i = 0; i < 5; i++) g = tap(g, g.target!, seq(0.42, 0.13)).game; // 35 < 50
  const end = endRound(g, seq(0.3));
  assert.equal(end.over, true);
  assert.equal(end.level, 1);
  assert.equal(end.totalScore, 35);
  assert.deepEqual(tap(end, end.target ?? "a").game, end); // після кінця тапи нічого не міняють
});

test("точність у відсотках: 10 влучань і 1 промах — 91%", () => {
  assert.equal(accuracy({ hits: 10, misses: 1 }), 91);
  assert.equal(accuracy({ hits: 0, misses: 0 }), 100);
});
