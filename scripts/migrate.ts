import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`ALTER TABLE words ADD COLUMN IF NOT EXISTS pronunciation TEXT`;
  console.log("Migration done: words.pronunciation column added");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
