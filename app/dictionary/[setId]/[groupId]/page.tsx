import { GroupClient } from "./GroupClient";
import { loadGroupOr404 } from "./group";
import { getStages, learnScope, type Stage } from "@/lib/learn";

export default async function DictionaryGroupPage({ params }: { params: Promise<{ setId: string; groupId: string }> }) {
  const { setId, groupId } = await params;
  const { set, group, groupHref, backHref } = loadGroupOr404(setId, groupId);
  // Без бази сторінка все одно працює (Flashcards), лише без прогресу Learn
  let stages: Record<string, Stage> | null = null;
  try {
    stages = await getStages(group.words.map(w => w.spanish), learnScope(set, group));
  } catch (e) {
    console.error(e);
  }
  return (
    <GroupClient
      group={group}
      setTitle={set.title}
      groupHref={groupHref}
      backHref={backHref}
      backLabel={set.groups.length === 1 ? "Словник" : set.title}
      stages={stages}
      scope={learnScope(set, group)}
    />
  );
}
