import { GroupClient } from "./GroupClient";
import { loadGroupOr404 } from "./group";

export default async function DictionaryGroupPage({ params }: { params: Promise<{ setId: string; groupId: string }> }) {
  const { setId, groupId } = await params;
  const { set, group, groupHref, backHref } = loadGroupOr404(setId, groupId);
  return (
    <GroupClient
      group={group}
      setTitle={set.title}
      groupHref={groupHref}
      backHref={backHref}
      backLabel={set.groups.length === 1 ? "Словник" : set.title}
    />
  );
}
