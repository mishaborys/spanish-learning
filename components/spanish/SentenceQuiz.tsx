"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { QuizSentence } from "@/lib/db";

type Props = { sentences: QuizSentence[] };
const ADVANCE_MS = 2000;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function SentenceQuiz({ sentences }: Props) {
  const makeDeck = useCallback(
    () => shuffle(sentences).map(s => ({ ...s, options: shuffle(s.options) })),
    [sentences]
  );

  const [deck, setDeck] = useState(makeDeck);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [wrong, setWrong] = useState<QuizSentence[]>([]);
  const [barWidth, setBarWidth] = useState(0);

  const idxRef = useRef(idx);
  const lenRef = useRef(deck.length);
  idxRef.current = idx;
  lenRef.current = deck.length;

  const q = deck[idx];

  useEffect(() => {
    if (selected === null) { setBarWidth(0); return; }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setBarWidth(100)));
    const timer = setTimeout(() => {
      setBarWidth(0);
      const next = idxRef.current + 1;
      if (next >= lenRef.current) setDone(true);
      else { setIdx(next); setSelected(null); }
    }, ADVANCE_MS);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [selected]);

  const resetSession = useCallback(() => {
    setDeck(makeDeck()); setIdx(0); setSelected(null);
    setBarWidth(0); setScore(0); setDone(false); setWrong([]);
  }, [makeDeck]);

  const handleSelect = (option: string) => {
    if (selected !== null || !q) return;
    setSelected(option);
    if (option === q.correct) setScore(s => s + 1);
    else setWrong(prev => [...prev, q]);
  };

  if (sentences.length === 0) return null;

  if (done) {
    const total = Math.max(deck.length, 1);
    const pct = Math.round((score / total) * 100);
    return (
      <div className="space-y-6 py-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-20 h-20 rounded-full border-4 border-primary flex items-center justify-center">
            <span className="text-xl font-bold">{pct}%</span>
          </div>
          <p className="font-semibold text-lg">
            {pct === 100 ? "Ідеально!" : pct >= 70 ? "Добре!" : "Продовжуй!"}
          </p>
          <p className="text-sm text-muted-foreground">{score} з {total} правильних</p>
        </div>
        {wrong.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Повтори:</p>
            <div className="space-y-1.5">
              {wrong.map((w, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 gap-3">
                  <span className="text-sm">{w.question.replace("___", w.correct)}</span>
                  <span className="text-sm font-medium text-primary shrink-0">{w.correct}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={resetSession}
          className="w-full min-h-[48px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all">
          Ще раз
        </button>
      </div>
    );
  }

  if (!q) return null;
  const isCorrect = selected === q.correct;

  return (
    <div className="flex flex-col gap-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(idx / deck.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{idx + 1}/{deck.length}</span>
      </div>

      {/* Question card */}
      <div className="rounded-3xl border bg-card flex flex-col items-center justify-center p-5 text-center"
        style={{ minHeight: 120 }}>
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Обери правильну форму</p>
        <p className="text-2xl font-bold tracking-tight leading-snug">{q.question}</p>
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-2.5">
        {q.options.map((opt) => {
          const thisCorrect = selected !== null && opt === q.correct;
          const thisWrong = selected === opt && opt !== q.correct;
          const dimmed = selected !== null && !thisCorrect && opt !== selected;
          return (
            <button key={opt} onClick={() => handleSelect(opt)} disabled={selected !== null}
              style={{ height: 60 }}
              className={`rounded-2xl border-2 px-3 text-lg font-medium text-center leading-tight transition-colors duration-150
                ${thisCorrect ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 dark:border-green-700"
                  : thisWrong ? "border-destructive/60 bg-destructive/8 text-destructive"
                  : dimmed ? "border-border bg-muted/20 text-muted-foreground opacity-40"
                  : "border-border bg-card hover:bg-accent/40 active:scale-[0.97]"
                }`}>
              {opt}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
        selected !== null
          ? isCorrect ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                      : "bg-destructive/8 text-destructive"
          : "invisible bg-muted"
      }`} style={{ minHeight: 44 }}>
        {selected !== null ? (isCorrect ? "Правильно!" : `Правильна відповідь: ${q.correct}`) : "‎"}
      </div>

      {/* Timer bar */}
      <div className="h-0.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary/60 rounded-full"
          style={{ width: `${barWidth}%`, transition: barWidth === 100 ? `width ${ADVANCE_MS}ms linear` : "none" }} />
      </div>
    </div>
  );
}
