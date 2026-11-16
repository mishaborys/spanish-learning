// Збереження стану довгого повторення в Neon. Лише читання/запис рядків —
// усі правила в ./core.ts.
import sql, { once } from "@/lib/db";
import type { Card, Grade } from "./core";

/** Створює таблиці, якщо їх ще немає. Викликається один раз на процес. */
export const ensureSchema = once(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS review_cards (
      word_key TEXT PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 0,
      due_on DATE NOT NULL,
      last_grade TEXT NOT NULL CHECK (last_grade IN ('known', 'hesitant', 'unknown')),
      times_reviewed INTEGER NOT NULL DEFAULT 0,
      last_reviewed_on DATE
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS review_batches (
      day DATE NOT NULL,
      batch INTEGER NOT NULL,
      mode TEXT NOT NULL,
      word_keys TEXT[] NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (day, batch)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS review_answers (
      day DATE NOT NULL,
      batch INTEGER NOT NULL,
      word_key TEXT NOT NULL,
      grade TEXT NOT NULL CHECK (grade IN ('known', 'hesitant', 'unknown')),
      answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (day, batch, word_key)
    )`;
  // Стан слова до оцінки — щоб «Назад» у Flashcards міг її повністю скасувати.
  // {"card": null} — слово до оцінки ще не повторювали; NULL — відповідь записана до появи колонки.
  await sql`ALTER TABLE review_answers ADD COLUMN IF NOT EXISTS prev_card JSONB`;
});

export type BatchRow = { batch: number; wordKeys: string[] };
/** Рядок розкладу слова повністю — щоб відновити його при скасуванні оцінки. */
export type CardRow = Card & { timesReviewed: number; lastReviewedOn: string | null };
export type AnswerRow = { batch: number; wordKey: string; grade: Grade };

export async function loadCards(): Promise<Card[]> {
  const rows = (await sql`
    SELECT word_key, level, due_on::text AS due_on, last_grade FROM review_cards
  `) as { word_key: string; level: number; due_on: string; last_grade: Grade }[];
  return rows.map(r => ({ key: r.word_key, level: r.level, dueOn: r.due_on, lastGrade: r.last_grade }));
}

export async function loadCard(key: string): Promise<CardRow | null> {
  const rows = (await sql`
    SELECT word_key, level, due_on::text AS due_on, last_grade, times_reviewed, last_reviewed_on::text AS last_reviewed_on
    FROM review_cards WHERE word_key = ${key}
  `) as { word_key: string; level: number; due_on: string; last_grade: Grade; times_reviewed: number; last_reviewed_on: string | null }[];
  const r = rows[0];
  return r ? {
    key: r.word_key, level: r.level, dueOn: r.due_on, lastGrade: r.last_grade,
    timesReviewed: r.times_reviewed, lastReviewedOn: r.last_reviewed_on,
  } : null;
}

export async function loadBatches(day: string): Promise<BatchRow[]> {
  const rows = (await sql`
    SELECT batch, word_keys FROM review_batches WHERE day = ${day} ORDER BY batch ASC
  `) as { batch: number; word_keys: string[] }[];
  return rows.map(r => ({ batch: r.batch, wordKeys: r.word_keys }));
}

export async function loadAnswers(day: string): Promise<AnswerRow[]> {
  const rows = (await sql`
    SELECT batch, word_key, grade FROM review_answers WHERE day = ${day}
  `) as { batch: number; word_key: string; grade: Grade }[];
  return rows.map(r => ({ batch: r.batch, wordKey: r.word_key, grade: r.grade }));
}

export async function insertBatch(day: string, batch: number, wordKeys: string[]): Promise<void> {
  // Колонка mode лишилась від «режиму дня», якого більше немає
  await sql`
    INSERT INTO review_batches (day, batch, mode, word_keys)
    VALUES (${day}, ${batch}, 'cards', ${wordKeys})
    ON CONFLICT (day, batch) DO NOTHING
  `;
}

/**
 * Записує відповідь разом зі станом слова до неї (null — слово ще не повторювали).
 * Повертає false, якщо на це слово в цій добірці вже відповідали.
 */
export async function insertAnswer(day: string, batch: number, key: string, grade: Grade, prev: CardRow | null): Promise<boolean> {
  const rows = await sql`
    INSERT INTO review_answers (day, batch, word_key, grade, prev_card)
    VALUES (${day}, ${batch}, ${key}, ${grade}, ${JSON.stringify({ card: prev })}::jsonb)
    ON CONFLICT (day, batch, word_key) DO NOTHING
    RETURNING word_key
  `;
  return (rows as unknown[]).length > 0;
}

/**
 * Видаляє відповідь і повертає збережений стан слова до неї (`card: null` — слово ще не повторювали).
 * Відповіді без збереженого стану не чіпає: повертає null, як і коли відповіді немає.
 */
export async function takeAnswer(day: string, batch: number, key: string): Promise<{ card: CardRow | null } | null> {
  const rows = (await sql`
    DELETE FROM review_answers
    WHERE day = ${day} AND batch = ${batch} AND word_key = ${key} AND prev_card IS NOT NULL
    RETURNING prev_card
  `) as { prev_card: { card: CardRow | null } }[];
  return rows[0]?.prev_card ?? null;
}

/** Повертає розклад слова до збереженого стану (null — прибрати слово з розкладу). */
export async function restoreCard(key: string, prev: CardRow | null): Promise<void> {
  if (!prev) {
    await sql`DELETE FROM review_cards WHERE word_key = ${key}`;
    return;
  }
  await sql`
    UPDATE review_cards SET
      level = ${prev.level}, due_on = ${prev.dueOn}, last_grade = ${prev.lastGrade},
      times_reviewed = ${prev.timesReviewed}, last_reviewed_on = ${prev.lastReviewedOn}
    WHERE word_key = ${key}
  `;
}

export async function deleteAnswer(day: string, batch: number, key: string): Promise<void> {
  await sql`DELETE FROM review_answers WHERE day = ${day} AND batch = ${batch} AND word_key = ${key}`;
}

export async function saveCard(card: Card, today: string): Promise<void> {
  await sql`
    INSERT INTO review_cards (word_key, level, due_on, last_grade, times_reviewed, last_reviewed_on)
    VALUES (${card.key}, ${card.level}, ${card.dueOn}, ${card.lastGrade}, 1, ${today})
    ON CONFLICT (word_key) DO UPDATE SET
      level = EXCLUDED.level,
      due_on = EXCLUDED.due_on,
      last_grade = EXCLUDED.last_grade,
      times_reviewed = review_cards.times_reviewed + 1,
      last_reviewed_on = EXCLUDED.last_reviewed_on
  `;
}
