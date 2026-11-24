export const dynamic = "force-dynamic";

import sql from "@/lib/db";
import { Topic } from "@/lib/db";
import Link from "next/link";

async function getTopics() {
  return (await sql`
    SELECT * FROM topics ORDER BY created_at DESC, id DESC
  `) as Topic[];
}

export default async function HomePage() {
  let topics: Topic[] = [];
  let dbError = false;

  try {
    topics = await getTopics();
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

  return (
    <div className="space-y-6">

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
          <div className="space-y-3">
            {topics.map((topic) => (
              <Link key={topic.id} href={`/topics/${topic.slug}`} className="block">
                <div className="rounded-2xl border bg-card p-4 hover:bg-accent/40 active:scale-[0.99] transition-all cursor-pointer">
                  <p className="font-medium text-[15px] leading-snug">{topic.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{addedLabel(topic.created_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

/** «додано 24 листопада» (рік — лише якщо не поточний); день рахуємо за Києвом, як і в решті застосунку. */
function addedLabel(createdAt: string | Date): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  const timeZone = "Europe/Kyiv";
  const yearOf = (d: Date) => new Intl.DateTimeFormat("uk-UA", { year: "numeric", timeZone }).format(d);
  const format = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric", month: "long", timeZone, ...(yearOf(date) === yearOf(new Date()) ? {} : { year: "numeric" }),
  });
  return `додано ${format.format(date)}`;
}
