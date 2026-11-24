// Інтерфейс модуля «Речення»: перевіряє вхід і ховає БД.
import { parseSentenceAnswers } from "./core";
import { loadSentenceDeck } from "./data";
import { addAnswers, ensureSchema, loadDoneIds } from "./store";

/** Некоректні дані від клієнта (на відміну від збоїв БД). */
export class SentenceInputError extends Error {}

/** id речень колоди, які вже складали правильно. */
export async function getDoneSentenceIds(deck: string): Promise<string[]> {
  await ensureSchema();
  return loadDoneIds(deck);
}

export async function recordSentenceAnswers(deckId: unknown, raw: unknown): Promise<void> {
  const deck = typeof deckId === "string" ? loadSentenceDeck(deckId) : null;
  if (!deck) throw new SentenceInputError("Невідома колода");
  const answers = parseSentenceAnswers(raw, deck);
  if (!answers) throw new SentenceInputError("Некоректні відповіді");
  await ensureSchema();
  await addAnswers(deck.id, answers);
}
