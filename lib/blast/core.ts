// Правила гри Blast у Словнику. Чистий модуль: без БД, без React —
// тестується напряму. Фізика польоту астероїдів — в інтерфейсі, тут лише гра й очки.

export const HIT_POINTS = 100;
export const SPEED_BONUS = 100;
/** До цього часу — повний бонус за швидкість, після FULL_BONUS_MS..ZERO_BONUS_MS спадає до нуля. */
export const FULL_BONUS_MS = 2000;
export const ZERO_BONUS_MS = 8000;
/** Штраф за промах; рахунок не опускається нижче нуля. */
export const MISS_PENALTY = 50;

/** Множник за серію: скільки влучань поспіль було ДО цього. ×2 після 3, ×3 після 6. */
export function multiplierFor(streakBefore: number): number {
  return streakBefore >= 6 ? 3 : streakBefore >= 3 ? 2 : 1;
}

/** Очки за влучання: (100 + бонус за швидкість, лінійно від 100 до 0 між 2 і 8 с) × множник серії. */
export function pointsForHit(elapsedMs: number, streakBefore: number): number {
  const t = Math.min(Math.max(elapsedMs, FULL_BONUS_MS), ZERO_BONUS_MS);
  const bonus = SPEED_BONUS * (ZERO_BONUS_MS - t) / (ZERO_BONUS_MS - FULL_BONUS_MS);
  return Math.round(HIT_POINTS + bonus) * multiplierFor(streakBefore);
}

import { shuffle, type Rng } from "@/lib/random";
export type { Rng };
/** Скільки астероїдів одночасно на полі. */
export const MAX_VISIBLE = 4;

/** Слово гри: ключ (іспанське слово на астероїді) і підказка (переклад унизу). */
export type BlastWord = { key: string; prompt: string };

export type BlastGame = {
  words: BlastWord[];
  /** Ключі слів на полі (до 4). */
  visible: string[];
  /** Слова, що ще прилетять, у порядку появи. */
  queue: string[];
  /** Слово, переклад якого зараз показано; null — гру завершено. */
  target: string | null;
  score: number;
  /** Влучань поспіль. */
  streak: number;
  hits: number;
  misses: number;
  done: boolean;
};


const pick = <T,>(arr: readonly T[], rng: Rng): T => arr[Math.min(Math.floor(rng() * arr.length), arr.length - 1)];

/** Нова гра: слова у випадковому порядку, перші 4 — на полі, підказка про одне з них. */
export function createGame(words: BlastWord[], rng: Rng = Math.random): BlastGame {
  const order = shuffle(words.map(w => w.key), rng);
  const visible = order.slice(0, MAX_VISIBLE);
  return {
    words,
    visible,
    queue: order.slice(MAX_VISIBLE),
    target: visible.length ? pick(visible, rng) : null,
    score: 0,
    streak: 0,
    hits: 0,
    misses: 0,
    done: visible.length === 0,
  };
}

export type TapResult = { game: BlastGame; correct: boolean; points: number };

/** Слова з однаковим перекладом взаємозамінні: підказка не дає їх розрізнити. */
function samePrompt(game: BlastGame, a: string, b: string): boolean {
  if (a === b) return true;
  const prompt = (k: string) => game.words.find(w => w.key === k)?.prompt.trim().toLowerCase();
  return prompt(a) !== undefined && prompt(a) === prompt(b);
}

/** Тап по астероїду `key` через `elapsedMs` після появи підказки. */
export function tap(game: BlastGame, key: string, elapsedMs: number, rng: Rng = Math.random): TapResult {
  if (game.done || !game.target || !game.visible.includes(key)) return { game, correct: false, points: 0 };
  if (!samePrompt(game, key, game.target)) {
    const score = Math.max(0, game.score - MISS_PENALTY);
    return {
      correct: false,
      points: score - game.score,
      game: { ...game, score, streak: 0, misses: game.misses + 1 },
    };
  }
  const points = pointsForHit(elapsedMs, game.streak);
  const [next, ...queue] = game.queue;
  // Новий астероїд стає на місце збитого
  const visible = game.visible.flatMap(k => (k !== key ? [k] : next ? [next] : []));
  return {
    correct: true,
    points,
    game: {
      ...game,
      visible,
      queue,
      target: visible.length ? pick(visible, rng) : null,
      score: game.score + points,
      streak: game.streak + 1,
      hits: game.hits + 1,
      done: visible.length === 0,
    },
  };
}

/** Точність у відсотках: влучання / усі тапи. Без тапів — 100. */
export function accuracy(game: Pick<BlastGame, "hits" | "misses">): number {
  const taps = game.hits + game.misses;
  return taps === 0 ? 100 : Math.round((game.hits / taps) * 100);
}

/** Максимум за гру з `n` слів: кожне влучання найшвидше, без жодного промаху. */
export function maxScore(n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += pointsForHit(0, i);
  return total;
}
