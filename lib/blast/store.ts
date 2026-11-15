// Рекорди Blast у Neon. Лише читання/запис рядків — правила гри в ./core.ts.
import sql, { once } from "@/lib/db";

/** Створює таблицю, якщо її ще немає. Викликається один раз на процес. */
export const ensureSchema = once(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS blast_scores (
      set_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      best_score INTEGER NOT NULL CHECK (best_score >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (set_id, group_id)
    )`;
});

export async function loadBest(setId: string, groupId: string): Promise<number | null> {
  const rows = (await sql`
    SELECT best_score FROM blast_scores WHERE set_id = ${setId} AND group_id = ${groupId}
  `) as { best_score: number }[];
  return rows[0]?.best_score ?? null;
}

/** Зберігає результат, якщо він кращий за рекорд. Повертає рекорд після запису. */
export async function saveIfBest(setId: string, groupId: string, score: number): Promise<number> {
  const rows = (await sql`
    INSERT INTO blast_scores (set_id, group_id, best_score) VALUES (${setId}, ${groupId}, ${score})
    ON CONFLICT (set_id, group_id) DO UPDATE SET
      best_score = GREATEST(blast_scores.best_score, EXCLUDED.best_score),
      updated_at = CASE WHEN EXCLUDED.best_score > blast_scores.best_score THEN NOW() ELSE blast_scores.updated_at END
    RETURNING best_score
  `) as { best_score: number }[];
  return rows[0].best_score;
}
