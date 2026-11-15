export const dynamic = "force-dynamic";

import { getTodayReview, type ReviewToday } from "@/lib/review";
import { DailyReview } from "@/components/spanish/DailyReview";

export default async function ReviewPage() {
  let review: ReviewToday;
  try {
    review = await getTodayReview();
  } catch (e) {
    console.error(e);
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold tracking-tight">Повторення</h1>
        <div className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
          Не вдалося завантажити повторення. Перевір підключення до бази даних (<code>DATABASE_URL</code>) і онови сторінку.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Повторення</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Слова зі словника · {review.stats.seen} з {review.stats.total} вже повторено
        </p>
      </div>
      <DailyReview key={`${review.day}-${review.batch}`} review={review} />
    </div>
  );
}
