import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const { word_ids } = await req.json() as { word_ids: number[] };
  if (!Array.isArray(word_ids) || word_ids.length === 0) {
    return NextResponse.json({ error: "word_ids required" }, { status: 400 });
  }
  await sql`DELETE FROM progress WHERE word_id = ANY(${word_ids})`;
  return NextResponse.json({ ok: true });
}
