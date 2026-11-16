import { getTodayReview } from "@/lib/review";
import { getStages, newSeed, reviewLearnMaterials, reviewLearnScope } from "@/lib/learn";
import { LearnMode } from "../../[setId]/[groupId]/learn/LearnMode";
import { ReviewUnavailable } from "../ReviewUnavailable";
import { REVIEW_HREF } from "../shared";

export const dynamic = "force-dynamic";

/** Learn для поточної добірки Повторення: свій прогрес на добірку, відповіді ставлять оцінки в розклад. */
async function load() {
  try {
    const review = await getTodayReview();
    const words = review.items.map(i => i.word);
    const scope = reviewLearnScope(review.day, review.batch);
    return { words, scope, stages: await getStages(words.map(w => w.spanish), scope) };
  } catch (e) {
    console.error(e);
    return null;
  }
}

export default async function ReviewLearnPage() {
  const data = await load();
  if (!data) return <ReviewUnavailable />;
  const { words, scope, stages } = data;
  return (
    <LearnMode
      key={scope}
      group={{ id: "review", title: "Повторення", emoji: "🔁", words }}
      initialStages={stages}
      materials={reviewLearnMaterials(words)}
      exitHref={REVIEW_HREF}
      exitLabel="До повторення"
      scope={scope}
      seed={newSeed()}
    />
  );
}
