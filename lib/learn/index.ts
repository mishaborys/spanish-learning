// Інтерфейс модуля Learn: сторінки й API звертаються лише сюди.
import { ALL_WORDS_GROUP_ID, loadVocabularySets, type VocabGroup, type VocabSet, type VocabWord } from "@/lib/vocabulary";
import { wordKey } from "@/lib/review/core";
import { checkInBatch, ReviewInputError } from "@/lib/review";
import { nextStage, shuffle, type Option, type QuestionKind, type Stage } from "./core";
import * as store from "./store";
import { randomInt } from "node:crypto";

export type { Option, QuestionKind, Stage } from "./core";
export { wordKey };

export class LearnInputError extends Error {}

/**
 * Область прогресу: звичайні групи ділять один прогрес на слово (''),
 * «Усі слова» набору — окремий ('all:<набір>'), щоб фінальний прохід був справжнім.
 */
export function learnScope(set: VocabSet, group: VocabGroup): string {
  return group.id === ALL_WORDS_GROUP_ID ? `all:${set.id}` : "";
}

/** Область прогресу Learn для добірки Повторення: у кожної добірки свій, на групи й розклад не впливає. */
export function reviewLearnScope(day: string, batch: number): string {
  return `review:${day}:${batch}`;
}

function parseReviewScope(scope: string): { day: string; batch: number } | null {
  const m = scope.match(/^review:(\d{4}-\d{2}-\d{2}):(\d{1,4})$/);
  return m ? { day: m[1], batch: Number(m[2]) } : null;
}

function checkScope(scope: unknown): string {
  if (scope === "") return "";
  if (typeof scope === "string" && parseReviewScope(scope)) return scope;
  if (typeof scope === "string" && scope.startsWith("all:") && loadVocabularySets().some(s => `all:${s.id}` === scope)) return scope;
  throw new LearnInputError("Некоректна область прогресу");
}

/** Етапи слів за ключем; слова без запису в результаті немає (= «не вивчав»). */
export async function getStages(spanish: string[], scope = ""): Promise<Record<string, Stage>> {
  await store.ensureSchema();
  return store.loadStages(scope, [...new Set(spanish.map(wordKey))]);
}

/** Записує відповідь і повертає новий етап слова. На розклад Повторення Learn не впливає. */
export async function recordAnswer(input: { scope: string; key: string; kind: QuestionKind; correct: boolean }): Promise<Stage> {
  const { key, kind, correct } = input;
  const scope = checkScope(input.scope);
  if (typeof key !== "string" || !key || key.length > 200) throw new LearnInputError("Некоректне слово");
  if (kind !== "choice" && kind !== "write") throw new LearnInputError("Некоректний тип питання");
  if (typeof correct !== "boolean") throw new LearnInputError("Некоректна відповідь");
  if (!allWordKeys().has(key)) throw new LearnInputError("Такого слова немає в словнику");
  const review = parseReviewScope(scope);
  if (review) await asLearnError(checkInBatch({ ...review, key }));
  await store.ensureSchema();
  const current = (await store.loadStages(scope, [key]))[key] ?? "new";
  const stage = nextStage(current, kind, correct);
  await store.saveStage(scope, key, stage);
  return stage;
}

async function asLearnError<T>(p: Promise<T>): Promise<T> {
  try { return await p; } catch (e) {
    if (e instanceof ReviewInputError) throw new LearnInputError(e.message);
    throw e;
  }
}

/** Скидає прогрес слів (усі стають «не вивчав»). */
export async function resetWords(keys: string[], scope: string): Promise<void> {
  const checked = checkScope(scope);
  if (!Array.isArray(keys) || keys.length > 2000 || keys.some(k => typeof k !== "string")) {
    throw new LearnInputError("Некоректний список слів");
  }
  await store.ensureSchema();
  await store.deleteStages(checked, keys);
}

/** Зерно для раунду й варіантів: генерується на сервері, щоб браузер склав той самий раунд. */
export function newSeed(): number {
  return randomInt(2 ** 31);
}

let cachedKeys: { at: number; keys: Set<string> } | undefined;

/** Ключі всіх слів словника; кеш на хвилину, щоб не читати файли на кожну відповідь. */
function allWordKeys(): Set<string> {
  if (!cachedKeys || Date.now() - cachedKeys.at > 60_000) {
    cachedKeys = {
      at: Date.now(),
      keys: new Set(loadVocabularySets().flatMap(s => s.groups.flatMap(g => g.words.map(w => wordKey(w.spanish))))),
    };
  }
  return cachedKeys.keys;
}

/** Що потрібно екрану Learn, окрім самих слів групи. */
export type LearnMaterials = {
  /** Запас хибних варіантів у порядку: своя група → інші групи набору → інші набори. */
  layers: Option[][];
  /** Для кожного слова групи — інші іспанські слова з тим самим перекладом. */
  sameTranslation: Record<string, string[]>;
};

const toOption = (w: { spanish: string; ukrainian: string }): Option => ({ key: wordKey(w.spanish), text: w.ukrainian });

export function learnMaterials(set: VocabSet, group: VocabGroup): LearnMaterials {
  const sets = loadVocabularySets();
  // «Усі слова» вже містять увесь набір — інших груп набору для них немає
  const inSet = group.id === ALL_WORDS_GROUP_ID ? [] : set.groups.filter(g => g.id !== group.id).flatMap(g => g.words.map(toOption));
  const elsewhere = sets.filter(s => s.id !== set.id).flatMap(s => s.groups.flatMap(g => g.words.map(toOption)));
  return materials(sets, group.words, inSet, elsewhere);
}

/** Learn для добірки Повторення: хибні варіанти — з інших слів Словника. */
export function reviewLearnMaterials(words: VocabWord[]): LearnMaterials {
  const sets = loadVocabularySets();
  const own = new Set(words.map(w => wordKey(w.spanish)));
  const elsewhere = sets.flatMap(s => s.groups.flatMap(g => g.words.map(toOption))).filter(o => !own.has(o.key));
  return materials(sets, words, [], elsewhere);
}

function materials(sets: VocabSet[], words: VocabWord[], inSet: Option[], elsewhereAll: Option[]): LearnMaterials {
  const own = words.map(toOption);
  // Інші набори — у випадковому порядку, щоб варіанти не були щоразу ті самі; на екран досить кількох десятків
  const elsewhere = shuffle(elsewhereAll).slice(0, 60);

  const byTranslation = new Map<string, Set<string>>();
  for (const s of sets) for (const g of s.groups) for (const w of g.words) {
    const t = w.ukrainian.trim().toLowerCase();
    if (!byTranslation.has(t)) byTranslation.set(t, new Set());
    byTranslation.get(t)!.add(w.spanish);
  }
  const sameTranslation: Record<string, string[]> = {};
  for (const w of words) {
    const others = [...(byTranslation.get(w.ukrainian.trim().toLowerCase()) ?? [])].filter(s => wordKey(s) !== wordKey(w.spanish));
    if (others.length) sameTranslation[wordKey(w.spanish)] = others;
  }
  return { layers: [own, inSet, elsewhere], sameTranslation };
}
