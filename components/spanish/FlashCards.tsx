"use client";

import { useState, useCallback, useRef } from "react";
import { Word } from "@/lib/db";
import { SwipeCounters, SwipeFlipCard, type SwipeDir, type SwipeFlipCardHandle } from "./SwipeFlipCard";

type WordWithStatus = Word & { status?: string };
type Props = { words: WordWithStatus[] };
type Mode = "es-ua" | "ua-es";

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

export function FlashCards({ words }: Props) {
  const [mode, setMode] = useState<Mode>("es-ua");
  const [showList, setShowList] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Deck = only words not yet known, shuffled
  const freshDeck = useCallback(() =>
    shuffle(words.filter(w => w.status !== "known")),
    [words]
  );

  const [deck, setDeck] = useState<WordWithStatus[]>(() =>
    shuffle(words.filter(w => w.status !== "known"))
  );
  const [deckIndex, setDeckIndex] = useState(0);

  const cardRef = useRef<SwipeFlipCardHandle>(null);
  const [busy, setBusy] = useState(false);
  const [swipe, setSwipe] = useState<{ dir: SwipeDir | null; level: number }>({ dir: null, level: 0 });
  const [tally, setTally] = useState({ known: 0, learning: 0 });

  const word = deck[deckIndex];
  const isDone = deckIndex >= deck.length;
  const knownCount = words.filter(w => w.status === "known").length;
  const totalWords = words.length;

  const speak = useCallback(() => {
    if (!word || speaking) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word.spanish);
    u.lang = "es-ES"; u.rate = 0.8;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [word, speaking]);

  const [flipped, setFlipped] = useState(false);

  /** Картка відлітає (праворуч — знаю, ліворуч — ні), паралельно зберігаємо прогрес. */
  const handleAnswer = async (known: boolean) => {
    if (!word || busy) return;
    setBusy(true);
    const fly = cardRef.current?.flyOut(known ? "right" : "left") ?? Promise.resolve();
    // force_known: true means flashcard "Знаю" → immediately sets status="known" in DB
    // Зберігаємо у фоні — наступна картка з'являється одразу після відльоту, як у Quizlet
    void fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: word.id, correct: known, force_known: known }),
    }).catch(() => {});
    await fly;
    setTally(t => known ? { ...t, known: t.known + 1 } : { ...t, learning: t.learning + 1 });
    setFlipped(false);
    setDeckIndex(i => i + 1);
    setBusy(false);
  };

  const handleShuffle = () => {
    setDeck(freshDeck());
    setDeckIndex(0);
    setTally({ known: 0, learning: 0 });
    setFlipped(false);
  };

  const handleReset = async () => {
    if (!confirm("Скинути весь прогрес по цій темі? Всі слова стануть новими.")) return;
    await fetch("/api/progress/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_ids: words.map(w => w.id) }),
    });
    window.location.reload();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setDeck(freshDeck());
    setDeckIndex(0);
    setTally({ known: 0, learning: 0 });
    setFlipped(false);
  };

  if (words.length === 0) return <p className="text-muted-foreground text-sm py-8 text-center">Слів немає.</p>;

  // Completed this deck
  if (isDone) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center py-8 space-y-4">
          <div className="text-5xl">🎉</div>
          <p className="font-semibold text-lg text-center">
            {deck.length === 0 ? "Всі слова вивчено!" : "Раунд завершено!"}
          </p>
          <p className="text-sm text-muted-foreground">
            Знаєш {knownCount} із {totalWords} слів
          </p>
          <div className="flex gap-3">
            <button onClick={handleShuffle} className="min-h-[44px] px-6 rounded-2xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all">
              Ще раз
            </button>
            <button onClick={handleReset} className="min-h-[44px] px-4 rounded-2xl border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
              Скинути прогрес
            </button>
          </div>
        </div>
        <WordList words={words} />
      </div>
    );
  }

  const frontText = mode === "es-ua" ? word.spanish : word.ukrainian;
  const backPrimary = mode === "es-ua" ? word.ukrainian : word.spanish;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex rounded-2xl bg-muted p-1 gap-1">
        {([["es-ua", "🇪🇸 → 🇺🇦"], ["ua-es", "🇺🇦 → 🇪🇸"]] as [Mode, string][]).map(([m, label]) => (
          <button key={m} onClick={() => switchMode(m)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(deckIndex / Math.max(deck.length, 1)) * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {deckIndex + 1} / {deck.length}
            {knownCount > 0 && <span className="text-primary"> · {knownCount} знаю</span>}
          </span>
        </div>
        {/* Shuffle button */}
        <button onClick={handleShuffle} title="Перемішати" className="ml-3 shrink-0 min-h-[32px] px-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors text-base">
          🔀
        </button>
      </div>

      <SwipeCounters
        left={{ count: tally.learning, label: "Ще вчу" }}
        right={{ count: tally.known, label: "Знаю" }}
        progress={swipe}
      />

      {/* Card: тап — перевернути, свайп праворуч — «Знаю», ліворуч — «Не знаю» */}
      <SwipeFlipCard
        key={`${mode}-${deckIndex}-${word.id}`}
        ref={cardRef}
        flipped={flipped}
        onFlip={() => setFlipped(f => !f)}
        canFlip={!busy}
        canSwipe={!busy}
        onSwipe={dir => handleAnswer(dir === "right")}
        onProgress={(dir, level) => setSwipe({ dir, level })}
        front={
          <>
            {word.part_of_speech && mode === "es-ua" && (
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full mb-3">{word.part_of_speech}</span>
            )}
            <span className="text-4xl font-bold tracking-tight leading-tight">{frontText}</span>
            {mode === "es-ua" && word.pronunciation && (
              <span className="text-base text-muted-foreground mt-2 font-mono tracking-wide">{word.pronunciation}</span>
            )}
            <span className="text-xs text-muted-foreground mt-6 opacity-40">натисни щоб відкрити</span>
          </>
        }
        back={
          <>
            <span className="text-xl font-semibold text-muted-foreground">{frontText}</span>
            {mode === "es-ua" && word.pronunciation && (
              <span className="text-sm text-muted-foreground/60 font-mono mt-0.5">{word.pronunciation}</span>
            )}
            <span className="text-3xl font-bold mt-3">{backPrimary}</span>
            {mode === "ua-es" && word.pronunciation && (
              <span className="text-base text-muted-foreground font-mono mt-1.5">{word.pronunciation}</span>
            )}
            {word.example_es && (
              <div className="mt-4 pt-4 border-t w-full space-y-1">
                <p className="text-sm italic text-muted-foreground">{word.example_es}</p>
                {word.example_uk && <p className="text-xs text-muted-foreground/60">{word.example_uk}</p>}
              </div>
            )}
          </>
        }
      />

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button onClick={() => handleAnswer(false)} disabled={busy}
          className="flex-1 min-h-[52px] rounded-2xl border-2 border-destructive/40 bg-destructive/5 text-destructive font-medium text-sm hover:bg-destructive/10 active:scale-[0.98] transition-all">
          Не знаю
        </button>
        {mode === "es-ua" && (
          <button onClick={speak}
            className="min-h-[52px] px-4 rounded-2xl border bg-muted/50 text-muted-foreground hover:bg-muted active:scale-[0.98] transition-all"
            style={{ opacity: speaking ? 0.6 : 1 }}>
            <SpeakerIcon />
          </button>
        )}
        <button onClick={() => handleAnswer(true)} disabled={busy}
          className="flex-1 min-h-[52px] rounded-2xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all">
          Знаю
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground opacity-40">← свайп / →</p>

      {/* Word list + reset */}
      <div className="flex items-center justify-between">
        <button onClick={() => setShowList(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors py-2 flex items-center gap-1">
          {showList ? "Сховати список ▲" : "Показати всі слова ▼"}
        </button>
        <button onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors py-2">
          Скинути прогрес
        </button>
      </div>
      {showList && <WordList words={words} />}
    </div>
  );
}

function WordList({ words }: { words: WordWithStatus[] }) {
  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/40">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Всі слова</p>
      </div>
      <div className="divide-y">
        {words.map((w) => (
          <div key={w.id} className={`px-4 py-3 flex items-start gap-3 ${w.status === "known" ? "opacity-40" : ""}`}>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{w.spanish}</p>
              {w.pronunciation && <p className="text-xs font-mono text-muted-foreground mt-0.5">{w.pronunciation}</p>}
            </div>
            <div className="text-right shrink-0 max-w-[45%]">
              <p className="text-sm text-muted-foreground">{w.ukrainian}</p>
              {w.status === "known" && <p className="text-xs text-primary mt-0.5">знаю ✓</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
