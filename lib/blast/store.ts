// Рекорди Blast у Neon. Лише читання/запис рядків — правила гри в ./core.ts.
import sql, { once } from "@/lib/db";

export type BlastRecord = { score: number; level: number };

/**
 * Створює таблицю, якщо її ще немає. Один раз на процес.
 * Перша версія гри рахувала бали інакше (сотні за влучання) і не мала рівня — такі рекорди
 * (best_level порожній або 0) нова гра ніколи б не побила, тож вони видаляються.
 */
export const ensureSchema = once(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS blast_scores (
      set_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      best_score INTEGER NOT NULL CHECK (best_score >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (set_id, group_id)
    )`;
  await sql`ALTER TABLE blast_scores ADD COLUMN IF NOT EXISTS best_level INTEGER`;
  // Справжня гра завжди дає рівень ≥ 1; 0 лишився від проміжної міграції з DEFAULT 0
  await sql`DELETE FROM blast_scores WHERE best_level IS NULL OR best_level < 1`;
});

export async function loadBest(setId: string, groupId: string): Promise<BlastRecord | null> {
  const rows = (await sql`
    SELECT best_score, best_level FROM blast_scores WHERE set_id = ${setId} AND group_id = ${groupId}
  `) as { best_score: number; best_level: number }[];
  const r = rows[0];
  return r ? { score: r.best_score, level: r.best_level } : null;
}

/** Рекорд — одна найкраща гра (за загальним рахунком) разом із її рівнем. Повертає рекорд після запису. */
export async function saveIfBest(setId: string, groupId: string, score: number, level: number): Promise<BlastRecord> {
  const rows = (await sql`
    INSERT INTO blast_scores (set_id, group_id, best_score, best_level) VALUES (${setId}, ${groupId}, ${score}, ${level})
    ON CONFLICT (set_id, group_id) DO UPDATE SET
      best_score = GREATEST(blast_scores.best_score, EXCLUDED.best_score),
      best_level = CASE WHEN EXCLUDED.best_score > blast_scores.best_score THEN EXCLUDED.best_level ELSE blast_scores.best_level END,
      updated_at = CASE WHEN EXCLUDED.best_score > blast_scores.best_score THEN NOW() ELSE blast_scores.updated_at END
    RETURNING best_score, best_level
  `) as { best_score: number; best_level: number }[];
  return { score: rows[0].best_score, level: rows[0].best_level };
}
