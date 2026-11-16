// Довге повторення слів зі Словника. Інтерфейс модуля для сторінки та API:
// getTodayReview · recordAnswer · undoAnswer · addBatch · checkInBatch.
import { loadVocabularySets, type VocabWord } from "@/lib/vocabulary";
import {
  addDays, countDue, firstLetterHint, GRADES, kyivDay, nextCard, pickBatch, scheduleDay, wordKey,
  type Grade,
} from "./core";
import * as store from "./store";

export type { Grade } from "./core";

/** Некоректні дані від клієнта (на відміну від збоїв БД). */
export class ReviewInputError extends Error {}

export type ReviewItem = {
  key: string;
  word: VocabWord;
  /** Інші іспанські слова з тим самим українським перекладом. */
  sameTranslation: string[];
  /** Підказка для UA→ES, якщо переклад неоднозначний. */
  hint: string | null;
};

export type ReviewToday = {
  day: string;
  batch: number;
  items: ReviewItem[];
  /** Оцінки слів поточної добірки. */
  answers: Record<string, Grade>;
  /** seen — скільки слів словника вже повторювали; today — скільки оцінено сьогодні в усіх добірках. */
  stats: { seen: number; total: number; dueTomorrow: number; today: number };
};

type Vocabulary = { words: Map<string, VocabWord>; byTranslation: Map<string, string[]> };

function loadVocabulary(): Vocabulary {
  const words = new Map<string, VocabWord>();
  for (const set of loadVocabularySets())
    for (const group of set.groups)
      for (const w of group.words) {
        const key = wordKey(w.spanish);
        if (!words.has(key)) words.set(key, w);
      }
  const byTranslation = new Map<string, string[]>();
  for (const w of words.values()) {
    const t = w.ukrainian.trim().toLowerCase();
    byTranslation.set(t, [...(byTranslation.get(t) ?? []), w.spanish]);
  }
  return { words, byTranslation };
}

function toItem(key: string, vocab: Vocabulary): ReviewItem | null {
  const word = vocab.words.get(key);
  if (!word) return null;
  const sameTranslation = (vocab.byTranslation.get(word.ukrainian.trim().toLowerCase()) ?? [])
    .filter(s => s !== word.spanish);
  return { key, word, sameTranslation, hint: sameTranslation.length > 0 ? firstLetterHint(word.spanish) : null };
}

/** Сьогоднішня (остання) добірка. Створює її при першому відкритті за день. */
export async function getTodayReview(now = new Date()): Promise<ReviewToday> {
  await store.ensureSchema();
  const day = kyivDay(now);
  const vocab = loadVocabulary();

  const [initialBatches, cards] = await Promise.all([store.loadBatches(day), store.loadCards()]);
  let batches = initialBatches;
  if (batches.length === 0) {
    const keys = pickBatch({ cards, allKeys: [...vocab.words.keys()], today: day });
    await store.insertBatch(day, 0, keys);
    batches = await store.loadBatches(day);
  }

  const current = batches[batches.length - 1];
  const answers: Record<string, Grade> = {};
  const todayAnswers = await store.loadAnswers(day);
  for (const a of todayAnswers) if (a.batch === current.batch) answers[a.wordKey] = a.grade;

  const allKeys = new Set(vocab.words.keys());
  return {
    day,
    batch: current.batch,
    items: current.wordKeys.map(k => toItem(k, vocab)).filter((i): i is ReviewItem => i !== null),
    answers,
    stats: {
      seen: cards.filter(c => allKeys.has(c.key)).length,
      total: allKeys.size,
      dueTomorrow: countDue(cards, addDays(day, 1), allKeys),
      today: todayAnswers.length,
    },
  };
}

function checkKey(input: { day: unknown; batch: unknown; key: unknown }) {
  if (typeof input.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new ReviewInputError("Некоректний день");
  if (!Number.isInteger(input.batch)) throw new ReviewInputError("Некоректна добірка");
  if (typeof input.key !== "string") throw new ReviewInputError("Некоректне слово");
}

/** Перевіряє, що слово є в добірці (інакше — ReviewInputError). */
export async function checkInBatch(input: { day: string; batch: number; key: string }): Promise<void> {
  checkKey(input);
  await store.ensureSchema();
  const batch = (await store.loadBatches(input.day)).find(b => b.batch === input.batch);
  if (!batch?.wordKeys.includes(input.key)) throw new ReviewInputError("Слова немає в цій добірці");
}

/**
 * Фіксує оцінку слова і переносить його в розкладі. Рахується перша оцінка слова в добірці —
 * повторні ігноруються. `answeredOn` — день, коли відповіли (оцінку могли поставити без інтернету).
 */
export async function recordAnswer(
  input: { day: string; batch: number; key: string; grade: Grade; answeredOn?: string },
  now = new Date(),
): Promise<void> {
  if (!GRADES.includes(input.grade)) throw new ReviewInputError(`Unknown grade: ${input.grade}`);
  await checkInBatch(input);
  const prev = await store.loadCard(input.key);
  const fresh = await store.insertAnswer(input.day, input.batch, input.key, input.grade, prev);
  if (!fresh) return;
  // Розклад рахуємо від дня відповіді: сесію могли почати до півночі, а відповісти після,
  // або відповісти без інтернету й відправити пізніше.
  const day = scheduleDay({
    batchDay: input.day,
    answeredOn: typeof input.answeredOn === "string" ? input.answeredOn : undefined,
    today: kyivDay(now),
  });
  try {
    await store.saveCard(nextCard(prev, input.key, input.grade, day), day);
  } catch (e) {
    // Без цього повторна спроба була б проігнорована як дубль, а розклад не оновився б.
    await store.deleteAnswer(input.day, input.batch, input.key).catch(() => {});
    throw e;
  }
}

/** Скасовує оцінку («Назад» у Flashcards): слово повертається в розклад таким, яким було до неї. */
export async function undoAnswer(input: { day: string; batch: number; key: string }): Promise<void> {
  checkKey(input);
  await store.ensureSchema();
  const taken = await store.takeAnswer(input.day, input.batch, input.key);
  if (taken) await store.restoreCard(input.key, taken.card);
}

/** «Ще 10»: нова добірка за тим самим правилом, без слів, які вже були сьогодні. */
export async function addBatch(now = new Date()): Promise<void> {
  await store.ensureSchema();
  const day = kyivDay(now);
  const batches = await store.loadBatches(day);
  if (batches.length === 0) { await getTodayReview(now); return; }
  const exclude = new Set(batches.flatMap(b => b.wordKeys));
  const vocab = loadVocabulary();
  const keys = pickBatch({ cards: await store.loadCards(), allKeys: [...vocab.words.keys()], exclude, today: day });
  await store.insertBatch(day, batches[batches.length - 1].batch + 1, keys);
}
