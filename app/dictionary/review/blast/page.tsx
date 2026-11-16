import { getTodayReview } from "@/lib/review";
import { getBest, REVIEW_BLAST, type BlastRecord } from "@/lib/blast";
import { ReviewUnavailable } from "../ReviewUnavailable";
import { ReviewDayGuard } from "../shared";
import { ReviewBlast } from "./ReviewBlast";

export const dynamic = "force-dynamic";

/** Blast Повторення; які слова — вирішує браузер (з урахуванням черги оцінок, бо сторінка працює й офлайн). */
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

  return (
    <>
      <ReviewBlast key={`${review.day}-${review.batch}`} review={review}
        setId={REVIEW_BLAST.setId} groupId={REVIEW_BLAST.groupId} best={best} dbOk={dbOk} />
      <ReviewDayGuard day={review.day} />
    </>
  );
}
