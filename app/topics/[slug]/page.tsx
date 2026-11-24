export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { Topic, Word } from "@/lib/db";
import { TopicTabs } from "@/components/spanish/TopicTabs";
import Link from "next/link";
import { CONJUGATION_TOPIC_SLUG, loadConjugation } from "@/lib/conjugation/data";
import { getDoneKeys } from "@/lib/conjugation";
import { sentenceDeckForTopic } from "@/lib/sentences/data";
import { getDoneSentenceIds } from "@/lib/sentences";

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

  // Прогрес вправи «Відмінювання»; якщо база не відповіла — починаємо з порожнього, вправа працює й так
  const conjugationDone = slug === CONJUGATION_TOPIC_SLUG ? await getDoneKeys().catch(() => []) : undefined;

  // Те саме для вправи «Речення» (теми з колодою в `lib/sentences/data.ts`)
  const sentenceDeck = sentenceDeckForTopic(slug);
  const sentenceDone = sentenceDeck ? await getDoneSentenceIds(sentenceDeck.id).catch(() => []) : undefined;

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
        </div>
      </div>

      <TopicTabs
        grammarText={topic.grammar_text}
        words={words}
        fillWords={topic.fill_words ?? undefined}
        quizSentences={topic.quiz_sentences ? JSON.parse(topic.quiz_sentences) : undefined}
        conjugation={slug === CONJUGATION_TOPIC_SLUG ? loadConjugation() : undefined}
        conjugationDone={conjugationDone}
        sentenceDeck={sentenceDeck ?? undefined}
        sentenceDone={sentenceDone}
      />
    </div>
  );
}
