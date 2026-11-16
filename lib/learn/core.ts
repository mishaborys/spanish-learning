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
export const ROUND_SIZE = 8;

export type LearnWord = { key: string; stage: Stage };
export type Question = { key: string; kind: QuestionKind };

export { shuffle };

/** Скільки питань підряд в одному режимі, перш ніж режим зміниться. */
export const RUN_LENGTH = 2;

const KINDS: QuestionKind[] = ["choice", "reverse", "write"];
const evenDown = (n: number) => n - (n % RUN_LENGTH);

/**
 * Раунд до 8 питань, що складається з пар: по 2 питання в одному режимі, потім інший режим.
 * Слова, що пройшли вибір, чекають на вписування (`write`); нові йдуть на вибір — навпіл між `choice` і `reverse`
 * (спершу ті, де помилився в цій сесії). Вивчені не потрапляють.
 * Кількість у кожній групі округлюється вниз до парної — слово, що не вмістилося, чекає наступного раунду.
 * Порядок пар випадковий, але той самий режим двічі поспіль лише коли інакше не вийде.
 * Лише коли пару скласти нізвідки (напр. лишилось по одному слову), віддаються одиночні питання.
 */
export function buildRound(opts: { words: LearnWord[]; missed?: Set<string>; rng?: Rng; size?: number }): Question[] {
  const { words, missed = new Set<string>(), rng = Math.random, size = ROUND_SIZE } = opts;
  const write = words.filter(w => w.stage === "learning").map(w => w.key);
  const fresh = words.filter(w => w.stage === "new");
  const choice = [...fresh.filter(w => missed.has(w.key)), ...fresh.filter(w => !missed.has(w.key))].map(w => w.key);

  let w = evenDown(Math.min(write.length, size));
  let n = evenDown(Math.min(choice.length, size - w));
  if (w + n === 0) { // пару скласти нізвідки — віддаємо що є, щоб раунд не став порожнім
    w = Math.min(write.length, size);
    n = Math.min(choice.length, size - w);
  }

  // Серії (по 2 питання) кожного режиму
  const runs: Record<QuestionKind, Question[][]> = { choice: [], reverse: [], write: [] };
  const chunks = (keys: string[]) => Array.from({ length: Math.ceil(keys.length / RUN_LENGTH) }, (_, i) => keys.slice(i * RUN_LENGTH, (i + 1) * RUN_LENGTH));
  for (const keys of chunks(shuffle(write.slice(0, w), rng))) runs.write.push(keys.map(key => ({ key, kind: "write" as const })));
  const [first, second] = shuffle<QuestionKind>(["choice", "reverse"], rng); // кому дістанеться зайва серія
  chunks(shuffle(choice.slice(0, n), rng)).forEach((keys, i) => {
    const kind = i % 2 === 0 ? first : second;
    runs[kind].push(keys.map(key => ({ key, kind })));
  });

  // Порядок серій: випадковий, без однакових режимів поруч (пошук із поверненням — серій мало)
  const left = Object.fromEntries(KINDS.map(k => [k, runs[k].length])) as Record<QuestionKind, number>;
  const total = KINDS.reduce((t, k) => t + left[k], 0);
  const order: QuestionKind[] = [];
  const place = (last: QuestionKind | null): boolean => {
    if (order.length === total) return true;
    for (const k of shuffle(KINDS.filter(k => left[k] > 0 && k !== last), rng)) {
      left[k]--; order.push(k);
      if (place(k)) return true;
      order.pop(); left[k]++;
    }
    return false;
  };
  if (!place(null)) for (const k of KINDS) for (let i = 0; i < left[k]; i++) order.push(k); // розвести не вийшло — у будь-якому порядку

  return order.flatMap(k => runs[k].shift()!);
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
