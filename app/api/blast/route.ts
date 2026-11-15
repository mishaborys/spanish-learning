import { NextRequest, NextResponse } from "next/server";
import { BlastInputError, recordScore } from "@/lib/blast";

type Body = { action: "score"; setId: string; groupId: string; score: number };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object" || body.action !== "score") {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }
  try {
    const best = await recordScore({ setId: body.setId, groupId: body.groupId, score: body.score });
    return NextResponse.json({ ok: true, best });
  } catch (e) {
    if (e instanceof BlastInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Не вдалося зберегти рекорд." }, { status: 500 });
  }
}
