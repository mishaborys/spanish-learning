import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const { word_id, correct, force_known = false } = await req.json();

  const existing = (await sql`
    SELECT id, correct_count, incorrect_count FROM progress WHERE word_id = ${word_id}
  `) as { id: number; correct_count: number; incorrect_count: number }[];

  const now = new Date();
  const isCorrect = Boolean(correct);

  // force_known = true means flashcard "Знаю" click → immediately mark as known
  const resolveStatus = (count: number) => {
    if (force_known && isCorrect) return "known";
    if (count >= 5) return "known";
    if (count >= 2) return "learning";
    return "new";
  };

  if (existing.length === 0) {
    const correct_count = isCorrect ? 1 : 0;
    const incorrect_count = isCorrect ? 0 : 1;
    const status = resolveStatus(correct_count);
    const next_review = nextReviewDate(correct_count);

    await sql`
      INSERT INTO progress (word_id, status, correct_count, incorrect_count, next_review_at, last_reviewed_at)
      VALUES (${word_id}, ${status}, ${correct_count}, ${incorrect_count}, ${next_review.toISOString()}, ${now.toISOString()})
    `;
  } else {
    const row = existing[0];
    const correct_count = isCorrect ? row.correct_count + 1 : row.correct_count;
    const incorrect_count = isCorrect ? row.incorrect_count : row.incorrect_count + 1;
    const status = resolveStatus(correct_count);
    const next_review = nextReviewDate(correct_count);

    await sql`
      UPDATE progress
      SET correct_count = ${correct_count},
          incorrect_count = ${incorrect_count},
          status = ${status},
          next_review_at = ${next_review.toISOString()},
          last_reviewed_at = ${now.toISOString()}
      WHERE word_id = ${word_id}
    `;
  }

  return NextResponse.json({ ok: true });
}

function nextReviewDate(correctCount: number): Date {
  const intervals = [1, 1, 2, 4, 7, 14, 30];
  const days = intervals[Math.min(correctCount, intervals.length - 1)];
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
