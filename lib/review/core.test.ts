import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, Card, firstLetterHint, gradeTyped, kyivDay, nextCard, pickBatch, pickMode,
} from "./core";

const today = "2026-11-15";

// ─── Розклад ──────────────────────────────────────────────────────────────────

test("«знаю» веде слово по драбині 14 → 30 → 60 → 120 → 120", () => {
  let card: Card | null = null;
  const gaps: number[] = [];
  let day = today;
  for (let i = 0; i < 5; i++) {
    card = nextCard(card, "la casa", "known", day);
    gaps.push((Date.parse(card.dueOn) - Date.parse(day)) / 86400000);
    day = card.dueOn;
  }
  assert.deepEqual(gaps, [14, 30, 60, 120, 120]);
});

test("«вагався» — через 2 дні, наступне «знаю» повторює попередній інтервал", () => {
  let card = nextCard(null, "k", "known", today);   // 14
  card = nextCard(card, "k", "known", today);       // 30
  card = nextCard(card, "k", "known", today);       // 60
  card = nextCard(card, "k", "hesitant", today);
  assert.equal(card.dueOn, addDays(today, 2));
  card = nextCard(card, "k", "known", today);
  assert.equal(card.dueOn, addDays(today, 60));
});

test("«вагався» на верхньому інтервалі — наступне «знаю» знову дає 120", () => {
  let card: Card | null = null;
  for (let i = 0; i < 5; i++) card = nextCard(card, "k", "known", today); // 14, 30, 60, 120, 120
  card = nextCard(card, "k", "hesitant", today);
  card = nextCard(card, "k", "known", today);
  assert.equal(card.dueOn, addDays(today, 120));
});

test("«не знаю» — завтра, драбина з початку", () => {
  let card = nextCard(null, "k", "known", today);
  card = nextCard(card, "k", "known", today);
  card = nextCard(card, "k", "unknown", today);
  assert.equal(card.dueOn, addDays(today, 1));
  card = nextCard(card, "k", "known", today);
  assert.equal(card.dueOn, addDays(today, 14));
});

test("день рахується за Києвом", () => {
  assert.equal(kyivDay(new Date("2026-11-15T22:30:00Z")), "2026-11-16");
  assert.equal(kyivDay(new Date("2026-11-15T21:30:00Z")), "2026-11-15");
});

// ─── Добірка ──────────────────────────────────────────────────────────────────

const keys = (n: number, p = "w") => Array.from({ length: n }, (_, i) => `${p}${i}`);
const card = (key: string, lastGrade: Card["lastGrade"], dueOn = today): Card => ({ key, level: 0, dueOn, lastGrade });

test("5 на повторення (борг першим) + 5 нових", () => {
  const debt = keys(3, "d").map(k => card(k, "unknown"));
  const planned = keys(4, "p").map((k, i) => card(k, "known", addDays(today, -i)));
  const fresh = keys(20, "n");
  const batch = pickBatch({ cards: [...debt, ...planned], allKeys: [...debt.map(c => c.key), ...planned.map(c => c.key), ...fresh], today });
  assert.equal(batch.length, 10);
  assert.equal(batch.filter(k => k.startsWith("n")).length, 5);
  assert.equal(batch.filter(k => k.startsWith("d")).length, 3);
  // з планових беруться найпростроченіші
  assert.deepEqual(batch.filter(k => k.startsWith("p")).sort(), ["p2", "p3"]);
});

test("борг понад 5 чекає наступного дня", () => {
  const debt = keys(8, "d").map(k => card(k, "hesitant"));
  const batch = pickBatch({ cards: debt, allKeys: [...debt.map(c => c.key), ...keys(20, "n")], today });
  assert.equal(batch.filter(k => k.startsWith("d")).length, 5);
});

test("нестача в одній групі добирається з іншої", () => {
  const debt = keys(8, "d").map(k => card(k, "unknown"));
  const onlyTwoNew = pickBatch({ cards: debt, allKeys: [...debt.map(c => c.key), "n0", "n1"], today });
  assert.equal(onlyTwoNew.length, 10);
  assert.equal(onlyTwoNew.filter(k => k.startsWith("d")).length, 8);

  const noDebt = pickBatch({ cards: [], allKeys: keys(30, "n"), today });
  assert.equal(noDebt.length, 10);
});

test("не беремо майбутні, виключені та видалені зі словника слова", () => {
  const cards = [card("future", "unknown", addDays(today, 1)), card("gone", "unknown"), card("ex", "unknown")];
  const batch = pickBatch({ cards, allKeys: ["future", "ex", "n0"], exclude: new Set(["ex"]), today });
  assert.deepEqual(batch, ["n0"]);
});

test("режим дня не повторює вчорашній", () => {
  for (let i = 0; i < 50; i++) assert.notEqual(pickMode("type", Math.random), "type");
});

// ─── Вписати ──────────────────────────────────────────────────────────────────

test("наголоси, ñ, регістр і розділові знаки не важливі", () => {
  assert.equal(gradeTyped("cafe", "el café"), "known");
  assert.equal(gradeTyped("Espanol", "español"), "known");
  assert.equal(gradeTyped("¿Que tal?", "¿Qué tal?"), "known");
});

test("артикль: без нього — знаю, неправильний — вагався", () => {
  assert.equal(gradeTyped("casa", "la casa"), "known");
  assert.equal(gradeTyped("la casa", "la casa"), "known");
  assert.equal(gradeTyped("el casa", "la casa"), "hesitant");
  assert.equal(gradeTyped("el cantante", "el/la cantante"), "known");
  assert.equal(gradeTyped("la cantante", "el/la cantante"), "known");
});

test("варіанти через «/» і позначки в дужках", () => {
  assert.equal(gradeTyped("la computadora", "el ordenador / la computadora"), "known");
  assert.equal(gradeTyped("ordenador", "el ordenador / la computadora"), "known");
  assert.equal(gradeTyped("contenta", "contento/a"), "known");
  assert.equal(gradeTyped("contento", "contento/a"), "known");
  assert.equal(gradeTyped("piso", "el piso (Ісп.) / el apartamento"), "known");
  assert.equal(gradeTyped("sala", "el salón / la sala (de estar)"), "known");
});

test("запис слова дослівно, як у словнику, — знаю", () => {
  assert.equal(gradeTyped("cansado/a", "cansado/a"), "known");
  assert.equal(gradeTyped("el/la cantante", "el/la cantante"), "known");
});

test("необов'язкова частина в дужках — можна з нею і без неї", () => {
  assert.equal(gradeTyped("la sala de estar", "el salón / la sala (de estar)"), "known");
  assert.equal(gradeTyped("la sala", "el salón / la sala (de estar)"), "known");
});

test("одна опечатка — вагався (від 5 літер)", () => {
  assert.equal(gradeTyped("ventana", "la ventanna"), "hesitant");
  assert.equal(gradeTyped("cocna", "la cocina"), "hesitant");
  assert.equal(gradeTyped("cosa", "la casa"), "unknown");
});

test("інше слово з тим самим перекладом — вагався", () => {
  assert.equal(gradeTyped("el cuarto de baño", "el lavabo", ["el baño / el cuarto de baño"]), "hesitant");
  assert.equal(gradeTyped("perro", "la casa", ["el piso"]), "unknown");
  assert.equal(gradeTyped("", "la casa"), "unknown");
});

test("підказка — перша літера без артикля", () => {
  assert.equal(firstLetterHint("el baño / el cuarto de baño"), "b…");
});
