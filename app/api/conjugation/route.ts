import { NextRequest, NextResponse } from "next/server";
import { ConjugationInputError, recordAnswers } from "@/lib/conjugation";

type Body = { answers: unknown };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }
  try {
    await recordAnswers(body.answers);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConjugationInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Не вдалося зберегти прогрес." }, { status: 500 });
  }
}
