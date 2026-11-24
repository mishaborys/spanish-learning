import { NextRequest, NextResponse } from "next/server";
import { recordSentenceAnswers, SentenceInputError } from "@/lib/sentences";

type Body = { deck: unknown; answers: unknown };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }
  try {
    await recordSentenceAnswers(body.deck, body.answers);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SentenceInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Не вдалося зберегти прогрес." }, { status: 500 });
  }
}
