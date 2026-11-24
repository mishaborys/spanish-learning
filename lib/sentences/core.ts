// Правила вправи «Речення» (складання речень зі слів уроку). Чистий модуль: без БД і React.
import { shuffle, type Rng } from "@/lib/random";
import type { Sentence } from "@/lib/conjugation/core";

/** Що саме тренує речення: прийменник чи вираз з уроку. */
export type Rule = "el" | "por" | "alas" | "en" | "a" | "despues";
export const RULE_LABEL: Record<Rule, string> = {
  el: "el + день",
  por: "por la + частина дня",
  alas: "a las + година",
  en: "en + місце",
  a: "a + місце (рух)",
  despues: "después de",
};

export type DeckSentence = Sentence & {
  id: string;
  /** Які правила з уроку тут працюють (показуємо після відповіді). */
  tags?: Rule[];
  /** Слова зі Словника, які вживаються в реченні. */
  words?: string[];
};

export type SentenceDeck = { id: string; title: string; sentences: DeckSentence[] };

export const SENTENCE_SESSION_SIZE = 10;

// ─── Сесія ────────────────────────────────────────────────────────────────────

/** Сесія: речення (за id), на якому зупинився, і чи було кожне пройдено правильно з першого разу. */
export type SentenceSession = { round: number; ids: string[]; index: number; results: boolean[] };

export const isSentenceSessionFinished = (s: SentenceSession) => s.index >= s.ids.length;

/**
 * Нова сесія: спершу речення, на які ще не було правильної відповіді (`done`), потім решта;
 * серед рівних речення з `avoid` (щойно пройдені) — пізніше. Усередині сесії порядок випадковий.
 */
export function buildSentenceSession(
  deck: SentenceDeck,
  opts: { size?: number; avoid?: ReadonlySet<string>; done?: ReadonlySet<string>; rng?: Rng } = {},
): SentenceSession {
  const { size = SENTENCE_SESSION_SIZE, avoid = new Set<string>(), done = new Set<string>(), rng = Math.random } = opts;
  const ranked = shuffle(deck.sentences, rng).sort((a, b) =>
    (Number(done.has(a.id)) - Number(done.has(b.id))) || (Number(avoid.has(a.id)) - Number(avoid.has(b.id))));
  const ids = shuffle(ranked.slice(0, size).map(s => s.id), rng);
  return { round: 1, ids, index: 0, results: [] };
}

/** Речення, на які не вийшло з першого разу: їх пропонуємо пройти ще раз. */
export function sentencesToRetry(s: SentenceSession): string[] {
  return s.ids.filter((_, i) => s.results[i] === false);
}

/** Збережену сесію повертає, лише якщо вона ще відповідає колоді (речення на місці, номери в межах). */
export function restoreSentenceSession(raw: unknown, deck: SentenceDeck): SentenceSession | null {
  const s = raw as Partial<SentenceSession> | null;
  if (!s || typeof s !== "object") return null;
  if (!Number.isInteger(s.round) || s.round! < 1 || !Array.isArray(s.ids) || s.ids.length === 0) return null;
  const known = new Set(deck.sentences.map(x => x.id));
  if (!s.ids.every(id => typeof id === "string" && known.has(id))) return null;
  if (!Number.isInteger(s.index) || s.index! < 0 || s.index! > s.ids.length) return null;
  if (!Array.isArray(s.results) || s.results.length !== s.index || !s.results.every(r => typeof r === "boolean")) return null;
  return { round: s.round!, ids: s.ids, index: s.index!, results: s.results };
}

// ─── Прогрес ──────────────────────────────────────────────────────────────────

export type SentenceProgress = { done: number; total: number; percent: number };

/**
 * Прогрес: скільки з УСІХ речень колоди вже хоч раз складено правильно. Повторна правильна відповідь на те саме
 * речення не додається, помилка нічого не забирає; 100% — лише коли справді все. Чужі id не рахуються.
 */
export function sentenceProgress(done: ReadonlySet<string>, deck: SentenceDeck): SentenceProgress {
  const total = deck.sentences.length;
  const count = deck.sentences.filter(s => done.has(s.id)).length;
  return { done: count, total, percent: total ? Math.floor((count / total) * 100) : 0 };
}

export type SentenceAnswer = { id: string; correct: boolean };

/** Відповіді від клієнта: перевіряє форму й що речення існують. `null` — некоректно. */
export function parseSentenceAnswers(raw: unknown, deck: SentenceDeck, max = 200): SentenceAnswer[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > max) return null;
  const known = new Set(deck.sentences.map(s => s.id));
  const out: SentenceAnswer[] = [];
  for (const a of raw as Partial<SentenceAnswer>[]) {
    if (!a || typeof a !== "object" || typeof a.id !== "string" || !known.has(a.id) || typeof a.correct !== "boolean") return null;
    out.push({ id: a.id, correct: a.correct });
  }
  return out;
}
