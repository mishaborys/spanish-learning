import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`ALTER TABLE topics ADD COLUMN IF NOT EXISTS fill_words TEXT[]`;
  console.log("Migration done: topics.fill_words column added");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
