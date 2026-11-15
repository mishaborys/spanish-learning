// Збереження стану довгого повторення в Neon. Лише читання/запис рядків —
// усі правила в ./core.ts.
import sql, { once } from "@/lib/db";
import type { Card, Grade, Mode } from "./core";

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
});

export type BatchRow = { batch: number; mode: Mode; wordKeys: string[] };
export type AnswerRow = { batch: number; wordKey: string; grade: Grade };

export async function loadCards(): Promise<Card[]> {
  const rows = (await sql`
    SELECT word_key, level, due_on::text AS due_on, last_grade FROM review_cards
  `) as { word_key: string; level: number; due_on: string; last_grade: Grade }[];
  return rows.map(r => ({ key: r.word_key, level: r.level, dueOn: r.due_on, lastGrade: r.last_grade }));
}

export async function loadCard(key: string): Promise<Card | null> {
  const rows = (await sql`
    SELECT word_key, level, due_on::text AS due_on, last_grade FROM review_cards WHERE word_key = ${key}
  `) as { word_key: string; level: number; due_on: string; last_grade: Grade }[];
  const r = rows[0];
  return r ? { key: r.word_key, level: r.level, dueOn: r.due_on, lastGrade: r.last_grade } : null;
}

export async function loadBatches(day: string): Promise<BatchRow[]> {
  const rows = (await sql`
    SELECT batch, mode, word_keys FROM review_batches WHERE day = ${day} ORDER BY batch ASC
  `) as { batch: number; mode: Mode; word_keys: string[] }[];
  return rows.map(r => ({ batch: r.batch, mode: r.mode, wordKeys: r.word_keys }));
}

export async function loadAnswers(day: string): Promise<AnswerRow[]> {
  const rows = (await sql`
    SELECT batch, word_key, grade FROM review_answers WHERE day = ${day}
  `) as { batch: number; word_key: string; grade: Grade }[];
  return rows.map(r => ({ batch: r.batch, wordKey: r.word_key, grade: r.grade }));
}

export async function lastModeBefore(day: string): Promise<Mode | null> {
  const rows = (await sql`
    SELECT mode FROM review_batches WHERE day < ${day} ORDER BY day DESC, batch ASC LIMIT 1
  `) as { mode: Mode }[];
  return rows[0]?.mode ?? null;
}

export async function insertBatch(day: string, batch: number, mode: Mode, wordKeys: string[]): Promise<void> {
  await sql`
    INSERT INTO review_batches (day, batch, mode, word_keys)
    VALUES (${day}, ${batch}, ${mode}, ${wordKeys})
    ON CONFLICT (day, batch) DO NOTHING
  `;
}

export async function updateMode(day: string, mode: Mode): Promise<void> {
  await sql`UPDATE review_batches SET mode = ${mode} WHERE day = ${day}`;
}

/** Записує відповідь. Повертає false, якщо на це слово в цій добірці вже відповідали. */
export async function insertAnswer(day: string, batch: number, key: string, grade: Grade): Promise<boolean> {
  const rows = await sql`
    INSERT INTO review_answers (day, batch, word_key, grade)
    VALUES (${day}, ${batch}, ${key}, ${grade})
    ON CONFLICT (day, batch, word_key) DO NOTHING
    RETURNING word_key
  `;
  return (rows as unknown[]).length > 0;
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
