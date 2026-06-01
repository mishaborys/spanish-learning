"use client";

import { useState, useCallback } from "react";
import { Word } from "@/lib/db";

type Props = { words: Word[] };

function SpeakerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export function FlashCards({ words }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [speaking, setSpeaking] = useState(false);

  const word = words[index];
  const knownCount = Object.values(results).filter(Boolean).length;
  const isDone = index >= words.length;

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

  const handleAnswer = async (known: boolean) => {
    setResults((prev) => ({ ...prev, [word.id]: known }));
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: word.id, correct: known }),
    });
    setFlipped(false);
    setTimeout(() => setIndex((i) => i + 1), 50);
  };

  const reset = () => {
    setIndex(0);
    setFlipped(false);
    setResults({});
  };

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">Слів у темі ще немає.</p>
      </div>
    );
  }

  if (isDone) {
    const total = words.length;
    const percent = Math.round((knownCount / total) * 100);
    return (
      <div className="flex flex-col items-center py-10 space-y-6">
        <div className="w-24 h-24 rounded-full border-4 border-primary flex items-center justify-center">
          <span className="text-2xl font-bold">{percent}%</span>
        </div>
        <div className="text-center space-y-1">
          <p className="font-semibold text-lg">
            {percent === 100 ? "Ідеально!" : percent >= 70 ? "Добре!" : "Продовжуй!"}
          </p>
          <p className="text-sm text-muted-foreground">
            Знаєш {knownCount} із {total} слів
          </p>
        </div>
        <button
          onClick={reset}
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
            style={{ width: `${((index) / words.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {index + 1} / {words.length}
        </span>
      </div>

      {/* Flip card */}
      <div className="card-flip-container" style={{ minHeight: 260 }}>
        <div
          className={`card-flip-inner cursor-pointer`}
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
            <span className="text-4xl font-bold tracking-tight leading-tight">
              {word.spanish}
            </span>
            {word.gender && (
              <span className="text-sm text-muted-foreground mt-2">{word.gender}</span>
            )}
            <span className="text-xs text-muted-foreground mt-6 opacity-60">
              Натисни щоб відкрити
            </span>
          </div>

          {/* Back */}
          <div className="card-flip-back card-flip-face rounded-3xl border bg-card flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 260 }}>
            <span className="text-2xl font-bold text-muted-foreground">{word.spanish}</span>
            <span className="text-3xl font-bold mt-2">{word.ukrainian}</span>
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
