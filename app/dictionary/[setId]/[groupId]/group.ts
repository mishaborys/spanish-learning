import { notFound } from "next/navigation";
import { loadVocabularySet, type VocabGroup, type VocabSet } from "@/lib/vocabulary";

/** Група набору для сторінок `/dictionary/<набір>/<група>/…`; 404, якщо такої немає. */
export function loadGroupOr404(setId: string, groupId: string): { set: VocabSet; group: VocabGroup; groupHref: string; backHref: string } {
  const set = loadVocabularySet(setId);
  const group = set?.groups.find(g => g.id === groupId);
  if (!set || !group) notFound();
  return {
    set,
    group,
    groupHref: `/dictionary/${set.id}/${group.id}`,
    // З єдиної групи набору «назад» веде одразу в Словник (сторінка набору лише перенаправляє сюди)
    backHref: set.groups.length === 1 ? "/dictionary" : `/dictionary/${set.id}`,
  };
}
