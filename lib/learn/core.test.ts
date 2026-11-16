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

test("драбина: вибір → «ще вчу», зворотний вибір → «знайомий», вписування → «вивчено»", () => {
  assert.equal(nextStage("new", "choice", true), "learning");
  assert.equal(nextStage("learning", "reverse", true), "familiar");
  assert.equal(nextStage("familiar", "write", true), "mastered");
});

test("правильна відповідь не знижує етап (напр. запізнілий вибір для вже вивченого слова)", () => {
  assert.equal(nextStage("mastered", "choice", true), "mastered");
});

test("помилка або «не знаю» на будь-якому етапі відкочує слово на початок драбини", () => {
  assert.equal(nextStage("familiar", "write", false), "new");
  assert.equal(nextStage("learning", "reverse", false), "new");
  assert.equal(nextStage("new", "choice", false), "new");
});

// ─── Раунд ────────────────────────────────────────────────────────────────────

const words = (stages: Record<string, Stage>) => Object.entries(stages).map(([key, stage]) => ({ key, stage }));

const kindsOf = (round: { kind: string }[]) => [...new Set(round.map(q => q.kind))];

test("раунд: 5 слів одного типу — вибір для нових", () => {
  const round = buildRound({ words: words(Object.fromEntries("abcdefgh".split("").map(k => [k, "new" as Stage]))), rng: seq(0.5) });
  assert.equal(round.length, 5);
  assert.deepEqual(kindsOf(round), ["choice"]);
  assert.equal(new Set(round.map(q => q.key)).size, 5);
});

test("раунд: тип залежить від етапу слів — «ще вчу» → зворотний вибір, «знайомий» → вписування", () => {
  const five = (stage: Stage) => Object.fromEntries("abcde".split("").map(k => [k, stage]));
  assert.deepEqual(kindsOf(buildRound({ words: words(five("learning")), rng: seq(0.5) })), ["reverse"]);
  assert.deepEqual(kindsOf(buildRound({ words: words(five("familiar")), rng: seq(0.5) })), ["write"]);
});

test("раунд: вивчені не потрапляють; слова різних етапів не змішуються в одному раунді", () => {
  const round = buildRound({
    words: words({ a: "mastered", b: "learning", c: "learning", d: "new", e: "new", f: "new", g: "new", h: "new", i: "new" }),
    rng: seq(0.5),
  });
  assert.ok(!round.some(q => q.key === "a"));
  assert.equal(kindsOf(round).length, 1);
});

test("раунд: перевага етапу, де набралось повних 5; інакше — найдальший етап зі словами", () => {
  // 5 нових і лише 3 «знайомих» — повна п'ятірка тільки на виборі
  const full = buildRound({ words: words({ a: "familiar", b: "familiar", c: "familiar", d: "new", e: "new", f: "new", g: "new", h: "new" }), rng: seq(0.5) });
  assert.deepEqual(kindsOf(full), ["choice"]);
  // повних п'ятірок немає ніде — спершу найдальший етап, хоч і неповний
  const part = buildRound({ words: words({ a: "familiar", b: "familiar", c: "learning", d: "new", e: "new" }), rng: seq(0.5) });
  assert.deepEqual(kindsOf(part), ["write"]);
  assert.equal(part.length, 2);
});

test("раунд: порожній, коли всі слова вивчені", () => {
  assert.deepEqual(buildRound({ words: words({ a: "mastered", b: "mastered" }), rng: seq(0.5) }), []);
});

test("кожне слово проходить усі три типи: вибір → зворотний вибір → вписування, поки не стане вивченим", () => {
  const keys = "abcdefghijkl".split("");
  let stages: Record<string, Stage> = {};
  const seen = new Map<string, string[]>();
  for (let guard = 0; guard < 50; guard++) {
    const round = buildRound({ words: keys.map(key => ({ key, stage: stages[key] ?? "new" })), rng: seededRng(guard + 1) });
    if (round.length === 0) break;
    for (const q of round) {
      seen.set(q.key, [...(seen.get(q.key) ?? []), q.kind]);
      stages = { ...stages, [q.key]: nextStage(stages[q.key] ?? "new", q.kind, true) };
    }
  }
  assert.ok(keys.every(k => stages[k] === "mastered"));
  for (const k of keys) assert.deepEqual(seen.get(k), ["choice", "reverse", "write"], k);
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
  // обидва проміжні етапи рахуються як «ще вчу»
  assert.equal(groupProgress(["a", "b"], { a: "learning", b: "familiar" }).learning, 2);
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


// ─── Частина мови у варіантах ─────────────────────────────────────────────────

test("хибні варіанти тієї ж частини мови, що правильний", () => {
  const verbs = ["a", "b", "c", "d", "e"].map(k => ({ key: k, text: `дієслово ${k}`, pos: "verb" as const }));
  const nouns = ["m", "n", "o", "p", "q"].map(k => ({ key: k, text: `іменник ${k}`, pos: "noun" as const }));
  for (let i = 0; i < 20; i++) {
    const r = seededRng(i);
    const forVerb = pickOptions({ target: { key: "t", text: "ціль", pos: "verb" }, layers: [nouns, verbs], rng: r });
    assert.equal(forVerb.length, 4);
    assert.ok(forVerb.every(o => o.pos === "verb"), "до дієслова — самі дієслова");
    const forNoun = pickOptions({ target: { key: "t", text: "ціль", pos: "noun" }, layers: [verbs, nouns], rng: r });
    assert.ok(forNoun.every(o => o.pos === "noun"), "до іменника — самі іменники");
  }
});

test("слів тієї ж частини мови бракує — спершу споріднені (службові слова), потім будь-які", () => {
  const adverbs = [{ key: "a", text: "тут", pos: "adverb" as const }];
  const preps = [{ key: "p", text: "на", pos: "preposition" as const }, { key: "q", text: "під", pos: "preposition" as const }];
  const nouns = ["m", "n", "o"].map(k => ({ key: k, text: `іменник ${k}`, pos: "noun" as const }));
  const options = pickOptions({ target: { key: "t", text: "ціль", pos: "adverb" }, layers: [nouns, adverbs, preps], rng: seededRng(1) });
  assert.equal(options.length, 4);
  assert.deepEqual(options.map(o => o.key).filter(k => k !== "t").sort(), ["a", "p", "q"], "прислівник добирає прийменники, а не іменники");
});

test("слів тієї ж частини мови зовсім немає — варіанти з інших, їх завжди 4", () => {
  const nouns = ["m", "n", "o", "p"].map(k => ({ key: k, text: `іменник ${k}`, pos: "noun" as const }));
  assert.equal(pickOptions({ target: { key: "t", text: "ціль", pos: "conjunction" }, layers: [nouns], rng: seededRng(2) }).length, 4);
});
