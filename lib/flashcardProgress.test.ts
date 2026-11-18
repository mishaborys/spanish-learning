import { test } from "node:test";
import assert from "node:assert/strict";
import { deckFromKeys, validIndex } from "./flashcardProgress";

const words = [{ s: "casa" }, { s: "perro" }, { s: "gato" }];
const key = (w: { s: string }) => w.s;

test("колода відновлюється в збереженому порядку", () => {
  assert.deepEqual(deckFromKeys(["gato", "casa"], words, key), [{ s: "gato" }, { s: "casa" }]);
});

test("якщо слова вже немає в наборі чи запис зіпсований — стан недійсний", () => {
  assert.equal(deckFromKeys(["gato", "mesa"], words, key), null);
  assert.equal(deckFromKeys("gato", words, key), null);
  assert.equal(deckFromKeys([1], words, key), null);
});

test("номер картки — від 0 до кінця колоди включно (підсумок)", () => {
  assert.equal(validIndex(0, 3), true);
  assert.equal(validIndex(3, 3), true);
  assert.equal(validIndex(4, 3), false);
  assert.equal(validIndex(-1, 3), false);
  assert.equal(validIndex(1.5, 3), false);
  assert.equal(validIndex("1", 3), false);
});
