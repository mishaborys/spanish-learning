import { getTodayReview } from "@/lib/review";
import { getStages, newSeed, reviewLearnMaterials, reviewLearnScope } from "@/lib/learn";
import { ReviewUnavailable } from "../ReviewUnavailable";
import { ReviewLearn } from "./ReviewLearn";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const review = await getTodayReview();
    const scope = reviewLearnScope(review.day, review.batch);
    return { review, scope, stages: await getStages(review.items.map(i => i.word.spanish), scope) };
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Learn для поточної добірки Повторення: свій прогрес на добірку. Які слова — вирішує браузер (з урахуванням черги оцінок). */
export default async function ReviewLearnPage() {
  const data = await load();
  if (!data) return <ReviewUnavailable />;
  const { review, scope, stages } = data;
  return (
    <ReviewLearn
      key={scope}
      review={review}
      stages={stages}
      // Хибні варіанти — спершу з інших слів добірки, далі з усього Словника
      materials={reviewLearnMaterials(review.items.map(i => i.word))}
      scope={scope}
      seed={newSeed()}
    />
  );
}
