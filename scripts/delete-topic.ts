import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const slug = process.argv[2];
  if (!slug) { console.error("Usage: tsx scripts/delete-topic.ts <slug>"); process.exit(1); }
  await sql`DELETE FROM topics WHERE slug = ${slug}`;
  console.log(`Deleted topic: ${slug}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
