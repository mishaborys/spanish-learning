import fs from "fs";
import path from "path";
import type { ConjVerb } from "./core";

/** Дієслова вправи «Відмінювання» (`data/conjugation/presente.json`). */
export function loadConjugation(): ConjVerb[] {
  const file = path.join(process.cwd(), "data/conjugation/presente.json");
  return (JSON.parse(fs.readFileSync(file, "utf-8")) as { verbs: ConjVerb[] }).verbs;
}

/** Тема в «Темах», на сторінці якої є вкладка «Відмінювання». */
export const CONJUGATION_TOPIC_SLUG = "conjugation-practice";
