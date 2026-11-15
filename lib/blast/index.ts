// Інтерфейс модуля Blast: сторінки й API звертаються лише сюди.
import { findGroup, loadVocabularySet } from "@/lib/vocabulary";
import { wordKey } from "@/lib/review/core";
import { maxScore } from "./core";
import * as store from "./store";

export class BlastInputError extends Error {}

/** Рекорд групи; null — ще не грав. */
export async function getBest(setId: string, groupId: string): Promise<number | null> {
  await store.ensureSchema();
  return store.loadBest(setId, groupId);
}

/** Записує результат гри; повертає рекорд групи після запису. */
export async function recordScore(input: { setId: string; groupId: string; score: number }): Promise<number> {
  const { setId, groupId, score } = input;
  const set = typeof setId === "string" ? loadVocabularySet(setId) : null;
  const group = set && typeof groupId === "string" ? findGroup(set, groupId) : null;
  if (!set || !group) throw new BlastInputError("Такої групи немає");
  // У грі кожне слово (без повторів написання) — рівно один раз; більше за ідеальну гру не буває
  const words = new Set(group.words.map(w => wordKey(w.spanish))).size;
  if (!Number.isInteger(score) || score < 0 || score > maxScore(words)) throw new BlastInputError("Некоректний рахунок");
  await store.ensureSchema();
  return store.saveIfBest(set.id, group.id, score);
}
