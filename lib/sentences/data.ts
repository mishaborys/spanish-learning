import fs from "fs";
import path from "path";
import type { SentenceDeck } from "./core";

/** Теми, на сторінці яких є вкладка «Речення»: slug теми → id колоди (`data/sentences/<id>.json`). */
export const SENTENCE_TOPICS: Record<string, string> = { quedamos: "quedamos" };

export function loadSentenceDeck(id: string): SentenceDeck | null {
  const file = path.join(process.cwd(), "data/sentences", `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as SentenceDeck;
}

/** Колода речень для теми або `null`, якщо в теми такої вправи немає. */
export function sentenceDeckForTopic(slug: string): SentenceDeck | null {
  const id = SENTENCE_TOPICS[slug];
  return id ? loadSentenceDeck(id) : null;
}
