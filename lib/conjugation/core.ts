// Правила вправи «Відмінювання». Чистий модуль: без БД і React — працює і на сервері, і в браузері.
import { shuffle, type Rng } from "@/lib/random";

export const PERSONS = ["yo", "tu", "el", "nosotros", "vosotros", "ellos"] as const;
export type Person = (typeof PERSONS)[number];

/** Як особа підписана в таблиці закінчень. */
export const PERSON_LABEL: Record<Person, string> = {
  yo: "yo",
  tu: "tú",
  el: "él / ella / usted",
  nosotros: "nosotros/as",
  vosotros: "vosotros/as",
  ellos: "ellos/ellas / ustedes",
};

/** Вид дієслова: правильні за закінченням; неправильні — за тим, що в них змінюється. */
export type Kind = "ar" | "er" | "ir" | "yo" | "stem" | "full";
export const KIND_LABEL: Record<Kind, string> = {
  ar: "правильне, -ar",
  er: "правильне, -er",
  ir: "правильне, -ir",
  yo: "змінюється тільки yo",
  stem: "зміна кореня",
  full: "зовсім неправильне",
};

export type Sentence = {
  /** Речення, у якому є форма дієслова; підмет написаний явно. */
  es: string;
  uk: string;
  /** Інші допустимі порядки слів (ті самі слова). */
  alt?: string[];
};

export type ConjVerb = {
  infinitive: string;
  ukrainian: string;
  group: "regular" | "irregular";
  kind: Kind;
  forms: Record<Person, string>;
  sentences: Record<Person, Sentence>;
};

/** Пара вправи: яке дієслово в якій особі. */
export type Item = { verb: string; person: Person };
/** Результат пари: чи з першого разу правильна форма й чи правильно складене речення. */
export type ItemResult = { form: boolean; order: boolean };

export const SESSION_SIZE = 10;

// ─── Вписана форма ────────────────────────────────────────────────────────────

/** Без наголосів, ñ, регістру й зайвих пробілів. Літери при цьому важливі: hablo ≠ habla. */
export function normalizeForm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function checkForm(answer: string, expected: string): boolean {
  return normalizeForm(answer) === normalizeForm(expected);
}

// ─── Речення зі слів ──────────────────────────────────────────────────────────

/** Слово речення без розділових знаків (¿ ¡ . , ? ! …), але з наголосами. */
function stripPunct(token: string): string {
  return token.replace(/^[¿¡"«(]+/, "").replace(/[.,;:!?…"»)]+$/, "");
}

/**
 * Слова для складання: без розділових знаків, малими літерами. Виняток — власні назви не на початку
 * речення (Kiev, Madrid): велика літера там — частина слова.
 */
export function chipsOf(sentence: string): string[] {
  return sentence.trim().split(/\s+/).map(stripPunct).filter(Boolean)
    .map((w, i) => (i > 0 && /^\p{Lu}/u.test(w) ? w : w.toLowerCase()));
}

const orderKey = (chips: readonly string[]) => chips.map(c => c.toLowerCase()).join(" ");

/** Усі допустимі порядки слів речення: основний і запасні. */
export function acceptedOrders(s: Sentence): string[] {
  return [s.es, ...(s.alt ?? [])].map(v => orderKey(chipsOf(v)));
}

export type Rect = { left: number; top: number; right: number; bottom: number };

/**
 * Куди вставити слово, яке тягнуть: перед першим словом, що стоїть правіше в тому ж рядку
 * або нижче. `rects` — слова речення в порядку читання (без того, яке тягнуть).
 */
export function insertIndex(point: { x: number; y: number }, rects: readonly Rect[]): number {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (point.y < r.top) return i;
    if (point.y <= r.bottom && point.x < (r.left + r.right) / 2) return i;
  }
  return rects.length;
}

/** Слово `id` стає на місце `index` серед решти слів; `null` — слово забрано з речення. */
export function moveWord(placed: readonly number[], id: number, index: number | null): number[] {
  const rest = placed.filter(x => x !== id);
  if (index !== null) rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

export function checkOrder(placed: readonly string[], s: Sentence): boolean {
  return acceptedOrders(s).includes(orderKey(placed));
}

/** Слова перемішано; не лишається в правильному порядку (якщо слів більше одного). */
export function shuffledChips(s: Sentence, rng: Rng = Math.random): string[] {
  const chips = chipsOf(s.es);
  if (chips.length < 2) return chips;
  for (let attempt = 0; attempt < 20; attempt++) {
    const mixed = shuffle(chips, rng);
    if (!checkOrder(mixed, s)) return mixed;
  }
  return [...chips].reverse();
}

// ─── Сесія ────────────────────────────────────────────────────────────────────

/**
 * Нова сесія: `size` різних дієслів, особа в кожного випадкова. Дієслова з `avoid` (щойно пройдені)
 * беруться, лише якщо інших не вистачає.
 */
export function buildSession(
  verbs: readonly ConjVerb[],
  opts: { size?: number; avoid?: ReadonlySet<string>; rng?: Rng } = {},
): Item[] {
  const { size = SESSION_SIZE, avoid = new Set<string>(), rng = Math.random } = opts;
  const pool = shuffle(verbs, rng);
  const fresh = pool.filter(v => !avoid.has(v.infinitive));
  const rest = pool.filter(v => avoid.has(v.infinitive));
  return [...fresh, ...rest].slice(0, size).map(v => ({
    verb: v.infinitive,
    person: PERSONS[Math.floor(rng() * PERSONS.length)],
  }));
}

/** Пари, у яких була помилка (у формі чи в реченні): їх пропонуємо пройти ще раз. */
export function itemsToRetry(items: readonly Item[], results: readonly ItemResult[]): Item[] {
  return items.filter((_, i) => results[i] && !(results[i].form && results[i].order));
}

export function tally(results: readonly ItemResult[]) {
  return { forms: results.filter(r => r.form).length, sentences: results.filter(r => r.order).length, total: results.length };
}

// ─── Збережена сесія ──────────────────────────────────────────────────────────

/** Сесія вправи: пари, на якій зупинився, і результати пройдених. */
export type Session = { round: number; items: Item[]; index: number; results: ItemResult[] };

export function newSession(verbs: readonly ConjVerb[], avoid?: ReadonlySet<string>, rng?: Rng): Session {
  return { round: 1, items: buildSession(verbs, { avoid, rng }), index: 0, results: [] };
}

/** Сесію пройдено до кінця (лишився підсумок). */
export const isFinished = (s: Session) => s.index >= s.items.length;

/** Збережену сесію повертає, лише якщо вона ще відповідає даним (дієслова на місці, номери в межах). */
export function restoreSession(raw: unknown, verbs: readonly ConjVerb[]): Session | null {
  const s = raw as Partial<Session> | null;
  if (!s || typeof s !== "object") return null;
  if (!Number.isInteger(s.round) || s.round! < 1 || !Array.isArray(s.items) || s.items.length === 0) return null;
  const known = new Set(verbs.map(v => v.infinitive));
  const itemOk = (i: Partial<Item> | null) => !!i && typeof i.verb === "string" && known.has(i.verb) && PERSONS.includes(i.person as Person);
  if (!s.items.every(itemOk)) return null;
  if (!Number.isInteger(s.index) || s.index! < 0 || s.index! > s.items.length) return null;
  if (!Array.isArray(s.results) || s.results.length !== s.index) return null;
  if (!s.results.every(r => typeof r?.form === "boolean" && typeof r?.order === "boolean")) return null;
  return { round: s.round!, items: s.items, index: s.index!, results: s.results };
}
