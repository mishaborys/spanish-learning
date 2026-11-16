import { NextRequest, NextResponse } from "next/server";
import { LearnInputError, recordAnswer, resetWords, type QuestionKind } from "@/lib/learn";

type Body =
  | { action: "answer"; scope: string; key: string; kind: QuestionKind; correct: boolean; typo?: boolean }
  | { action: "reset"; scope: string; keys: string[] };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "answer": {
        const stage = await recordAnswer({ scope: body.scope, key: body.key, kind: body.kind, correct: body.correct, typo: body.typo });
        return NextResponse.json({ ok: true, stage });
      }
      case "reset":
        await resetWords(body.keys, body.scope);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof LearnInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Не вдалося зберегти. Спробуй ще раз." }, { status: 500 });
  }
}
