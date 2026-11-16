// Правила режиму Learn у Словнику. Чистий модуль: без БД, без React —
// працює і на сервері, і в браузері, тестується напряму.
import { gradeTyped } from "@/lib/review/core";

/** Етап слова: не вивчав → ще вчу (пройшов вибір) → вивчено (ще й правильно вписав). */
export type Stage = "new" | "learning" | "mastered";
/**
 * Тип питання (три режими):
 * - `choice`: іспанське слово → вибір українського перекладу з 4;
 * - `reverse`: український переклад → вибір іспанського слова з 4;
 * - `write`: український переклад → вписати іспанською.
 */
export type QuestionKind = "choice" | "reverse" | "write";

const STAGE_ORDER: Stage[] = ["new", "learning", "mastered"];

/** Етап після відповіді: помилка — назад на вибір; правильна відповідь етап не знижує. */
export function nextStage(stage: Stage, kind: QuestionKind, correct: boolean): Stage {
  if (!correct) return "new"; // повертається на вибір
  const reached: Stage = kind === "write" ? "mastered" : "learning"; // обидва види вибору — етап «ще вчу»
  return STAGE_ORDER.indexOf(reached) > STAGE_ORDER.indexOf(stage) ? reached : stage;
}

import { shuffle, type Rng } from "@/lib/random";
export type { Rng };
export const ROUND_SIZE = 7;

export type LearnWord = { key: string; stage: Stage };
export type Question = { key: string; kind: QuestionKind };

export { shuffle };

/** Скільки питань підряд в одному режимі, перш ніж режим зміниться. */
export const RUN_LENGTH = 2;

/**
 * Раунд до 7 питань: спершу слова, що пройшли вибір і чекають на вписування,
 * потім нові на вибір (спершу ті, де помилився в цій сесії). Вивчені не потрапляють.
 * Нові слова навпіл діляться між `choice` і `reverse`; режими йдуть серіями по {@link RUN_LENGTH}
 * питання, а порядок серій випадковий (той самий режим двічі поспіль лише коли інших не лишилось).
 */
export function buildRound(opts: { words: LearnWord[]; missed?: Set<string>; rng?: Rng; size?: number }): Question[] {
  const { words, missed = new Set<string>(), rng = Math.random, size = ROUND_SIZE } = opts;
  const write = words.filter(w => w.stage === "learning").map(w => w.key);
  // Серед нових спершу ті, де вже помилився, — вони мають повернутися в наступному раунді
  const fresh = words.filter(w => w.stage === "new");
  const choice = [...fresh.filter(w => missed.has(w.key)), ...fresh.filter(w => !missed.has(w.key))].map(w => w.key);

  const picked = [
    ...write.map(key => ({ key, write: true })),
    ...choice.map(key => ({ key, write: false })),
  ].slice(0, size);

  const queues: Record<QuestionKind, Question[]> = { choice: [], reverse: [], write: [] };
  for (const key of shuffle(picked.filter(p => p.write).map(p => p.key), rng)) queues.write.push({ key, kind: "write" });
  shuffle(picked.filter(p => !p.write).map(p => p.key), rng)
    .forEach((key, i) => queues[i % 2 === 0 ? "choice" : "reverse"].push({ key, kind: i % 2 === 0 ? "choice" : "reverse" }));

  const kinds: QuestionKind[] = ["choice", "reverse", "write"];
  const round: Question[] = [];
  let last: QuestionKind | null = null;
  for (;;) {
    const left = kinds.filter(k => queues[k].length > 0);
    if (left.length === 0) break;
    const other = left.filter(k => k !== last);
    const from = other.length > 0 ? other : left;
    const kind = from[Math.min(Math.floor(rng() * from.length), from.length - 1)];
    round.push(...queues[kind].splice(0, RUN_LENGTH));
    last = kind;
  }
  return round;
}

/**
 * Варіант відповіді на вибір: ключ слова + текст, що показується (український переклад або іспанське слово).
 * `meaning` — український переклад, коли `text` іспанський: за ним відсікаються слова з тим самим значенням.
 */
export type Option = { key: string; text: string; meaning?: string };

export const OPTION_COUNT = 4;
/** Запас слів, з якого беруться хибні варіанти (разом із правильним). */
export const OPTION_POOL = 20;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * 4 варіанти (1 правильний + 3 хибні), перемішані. Хибні беруться із запасу
 * щонайменше 20 слів: спершу своя група, потім інші групи набору, потім інші набори
 * (`layers` — у цьому порядку). Варіант з тим самим текстом чи значенням, що в правильного, не береться
 * (інакше «інше правильне» слово з тим самим перекладом стало б хибним варіантом).
 */
export function pickOptions(opts: { target: Option; layers: Option[][]; rng?: Rng }): Option[] {
  const { target, layers, rng = Math.random } = opts;
  const meaning = (o: Option) => o.meaning ?? o.text;
  const pool: Option[] = [];
  for (const layer of layers) {
    for (const o of layer) {
      if (pool.length >= OPTION_POOL - 1) break;
      if (o.key === target.key || sameText(o.text, target.text) || sameText(meaning(o), meaning(target))) continue;
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
