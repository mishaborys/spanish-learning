"use client";

import { useState, useCallback } from "react";
import { WordWithProgress } from "@/lib/db";

type Props = { words: WordWithProgress[] };

function SpeakerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: "Нове",
  learning: "Вивчаю",
  known: "Знаю",
};

export function ReviewSession({ words: initialWords }: Props) {
  const [words] = useState(initialWords);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [speaking, setSpeaking] = useState(false);

  const word = words[index];

  const speak = useCallback(() => {
    if (!word || speaking) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word.spanish);
    u.lang = "es-ES";
    u.rate = 0.8;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [word, speaking]);

  const handleAnswer = async (correct: boolean) => {
    setDone((prev) => ({ ...prev, [word.id]: correct }));
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: word.id, correct }),
    });
    setFlipped(false);
    setTimeout(() => setIndex((i) => i + 1), 50);
  };

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <div className="text-5xl">🎉</div>
        <p className="font-semibold text-lg">Все повторено!</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Нових слів на сьогодні немає. Повернись завтра.
        </p>
      </div>
    );
  }

  if (index >= words.length) {
    const correct = Object.values(done).filter(Boolean).length;
    const percent = Math.round((correct / words.length) * 100);
    return (
      <div className="flex flex-col items-center py-10 space-y-6">
        <div className="w-24 h-24 rounded-full border-4 border-primary flex items-center justify-center">
          <span className="text-2xl font-bold">{percent}%</span>
        </div>
        <div className="text-center space-y-1">
          <p className="font-semibold text-lg">Сесія завершена!</p>
          <p className="text-sm text-muted-foreground">
            {correct} з {words.length} правильних
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[48px] px-8 rounded-2xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Ще раз
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(index / words.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {index + 1} / {words.length}
        </span>
      </div>

      {/* Status badge */}
      <div className="flex justify-end">
        <span className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-1">
          {STATUS_LABEL[word.status] ?? word.status}
        </span>
      </div>

      {/* Flip card */}
      <div className="card-flip-container" style={{ minHeight: 260 }}>
        <div
          className={`card-flip-inner cursor-pointer ${flipped ? "is-flipped" : ""}`}
          style={{ minHeight: 260 }}
          onClick={() => !flipped && setFlipped(true)}
        >
          {/* Front */}
          <div className="card-flip-face rounded-3xl border bg-card flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 260 }}>
            {word.part_of_speech && (
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full mb-4">
                {word.part_of_speech}
              </span>
            )}
            <span className="text-4xl font-bold tracking-tight">{word.spanish}</span>
            {word.pronunciation && (
              <span className="text-base text-muted-foreground mt-2 font-mono tracking-wide">
                {word.pronunciation}
              </span>
            )}
            {word.gender && (
              <span className="text-sm text-muted-foreground mt-1">{word.gender}</span>
            )}
            <span className="text-xs text-muted-foreground mt-5 opacity-60">
              Натисни щоб відкрити
            </span>
          </div>

          {/* Back */}
          <div className="card-flip-back card-flip-face rounded-3xl border bg-card flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 260 }}>
            <span className="text-2xl font-bold text-muted-foreground">{word.spanish}</span>
            {word.pronunciation && (
              <span className="text-sm text-muted-foreground/70 font-mono mt-0.5">
                {word.pronunciation}
              </span>
            )}
            <span className="text-3xl font-bold mt-3">{word.ukrainian}</span>
            {word.example_es && (
              <div className="mt-5 pt-5 border-t w-full space-y-1">
                <p className="text-sm italic text-muted-foreground">{word.example_es}</p>
                {word.example_uk && (
                  <p className="text-xs text-muted-foreground/70">{word.example_uk}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={speak}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-2xl border bg-muted/50 text-sm text-muted-foreground hover:bg-muted active:scale-[0.98] transition-all"
          style={{ opacity: speaking ? 0.6 : 1 }}
        >
          <SpeakerIcon />
          Прослухати вимову
        </button>

        {flipped ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleAnswer(false)}
              className="min-h-[56px] rounded-2xl border-2 border-destructive/40 bg-destructive/5 text-destructive font-medium text-sm hover:bg-destructive/10 active:scale-[0.98] transition-all"
            >
              Не знаю
            </button>
            <button
              onClick={() => handleAnswer(true)}
              className="min-h-[56px] rounded-2xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Знаю
            </button>
          </div>
        ) : (
          <button
            onClick={() => setFlipped(true)}
            className="w-full min-h-[56px] rounded-2xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Показати переклад
          </button>
        )}
      </div>
    </div>
  );
}
