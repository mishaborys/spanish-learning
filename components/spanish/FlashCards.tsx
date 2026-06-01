"use client";

import { useState, useCallback, useRef } from "react";
import { Word } from "@/lib/db";

type Props = { words: Word[] };

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

export function FlashCards({ words }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [speaking, setSpeaking] = useState(false);
  const [swipeHint, setSwipeHint] = useState<"left" | "right" | null>(null);
  const [showList, setShowList] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

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
    setSwipeHint(null);
    setTimeout(() => setIndex((i) => i + 1), 50);
  };

  const handleCardClick = () => {
    if (!flipped) setFlipped(true);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!flipped || touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - (touchStartY.current ?? 0));
    if (Math.abs(dx) > 20 && Math.abs(dx) > dy) {
      setSwipeHint(dx > 0 ? "right" : "left");
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!flipped || touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0));
    if (Math.abs(dx) > 60 && Math.abs(dx) > dy) {
      handleAnswer(dx > 0);
    } else {
      setSwipeHint(null);
    }
    touchStartX.current = null;
  };

  const reset = () => { setIndex(0); setFlipped(false); setResults({}); setSwipeHint(null); };

  if (words.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Слів у темі ще немає.</p>;
  }

  if (isDone) {
    const percent = Math.round((knownCount / words.length) * 100);
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center py-8 space-y-4">
          <div className="w-20 h-20 rounded-full border-4 border-primary flex items-center justify-center">
            <span className="text-xl font-bold">{percent}%</span>
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-lg">{percent === 100 ? "Ідеально!" : percent >= 70 ? "Добре!" : "Продовжуй!"}</p>
            <p className="text-sm text-muted-foreground">Знаєш {knownCount} із {words.length} слів</p>
          </div>
          <button onClick={reset} className="min-h-[48px] px-8 rounded-2xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all">
            Ще раз
          </button>
        </div>
        <WordList words={words} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(index / words.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{index + 1} / {words.length}</span>
      </div>

      {/* Card */}
      <div
        className="card-flip-container select-none"
        style={{ minHeight: 280 }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleCardClick}
      >
        <div
          className={`card-flip-inner cursor-pointer ${flipped ? "is-flipped" : ""}`}
          style={{
            minHeight: 280,
            transform: swipeHint === "right" ? "rotate(2deg)" : swipeHint === "left" ? "rotate(-2deg)" : undefined,
            transition: swipeHint ? "transform 0.1s" : undefined,
          }}
        >
          {/* Front */}
          <div className="card-flip-face rounded-3xl border bg-card flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 280 }}>
            {word.part_of_speech && (
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full mb-4">{word.part_of_speech}</span>
            )}
            <span className="text-4xl font-bold tracking-tight leading-tight">{word.spanish}</span>
            {word.pronunciation && (
              <span className="text-base text-muted-foreground mt-2 font-mono tracking-wide">{word.pronunciation}</span>
            )}
            <span className="text-xs text-muted-foreground mt-6 opacity-50">Натисни щоб відкрити</span>
          </div>

          {/* Back */}
          <div className="card-flip-back card-flip-face rounded-3xl border bg-card flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 280 }}>
            <span className="text-xl font-semibold text-muted-foreground">{word.spanish}</span>
            {word.pronunciation && (
              <span className="text-sm text-muted-foreground/60 font-mono mt-0.5">{word.pronunciation}</span>
            )}
            <span className="text-3xl font-bold mt-3">{word.ukrainian}</span>
            {word.example_es && (
              <div className="mt-4 pt-4 border-t w-full space-y-1">
                <p className="text-sm italic text-muted-foreground">{word.example_es}</p>
                {word.example_uk && <p className="text-xs text-muted-foreground/60">{word.example_uk}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Swipe hint + actions */}
      {flipped && (
        <div className="space-y-3">
          <p className="text-center text-xs text-muted-foreground">
            <span className={swipeHint === "left" ? "font-bold text-destructive" : ""}>← Не знаю</span>
            <span className="mx-4 opacity-30">|</span>
            <span className={swipeHint === "right" ? "font-bold text-primary" : ""}>Знаю →</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleAnswer(false)} className="min-h-[52px] rounded-2xl border-2 border-destructive/40 bg-destructive/5 text-destructive font-medium text-sm hover:bg-destructive/10 active:scale-[0.98] transition-all">
              Не знаю
            </button>
            <button onClick={() => handleAnswer(true)} className="min-h-[52px] rounded-2xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all">
              Знаю
            </button>
          </div>
        </div>
      )}

      {!flipped && (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); speak(); }}
            className="min-h-[44px] px-4 flex items-center gap-2 rounded-2xl border bg-muted/50 text-sm text-muted-foreground hover:bg-muted active:scale-[0.98] transition-all"
            style={{ opacity: speaking ? 0.6 : 1 }}
          >
            <SpeakerIcon />
          </button>
          <button onClick={handleCardClick} className="flex-1 min-h-[44px] rounded-2xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all">
            Показати переклад
          </button>
        </div>
      )}

      {/* Word list toggle */}
      <button
        onClick={() => setShowList((v) => !v)}
        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2 flex items-center justify-center gap-1"
      >
        {showList ? "Сховати список" : "Показати всі слова"}
        <span className="text-[10px]">{showList ? "▲" : "▼"}</span>
      </button>
      {showList && <WordList words={words} />}
    </div>
  );
}

function WordList({ words }: { words: Word[] }) {
  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/40">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Всі слова</p>
      </div>
      <div className="divide-y">
        {words.map((w) => (
          <div key={w.id} className="px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{w.spanish}</p>
              {w.pronunciation && <p className="text-xs font-mono text-muted-foreground mt-0.5">{w.pronunciation}</p>}
            </div>
            <p className="text-sm text-muted-foreground text-right shrink-0 max-w-[45%]">{w.ukrainian}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
