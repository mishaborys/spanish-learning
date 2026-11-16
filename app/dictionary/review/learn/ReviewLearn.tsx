"use client";

import type { ReviewToday } from "@/lib/review";
import type { LearnMaterials, Stage } from "@/lib/learn";
import { LearnMode } from "../../[setId]/[groupId]/learn/LearnMode";
import { PracticeLocked, REVIEW_HREF, usePracticeWords } from "../shared";

/** Learn Повторення: лише слова з «не знаю» й «вагався», після Flashcards. На розклад не впливає. */
export function ReviewLearn({ review, stages, materials, scope, seed }: {
  review: ReviewToday;
  stages: Record<string, Stage>;
  materials: LearnMaterials;
  scope: string;
  seed: number;
}) {
  const practice = usePracticeWords(review);
  if (!practice || practice.length === 0) return <PracticeLocked review={review} mode="Learn" />;
  return (
    <LearnMode
      key={practice.map(i => i.key).join("|")}
      group={{ id: "review", title: "Повторення", emoji: "🔁", words: practice.map(i => i.word) }}
      initialStages={stages}
      materials={materials}
      exitHref={REVIEW_HREF}
      exitLabel="До повторення"
      scope={scope}
      seed={seed}
    />
  );
}
