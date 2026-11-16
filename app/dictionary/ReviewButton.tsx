"use client";

import Link from "next/link";
import type { Grade } from "@/lib/review/core";
import { REVIEW_HREF, useReviewAnswers } from "./review/shared";

export type ReviewBadge = { day: string; batch: number; keys: string[]; answers: Record<string, Grade> };

/** Кнопка Повторення вгорі Словника: скільки слів поточної добірки ще не оцінено (з урахуванням черги). */
export function ReviewButton({ badge }: { badge: ReviewBadge | null }) {
  const answers = useReviewAnswers(badge ?? { day: "", batch: 0, answers: {} });
  const left = badge ? badge.keys.filter(k => !answers[k]).length : null;
  return (
    <Link href={REVIEW_HREF}
      aria-label={left === null ? "Повторення" : left === 0 ? "Повторення: на сьогодні все" : `Повторення: лишилось ${left}`}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-full border bg-card pl-3 pr-3.5 h-10 text-sm font-medium hover:bg-accent/30 transition-colors active:scale-[0.98]">
      <RepeatIcon />
      Повторення
      {left !== null && (left === 0
        ? <span className="text-[#18AE79]">✓</span>
        : <span className="min-w-[1.5rem] h-6 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center tabular-nums">{left}</span>)}
    </Link>
  );
}

function RepeatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
