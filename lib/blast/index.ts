// Інтерфейс модуля Blast: сторінки й API звертаються лише сюди.
import { findGroup, loadVocabularySet } from "@/lib/vocabulary";
import { maxPlausibleScore, minScoreToReach } from "./core";
import * as store from "./store";

export type { BlastRecord } from "./store";

export class BlastInputError extends Error {}

/** Рекорд групи; null — ще не грав. */
export async function getBest(setId: string, groupId: string): Promise<store.BlastRecord | null> {
  await store.ensureSchema();
  return store.loadBest(setId, groupId);
}

/** Записує результат гри (загальний рахунок і рівень, до якого дійшов); повертає рекорд групи. */
export async function recordScore(input: { setId: string; groupId: string; score: number; level: number }): Promise<store.BlastRecord> {
  const { setId, groupId, score, level } = input;
  const set = typeof setId === "string" ? loadVocabularySet(setId) : null;
  const group = set && typeof groupId === "string" ? findGroup(set, groupId) : null;
  if (!set || !group) throw new BlastInputError("Такої групи немає");
  if (!Number.isInteger(level) || level < 1 || level > 100) throw new BlastInputError("Некоректний рівень");
  // Гра на час, тож точного максимуму немає. Але рахунок має відповідати рівню:
  // щоб дійти до рівня, треба було набрати цілі всіх попередніх, і не більше, ніж реально встигнути
  if (!Number.isInteger(score) || score < minScoreToReach(level) || score > maxPlausibleScore(level)) {
    throw new BlastInputError("Некоректний рахунок");
  }
  await store.ensureSchema();
  return store.saveIfBest(set.id, group.id, score, level);
}
