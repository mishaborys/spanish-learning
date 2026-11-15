// Інтерфейс модуля Learn: сторінки й API звертаються лише сюди.
import { ALL_WORDS_GROUP_ID, loadVocabularySets, type VocabGroup, type VocabSet } from "@/lib/vocabulary";
import { wordKey } from "@/lib/review/core";
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

function checkScope(scope: unknown): string {
  if (scope === "") return "";
  if (typeof scope === "string" && scope.startsWith("all:") && loadVocabularySets().some(s => `all:${s.id}` === scope)) return scope;
  throw new LearnInputError("Некоректна область прогресу");
}

/** Етапи слів за ключем; слова без запису в результаті немає (= «не вивчав»). */
export async function getStages(spanish: string[], scope = ""): Promise<Record<string, Stage>> {
  await store.ensureSchema();
  return store.loadStages(scope, [...new Set(spanish.map(wordKey))]);
}

/** Записує відповідь і повертає новий етап слова. */
export async function recordAnswer(input: { scope: string; key: string; kind: QuestionKind; correct: boolean }): Promise<Stage> {
  const { key, kind, correct } = input;
  const scope = checkScope(input.scope);
  if (typeof key !== "string" || !key || key.length > 200) throw new LearnInputError("Некоректне слово");
  if (kind !== "choice" && kind !== "write") throw new LearnInputError("Некоректний тип питання");
  if (typeof correct !== "boolean") throw new LearnInputError("Некоректна відповідь");
  if (!allWordKeys().has(key)) throw new LearnInputError("Такого слова немає в словнику");
  await store.ensureSchema();
  const current = (await store.loadStages(scope, [key]))[key] ?? "new";
  const stage = nextStage(current, kind, correct);
  await store.saveStage(scope, key, stage);
  return stage;
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
  const own = group.words.map(toOption);
  // «Усі слова» вже містять увесь набір — інших груп набору для них немає
  const inSet = group.id === ALL_WORDS_GROUP_ID ? [] : set.groups.filter(g => g.id !== group.id).flatMap(g => g.words.map(toOption));
  // Інші набори — у випадковому порядку, щоб варіанти не були щоразу ті самі; на екран досить кількох десятків
  const elsewhere = shuffle(sets.filter(s => s.id !== set.id).flatMap(s => s.groups.flatMap(g => g.words.map(toOption)))).slice(0, 60);

  const byTranslation = new Map<string, Set<string>>();
  for (const s of sets) for (const g of s.groups) for (const w of g.words) {
    const t = w.ukrainian.trim().toLowerCase();
    if (!byTranslation.has(t)) byTranslation.set(t, new Set());
    byTranslation.get(t)!.add(w.spanish);
  }
  const sameTranslation: Record<string, string[]> = {};
  for (const w of group.words) {
    const others = [...(byTranslation.get(w.ukrainian.trim().toLowerCase()) ?? [])].filter(s => wordKey(s) !== wordKey(w.spanish));
    if (others.length) sameTranslation[wordKey(w.spanish)] = others;
  }
  return { layers: [own, inSet, elsewhere], sameTranslation };
}
