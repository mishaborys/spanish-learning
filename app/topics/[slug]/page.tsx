export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { Topic, Word } from "@/lib/db";
import { TopicTabs } from "@/components/spanish/TopicTabs";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

type Props = { params: Promise<{ slug: string }> };

export default async function TopicPage({ params }: Props) {
  const { slug } = await params;

  const topics = (await sql`SELECT * FROM topics WHERE slug = ${slug} LIMIT 1`) as Topic[];
  if (topics.length === 0) notFound();
  const topic = topics[0];

  const words = (await sql`
    SELECT w.*, COALESCE(p.status, 'new') as status
    FROM words w
    LEFT JOIN progress p ON p.word_id = w.id
    WHERE w.topic_id = ${topic.id}
    ORDER BY w.id ASC
  `) as (Word & { status: string })[];

  const known = words.filter((w) => w.status === "known").length;
  const learning = words.filter((w) => w.status === "learning").length;
  const total = words.length;
  const percent = total > 0 ? Math.round((known / total) * 100) : 0;

  return (
    <div className="space-y-5">

      {/* Back + title */}
      <div className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Всі теми
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{topic.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} {pluralWords(total)}
            {learning > 0 && ` · ${learning} вивчаю`}
            {known > 0 && ` · ${known} знаю`}
          </p>
        </div>
        {total > 0 && (
          <div className="space-y-1.5">
            <Progress value={percent} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-right">{percent}%</p>
          </div>
        )}
      </div>

      <TopicTabs
        grammarText={topic.grammar_text}
        words={words}
        fillWords={topic.fill_words ?? undefined}
        quizSentences={topic.quiz_sentences ? JSON.parse(topic.quiz_sentences) : undefined}
      />
    </div>
  );
}

function pluralWords(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "слово";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "слова";
  return "слів";
}
