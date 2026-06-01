export const dynamic = "force-dynamic";

import sql from "@/lib/db";
import { Topic } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type StatRow = { topic_id: number; total: number; known: number; learning: number };

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
  `) as StatRow[];

  const statsMap = Object.fromEntries(stats.map((s) => [s.topic_id, s]));

  return topics.map((t) => ({
    ...t,
    stats: statsMap[t.id] ?? { total: 0, known: 0, learning: 0 },
  }));
}

async function getReviewCount() {
  const result = (await sql`
    SELECT COUNT(*)::int AS count FROM progress
    WHERE next_review_at <= NOW()
    AND status != 'known'
  `) as { count: number }[];
  return result[0]?.count ?? 0;
}

export default async function HomePage() {
  let topics: Awaited<ReturnType<typeof getTopicsWithProgress>> = [];
  let reviewCount = 0;
  let dbError = false;

  try {
    [topics, reviewCount] = await Promise.all([
      getTopicsWithProgress(),
      getReviewCount(),
    ]);
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Іспанська</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              База даних не підключена. Додай{" "}
              <code className="bg-muted px-1 rounded">DATABASE_URL</code> в{" "}
              <code className="bg-muted px-1 rounded">.env.local</code> і
              зроби запит{" "}
              <code className="bg-muted px-1 rounded">POST /api/seed</code>{" "}
              для створення таблиць.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalWords = topics.reduce((s, t) => s + t.stats.total, 0);
  const totalKnown = topics.reduce((s, t) => s + t.stats.known, 0);
  const overallPercent =
    totalWords > 0 ? Math.round((totalKnown / totalWords) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Іспанська</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {topics.length} {pluralTopics(topics.length)} &middot; {totalWords}{" "}
            {pluralWords(totalWords)}
          </p>
        </div>
        {reviewCount > 0 && (
          <Link href="/review">
            <Badge
              variant="default"
              className="text-sm px-3 py-1 cursor-pointer"
            >
              {reviewCount} до повторення
            </Badge>
          </Link>
        )}
      </div>

      {totalWords > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Загальний прогрес</span>
            <span>{overallPercent}%</span>
          </div>
          <Progress value={overallPercent} className="h-2" />
        </div>
      )}

      {topics.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              Тем поки немає. Попроси Клода додати першу тему!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {topics.map((topic) => {
            const { total, known, learning } = topic.stats;
            const percent =
              total > 0 ? Math.round((known / total) * 100) : 0;

            return (
              <Link key={topic.id} href={`/topics/${topic.slug}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-medium">
                        {topic.title}
                      </CardTitle>
                      <div className="flex gap-2">
                        {learning > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {learning} вивчаю
                          </Badge>
                        )}
                        {known > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {known}/{total} знаю
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <Progress value={percent} className="h-1.5" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function pluralTopics(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "тема";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "теми";
  return "тем";
}

function pluralWords(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "слово";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "слова";
  return "слів";
}
