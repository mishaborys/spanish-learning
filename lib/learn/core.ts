// Правила режиму Learn у Словнику. Чистий модуль: без БД, без React —
// працює і на сервері, і в браузері, тестується напряму.
import { gradeTyped } from "@/lib/review/core";
import { likeness, type PartOfSpeech } from "@/lib/partOfSpeech";

/**
 * Етап слова — драбина з трьох вправ:
 * не вивчав → (вибір перекладу) ще вчу → (вибір іспанського) знайомий → (вписування) вивчено.
 */
export type Stage = "new" | "learning" | "familiar" | "mastered";
/**
 * Тип питання (три вправи):
 * - `choice`: іспанське слово → вибір українського перекладу з 4;
 * - `reverse`: український переклад → вибір іспанського слова з 4;
 * - `write`: український переклад → вписати іспанською.
 */
export type QuestionKind = "choice" | "reverse" | "write";

const STAGE_ORDER: Stage[] = ["new", "learning", "familiar", "mastered"];
/** Етап, якого слово досягає після правильної відповіді на питання цього типу. */
const REACHED: Record<QuestionKind, Stage> = { choice: "learning", reverse: "familiar", write: "mastered" };
/** Яке питання чекає слово на цьому етапі (вивчене — жодного). */
const KIND_AT: Partial<Record<Stage, QuestionKind>> = { new: "choice", learning: "reverse", familiar: "write" };

/** Етап після відповіді: помилка — назад на початок; правильна відповідь етап не знижує. */
export function nextStage(stage: Stage, kind: QuestionKind, correct: boolean): Stage {
  if (!correct) return "new"; // повертається на перший вибір
  const reached = REACHED[kind];
  return STAGE_ORDER.indexOf(reached) > STAGE_ORDER.indexOf(stage) ? reached : stage;
}

/** Статус слова для людини: «не вивчав» / «ще вчу» (обидва проміжні етапи) / «вивчено». */
export type Status = "new" | "learning" | "mastered";
export function statusOf(stage: Stage): Status {
  return stage === "new" || stage === "mastered" ? stage : "learning";
}

import { shuffle, type Rng } from "@/lib/random";
export type { Rng };
/** Слів у раунді: усі з одного етапу, тож усі питання раунду — одного типу. */
export const ROUND_SIZE = 5;

export type LearnWord = { key: string; stage: Stage };
export type Question = { key: string; kind: QuestionKind };

export { shuffle };

/**
 * Раунд — до 5 слів, усі питання одного типу. Кожне слово проходить усі три вправи по черзі.
 * Тип раунду: найдальший етап, на якому зібралося повних 5 слів (вписування → зворотний вибір → вибір);
 * якщо повних 5 немає ніде — найдальший етап, де взагалі є слова, щоб раунд не став порожнім.
 * Серед нових слів спершу ті, де вже помилився в цій сесії. Вивчені не потрапляють. Усередині раунду — перемішано.
 */
export function buildRound(opts: { words: LearnWord[]; missed?: Set<string>; rng?: Rng; size?: number }): Question[] {
  const { words, missed = new Set<string>(), rng = Math.random, size = ROUND_SIZE } = opts;
  const at = (stage: Stage) => words.filter(w => w.stage === stage).map(w => w.key);
  const pools = (["familiar", "learning", "new"] as Stage[]).map(stage => ({ kind: KIND_AT[stage]!, keys: at(stage) }));
  const pool = pools.find(p => p.keys.length >= size) ?? pools.find(p => p.keys.length > 0);
  if (!pool) return [];
  const keys = [...pool.keys.filter(k => missed.has(k)), ...pool.keys.filter(k => !missed.has(k))].slice(0, size);
  return shuffle(keys, rng).map(key => ({ key, kind: pool.kind }));
}

/**
 * Варіант відповіді на вибір: ключ слова + текст, що показується (український переклад або іспанське слово).
 * `meaning` — український переклад, коли `text` іспанський: за ним відсікаються слова з тим самим значенням.
 */
export type Option = { key: string; text: string; meaning?: string; pos?: PartOfSpeech };

export const OPTION_COUNT = 4;
/** Запас слів, з якого беруться хибні варіанти (разом із правильним). */
export const OPTION_POOL = 20;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * 4 варіанти (1 правильний + 3 хибні), перемішані. Хибні — тієї ж частини мови, що правильний (дієслово до
 * дієслів, іменник до іменників), інакше правильний видно з першого погляду. Вони беруться із запасу
 * щонайменше 20 слів: спершу своя група, потім інші групи набору, потім інші набори (`layers` — у цьому порядку).
 * Якщо слів тієї ж частини мови бракує, решту добираємо спершу зі спорідненої (службові слова),
 * потім з будь-якої. Варіант з тим самим текстом чи значенням, що в правильного, не береться (інакше «інше правильне» слово з тим самим перекладом стало б хибним).
 */
export function pickOptions(opts: { target: Option; layers: Option[][]; rng?: Rng }): Option[] {
  const { target, layers, rng = Math.random } = opts;
  const meaning = (o: Option) => o.meaning ?? o.text;
  const candidates: Option[] = [];
  for (const layer of layers) {
    for (const o of layer) {
      if (o.key === target.key || sameText(o.text, target.text) || sameText(meaning(o), meaning(target))) continue;
      if (candidates.some(p => p.key === o.key || sameText(p.text, o.text))) continue;
      candidates.push(o);
    }
  }
  const take = (list: Option[], n: number) => shuffle(list.slice(0, OPTION_POOL - 1), rng).slice(0, n);
  const wrong: Option[] = [];
  for (const tier of [0, 1, 2]) {
    if (wrong.length >= OPTION_COUNT - 1) break;
    wrong.push(...take(candidates.filter(o => likeness(target.pos, o.pos) === tier), OPTION_COUNT - 1 - wrong.length));
  }
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
  for (const k of keys) p[statusOf(stages[k] ?? "new")]++;
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
