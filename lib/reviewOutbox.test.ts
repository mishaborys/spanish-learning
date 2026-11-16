import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAnswers, type ReviewOp } from "./reviewOutbox";
import type { Grade } from "./review/core";

const at = { day: "2026-11-16", batch: 0 };
const answer = (key: string, grade: Grade): ReviewOp =>
  ({ op: "answer", ...at, key, grade, answeredOn: at.day });

test("ще не відправлені оцінки видно одразу, але перша оцінка слова лишається першою", () => {
  const merged = mergeAnswers({ casa: "known" }, [answer("casa", "unknown"), answer("perro", "hesitant")], at.day, at.batch);
  assert.deepEqual(merged, { casa: "known", perro: "hesitant" });
});

test("скасована оцінка зникає, а нова після скасування рахується", () => {
  const ops: ReviewOp[] = [{ op: "undo", ...at, key: "casa" }, answer("casa", "unknown")];
  assert.deepEqual(mergeAnswers({ casa: "known" }, ops, at.day, at.batch), { casa: "unknown" });
});

test("оцінки інших добірок не змішуються з поточною", () => {
  assert.deepEqual(mergeAnswers({}, [{ ...answer("casa", "known"), batch: 1 }], at.day, at.batch), {});
});

test("журнал поверх свіжого знімка сервера не змінює вже враховане (оцінка → скасування → нова оцінка)", () => {
  const ops: ReviewOp[] = [{ ...answer("casa", "known"), sent: true }, { op: "undo", ...at, key: "casa", sent: true }, answer("casa", "unknown")];
  assert.deepEqual(mergeAnswers({ casa: "unknown" }, ops, at.day, at.batch), { casa: "unknown" });
  assert.deepEqual(mergeAnswers({}, ops, at.day, at.batch), { casa: "unknown" });
});
