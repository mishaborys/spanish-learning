// Правила гри Blast у Словнику — механіка як у Quizlet Blast (відновлена з реальної гри та спостережень).
// Чистий модуль: без БД, без React — тестується напряму. Політ астероїдів і таймер — в інтерфейсі.
import { shuffle, type Rng } from "@/lib/random";
export type { Rng };

/**
 * Версія правил підрахунку. Рекорди, зароблені за іншими правилами, у базі не порівнюються
 * з новими (видаляються при міграції). Змінюй разом із правилами нижче.
 */
export const RULES_VERSION = 3;

/** Бали за влучання до множника. */
export const BASE_POINTS = 5;
/** На скільки росте множник за кожне влучання поспіль. */
export const STREAK_STEP = 0.2;
/** Стеля множника. */
export const MAX_MULTIPLIER = 3;

/** Множник серії: 1 + 0.2 за кожне влучання поспіль, не більше ×3. */
export function multiplierFor(streak: number): number {
  // Округлення прибирає хвости на кшталт 1.2000000000000002
  return Math.min(Math.round((1 + STREAK_STEP * streak) * 10) / 10, MAX_MULTIPLIER);
}

/** Бали за влучання при серії `streak` (скільки влучань поспіль було ДО цього). */
export function pointsForHit(streak: number): number {
  return Math.round(BASE_POINTS * multiplierFor(streak));
}

/** Цілі перших рівнів як у Quizlet; далі — +50 за рівень (продовження не спостерігали). */
const GOALS = [50, 75, 125, 200, 250];
const GOAL_STEP_AFTER = 50;

/** Ціль рівня: раунд закінчується, щойно її набрано. */
export function goalFor(level: number): number {
  const last = GOALS.length;
  return level <= last ? GOALS[level - 1] : GOALS[last - 1] + GOAL_STEP_AFTER * (level - last);
}

/** Мінімальний загальний рахунок, щоб дійти до рівня `level`: сума цілей усіх попередніх. */
export function minScoreToReach(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += goalFor(l);
  return total;
}

/**
 * Найбільший загальний рахунок гри, що закінчилась (вийшов час) на рівні `level`:
 * у кожному пройденому раунді — ціль − 1 + найбільше влучання, в останньому — ціль − 1.
 */
export function maxScoreToEndAt(level: number): number {
  const bestHit = pointsForHit(Number.MAX_SAFE_INTEGER);
  let total = goalFor(level) - 1;
  for (let l = 1; l < level; l++) total += goalFor(l) - 1 + bestHit;
  return total;
}

/** Скільки астероїдів одночасно на полі. */
export const MAX_VISIBLE = 4;
/** Тривалість раунду. */
export const ROUND_MS = 60_000;

/** Слово гри: ключ (іспанське слово на астероїді) і підказка (переклад). */
export type BlastWord = { key: string; prompt: string };

export type BlastGame = {
  words: BlastWord[];
  level: number;
  /** Ключі слів на полі (до 4, без повторів). */
  visible: string[];
  /** Слова, що прилетять наступними; коли закінчуються — колода перемішується знову. */
  deck: string[];
  /** Слово, переклад якого зараз показано. */
  target: string | null;
  /** Бали в поточному раунді (окремі для кожного раунду; порівнюються з ціллю). */
  levelScore: number;
  /** Загальний рахунок за гру. */
  totalScore: number;
  /** Влучань поспіль. */
  streak: number;
  hits: number;
  misses: number;
  /** Гру завершено: час вийшов, а ціль рівня не набрано. */
  over: boolean;
};

const pick = <T,>(arr: readonly T[], rng: Rng): T => arr[Math.min(Math.floor(rng() * arr.length), arr.length - 1)];

/**
 * Наступне слово з колоди (не з тих, що на полі); порожня колода перемішується заново.
 * `avoid` (щойно збите) береться лише тоді, коли інших слів немає.
 */
function draw(game: Pick<BlastGame, "words" | "deck">, onField: string[], rng: Rng, avoid?: string): { key: string | null; deck: string[] } {
  let deck = game.deck.filter(k => !onField.includes(k));
  if (deck.length === 0) deck = shuffle(game.words.map(w => w.key).filter(k => !onField.includes(k)), rng);
  const i = deck.findIndex(k => k !== avoid);
  const at = i === -1 ? 0 : i;
  const key = deck[at] ?? null;
  return { key, deck: deck.filter((_, j) => j !== at) };
}

/** Заповнює поле до 4 слів. */
function fill(game: BlastGame, rng: Rng): Pick<BlastGame, "visible" | "deck"> {
  let visible = [...game.visible];
  let deck = game.deck;
  while (visible.length < Math.min(MAX_VISIBLE, game.words.length)) {
    const d = draw({ words: game.words, deck }, visible, rng);
    if (!d.key) break;
    visible = [...visible, d.key];
    deck = d.deck;
  }
  return { visible, deck };
}

const promptOf = (words: BlastWord[], key: string | null) =>
  key === null ? undefined : words.find(w => w.key === key)?.prompt.trim().toLowerCase();

/** Нова підказка: про одне зі слів на полі, по змозі з іншим перекладом, ніж щойно була. */
function nextTarget(words: BlastWord[], visible: string[], previous: string | null, rng: Rng): string | null {
  if (visible.length === 0) return null;
  const prev = promptOf(words, previous);
  const others = visible.filter(k => k !== previous && promptOf(words, k) !== prev);
  return pick(others.length ? others : visible, rng);
}

/** Штраф за промах; бали не опускаються нижче нуля. */
export const MISS_PENALTY = 2;

export type TapResult = { game: BlastGame; correct: boolean; points: number };

/** Слова з однаковим перекладом взаємозамінні: підказка не дає їх розрізнити. */
function samePrompt(game: BlastGame, a: string, b: string): boolean {
  if (a === b) return true;
  const prompt = (k: string) => game.words.find(w => w.key === k)?.prompt.trim().toLowerCase();
  return prompt(a) !== undefined && prompt(a) === prompt(b);
}

/** Тап по астероїду `key`. */
export function tap(game: BlastGame, key: string, rng: Rng = Math.random): TapResult {
  if (game.over || isRoundComplete(game) || !game.target || !game.visible.includes(key)) return { game, correct: false, points: 0 };
  if (!samePrompt(game, key, game.target)) {
    const levelScore = Math.max(0, game.levelScore - MISS_PENALTY);
    const lost = game.levelScore - levelScore;
    return {
      correct: false,
      points: -lost,
      game: { ...game, levelScore, totalScore: Math.max(0, game.totalScore - lost), streak: 0, misses: game.misses + 1 },
    };
  }
  const points = pointsForHit(game.streak);
  const levelScore = game.levelScore + points;
  // Замінник — не з тих, що лишаються на полі; збите слово може повернутися лише якщо інших немає (мала група)
  const { key: replacement, deck } = draw(game, game.visible.filter(k => k !== key), rng, key);
  // Новий астероїд стає на місце збитого
  const visible = game.visible.flatMap(k => (k !== key ? [k] : replacement ? [replacement] : []));
  return {
    correct: true,
    points,
    game: {
      ...game,
      visible,
      deck,
      target: nextTarget(game.words, visible, game.target, rng),
      levelScore,
      totalScore: game.totalScore + points,
      streak: game.streak + 1,
      hits: game.hits + 1,
    },
  };
}

/** Ціль раунду набрано — раунд закінчено, далі `endRound` переводить на наступний рівень. */
export function isRoundComplete(game: Pick<BlastGame, "level" | "levelScore">): boolean {
  return game.levelScore >= goalFor(game.level);
}

/**
 * Кінець раунду. Ціль набрано (`isRoundComplete`) — наступний рівень: нова ціль, бали раунду з нуля
 * (загальні лишаються), поле заповнюється новими словами. Інакше вийшов час — гру завершено.
 */
export function endRound(game: BlastGame, rng: Rng = Math.random): BlastGame {
  if (game.over) return game;
  if (!isRoundComplete(game)) return { ...game, over: true, target: null };
  const cleared: BlastGame = { ...game, level: game.level + 1, levelScore: 0, visible: [], deck: [...game.deck, ...game.visible] };
  const field = fill(cleared, rng);
  return { ...cleared, ...field, target: nextTarget(game.words, field.visible, game.target, rng) };
}

/** Точність у відсотках: влучання / усі тапи. Без тапів — 100. */
export function accuracy(game: Pick<BlastGame, "hits" | "misses">): number {
  const taps = game.hits + game.misses;
  return taps === 0 ? 100 : Math.round((game.hits / taps) * 100);
}

/** Нова гра: рівень 1, на полі до 4 слів, підказка про одне з них. */
export function createGame(words: BlastWord[], rng: Rng = Math.random): BlastGame {
  const base: BlastGame = {
    words, level: 1, visible: [], deck: shuffle(words.map(w => w.key), rng), target: null,
    levelScore: 0, totalScore: 0, streak: 0, hits: 0, misses: 0, over: false,
  };
  const field = fill(base, rng);
  return { ...base, ...field, target: nextTarget(words, field.visible, null, rng) };
}
