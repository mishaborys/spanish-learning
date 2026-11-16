import fs from "fs";
import path from "path";
import { wordKey } from "@/lib/review/core";
import type { PartOfSpeech } from "@/lib/partOfSpeech";

export type VocabWord = {
  spanish: string;
  ukrainian: string;
  part_of_speech: PartOfSpeech;
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

/** Адреса псевдогрупи «Усі слова» набору: `/dictionary/<набір>/all`. */
export const ALL_WORDS_GROUP_ID = "all";

/**
 * Псевдогрупа «Усі слова» — для фінального проходу після вивчення по частинах.
 * Є лише в наборах із 2+ групами. Слово, що є в кількох групах, іде один раз.
 */
export function allWordsGroup(set: VocabSet): VocabGroup | null {
  if (set.groups.length < 2) return null;
  const seen = new Set<string>();
  const words: VocabWord[] = [];
  for (const g of set.groups) {
    for (const w of g.words) {
      const key = wordKey(w.spanish);
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(w);
    }
  }
  return { id: ALL_WORDS_GROUP_ID, title: "Усі слова", emoji: "📚", words };
}

/** Група набору за id; `all` — «Усі слова» (справжня група з таким id має пріоритет). */
export function findGroup(set: VocabSet, groupId: string): VocabGroup | null {
  return set.groups.find(g => g.id === groupId)
    ?? (groupId === ALL_WORDS_GROUP_ID ? allWordsGroup(set) : null);
}

/**
 * Адреса набору в Словнику. Набір з однією групою власної сторінки не має (вона лише перенаправляє),
 * тож посилання веде одразу на групу — перенаправлену сторінку Safari з офлайн-кешу не віддає.
 */
export function setHref(set: VocabSet): string {
  return set.groups.length === 1 ? `/dictionary/${set.id}/${set.groups[0].id}` : `/dictionary/${set.id}`;
}
