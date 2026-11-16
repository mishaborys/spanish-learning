import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRound, checkWritten, groupProgress, nextStage, pickOptions, seededRng, type Stage } from "./core";

/** Детермінований «рандом» для тестів. */
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

// ─── Етапи слова ──────────────────────────────────────────────────────────────

test("правильний вибір переводить нове слово в «ще вчу», правильне вписування — у «вивчено»", () => {
  assert.equal(nextStage("new", "choice", true), "learning");
  assert.equal(nextStage("learning", "write", true), "mastered");
});

test("зворотний вибір (переклад → іспанське) теж веде нове слово в «ще вчу», але не в «вивчено»", () => {
  assert.equal(nextStage("new", "reverse", true), "learning");
  assert.equal(nextStage("learning", "reverse", true), "learning");
  assert.equal(nextStage("learning", "reverse", false), "new");
});

test("правильна відповідь не знижує етап (напр. запізнілий вибір для вже вивченого слова)", () => {
  assert.equal(nextStage("mastered", "choice", true), "mastered");
});

test("помилка або «не знаю» відкочує слово на етап вибору", () => {
  assert.equal(nextStage("learning", "write", false), "new");
  assert.equal(nextStage("new", "choice", false), "new");
});

// ─── Раунд ────────────────────────────────────────────────────────────────────

const words = (stages: Record<string, Stage>) => Object.entries(stages).map(([key, stage]) => ({ key, stage }));

test("раунд: до 7 питань, спершу слова на вписування, потім нові на вибір; вивчені не потрапляють", () => {
  const round = buildRound({
    words: words({ a: "learning", b: "learning", c: "mastered", d: "new", e: "new", f: "new", g: "new", h: "new", i: "new", j: "new" }),
    rng: seq(0.5),
  });
  assert.equal(round.length, 7);
  assert.deepEqual(round.filter(q => q.kind === "write").map(q => q.key).sort(), ["a", "b"]);
  assert.equal(round.filter(q => q.kind !== "write").length, 5);
  assert.ok(!round.some(q => q.key === "c"));
});

test("раунд: нові слова діляться між двома видами вибору, кожне слово — один раз", () => {
  const round = buildRound({ words: words({ a: "new", b: "new", c: "new", d: "new", e: "new", f: "new" }), rng: seq(0.3, 0.8, 0.1) });
  assert.equal(round.filter(q => q.kind === "choice").length, 3);
  assert.equal(round.filter(q => q.kind === "reverse").length, 3);
  assert.equal(new Set(round.map(q => q.key)).size, 6);
});

test("раунд: режими йдуть серіями по 2 питання в випадковому порядку", () => {
  const stages = { a: "learning", b: "learning", c: "new", d: "new", e: "new", f: "new" } as Record<string, Stage>;
  const orders = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const kinds = buildRound({ words: words(stages), rng: seededRng(seed) }).map(q => q.kind);
    assert.equal(kinds.length, 6);
    // Кожна серія — рівно по 2 однакові, сусідні серії різні
    for (let i = 0; i < kinds.length; i += 2) {
      assert.equal(kinds[i], kinds[i + 1], `серія ${i / 2} не по два: ${kinds}`);
      if (i > 0) assert.notEqual(kinds[i], kinds[i - 1], `режим повторився поспіль: ${kinds}`);
    }
    orders.add(kinds.join());
  }
  assert.ok(orders.size > 1, "порядок режимів завжди однаковий");
});

test("раунд: коли лишається один режим, питання все одно віддаються (без зациклення)", () => {
  const round = buildRound({ words: words({ a: "learning", b: "learning", c: "learning" }), rng: seq(0.5) });
  assert.deepEqual(round.map(q => q.kind), ["write", "write", "write"]);
});

test("слова з помилкою повертаються в наступний раунд раніше за ще не бачені", () => {
  const round = buildRound({
    words: words({ a: "new", b: "new", c: "new", d: "new", e: "new", f: "new", g: "new", h: "new", z: "new" }),
    missed: new Set(["z"]),
    rng: seq(0.5),
  });
  assert.ok(round.some(q => q.key === "z"));
  assert.ok(!round.some(q => q.key === "h")); // місце віддали слову з помилкою
});

// ─── Варіанти відповіді ───────────────────────────────────────────────────────

const opts = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `${prefix}${i}`, text: `${prefix}-переклад-${i}` }));

test("4 різні варіанти з правильним; хибні — із запасу 20: своя група → інші групи набору → інші набори", () => {
  const own = opts("own", 3);      // мала група: 2 хибні кандидати
  const set = opts("set", 10);     // + 10 = 12
  const other = opts("oth", 30);   // + 7 = 19 хибних, разом із правильним — 20
  const allowed = new Set([...own.slice(1), ...set, ...other.slice(0, 7)].map(o => o.key));
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const options = pickOptions({ target: own[0], layers: [own, set, other], rng: seq(r, 0.99 - r / 2, 0.42) });
    assert.equal(options.length, 4);
    assert.ok(options.some(o => o.key === "own0"));
    assert.equal(new Set(options.map(o => o.text)).size, 4);
    for (const o of options) if (o.key !== "own0") assert.ok(allowed.has(o.key), `${o.key} поза запасом`);
  }
});

test("зворотний вибір: слово з тим самим перекладом не стає хибним варіантом", () => {
  const target = { key: "casa", text: "la casa", meaning: "будинок" };
  const layer = [
    target,
    { key: "hogar", text: "el hogar", meaning: "Будинок" }, // теж «будинок» — інша правильна відповідь
    { key: "la-casa-2", text: "la casa", meaning: "родина" }, // той самий текст
    ...Array.from({ length: 6 }, (_, i) => ({ key: `w${i}`, text: `слово-${i}`, meaning: `значення-${i}` })),
  ];
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const options = pickOptions({ target, layers: [layer], rng: seq(r, 0.5, 0.2) });
    assert.equal(options.length, 4);
    assert.ok(!options.some(o => o.key === "hogar" || o.key === "la-casa-2"));
  }
});

// ─── Вписування ───────────────────────────────────────────────────────────────

test("вписане: точна відповідь (наголоси й артикль не обов'язкові) — правильно без підказки", () => {
  assert.deepEqual(checkWritten("casa", "la casa"), { correct: true, showSpelling: false });
  assert.deepEqual(checkWritten("cancion", "la canción"), { correct: true, showSpelling: false });
});

test("вписане: одна опечатка чи неправильний артикль — зараховано, але з підказкою написання", () => {
  assert.deepEqual(checkWritten("ventanna", "la ventana"), { correct: true, showSpelling: true });
  assert.deepEqual(checkWritten("el casa", "la casa"), { correct: true, showSpelling: true });
});

test("вписане: інше слово — неправильно", () => {
  assert.deepEqual(checkWritten("perro", "la casa"), { correct: false, showSpelling: true });
});

// ─── Прогрес ──────────────────────────────────────────────────────────────────

test("прогрес групи: слова без запису — «не вивчав»; група вивчена, коли вивчені всі", () => {
  const p = groupProgress(["a", "b", "c", "d"], { a: "mastered", b: "learning", z: "mastered" });
  assert.deepEqual(p, { new: 2, learning: 1, mastered: 1, total: 4, done: false });
  assert.equal(groupProgress(["a"], { a: "mastered" }).done, true);
});

test("одне слово з різними перекладами в різних групах не стає двома варіантами", () => {
  const own = [{ key: "t", text: "ціль" }, { key: "z", text: "переклад-1" }];
  const set = [{ key: "z", text: "переклад-2" }, ...opts("set", 2)]; // запас малий — дубль точно потрапить
  for (const r of [0, 0.5, 0.99]) {
    const keys = pickOptions({ target: own[0], layers: [own, set], rng: seq(r, 0.1, 0.7) }).map(o => o.key);
    assert.equal(new Set(keys).size, 4);
  }
});

// ─── Випадковість ─────────────────────────────────────────────────────────────

test("seededRng: те саме зерно дає той самий раунд (сервер і браузер збігаються), інше — інший", () => {
  const ws = words(Object.fromEntries("abcdefghij".split("").map(k => [k, "new" as Stage])));
  const a = buildRound({ words: ws, rng: seededRng(42) }).map(q => q.key);
  const b = buildRound({ words: ws, rng: seededRng(42) }).map(q => q.key);
  const c = buildRound({ words: ws, rng: seededRng(7) }).map(q => q.key);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

