import { getTodayReview, type ReviewToday } from "@/lib/review";
import { getStages, reviewLearnScope, type Stage } from "@/lib/learn";
import { getBest, REVIEW_BLAST } from "@/lib/blast";
import { ReviewClient } from "./ReviewClient";
import { ExitLink } from "@/components/spanish/ExitLink";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  let review: ReviewToday;
  try {
    review = await getTodayReview();
  } catch (e) {
    console.error(e);
    return (
      <div className="space-y-4">
        <ExitLink href="/dictionary" className="text-sm text-muted-foreground hover:text-foreground">← Словник</ExitLink>
        <h1 className="text-xl font-bold">Повторення</h1>
        <div className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
          Не вдалося завантажити повторення. Перевір підключення до бази даних (<code>DATABASE_URL</code>) і онови сторінку.
        </div>
      </div>
    );
  }

  // Збій прогресу Learn чи рекорду Blast не повинен ламати сторінку
  const [stagesRes, bestRes] = await Promise.allSettled([
    getStages(review.items.map(i => i.word.spanish), reviewLearnScope(review.day, review.batch)),
    getBest(REVIEW_BLAST.setId, REVIEW_BLAST.groupId),
  ]);
  for (const r of [stagesRes, bestRes]) if (r.status === "rejected") console.error(r.reason);
  const stages: Record<string, Stage> | null = stagesRes.status === "fulfilled" ? stagesRes.value : null;

  return (
    <ReviewClient
      key={`${review.day}-${review.batch}`}
      review={review}
      stages={stages}
      blastBest={bestRes.status === "fulfilled" ? bestRes.value : null}
    />
  );
}
