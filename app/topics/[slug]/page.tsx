import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { Topic, Word } from "@/lib/db";
import { TopicTabs } from "@/components/spanish/TopicTabs";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function TopicPage({ params }: Props) {
  const { slug } = await params;

  const topics = (await sql`
    SELECT * FROM topics WHERE slug = ${slug} LIMIT 1
  `) as Topic[];

  if (topics.length === 0) notFound();
  const topic = topics[0];

  const words = (await sql`
    SELECT w.*, COALESCE(p.status, 'new') as status
    FROM words w
    LEFT JOIN progress p ON p.word_id = w.id
    WHERE w.topic_id = ${topic.id}
    ORDER BY w.id ASC
  `) as Word[];

  const known = words.filter((w) => (w as Word & { status: string }).status === "known").length;
  const total = words.length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Всі теми
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold tracking-tight">{topic.title}</h1>
          {total > 0 && (
            <Badge variant="outline" className="text-xs">
              {known}/{total} знаю
            </Badge>
          )}
        </div>
      </div>

      <TopicTabs grammarText={topic.grammar_text} words={words} />
    </div>
  );
}
