import Link from "next/link";
import { loadVocabularySets, setHref } from "@/lib/vocabulary";
import { getTodayReview } from "@/lib/review";
import { ReviewButton, type ReviewBadge } from "./ReviewButton";

// Кнопка Повторення показує, скільки слів лишилось на сьогодні — це дані з бази
export const dynamic = "force-dynamic";

type VocabSetMeta = {
  id: string;
  title: string;
  description: string;
  totalWords: number;
  groupCount: number;
  addedAt: number;
  href: string;
};

function loadSets(): VocabSetMeta[] {
  return loadVocabularySets()
    .map(raw => ({
      id: raw.id,
      title: raw.title,
      description: raw.description,
      totalWords: raw.groups.reduce((s, g) => s + g.words.length, 0),
      groupCount: raw.groups.length,
      addedAt: raw.added_at ? Date.parse(raw.added_at) : 0,
      href: setHref(raw),
    }))
    .sort((a, b) => b.addedAt - a.addedAt || a.id.localeCompare(b.id));
}

/** Поточна добірка Повторення для лічильника на кнопці; null — база недоступна. */
async function reviewBadge(): Promise<ReviewBadge | null> {
  try {
    const { day, batch, items, answers } = await getTodayReview();
    return { day, batch, keys: items.map(i => i.key), answers };
  } catch (e) {
    console.error(e);
    return null;
  }
}

export default async function DictionaryPage() {
  const sets = loadSets();
  const badge = await reviewBadge();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Словник</h1>
          <p className="text-sm text-muted-foreground mt-1">Набори слів для вивчення</p>
        </div>
        <ReviewButton badge={badge} />
      </div>

      {sets.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">Набори відсутні.</p>
      )}

      <div className="space-y-3">
        {sets.map(s => (
          <Link key={s.id} href={s.href}
            className="block rounded-2xl border bg-card p-4 hover:bg-accent/30 transition-colors active:scale-[0.99]">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
              <span className="text-muted-foreground text-lg shrink-0">→</span>
            </div>
            <div className="flex gap-3 mt-3">
              <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
                {s.totalWords} слів
              </span>
              <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                {s.groupCount} груп
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
