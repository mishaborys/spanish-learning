export const dynamic = "force-dynamic";

import sql from "@/lib/db";
import { WordWithProgress } from "@/lib/db";
import { ReviewSession } from "@/components/spanish/ReviewSession";
import Link from "next/link";

export default async function ReviewPage() {
  const words = (await sql`
    SELECT
      w.*,
      p.status,
      p.correct_count,
      p.incorrect_count,
      p.next_review_at
    FROM progress p
    JOIN words w ON w.id = p.word_id
    WHERE p.next_review_at <= NOW()
      AND p.status != 'known'
    ORDER BY p.next_review_at ASC
    LIMIT 30
  `) as WordWithProgress[];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Всі теми
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Повторення</h1>
        {words.length > 0 && (
          <p className="text-muted-foreground text-sm mt-1">
            {words.length} слів на сьогодні
          </p>
        )}
      </div>

      <ReviewSession words={words} />
    </div>
  );
}
