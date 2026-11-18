/**
 * Де зупинився у флешкартках: колода, номер картки, оцінки раунду. Зберігається в браузері окремо
 * для кожної групи Словника й кожної добірки Повторення — повернувшись, продовжуєш з тієї ж картки.
 */

const PREFIX = "flashcards-progress:";

/** Збережений стан; `null` — немає, зіпсований чи сховище недоступне. */
export function loadProgress<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveProgress(key: string, value: unknown): void {
  try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* приватний режим, квота */ }
}

export function clearProgress(key: string): void {
  try { window.localStorage.removeItem(PREFIX + key); } catch { /* немає сховища — нічого стирати */ }
}

/** Стерти збережене з тим самим префіксом, крім `keep` (вчорашні добірки Повторення). */
export function forgetOtherProgress(prefix: string, keep: string): void {
  try {
    const storage = window.localStorage;
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX + prefix) && k !== PREFIX + keep) storage.removeItem(k);
    }
  } catch { /* немає сховища */ }
}

/**
 * Колода за збереженими ключами. `null`, якщо якогось слова вже немає (набір змінився) —
 * тоді збережений стан недійсний і раунд починається заново.
 */
export function deckFromKeys<T>(keys: unknown, items: T[], keyOf: (item: T) => string): T[] | null {
  if (!Array.isArray(keys)) return null;
  const byKey = new Map(items.map(i => [keyOf(i), i]));
  const deck: T[] = [];
  for (const k of keys) {
    const item = typeof k === "string" ? byKey.get(k) : undefined;
    if (!item) return null;
    deck.push(item);
  }
  return deck;
}

/** Номер картки в межах колоди (0..length; length — раунд пройдено, видно підсумок). */
export function validIndex(index: unknown, length: number): index is number {
  return Number.isInteger(index) && (index as number) >= 0 && (index as number) <= length;
}
