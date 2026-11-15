import { notFound } from "next/navigation";
import { DictionaryClient } from "./DictionaryClient";
import { loadVocabularySet } from "@/lib/vocabulary";

export type { VocabSet, VocabGroup, VocabWord } from "@/lib/vocabulary";

export default async function DictionarySetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const set = loadVocabularySet(setId);
  if (!set) notFound();
  return <DictionaryClient set={set} />;
}
