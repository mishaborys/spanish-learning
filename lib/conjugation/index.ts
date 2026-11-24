// Інтерфейс модуля прогресу «Відмінювання»: перевіряє вхід і ховає БД.
import { parseAnswers } from "./core";
import { loadConjugation } from "./data";
import { addAnswers, ensureSchema, loadDone } from "./store";

/** Некоректні дані від клієнта (на відміну від збоїв БД). */
export class ConjugationInputError extends Error {}

/** Ключі відповідей, на які вже відповідали правильно (див. `answerKey`). */
export async function getDoneKeys(): Promise<string[]> {
  await ensureSchema();
  return loadDone();
}

export async function recordAnswers(raw: unknown): Promise<void> {
  const answers = parseAnswers(raw, loadConjugation());
  if (!answers) throw new ConjugationInputError("Некоректні відповіді");
  await ensureSchema();
  await addAnswers(answers);
}
