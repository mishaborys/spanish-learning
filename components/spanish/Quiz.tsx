"use client";

import { useState, useMemo } from "react";
import { Word } from "@/lib/db";

type Props = { words: Word[] };

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildQuestion(target: Word, allWords: Word[]) {
  const distractors = shuffle(allWords.filter((w) => w.id !== target.id))
    .slice(0, 3)
    .map((w) => w.ukrainian);
  return {
    question: target.spanish,
    correct: target.ukrainian,
    options: shuffle([target.ukrainian, ...distractors]),
  };
}

export function Quiz({ words }: Props) {
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [wrongWords, setWrongWords] = useState<Word[]>([]);

  const questions = useMemo(() => shuffle(words).slice(0, Math.min(10, words.length)), [words]);
  const current = questions[qIndex];
  const q = useMemo(() => (current ? buildQuestion(current, words) : null), [current, words]);

  if (words.length < 4) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">Потрібно мінімум 4 слова для тесту.</p>
      </div>
    );
  }

  if (finished) {
    const percent = Math.round((score / questions.length) * 100);
    return (
      <div className="space-y-6 py-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-20 h-20 rounded-full border-4 border-primary flex items-center justify-center">
            <span className="text-xl font-bold">{percent}%</span>
          </div>
          <p className="font-semibold text-lg">{percent === 100 ? "Ідеально!" : percent >= 70 ? "Добре!" : "Продовжуй вчити!"}</p>
          <p className="text-sm text-muted-foreground">{score} з {questions.length} правильних</p>
        </div>

        {wrongWords.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Повтори ці слова:</p>
            <div className="space-y-1.5">
              {wrongWords.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                  <span className="font-medium text-sm">{w.spanish}</span>
                  <span className="text-sm text-muted-foreground">{w.ukrainian}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => { setQIndex(0); setSelected(null); setScore(0); setFinished(false); setWrongWords([]); }}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Ще раз
        </button>
      </div>
    );
  }

  if (!q) return null;

  const isCorrect = selected === q.correct;

  const handleSelect = async (option: string) => {
    if (selected !== null) return;
    setSelected(option);
    const correct = option === q.correct;
    if (correct) setScore((s) => s + 1);
    else setWrongWords((prev) => [...prev, current]);
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: current.id, correct }),
    });
  };

  const handleNext = () => {
    if (selected === null) return;
    if (qIndex + 1 >= questions.length) setFinished(true);
    else { setQIndex((i) => i + 1); setSelected(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(qIndex / questions.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{qIndex + 1} / {questions.length}</span>
      </div>

      {/* Question */}
      <div className="rounded-3xl border bg-card flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 120 }}>
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Як перекласти?</p>
        <p className="text-4xl font-bold tracking-tight">{q.question}</p>
        {current.pronunciation && (
          <p className="text-sm text-muted-foreground font-mono mt-2">{current.pronunciation}</p>
        )}
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        {q.options.map((opt) => {
          const isThisCorrect = selected !== null && opt === q.correct;
          const isThisWrong = selected === opt && opt !== q.correct;
          const isDisabled = selected !== null && !isThisCorrect && opt !== selected;

          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              disabled={isDisabled}
              className={`
                min-h-[64px] rounded-2xl border-2 px-3 py-3 text-sm font-medium
                text-center leading-snug transition-all
                ${isThisCorrect
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 dark:border-green-700"
                  : isThisWrong
                  ? "border-destructive/60 bg-destructive/8 text-destructive"
                  : isDisabled
                  ? "border-border bg-muted/30 text-muted-foreground opacity-40"
                  : "border-border bg-card hover:bg-accent/40 hover:border-primary/30 active:scale-[0.97]"
                }
              `}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Feedback — always takes up space to prevent layout shift */}
      <div className={`rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
        selected !== null
          ? isCorrect
            ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
            : "bg-destructive/8 text-destructive"
          : "opacity-0 pointer-events-none bg-muted"
      }`}>
        {selected !== null
          ? isCorrect ? "Правильно!" : `Правильна відповідь: ${q.correct}`
          : "‎" /* invisible placeholder to reserve height */
        }
      </div>

      {/* Next button — always visible, disabled until answer selected */}
      <button
        onClick={handleNext}
        disabled={selected === null}
        className={`w-full min-h-[52px] rounded-2xl font-medium text-sm transition-all ${
          selected !== null
            ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        {qIndex + 1 >= questions.length ? "Результат" : "Далі →"}
      </button>
    </div>
  );
}
