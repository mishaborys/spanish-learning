import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { allWordsGroup, loadVocabularySet } from "@/lib/vocabulary";
import { PinnedAboveNav } from "@/components/spanish/PinnedAboveNav";

export default async function DictionarySetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const set = loadVocabularySet(setId);
  if (!set) notFound();

  // Набір з однією групою: проміжний список зайвий — одразу сторінка групи
  if (set.groups.length === 1) redirect(`/dictionary/${set.id}/${set.groups[0].id}`);

  const all = allWordsGroup(set);
  const total = all?.words.length ?? set.groups[0]?.words.length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dictionary" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Словник
        </Link>
        <h1 className="text-xl font-bold mt-2">{set.title}</h1>
        <p className="text-sm text-muted-foreground">{total} слів · {set.groups.length} груп</p>
      </div>

      <div className="space-y-2">
        {set.groups.map(g => (
          <Link key={g.id} href={`/dictionary/${set.id}/${g.id}`}
            className="block rounded-2xl border bg-card p-4 hover:bg-accent/30 transition-colors active:scale-[0.99]">
            <div className="flex items-center gap-3">
              <span className="text-2xl w-9 text-center">{g.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{g.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{g.words.length} слів</p>
              </div>
              <span className="text-muted-foreground text-sm shrink-0">→</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Фінальний прохід: усі слова набору разом, після вивчення по частинах */}
      {all && (
        <PinnedAboveNav>
          <Link href={`/dictionary/${set.id}/${all.id}`}
            className="block rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-sm hover:bg-accent/30 transition-colors active:scale-[0.99]">
            <div className="flex items-center gap-3">
              <span className="text-2xl w-9 text-center">{all.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Вивчити все</p>
                <p className="text-xs text-muted-foreground mt-0.5">усі {all.words.length} слів набору за один раз</p>
              </div>
              <span className="text-muted-foreground text-sm shrink-0">→</span>
            </div>
          </Link>
        </PinnedAboveNav>
      )}
    </div>
  );
}
