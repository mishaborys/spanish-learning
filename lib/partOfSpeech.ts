// Частини мови слів Словника (`part_of_speech` у data/vocabulary/*.json). Чистий модуль: працює і на сервері, і в браузері.

/**
 * Допустимі значення. `phrase` — вирази й речення, що не зводяться до однієї частини мови
 * («hace frío», «¿Qué tiempo hace?», «bajo cero»). Прийменникові звороти («delante de») — `preposition`.
 */
export const PARTS_OF_SPEECH = [
  "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "numeral", "interjection", "phrase",
] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export function isPartOfSpeech(value: unknown): value is PartOfSpeech {
  return typeof value === "string" && (PARTS_OF_SPEECH as readonly string[]).includes(value);
}

/** Службові слова: між собою схожі (прислівник серед прийменників не впадає в око), тож добираємо їх одне до одного. */
const FUNCTION_WORDS: readonly PartOfSpeech[] = ["adverb", "preposition", "conjunction", "pronoun", "numeral", "interjection"];

/** Наскільки слово `other` схоже на `target` для підбору хибних варіантів: 0 — та сама частина мови, 1 — споріднена, 2 — інша. */
export function likeness(target: PartOfSpeech | undefined, other: PartOfSpeech | undefined): 0 | 1 | 2 {
  if (target === other) return 0;
  if (target && other && FUNCTION_WORDS.includes(target) && FUNCTION_WORDS.includes(other)) return 1;
  return 2;
}
