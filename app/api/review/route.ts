import { NextRequest, NextResponse } from "next/server";
import { addBatch, changeMode, recordAnswer, ReviewInputError, type Grade, type Mode } from "@/lib/review";

type Body =
  | { action: "answer"; day: string; batch: number; key: string; grade: Grade }
  | { action: "more" }
  | { action: "mode"; mode: Mode };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "answer":
        await recordAnswer({ day: body.day, batch: body.batch, key: body.key, grade: body.grade });
        break;
      case "more":
        await addBatch();
        break;
      case "mode":
        await changeMode(body.mode);
        break;
      default:
        return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof ReviewInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Не вдалося зберегти. Спробуй ще раз." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
