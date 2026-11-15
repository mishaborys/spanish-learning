// Збереження етапів Learn у Neon. Лише читання/запис рядків — правила в ./core.ts.
import sql from "@/lib/db";
import type { Stage } from "./core";

let ready: Promise<void> | undefined;

/**
 * Створює таблицю, якщо її ще немає. Викликається один раз на процес.
 * `scope` — '' для звичайних груп (етап на слово, спільний для всіх груп)
 * або 'all:<набір>' для фінального проходу «Усі слова» (окремий прогрес).
 */
export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS learn_progress (
        scope TEXT NOT NULL DEFAULT '',
        word_key TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('new', 'learning', 'mastered')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (scope, word_key)
      )`;
  })().catch(e => { ready = undefined; throw e; });
  return ready;
}

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
