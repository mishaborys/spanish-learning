import Link from "next/link";
import { loadVocabularySets } from "@/lib/vocabulary";

type VocabSetMeta = {
  id: string;
  title: string;
  description: string;
  totalWords: number;
  groupCount: number;
  addedAt: number;
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
    }))
    .sort((a, b) => b.addedAt - a.addedAt || a.id.localeCompare(b.id));
}

export default function DictionaryPage() {
  const sets = loadSets();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Словник</h1>
        <p className="text-sm text-muted-foreground mt-1">Набори слів для вивчення</p>
      </div>

      {sets.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">Набори відсутні.</p>
      )}

      <div className="space-y-3">
        {sets.map(s => (
          <Link key={s.id} href={`/dictionary/${s.id}`}
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
