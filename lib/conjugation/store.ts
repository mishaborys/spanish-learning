// Прогрес «Відмінювання» в Neon. Лише читання/запис рядків — правила в ./core.ts.
import sql, { once } from "@/lib/db";
import { answerKey, type Answer, type Person, type Step } from "./core";

/** Створює таблицю, якщо її ще немає. Один раз на процес. */
export const ensureSchema = once(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS conjugation_progress (
      verb TEXT NOT NULL,
      person TEXT NOT NULL,
      step TEXT NOT NULL,
      correct INTEGER NOT NULL DEFAULT 0,
      wrong INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (verb, person, step)
    )`;
});

/** Ключі відповідей, на які хоч раз відповіли правильно. */
export async function loadDone(): Promise<string[]> {
  const rows = (await sql`
    SELECT verb, person, step FROM conjugation_progress WHERE correct > 0
  `) as { verb: string; person: Person; step: Step }[];
  return rows.map(r => answerKey(r.verb, r.person, r.step));
}

/** Записує відповіді: лічильники правильних і хибних на кожну відповідь додаються. */
export async function addAnswers(answers: Answer[]): Promise<void> {
  // Один запит не може двічі зачепити той самий рядок — тому спершу складаємо повтори
  const merged = new Map<string, { a: Answer; correct: number; wrong: number }>();
  for (const a of answers) {
    const key = answerKey(a.verb, a.person, a.step);
    const m = merged.get(key) ?? { a, correct: 0, wrong: 0 };
    if (a.correct) m.correct++; else m.wrong++;
    merged.set(key, m);
  }
  const rows = [...merged.values()];
  await sql`
    INSERT INTO conjugation_progress (verb, person, step, correct, wrong)
    SELECT * FROM unnest(
      ${rows.map(r => r.a.verb)}::text[], ${rows.map(r => r.a.person)}::text[], ${rows.map(r => r.a.step)}::text[],
      ${rows.map(r => r.correct)}::int[], ${rows.map(r => r.wrong)}::int[]
    )
    ON CONFLICT (verb, person, step) DO UPDATE SET
      correct = conjugation_progress.correct + EXCLUDED.correct,
      wrong = conjugation_progress.wrong + EXCLUDED.wrong,
      updated_at = NOW()
  `;
}
