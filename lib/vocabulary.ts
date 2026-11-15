import fs from "fs";
import path from "path";

export type VocabWord = {
  spanish: string;
  ukrainian: string;
  pronunciation: string;
  sound_association: string;
  example_es: string;
  example_uk: string;
  emoji?: string;
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
  added_at?: string;
  groups: VocabGroup[];
};

const DIR = path.join(process.cwd(), "data/vocabulary");

export function loadVocabularySet(id: string): VocabSet | null {
  const file = path.join(DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function loadVocabularySets(): VocabSet[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8")) as VocabSet);
}
