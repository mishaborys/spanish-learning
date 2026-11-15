"use client";

import { useSyncExternalStore } from "react";

/** Налаштування флешкарток Словника. Зберігаються в браузері, спільні для всіх груп. */
export type FlashcardSettings = {
  /** Який бік картки видно спершу. */
  front: "es" | "uk";
  /** Перемішувати картки (інакше — порядок списку). */
  shuffle: boolean;
  /** Сортування «Знаю / Ще вчу» (інакше — просте гортання). */
  sorting: boolean;
};

export const DEFAULT_FLASHCARD_SETTINGS: FlashcardSettings = { front: "es", shuffle: false, sorting: true };

const KEY = "dictionary-flashcards-settings";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: FlashcardSettings = DEFAULT_FLASHCARD_SETTINGS;
/** Сховище недоступне (приватний режим, квота): тримаємо налаштування в пам'яті до перезавантаження. */
let memoryOnly = false;

function read(): FlashcardSettings {
  if (memoryOnly) return cached;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { memoryOnly = true; return cached; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  let parsed: Partial<FlashcardSettings> = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { /* зіпсований запис — беремо типові */ }
  cached = {
    front: parsed.front === "uk" ? "uk" : "es",
    shuffle: parsed.shuffle === true,
    sorting: parsed.sorting !== false,
  };
  return cached;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}

export function setFlashcardSettings(patch: Partial<FlashcardSettings>) {
  const next = { ...read(), ...patch };
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { memoryOnly = true; }
  cachedRaw = JSON.stringify(next);
  cached = next;
  listeners.forEach(l => l());
}

/** null — поки сторінка не ожила в браузері (на сервері налаштувань немає). */
export function useFlashcardSettings(): FlashcardSettings | null {
  return useSyncExternalStore<FlashcardSettings | null>(subscribe, read, () => null);
}
