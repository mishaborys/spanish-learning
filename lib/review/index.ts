// Довге повторення слів зі Словника. Інтерфейс модуля для сторінки та API:
// getTodayReview · recordAnswer · addBatch · changeMode.
import { loadVocabularySets, type VocabWord } from "@/lib/vocabulary";
import {
  addDays, countDue, firstLetterHint, GRADES, kyivDay, MODES, nextCard, pickBatch, pickMode, wordKey,
  type Grade, type Mode,
} from "./core";
import * as store from "./store";

export type { Grade, Mode } from "./core";

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
  mode: Mode;
  items: ReviewItem[];
  answers: Record<string, Grade>;
  stats: { seen: number; total: number; dueTomorrow: number };
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
    const mode = pickMode(await store.lastModeBefore(day));
    const keys = pickBatch({ cards, allKeys: [...vocab.words.keys()], today: day });
    await store.insertBatch(day, 0, mode, keys);
    batches = await store.loadBatches(day);
  }

  const current = batches[batches.length - 1];
  const answers: Record<string, Grade> = {};
  for (const a of await store.loadAnswers(day)) if (a.batch === current.batch) answers[a.wordKey] = a.grade;

  const allKeys = new Set(vocab.words.keys());
  return {
    day,
    batch: current.batch,
    mode: current.mode,
    items: current.wordKeys.map(k => toItem(k, vocab)).filter((i): i is ReviewItem => i !== null),
    answers,
    stats: {
      seen: cards.filter(c => allKeys.has(c.key)).length,
      total: allKeys.size,
      dueTomorrow: countDue(cards, addDays(day, 1), allKeys),
    },
  };
}

/** Фіксує оцінку слова і переносить його в розкладі. Повторний запис ігнорується. */
export async function recordAnswer(
  input: { day: string; batch: number; key: string; grade: Grade },
  now = new Date(),
): Promise<void> {
  if (!GRADES.includes(input.grade)) throw new ReviewInputError(`Unknown grade: ${input.grade}`);
  await store.ensureSchema();
  const batch = (await store.loadBatches(input.day)).find(b => b.batch === input.batch);
  if (!batch?.wordKeys.includes(input.key)) throw new ReviewInputError("Слова немає в цій добірці");
  const fresh = await store.insertAnswer(input.day, input.batch, input.key, input.grade);
  if (!fresh) return;
  // Розклад рахуємо від реального сьогодні: сесію могли почати до півночі, а відповісти після.
  const today = kyivDay(now);
  try {
    const prev = await store.loadCard(input.key);
    await store.saveCard(nextCard(prev, input.key, input.grade, today), today);
  } catch (e) {
    // Без цього повторна спроба була б проігнорована як дубль, а розклад не оновився б.
    await store.deleteAnswer(input.day, input.batch, input.key).catch(() => {});
    throw e;
  }
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
  await store.insertBatch(day, batches[batches.length - 1].batch + 1, batches[0].mode, keys);
}

export async function changeMode(mode: Mode, now = new Date()): Promise<void> {
  if (!MODES.includes(mode)) throw new ReviewInputError(`Unknown mode: ${mode}`);
  await store.ensureSchema();
  await store.updateMode(kyivDay(now), mode);
}
