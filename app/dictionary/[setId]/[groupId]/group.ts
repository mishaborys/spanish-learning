import { notFound } from "next/navigation";
import { findGroup, loadVocabularySet, setHref, type VocabGroup, type VocabSet } from "@/lib/vocabulary";

/** Група набору (або «Усі слова» — `all`) для сторінок `/dictionary/<набір>/<група>/…`; 404, якщо такої немає. */
export function loadGroupOr404(setId: string, groupId: string): { set: VocabSet; group: VocabGroup; groupHref: string; backHref: string } {
  const set = loadVocabularySet(setId);
  const group = set ? findGroup(set, groupId) : null;
  if (!set || !group) notFound();
  return {
    set,
    group,
    groupHref: `/dictionary/${set.id}/${group.id}`,
    // Якщо в набору немає власної сторінки (одна група), «назад» веде одразу в Словник
    backHref: setHref(set) === `/dictionary/${set.id}` ? `/dictionary/${set.id}` : "/dictionary",
  };
}
