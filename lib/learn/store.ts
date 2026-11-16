// Збереження етапів Learn у Neon. Лише читання/запис рядків — правила в ./core.ts.
import sql, { once } from "@/lib/db";
import type { Stage } from "./core";

/**
 * Створює таблицю, якщо її ще немає. Викликається один раз на процес.
 * `scope` — '' для звичайних груп (етап на слово, спільний для всіх груп)
 * або 'all:<набір>' для фінального проходу «Усі слова» (окремий прогрес).
 */
export const ensureSchema = once(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS learn_progress (
      scope TEXT NOT NULL DEFAULT '',
      word_key TEXT NOT NULL,
      stage TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope, word_key)
    )`;
  // Драбина виросла до чотирьох етапів: старе обмеження (3 етапи) замінюємо. Наявні 'learning' лишаються
  // чинними — такі слова просто далі йдуть на зворотний вибір, а потім на вписування.
  await sql`ALTER TABLE learn_progress DROP CONSTRAINT IF EXISTS learn_progress_stage_check`;
  await sql`
    DO $$ BEGIN
      ALTER TABLE learn_progress ADD CONSTRAINT learn_progress_stage_check
        CHECK (stage IN ('new', 'learning', 'familiar', 'mastered'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`;
});

export async function loadStages(scope: string, keys: string[]): Promise<Record<string, Stage>> {
  if (keys.length === 0) return {};
  const rows = (await sql`
    SELECT word_key, stage FROM learn_progress WHERE scope = ${scope} AND word_key = ANY(${keys})
  `) as { word_key: string; stage: Stage }[];
  return Object.fromEntries(rows.map(r => [r.word_key, r.stage]));
}

export async function saveStage(scope: string, key: string, stage: Stage): Promise<void> {
  await sql`
    INSERT INTO learn_progress (scope, word_key, stage) VALUES (${scope}, ${key}, ${stage})
    ON CONFLICT (scope, word_key) DO UPDATE SET stage = EXCLUDED.stage, updated_at = NOW()
  `;
}

export async function deleteStages(scope: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await sql`DELETE FROM learn_progress WHERE scope = ${scope} AND word_key = ANY(${keys})`;
}
