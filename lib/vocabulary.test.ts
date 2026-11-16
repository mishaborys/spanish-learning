import { test } from "node:test";
import assert from "node:assert/strict";
import { isPartOfSpeech, PARTS_OF_SPEECH } from "./partOfSpeech";
import { loadVocabularySets } from "./vocabulary";

// Дані Словника — контракт: кожне слово має частину мови, інакше Learn не зможе підібрати схожі хибні варіанти.
// Тест падає на новому наборі без `part_of_speech` або з довільним значенням.

const words = loadVocabularySets().flatMap(s => s.groups.flatMap(g => g.words.map(w => ({ set: s.id, ...w }))));
const firstWord = (s: string) => s.trim().toLowerCase().split(/[\s,;/(]+/)[0];

test("кожне слово Словника має допустиму частину мови", () => {
  const bad = words.filter(w => !isPartOfSpeech(w.part_of_speech)).map(w => `${w.set}: ${w.spanish} → ${JSON.stringify(w.part_of_speech)}`);
  assert.deepEqual(bad, [], `Допустимі значення part_of_speech: ${PARTS_OF_SPEECH.join(", ")}`);
});

test("дієслово — це інфінітив (-ar/-er/-ir, можливо -se)", () => {
  const bad = words.filter(w => w.part_of_speech === "verb" && !/(ar|er|ir|ár|ér|ír)(se)?$/.test(firstWord(w.spanish)));
  assert.deepEqual(bad.map(w => `${w.set}: ${w.spanish}`), []);
});

test("слово з артиклем el/la/los/las — іменник (або вираз)", () => {
  const bad = words.filter(w => /^(el|la|los|las|el\/la)\s/i.test(w.spanish.trim()) && !["noun", "phrase"].includes(w.part_of_speech));
  assert.deepEqual(bad.map(w => `${w.set}: ${w.spanish} → ${w.part_of_speech}`), []);
});

test("український переклад — не латиницею (друкарська помилка)", () => {
  assert.deepEqual(words.filter(w => /^[a-z]+$/i.test(w.ukrainian.trim())).map(w => `${w.set}: ${w.spanish} = ${w.ukrainian}`), []);
});
