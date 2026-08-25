import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

type TopicData = {
  title: string;
  slug: string;
  display_order: number;
  grammar_text: string;
  fill_words?: string[];
  quiz_sentences?: { question: string; options: string[]; correct: string }[];
  words: {
    spanish: string;
    ukrainian: string;
    pronunciation?: string;
    example_es?: string;
    example_uk?: string;
    gender?: string;
    part_of_speech?: string;
  }[];
};

async function seedTopic(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data: TopicData = JSON.parse(raw);

  console.log(`Seeding: ${data.title} (${data.slug})`);

  const existing = await sql`
    SELECT id FROM topics WHERE slug = ${data.slug}
  `;

  let topicId: number;
  const quizSentencesJson = data.quiz_sentences ? JSON.stringify(data.quiz_sentences) : null;

  if (existing.length > 0) {
    topicId = existing[0].id as number;
    await sql`
      UPDATE topics SET
        title = ${data.title},
        grammar_text = ${data.grammar_text},
        display_order = ${data.display_order},
        fill_words = ${data.fill_words ?? null},
        quiz_sentences = ${quizSentencesJson}
      WHERE id = ${topicId}
    `;
    console.log(`  Updated topic id=${topicId}`);
  } else {
    const result = await sql`
      INSERT INTO topics (title, slug, grammar_text, display_order, fill_words, quiz_sentences)
      VALUES (${data.title}, ${data.slug}, ${data.grammar_text}, ${data.display_order}, ${data.fill_words ?? null}, ${quizSentencesJson})
      RETURNING id
    `;
    topicId = result[0].id as number;
    console.log(`  Created topic id=${topicId}`);
  }

  for (const word of data.words) {
    const existing = await sql`
      SELECT id FROM words WHERE topic_id = ${topicId} AND spanish = ${word.spanish}
    `;
    if (existing.length > 0) {
      await sql`
        UPDATE words SET
          ukrainian = ${word.ukrainian},
          pronunciation = ${word.pronunciation ?? null},
          example_es = ${word.example_es ?? null},
          example_uk = ${word.example_uk ?? null},
          gender = ${word.gender ?? null},
          part_of_speech = ${word.part_of_speech ?? null}
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO words (topic_id, spanish, ukrainian, pronunciation, example_es, example_uk, gender, part_of_speech)
        VALUES (
          ${topicId},
          ${word.spanish},
          ${word.ukrainian},
          ${word.pronunciation ?? null},
          ${word.example_es ?? null},
          ${word.example_uk ?? null},
          ${word.gender ?? null},
          ${word.part_of_speech ?? null}
        )
      `;
    }
  }

  console.log(`  ${data.words.length} words processed`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    for (const arg of args) {
      await seedTopic(path.resolve(arg));
    }
  } else {
    const dir = path.resolve("data/topics");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      await seedTopic(path.join(dir, file));
    }
  }

  console.log("Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
