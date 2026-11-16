"use client";

import { useEffect } from "react";
import { flushOutbox } from "@/lib/blastOutbox";
import { flushReviewOutbox } from "@/lib/reviewOutbox";
import { refreshOfflineCopy } from "@/lib/offlineCache";

/**
 * Офлайн для застосунку на головному екрані: реєструє service worker і зберігає
 * Словник (Flashcards, Blast) для поточної збірки. Відправляє відкладені рекорди Blast і оцінки Повторення.
 * Лише в продакшн-збірці — у розробці service worker заважав би гарячому перезавантаженню.
 */
export function ServiceWorker() {
  useEffect(() => {
    const flush = () => { void flushOutbox(); void flushReviewOutbox(); };
    flush();
    const onOnline = flush;
    window.addEventListener("online", onOnline);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        // Копію качає сама сторінка: фонова робота в service worker на iOS ненадійна
        .then(() => refreshOfflineCopy(process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"))
        .catch(() => { /* без service worker сайт просто працює онлайн */ });
    }
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return null;
}
