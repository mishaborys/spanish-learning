// Прогрес «Речень» у Neon. Лише читання/запис рядків — правила в ./core.ts.
import sql, { once } from "@/lib/db";
import type { SentenceAnswer } from "./core";

/** Створює таблицю, якщо її ще немає. Один раз на процес. */
export const ensureSchema = once(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS sentence_progress (
      deck TEXT NOT NULL,
      sentence_id TEXT NOT NULL,
      correct INTEGER NOT NULL DEFAULT 0,
      wrong INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (deck, sentence_id)
    )`;
});

/** id речень, які хоч раз складено правильно. */
export async function loadDoneIds(deck: string): Promise<string[]> {
  const rows = (await sql`
    SELECT sentence_id FROM sentence_progress WHERE deck = ${deck} AND correct > 0
  `) as { sentence_id: string }[];
  return rows.map(r => r.sentence_id);
}

/** Записує відповіді: лічильники правильних і хибних на кожне речення додаються. */
export async function addAnswers(deck: string, answers: SentenceAnswer[]): Promise<void> {
  // Один запит не може двічі зачепити той самий рядок — тому спершу складаємо повтори
  const merged = new Map<string, { correct: number; wrong: number }>();
  for (const a of answers) {
    const m = merged.get(a.id) ?? { correct: 0, wrong: 0 };
    if (a.correct) m.correct++; else m.wrong++;
    merged.set(a.id, m);
  }
  const ids = [...merged.keys()];
  const values = [...merged.values()];
  await sql`
    INSERT INTO sentence_progress (deck, sentence_id, correct, wrong)
    SELECT ${deck}, * FROM unnest(${ids}::text[], ${values.map(v => v.correct)}::int[], ${values.map(v => v.wrong)}::int[])
    ON CONFLICT (deck, sentence_id) DO UPDATE SET
      correct = sentence_progress.correct + EXCLUDED.correct,
      wrong = sentence_progress.wrong + EXCLUDED.wrong,
      updated_at = NOW()
  `;
}
