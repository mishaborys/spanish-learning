import { LearnMode } from "./LearnMode";
import { loadGroupOr404 } from "../group";
import { getStages, learnMaterials, learnScope, newSeed, type Stage } from "@/lib/learn";
import { ExitLink } from "@/components/spanish/ExitLink";

export const dynamic = "force-dynamic";

export default async function GroupLearnPage({ params }: { params: Promise<{ setId: string; groupId: string }> }) {
  const { setId, groupId } = await params;
  const { set, group, groupHref } = loadGroupOr404(setId, groupId);
  let stages: Record<string, Stage>;
  try {
    stages = await getStages(group.words.map(w => w.spanish), learnScope(set, group));
  } catch (e) {
    console.error(e);
    return (
      <div className="space-y-4">
        <ExitLink href={groupHref} className="text-sm text-muted-foreground hover:text-foreground">← {group.title}</ExitLink>
        <div className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
          Не вдалося завантажити прогрес. Перевір підключення до бази даних (<code>DATABASE_URL</code>) і онови сторінку.
        </div>
      </div>
    );
  }
  return (
    <LearnMode
      group={group}
      initialStages={stages}
      materials={learnMaterials(set, group)}
      exitHref={groupHref}
      scope={learnScope(set, group)}
      // Зерно з сервера: раунд і варіанти однакові при рендері на сервері й у браузері
      seed={newSeed()}
    />
  );
}
