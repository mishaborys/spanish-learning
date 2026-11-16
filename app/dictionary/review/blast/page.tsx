import { getTodayReview } from "@/lib/review";
import { getBest, REVIEW_BLAST, type BlastRecord } from "@/lib/blast";
import { BlastMode, type BlastModeWord } from "../../[setId]/[groupId]/blast/BlastMode";
import { ReviewUnavailable } from "../ReviewUnavailable";
import { ReviewDayGuard, REVIEW_HREF } from "../shared";

export const dynamic = "force-dynamic";

/** Blast зі слів поточної добірки; рекорд — один спільний для Повторення. На оцінки не впливає. */
export default async function ReviewBlastPage() {
  const review = await getTodayReview().catch(e => { console.error(e); return null; });
  if (!review) return <ReviewUnavailable />;

  let best: BlastRecord | null = null;
  let dbOk = true;
  try {
    best = await getBest(REVIEW_BLAST.setId, REVIEW_BLAST.groupId);
  } catch (e) {
    console.error(e);
    dbOk = false;
  }

  const words: BlastModeWord[] = review.items.map(i => ({ key: i.key, spanish: i.word.spanish, prompt: i.word.ukrainian, emoji: i.word.emoji }));
  return (
    <>
      <BlastMode
        key={`${review.day}-${review.batch}`}
        words={words}
        title="🔁 Повторення"
        setId={REVIEW_BLAST.setId}
        groupId={REVIEW_BLAST.groupId}
        exitHref={REVIEW_HREF}
        initialBest={best}
        dbOk={dbOk}
      />
      <ReviewDayGuard day={review.day} />
    </>
  );
}
