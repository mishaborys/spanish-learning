import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export default sql;

export type Topic = {
  id: number;
  title: string;
  slug: string;
  grammar_text: string;
  display_order: number;
  created_at: string;
};

export type Word = {
  id: number;
  topic_id: number;
  spanish: string;
  ukrainian: string;
  example_es: string | null;
  example_uk: string | null;
  gender: string | null;
  part_of_speech: string | null;
};

export type Progress = {
  id: number;
  word_id: number;
  status: "new" | "learning" | "known";
  correct_count: number;
  incorrect_count: number;
  next_review_at: string;
  last_reviewed_at: string | null;
};

export type WordWithProgress = Word & {
  status: Progress["status"];
  correct_count: number;
  incorrect_count: number;
  next_review_at: string;
};
