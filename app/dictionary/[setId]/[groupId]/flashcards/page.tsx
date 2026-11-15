import { FlashcardsMode } from "./FlashcardsMode";
import { loadGroupOr404 } from "../group";

export default async function GroupFlashcardsPage({ params }: { params: Promise<{ setId: string; groupId: string }> }) {
  const { setId, groupId } = await params;
  const { group, groupHref } = loadGroupOr404(setId, groupId);
  return <FlashcardsMode group={group} exitHref={groupHref} />;
}
