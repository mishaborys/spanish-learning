import { BlastMode, type BlastModeWord } from "./BlastMode";
import { loadGroupOr404 } from "../group";
import { getBest, type BlastRecord } from "@/lib/blast";
import { wordKey } from "@/lib/review/core";

export const dynamic = "force-dynamic";

export default async function GroupBlastPage({ params }: { params: Promise<{ setId: string; groupId: string }> }) {
  const { setId, groupId } = await params;
  const { set, group, groupHref } = loadGroupOr404(setId, groupId);

  // Без бази гра працює, лише рекорд не збережеться
  let best: BlastRecord | null = null;
  let dbOk = true;
  try {
    best = await getBest(set.id, group.id);
  } catch (e) {
    console.error(e);
    dbOk = false;
  }

  const seen = new Set<string>();
  const words: BlastModeWord[] = [];
  for (const w of group.words) {
    const key = wordKey(w.spanish);
    if (seen.has(key)) continue;
    seen.add(key);
    words.push({ key, spanish: w.spanish, prompt: w.ukrainian, emoji: w.emoji });
  }

  return (
    <BlastMode
      words={words}
      title={`${group.emoji} ${group.title}`}
      setId={set.id}
      groupId={group.id}
      exitHref={groupHref}
      initialBest={best}
      dbOk={dbOk}
    />
  );
}
