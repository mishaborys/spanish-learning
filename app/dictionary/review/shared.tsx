"use client";

// Спільне для сторінок Повторення: оцінки з урахуванням черги на телефоні, кольори оцінок,
// захист від учорашньої добірки зі збереженої копії.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { kyivDay, type Grade } from "@/lib/review/core";
import type { ReviewToday } from "@/lib/review";
import { mergeAnswers, outboxSnapshot, parseOutbox, subscribeOutbox } from "@/lib/reviewOutbox";

export const REVIEW_HREF = "/dictionary/review";

/** Порядок оцінок у списках і підсумках. */
export const GRADE_ORDER: Grade[] = ["unknown", "hesitant", "known"];
export const GRADE_LABEL: Record<Grade, string> = { known: "Знаю", hesitant: "Вагався", unknown: "Не знаю" };
export const GRADE_DOT: Record<Grade, string> = { known: "bg-[#18AE79]", hesitant: "bg-[#F5B400]", unknown: "bg-[#FF983A]" };

/** Оцінки поточної добірки: з сервера плюс ще не відправлені з телефона. */
export function useReviewAnswers(review: Pick<ReviewToday, "answers" | "day" | "batch">): Record<string, Grade> {
  const raw = useSyncExternalStore(subscribeOutbox, outboxSnapshot, () => "[]");
  return useMemo(
    () => mergeAnswers(review.answers, parseOutbox(raw), review.day, review.batch),
    [raw, review.answers, review.day, review.batch],
  );
}

export function gradeCounts(answers: Record<string, Grade>, keys: string[]): Record<Grade, number> {
  const counts: Record<Grade, number> = { known: 0, hesitant: 0, unknown: 0 };
  for (const k of keys) if (answers[k]) counts[answers[k]]++;
  return counts;
}

/** Три лічильники оцінок. */
export function GradeCounters({ counts }: { counts: Record<Grade, number> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {(["known", "hesitant", "unknown"] as Grade[]).map(g => (
        <div key={g} className={`rounded-2xl border p-3 text-center swipe-counter-${g}`}>
          <p className="text-2xl font-bold tabular-nums">{counts[g]}</p>
          <p className="text-xs">{GRADE_LABEL[g]}</p>
        </div>
      ))}
    </div>
  );
}

/** «Ще 10 слів»: нова добірка на сьогодні (лише з інтернетом). */
export function useMoreWords() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const more = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "more" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Не вдалося додати слова");
      router.refresh();
    } catch (e) {
      setError(e instanceof TypeError ? "Немає інтернету — нові слова можна взяти лише з мережею" : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { more, busy, error };
}

/**
 * Сторінку могли відкрити зі збереженої копії вчорашнього дня (без інтернету).
 * Тоді з мережею — підтягуємо свіжу, без мережі — пояснюємо, що потрібен інтернет.
 */
export function ReviewDayGuard({ day }: { day: string }) {
  const router = useRouter();
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const check = () => {
      const isStale = kyivDay(new Date()) !== day;
      // З мережею просто тихо підтягуємо сьогоднішню добірку
      setStale(isStale && !navigator.onLine);
      if (isStale && navigator.onLine) router.refresh();
    };
    check();
    // Застосунок на телефоні може лишатися відкритим через північ
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
    };
  }, [day, router]);
  if (!stale) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-4xl">📡</p>
      <p className="font-semibold text-lg">Немає інтернету</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Тут збережена вчорашня добірка. Нову на сьогодні можна отримати лише з інтернетом.
      </p>
      <button type="button" onClick={() => location.reload()}
        className="min-h-[48px] px-6 rounded-2xl bg-primary text-primary-foreground text-sm font-medium">
        Спробувати ще раз
      </button>
      <Link href="/dictionary" className="text-sm text-muted-foreground underline">До Словника</Link>
    </div>
  );
}
