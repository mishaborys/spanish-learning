import { getTodayReview } from "@/lib/review";
import { ReviewFlashcards } from "./ReviewFlashcards";
import { ReviewUnavailable } from "../ReviewUnavailable";
import { REVIEW_HREF } from "../shared";

export const dynamic = "force-dynamic";

export default async function ReviewFlashcardsPage() {
  const review = await getTodayReview().catch(e => { console.error(e); return null; });
  if (!review) return <ReviewUnavailable />;
  return <ReviewFlashcards key={`${review.day}-${review.batch}`} review={review} exitHref={REVIEW_HREF} />;
}
