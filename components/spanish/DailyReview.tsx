"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewItem, ReviewToday } from "@/lib/review";
import { gradeTyped, type Grade, type Mode } from "@/lib/review/core";

const MODE_LABEL: Record<Mode, string> = {
  "cards-es-ua": "ES → UA",
  "cards-ua-es": "UA → ES",
  type: "Вписати",
};

const GRADE_LABEL: Record<Grade, string> = { known: "Знаю", hesitant: "Вагався", unknown: "Не знаю" };
const GRADE_STYLE: Record<Grade, string> = {
  known: "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  hesitant: "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  unknown: "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

/** Кнопки оцінки до вибору: кольорова рамка й текст, без заливки. */
const GRADE_OUTLINE: Record<Grade, string> = {
  known: "border-emerald-500/70 text-emerald-700 dark:text-emerald-300",
  hesitant: "border-amber-500/70 text-amber-700 dark:text-amber-300",
  unknown: "border-red-500/70 text-red-700 dark:text-red-300",
};

type Phase = "main" | "retry" | "done";

async function post(body: unknown) {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Помилка збереження");
}

export function DailyReview({ review }: { review: ReviewToday }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(review.mode);
  const [answers, setAnswers] = useState<Record<string, Grade>>(review.answers);
  const [phase, setPhase] = useState<Phase>(() =>
    review.items.some(i => !review.answers[i.key]) ? "main" : "done");
  const [queue, setQueue] = useState<ReviewItem[]>(() => review.items.filter(i => !review.answers[i.key]));
  const [idx, setIdx] = useState(0);

  // Стан поточного слова
  const [revealed, setRevealed] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [autoGrade, setAutoGrade] = useState<Grade | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = queue[idx];
  const isRetry = phase === "retry";

  const resetCard = () => {
    setRevealed(false); setGrade(null); setAutoGrade(null); setTyped(""); setError(null);
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    resetCard();
    post({ action: "mode", mode: m }).catch(() => {});
  };

  const finishPhase = (current: Record<string, Grade>) => {
    if (phase === "main") {
      const wrong = review.items.filter(i => current[i.key] === "unknown");
      if (wrong.length > 0) { setQueue(wrong); setIdx(0); setPhase("retry"); return; }
    }
    setPhase("done");
    router.refresh(); // оновити статистику
  };

  const next = async () => {
    if (!item) return;
    let current = answers;
    if (!isRetry) {
      if (!grade) return;
      setBusy(true);
      try {
        await post({ action: "answer", day: review.day, batch: review.batch, key: item.key, grade });
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
        return;
      }
      setBusy(false);
      current = { ...answers, [item.key]: grade };
      setAnswers(current);
    }
    resetCard();
    if (idx + 1 < queue.length) setIdx(idx + 1);
    else finishPhase(current);
  };

  const check = () => {
    if (!item || !typed.trim()) return;
    const g = gradeTyped(typed, item.word.spanish, item.sameTranslation);
    setAutoGrade(g);
    setGrade(g);
    setRevealed(true);
  };

  const more = async () => {
    setBusy(true);
    try {
      await post({ action: "more" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (review.items.length === 0) {
    return (
      <div className="rounded-2xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Сьогодні немає слів для повторення.
      </div>
    );
  }

  if (phase === "done") {
    const counts = { known: 0, hesitant: 0, unknown: 0 } as Record<Grade, number>;
    for (const i of review.items) if (answers[i.key]) counts[answers[i.key]]++;
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-1">
          <p className="text-4xl">🎉</p>
          <p className="font-semibold text-lg">На сьогодні все!</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["known", "hesitant", "unknown"] as Grade[]).map(g => (
            <div key={g} className={`rounded-2xl border p-3 text-center ${GRADE_STYLE[g]}`}>
              <p className="text-2xl font-bold tabular-nums">{counts[g]}</p>
              <p className="text-xs">{GRADE_LABEL[g]}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border bg-card p-4 text-sm space-y-1.5">
          <p>Повторено слів словника: <strong>{review.stats.seen} з {review.stats.total}</strong></p>
          <p>Завтра на повторення: <strong>{review.stats.dueTomorrow}</strong> + нові</p>
        </div>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <button onClick={more} disabled={busy}
          className="w-full min-h-[52px] rounded-2xl border text-sm font-medium hover:bg-accent/40 active:scale-[0.98] transition-all disabled:opacity-50">
          {busy ? "…" : "Ще 10 слів"}
        </button>
      </div>
    );
  }

  const w = item.word;
  const total = queue.length;

  return (
    <div className="space-y-4">
      {/* Режим */}
      <div className="flex rounded-2xl bg-muted p-1 gap-1">
        {(Object.keys(MODE_LABEL) as Mode[]).map(m => (
          <button key={m} onClick={() => switchMode(m)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
              mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {/* Прогрес */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${isRetry ? "bg-red-500" : "bg-primary"}`}
            style={{ width: `${(idx / total) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {isRetry ? "Повтор помилок · " : ""}{idx + 1} / {total}
        </span>
      </div>

      {/* Лицьовий бік */}
      {!revealed && (
        <div className="rounded-3xl border bg-card flex flex-col items-center justify-center p-8 text-center min-h-[260px]">
          {mode === "cards-es-ua" ? (
            <>
              <span className="text-4xl font-bold tracking-tight">{w.spanish}</span>
              <span className="text-base text-muted-foreground mt-2 font-mono tracking-wide">{w.pronunciation}</span>
            </>
          ) : (
            <>
              {w.emoji && <span className="text-5xl mb-3">{w.emoji}</span>}
              <span className="text-3xl font-bold">{w.ukrainian}</span>
              {item.hint && <span className="text-sm text-muted-foreground mt-2">підказка: <span className="font-mono">{item.hint}</span></span>}
            </>
          )}
        </div>
      )}

      {/* Зворотний бік */}
      {revealed && <WordDetails item={item} />}

      {/* Дії */}
      {mode === "type" && !revealed && (
        <TypeInput value={typed} onChange={setTyped} onSubmit={check} />
      )}

      {mode !== "type" && !revealed && (
        <button onClick={() => setRevealed(true)}
          className="w-full min-h-[52px] rounded-2xl border text-sm font-medium hover:bg-accent/40 active:scale-[0.98] transition-all">
          Показати відповідь
        </button>
      )}

      {revealed && mode === "type" && autoGrade && (
        <div className={`rounded-2xl border p-3 text-sm flex items-center justify-between gap-3 ${GRADE_STYLE[grade ?? autoGrade]}`}>
          <span>Ти написав: <strong>{typed}</strong> → {GRADE_LABEL[grade ?? autoGrade]}</span>
          {autoGrade !== "known" && grade !== "known" && (
            <button onClick={() => setGrade("known")} className="shrink-0 text-xs underline">
              Я мав на увазі це
            </button>
          )}
        </div>
      )}

      {revealed && mode !== "type" && !isRetry && (
        <div className="grid grid-cols-3 gap-2">
          {(["known", "hesitant", "unknown"] as Grade[]).map(g => (
            <button key={g} onClick={() => setGrade(g)}
              className={`min-h-[48px] rounded-2xl text-sm font-medium transition-all active:scale-[0.98] ${
                grade === g ? `border-2 ${GRADE_STYLE[g]}` : `border-2 ${GRADE_OUTLINE[g]} hover:bg-accent/40`
              }`}>
              {GRADE_LABEL[g]}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      {revealed && (
        <button onClick={next} disabled={busy || (!isRetry && !grade)}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-40">
          {busy ? "…" : "Далі →"}
        </button>
      )}
    </div>
  );
}

function TypeInput({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="flex gap-2">
      <input ref={ref} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSubmit(); }}
        placeholder="Іспанською…" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
        className="flex-1 min-h-[52px] rounded-2xl border bg-background px-4 text-base outline-none focus:ring-2 focus:ring-primary/40" />
      <button onClick={onSubmit} disabled={!value.trim()}
        className="min-h-[52px] px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">
        Перевірити
      </button>
    </div>
  );
}

function WordDetails({ item }: { item: ReviewItem }) {
  const w = item.word;
  return (
    <div className="rounded-3xl border bg-card flex flex-col items-center p-6 text-center">
      <span className="text-2xl font-bold">{w.spanish}</span>
      <span className="text-sm text-muted-foreground font-mono mt-0.5">{w.pronunciation}</span>
      {w.emoji && <span className="text-5xl mt-3">{w.emoji}</span>}
      <span className="text-2xl font-semibold mt-2">{w.ukrainian}</span>
      <div className="mt-4 w-full pt-4 border-t space-y-2">
        {w.sound_association && (
          <div className="text-left bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Звукова асоціація</p>
            <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{w.sound_association}</p>
          </div>
        )}
        {w.example_es && (
          <div className="text-left bg-sky-50 dark:bg-sky-950/30 rounded-2xl p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-1">Приклад</p>
            <p className="text-sm font-medium text-sky-900 dark:text-sky-100 italic">{w.example_es}</p>
            <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">{w.example_uk}</p>
          </div>
        )}
      </div>
    </div>
  );
}
