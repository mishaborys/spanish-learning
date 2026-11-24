import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOrder, chipsOf, shuffledChips } from "@/lib/conjugation/core";
import { loadVocabularySet } from "@/lib/vocabulary";
import {
  buildSentenceSession, isSentenceSessionFinished, parseSentenceAnswers, RULE_LABEL, restoreSentenceSession,
  sentenceProgress, sentencesToRetry, type Rule,
} from "./core";
import { loadSentenceDeck, sentenceDeckForTopic } from "./data";

const deck = loadSentenceDeck("quedamos")!;
const ids = deck.sentences.map(s => s.id);

// ─── Дані ─────────────────────────────────────────────────────────────────────

test("колода «¿Quedamos?» існує й підключена до теми", () => {
  assert.ok(deck && deck.sentences.length >= 40);
  assert.equal(sentenceDeckForTopic("quedamos")?.id, "quedamos");
  assert.equal(sentenceDeckForTopic("gustar"), null);
});

test("id унікальні, у кожного речення є переклад, запасні порядки — з тих самих слів", () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const s of deck.sentences) {
    assert.ok(s.uk.trim() && s.es.trim(), s.id);
    for (const alt of s.alt ?? []) {
      assert.deepEqual(chipsOf(alt).map(c => c.toLowerCase()).sort(), chipsOf(s.es).map(c => c.toLowerCase()).sort(), `${s.id}: «${alt}»`);
      assert.ok(checkOrder(chipsOf(alt), s), `${s.id}: запасний порядок має зараховуватись`);
    }
    assert.ok(checkOrder(chipsOf(s.es), s), s.id);
    assert.ok(!checkOrder(shuffledChips(s), s), `${s.id}: слова вже в порядку`);
  }
});

test("усі 21 слово набору «¿Quedamos?» зустрічаються в реченнях, і лише слова з набору", () => {
  const set = loadVocabularySet("quedamos")!;
  const setWords = new Set(set.groups.flatMap(g => g.words.map(w => w.spanish)));
  const used = new Set(deck.sentences.flatMap(s => s.words ?? []));
  assert.deepEqual([...setWords].filter(w => !used.has(w)), [], "слова без жодного речення");
  assert.deepEqual([...used].filter(w => !setWords.has(w)), [], "посилання на слова, яких немає в наборі");
});

test("кожне правило уроку (el, por, a las, en, a, después de) тренується щонайменше в 4 реченнях", () => {
  for (const rule of Object.keys(RULE_LABEL) as Rule[]) {
    assert.ok(deck.sentences.filter(s => s.tags?.includes(rule)).length >= 4, rule);
  }
  for (const s of deck.sentences) for (const t of s.tags ?? []) assert.ok(t in RULE_LABEL, `${s.id}: невідоме правило ${t}`);
});

// ─── Сесія ────────────────────────────────────────────────────────────────────

test("сесія — 10 різних речень колоди", () => {
  const s = buildSentenceSession(deck);
  assert.equal(s.ids.length, 10);
  assert.equal(new Set(s.ids).size, 10);
  assert.ok(s.ids.every(id => ids.includes(id)));
  assert.deepEqual([s.round, s.index, s.results], [1, 0, []]);
});

test("спершу речення, на які ще не було правильної відповіді; щойно пройдені — пізніше", () => {
  const done = new Set(ids.filter(id => !["s03", "s07", "s12"].includes(id)));
  for (let i = 0; i < 20; i++) {
    const picked = buildSentenceSession(deck, { done }).ids;
    for (const id of ["s03", "s07", "s12"]) assert.ok(picked.includes(id), `${id} має потрапити в сесію`);
  }
  // з нуля — не повторює щойно пройдене, поки є інше
  const first = buildSentenceSession(deck).ids;
  const next = buildSentenceSession(deck, { avoid: new Set(first) }).ids;
  assert.ok(next.every(id => !first.includes(id)));
  // і навіть пройдені можуть потрапити, коли непройдених менше за 10
  assert.equal(buildSentenceSession(deck, { done: new Set(ids) }).ids.length, 10);
});

test("з помилкою з першого разу речення йдуть на повтор", () => {
  const s = { round: 1, ids: ["s01", "s02", "s03", "s04"], index: 4, results: [true, false, true, false] };
  assert.deepEqual(sentencesToRetry(s), ["s02", "s04"]);
  assert.equal(isSentenceSessionFinished(s), true);
  assert.equal(isSentenceSessionFinished({ ...s, index: 3, results: [true, false, true] }), false);
});

test("збережена сесія відновлюється, зіпсована чи застаріла — ні", () => {
  const s = buildSentenceSession(deck);
  assert.deepEqual(restoreSentenceSession(JSON.parse(JSON.stringify(s)), deck), s);
  const mid = { ...s, index: 2, results: [true, false] };
  assert.deepEqual(restoreSentenceSession(mid, deck), mid);
  assert.equal(restoreSentenceSession(null, deck), null);
  assert.equal(restoreSentenceSession({ ...s, ids: ["s01", "s99"] }, deck), null);
  assert.equal(restoreSentenceSession({ ...s, index: 99 }, deck), null);
  assert.equal(restoreSentenceSession({ ...s, index: 1, results: [] }, deck), null);
  assert.equal(restoreSentenceSession({ ...s, round: 0 }, deck), null);
});

// ─── Прогрес ──────────────────────────────────────────────────────────────────

test("прогрес — частка всіх речень, які хоч раз складено правильно", () => {
  const p0 = sentenceProgress(new Set(), deck);
  assert.deepEqual([p0.done, p0.total, p0.percent], [0, deck.sentences.length, 0]);
  const done = new Set(["s01", "s02", "s03"]);
  assert.equal(sentenceProgress(done, deck).done, 3);
  done.add("s01"); // те саме вдруге — множина не росте
  assert.equal(sentenceProgress(done, deck).done, 3);
  assert.equal(sentenceProgress(new Set(["s99", "сміття"]), deck).done, 0, "чужі id не рахуються");
  const all = new Set(ids);
  assert.equal(sentenceProgress(all, deck).percent, 100);
  all.delete("s42");
  assert.equal(sentenceProgress(all, deck).percent, 97); // 41 із 42 — ще не 98 і не 100
});

test("відповіді від клієнта: некоректні відхиляються", () => {
  const ok = { id: "s05", correct: false };
  assert.deepEqual(parseSentenceAnswers([ok], deck), [ok]);
  assert.equal(parseSentenceAnswers([], deck), null);
  assert.equal(parseSentenceAnswers("s05", deck), null);
  assert.equal(parseSentenceAnswers([{ id: "s99", correct: true }], deck), null);
  assert.equal(parseSentenceAnswers([{ id: "s05", correct: "yes" }], deck), null);
  assert.equal(parseSentenceAnswers([ok, null], deck), null);
  assert.equal(parseSentenceAnswers(Array(201).fill(ok), deck), null);
});
