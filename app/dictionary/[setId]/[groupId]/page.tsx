import { GroupClient } from "./GroupClient";
import { loadGroupOr404 } from "./group";
import { getStages, learnScope, type Stage } from "@/lib/learn";
import { getBest } from "@/lib/blast";

export default async function DictionaryGroupPage({ params }: { params: Promise<{ setId: string; groupId: string }> }) {
  const { setId, groupId } = await params;
  const { set, group, groupHref, backHref } = loadGroupOr404(setId, groupId);
  // Без бази сторінка все одно працює (Flashcards і Blast без рекорду).
  // Запити незалежні: збій рекорду Blast не повинен вимикати Learn, і навпаки.
  const [stagesRes, bestRes] = await Promise.allSettled([
    getStages(group.words.map(w => w.spanish), learnScope(set, group)),
    getBest(set.id, group.id),
  ]);
  const stages: Record<string, Stage> | null = stagesRes.status === "fulfilled" ? stagesRes.value : null;
  const blastBest = bestRes.status === "fulfilled" ? bestRes.value : null;
  for (const r of [stagesRes, bestRes]) if (r.status === "rejected") console.error(r.reason);
  return (
    <GroupClient
      group={group}
      setTitle={set.title}
      groupHref={groupHref}
      backHref={backHref}
      backLabel={set.groups.length === 1 ? "Словник" : set.title}
      stages={stages}
      scope={learnScope(set, group)}
      blastBest={blastBest}
    />
  );
}
