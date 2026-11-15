/** Генератор випадкових чисел у [0, 1); у тестах підміняється детермінованим. */
export type Rng = () => number;

/** Перемішування Фішера–Єйтса; оригінал не змінюється. */
export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
