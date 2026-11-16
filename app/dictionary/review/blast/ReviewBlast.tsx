"use client";

import type { ReviewToday } from "@/lib/review";
import { BlastMode, type BlastRecord } from "../../[setId]/[groupId]/blast/BlastMode";
import { PracticeLocked, REVIEW_HREF, usePracticeWords } from "../shared";

/** Blast Повторення: лише слова з «не знаю» й «вагався», після Flashcards. Рекорд спільний, на оцінки не впливає. */
export function ReviewBlast({ review, setId, groupId, best, dbOk }: {
  review: ReviewToday;
  setId: string;
  groupId: string;
  best: BlastRecord | null;
  dbOk: boolean;
}) {
  const practice = usePracticeWords(review);
  if (!practice || practice.length === 0) return <PracticeLocked review={review} mode="Blast" />;
  return (
    <BlastMode
      key={practice.map(i => i.key).join("|")}
      words={practice.map(i => ({ key: i.key, spanish: i.word.spanish, prompt: i.word.ukrainian, emoji: i.word.emoji }))}
      title="🔁 Повторення"
      setId={setId}
      groupId={groupId}
      exitHref={REVIEW_HREF}
      initialBest={best}
      dbOk={dbOk}
    />
  );
}
