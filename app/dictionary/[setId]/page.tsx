import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { DictionaryClient } from "./DictionaryClient";

export type VocabWord = {
  spanish: string;
  ukrainian: string;
  pronunciation: string;
  sound_association: string;
  example_es: string;
  example_uk: string;
};

export type VocabGroup = {
  id: string;
  title: string;
  emoji: string;
  words: VocabWord[];
};

export type VocabSet = {
  id: string;
  title: string;
  description: string;
  groups: VocabGroup[];
};

function loadSet(id: string): VocabSet | null {
  const file = path.join(process.cwd(), "data/vocabulary", `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export default async function DictionarySetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const set = loadSet(setId);
  if (!set) notFound();
  return <DictionaryClient set={set} />;
}
