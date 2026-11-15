// Правила режиму Learn у Словнику. Чистий модуль: без БД, без React —
// працює і на сервері, і в браузері, тестується напряму.
import { gradeTyped } from "@/lib/review/core";

/** Етап слова: не вивчав → ще вчу (пройшов вибір) → вивчено (ще й правильно вписав). */
export type Stage = "new" | "learning" | "mastered";
/** Тип питання: вибір із 4 перекладів або вписування іспанською. */
export type QuestionKind = "choice" | "write";

const STAGE_ORDER: Stage[] = ["new", "learning", "mastered"];

/** Етап після відповіді: помилка — назад на вибір; правильна відповідь етап не знижує. */
export function nextStage(stage: Stage, kind: QuestionKind, correct: boolean): Stage {
  if (!correct) return "new"; // повертається на вибір
  const reached: Stage = kind === "choice" ? "learning" : "mastered";
  return STAGE_ORDER.indexOf(reached) > STAGE_ORDER.indexOf(stage) ? reached : stage;
}

export type Rng = () => number;
export const ROUND_SIZE = 7;

export type LearnWord = { key: string; stage: Stage };
export type Question = { key: string; kind: QuestionKind };

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Раунд до 7 питань: спершу слова, що пройшли вибір і чекають на вписування,
 * потім нові на вибір (спершу ті, де помилився в цій сесії). Вивчені не потрапляють. Усередині раунду — перемішано.
 */
export function buildRound(opts: { words: LearnWord[]; missed?: Set<string>; rng?: Rng; size?: number }): Question[] {
  const { words, missed = new Set<string>(), rng = Math.random, size = ROUND_SIZE } = opts;
  const write = words.filter(w => w.stage === "learning").map(w => ({ key: w.key, kind: "write" as const }));
  // Серед нових спершу ті, де вже помилився, — вони мають повернутися в наступному раунді
  const fresh = words.filter(w => w.stage === "new");
  const choice = [...fresh.filter(w => missed.has(w.key)), ...fresh.filter(w => !missed.has(w.key))]
    .map(w => ({ key: w.key, kind: "choice" as const }));
  return shuffle([...write, ...choice].slice(0, size), rng);
}

/** Варіант відповіді на вибір: ключ слова + український переклад. */
export type Option = { key: string; text: string };

export const OPTION_COUNT = 4;
/** Запас слів, з якого беруться хибні варіанти (разом із правильним). */
export const OPTION_POOL = 20;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * 4 варіанти (1 правильний + 3 хибні), перемішані. Хибні беруться із запасу
 * щонайменше 20 слів: спершу своя група, потім інші групи набору, потім інші набори
 * (`layers` — у цьому порядку). Переклад, що збігається з правильним, не береться.
 */
export function pickOptions(opts: { target: Option; layers: Option[][]; rng?: Rng }): Option[] {
  const { target, layers, rng = Math.random } = opts;
  const pool: Option[] = [];
  for (const layer of layers) {
    for (const o of layer) {
      if (pool.length >= OPTION_POOL - 1) break;
      if (o.key === target.key || sameText(o.text, target.text)) continue;
      if (pool.some(p => p.key === o.key || sameText(p.text, o.text))) continue;
      pool.push(o);
    }
  }
  const wrong = shuffle(pool, rng).slice(0, OPTION_COUNT - 1);
  return shuffle([target, ...wrong], rng);
}

/**
 * Перевірка вписаного іспанською (ті самі правила, що в Повторенні):
 * точна відповідь — правильно; одна опечатка, неправильний артикль або слово
 * з тим самим перекладом — теж правильно, але показуємо, як пишеться.
 */
export function checkWritten(input: string, spanish: string, sameTranslation: string[] = []): { correct: boolean; showSpelling: boolean } {
  const grade = gradeTyped(input, spanish, sameTranslation);
  return { correct: grade !== "unknown", showSpelling: grade !== "known" };
}

export type GroupProgress = { new: number; learning: number; mastered: number; total: number; done: boolean };

/** Лічильники етапів для слів групи; слово без запису — «не вивчав». */
export function groupProgress(keys: string[], stages: Record<string, Stage>): GroupProgress {
  const p = { new: 0, learning: 0, mastered: 0, total: keys.length, done: false };
  for (const k of keys) p[stages[k] ?? "new"]++;
  p.done = p.total > 0 && p.mastered === p.total;
  return p;
}

/** Детермінований генератор (mulberry32): те саме зерно на сервері й у браузері дає ті самі числа. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
