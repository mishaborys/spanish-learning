export const dynamic = "force-dynamic";

import sql from "@/lib/db";
import { Topic } from "@/lib/db";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";

type TopicStat = { topic_id: number; total: number; known: number; learning: number };

async function getTopicsWithProgress() {
  const topics = (await sql`
    SELECT * FROM topics ORDER BY display_order ASC, created_at ASC
  `) as Topic[];

  const stats = (await sql`
    SELECT
      w.topic_id,
      COUNT(w.id)::int AS total,
      COUNT(p.id) FILTER (WHERE p.status = 'known')::int AS known,
      COUNT(p.id) FILTER (WHERE p.status = 'learning')::int AS learning
    FROM words w
    LEFT JOIN progress p ON p.word_id = w.id
    GROUP BY w.topic_id
  `) as TopicStat[];

  const statsMap = Object.fromEntries(stats.map((s) => [s.topic_id, s]));
  return topics.map((t) => ({
    ...t,
    stats: statsMap[t.id] ?? { total: 0, known: 0, learning: 0 },
  }));
}

async function getReviewCount() {
  const result = (await sql`
    SELECT COUNT(*)::int AS count FROM progress
    WHERE next_review_at <= NOW() AND status != 'known'
  `) as { count: number }[];
  return result[0]?.count ?? 0;
}

export default async function HomePage() {
  let topics: Awaited<ReturnType<typeof getTopicsWithProgress>> = [];
  let reviewCount = 0;
  let dbError = false;

  try {
    [topics, reviewCount] = await Promise.all([getTopicsWithProgress(), getReviewCount()]);
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Іспанська</h1>
        <div className="rounded-2xl border bg-muted/40 p-5">
          <p className="text-sm text-muted-foreground">
            База даних не підключена. Додай{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">DATABASE_URL</code>{" "}
            та зроби <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /api/seed</code>.
          </p>
        </div>
      </div>
    );
  }

  const totalWords = topics.reduce((s, t) => s + t.stats.total, 0);
  const totalKnown = topics.reduce((s, t) => s + t.stats.known, 0);
  const overallPercent = totalWords > 0 ? Math.round((totalKnown / totalWords) * 100) : 0;

  return (
    <div className="space-y-6">

      {/* Stats header */}
      {totalWords > 0 && (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tracking-tight">{overallPercent}%</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {totalKnown} з {totalWords} слів
              </p>
            </div>
            {reviewCount > 0 && (
              <Link
                href="/review"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <span className="text-base leading-none">↩</span>
                {reviewCount} до повторення
              </Link>
            )}
          </div>
          <Progress value={overallPercent} className="h-2" />
        </div>
      )}

      {/* Review banner when no overall stats yet */}
      {totalWords === 0 && reviewCount > 0 && (
        <Link href="/review">
          <div className="rounded-2xl border bg-primary text-primary-foreground p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold">Час повторювати</p>
              <p className="text-sm opacity-80">{reviewCount} слів чекають</p>
            </div>
            <span className="text-2xl">↩</span>
          </div>
        </Link>
      )}

      {/* Topics list */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
          Теми
        </p>

        {topics.length === 0 ? (
          <div className="rounded-2xl border bg-muted/40 p-5">
            <p className="text-sm text-muted-foreground">
              Тем поки немає. Попроси Клода додати тему!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {topics.map((topic) => {
              const { total, known, learning } = topic.stats;
              const percent = total > 0 ? Math.round((known / total) * 100) : 0;
              const newWords = total - known - learning;

              return (
                <Link key={topic.id} href={`/topics/${topic.slug}`}>
                  <div className="rounded-2xl border bg-card p-4 hover:bg-accent/40 active:scale-[0.99] transition-all cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[15px] leading-snug">{topic.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {total} {pluralWords(total)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                        {newWords > 0 && (
                          <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                            {newWords} нових
                          </span>
                        )}
                        {known > 0 && (
                          <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                            {percent}%
                          </span>
                        )}
                      </div>
                    </div>
                    <Progress value={percent} className="h-1.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

function pluralWords(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "слово";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "слова";
  return "слів";
}
