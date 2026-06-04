"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Word } from "@/lib/db";

type WordWithStatus = Word & { status?: string };
type Props = { words: WordWithStatus[] };

const PRONOUNS = ["yo", "tú", "él", "ella"];
const ADVANCE_MS = 2000;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function conjugate(infinitive: string, pronoun: string): string {
  const arEnd: Record<string, string> = { yo: "o", tú: "as", él: "a", ella: "a" };
  const erirEnd: Record<string, string> = { yo: "o", tú: "es", él: "e", ella: "e" };
  if (infinitive.endsWith("ar")) return infinitive.slice(0, -2) + (arEnd[pronoun] ?? "");
  if (infinitive.endsWith("er") || infinitive.endsWith("ir"))
    return infinitive.slice(0, -2) + (erirEnd[pronoun] ?? "");
  return infinitive;
}

// Strip diacritics for loose comparison (user types on EN keyboard)
function normalize(s: string) {
  return s.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

type Question = {
  word: WordWithStatus;
  pronoun: string;
  correct: string;         // e.g. "hablas"
  sentence: string;        // e.g. "tú ___ español."
  infinitiveHint: string;  // e.g. "(hablar)"
};

function buildQuestion(word: WordWithStatus, pronoun: string): Question {
  const correct = conjugate(word.spanish, pronoun);
  const hint = `(${word.spanish})`;

  let sentence = `${pronoun} ___.`;

  if (word.example_es) {
    // Strip leading pronoun from example
    const withoutPronoun = word.example_es.replace(/^(Yo|Tú|Él|Ella)\s+/i, "").trim();
    // Remove first word (conjugated form) and keep the rest
    const parts = withoutPronoun.split(/\s+/);
    if (parts.length > 1) {
      const context = parts.slice(1).join(" ");
      sentence = `${pronoun} ___ ${context}`;
    } else {
      sentence = `${pronoun} ___.`;
    }
  }

  return { word, pronoun, correct, sentence, infinitiveHint: hint };
}

export function FillInBlank({ words }: Props) {
  const knownCount = words.filter(w => w.status === "known").length;

  const makeDeck = useCallback(() =>
    shuffle(words.filter(w => w.status !== "known")),
    [words]
  );

  const [deck, setDeck] = useState<WordWithStatus[]>(() =>
    shuffle(words.filter(w => w.status !== "known"))
  );
  const [deckIdx, setDeckIdx] = useState(0);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [wrongWords, setWrongWords] = useState<WordWithStatus[]>([]);
  const [barWidth, setBarWidth] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const deckIdxRef = useRef(deckIdx);
  const deckLenRef = useRef(deck.length);
  deckIdxRef.current = deckIdx;
  deckLenRef.current = deck.length;

  const word = deck[deckIdx];
  const q = useMemo((): Question | null => {
    if (!word) return null;
    const pronoun = PRONOUNS[deckIdx % PRONOUNS.length];
    return buildQuestion(word, pronoun);
  }, [word, deckIdx]);

  // Auto-focus input on new question
  useEffect(() => {
    if (!submitted && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [deckIdx, submitted]);

  // Auto-advance after answer shown
  useEffect(() => {
    if (!submitted) { setBarWidth(0); return; }
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setBarWidth(100))
    );
    const timer = setTimeout(() => {
      setBarWidth(0);
      const next = deckIdxRef.current + 1;
      if (next >= deckLenRef.current) setDone(true);
      else { setDeckIdx(next); setInput(""); setSubmitted(false); }
    }, ADVANCE_MS);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [submitted]);

  const handleSubmit = async () => {
    if (submitted || !q || !input.trim()) return;
    const correct = normalize(input) === normalize(q.correct);
    setIsCorrect(correct);
    setSubmitted(true);
    if (correct) setScore(s => s + 1);
    else setWrongWords(prev => [...prev, q.word]);
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: q.word.id, correct, force_known: correct }),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  const handleShuffle = () => {
    setDeck(makeDeck()); setDeckIdx(0); setInput("");
    setSubmitted(false); setScore(0); setDone(false); setWrongWords([]);
  };

  const handleReset = async () => {
    if (!confirm("Скинути прогрес по цій темі?")) return;
    await fetch("/api/progress/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_ids: words.map(w => w.id) }),
    });
    window.location.reload();
  };

  if (words.length === 0)
    return <p className="text-muted-foreground text-sm py-8 text-center">Слів немає.</p>;

  if (done || deck.length === 0) {
    const total = Math.max(deck.length, 1);
    const pct = Math.round((score / total) * 100);
    return (
      <div className="space-y-6 py-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-20 h-20 rounded-full border-4 border-primary flex items-center justify-center">
            <span className="text-xl font-bold">{deck.length === 0 ? "✓" : `${pct}%`}</span>
          </div>
          <p className="font-semibold text-lg">
            {deck.length === 0 ? "Всі слова вже вивчені!" : pct === 100 ? "Ідеально!" : pct >= 70 ? "Добре!" : "Продовжуй!"}
          </p>
          {deck.length > 0 && <p className="text-sm text-muted-foreground">{score} з {total} правильних</p>}
        </div>
        {wrongWords.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Повтори ці форми:</p>
            <div className="space-y-1.5">
              {[...new Map(wrongWords.map(w => [w.id, w])).values()].map(w => (
                <div key={w.id} className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                  <span className="font-medium text-sm">{w.spanish}</span>
                  <span className="text-sm text-muted-foreground">{w.ukrainian}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={handleShuffle}
            className="flex-1 min-h-[48px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all">
            Ще раз
          </button>
          <button onClick={handleReset}
            className="min-h-[48px] px-4 rounded-2xl border text-sm text-muted-foreground hover:text-foreground transition-all">
            Скинути
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div className="flex flex-col gap-3">

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(deckIdx / deck.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {deckIdx + 1}/{deck.length}
          {knownCount > 0 && <span className="text-primary"> · {knownCount} знаю</span>}
        </span>
        <button onClick={handleShuffle} title="Перемішати"
          className="shrink-0 text-base text-muted-foreground hover:text-foreground transition-colors leading-none">
          🔀
        </button>
      </div>

      {/* Question card — fixed height */}
      <div className="rounded-3xl border bg-card flex flex-col items-center justify-center p-6 text-center"
        style={{ height: 148 }}>
        <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Вставте правильну форму</p>
        <p className="text-xl font-semibold leading-snug">
          {q.sentence.split("___").map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && (
                <span className={`inline-block px-2 mx-0.5 rounded border-b-2 min-w-[3rem] font-bold ${
                  submitted
                    ? isCorrect
                      ? "border-green-500 text-green-600 dark:text-green-400"
                      : "border-destructive text-destructive"
                    : "border-foreground/40 text-transparent bg-muted/30"
                }`}>
                  {submitted ? q.correct : "___"}
                </span>
              )}
            </span>
          ))}
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          <span className="font-mono">{q.infinitiveHint}</span>
          {" — "}
          {q.word.ukrainian}
        </p>
      </div>

      {/* Input field — fixed height */}
      <div style={{ height: 56 }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitted}
          placeholder="Введіть форму дієслова..."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`w-full h-full rounded-2xl border-2 px-4 text-lg font-semibold text-center bg-background outline-none transition-colors duration-150 ${
            submitted
              ? isCorrect
                ? "border-green-500 text-green-700 dark:text-green-400"
                : "border-destructive text-destructive"
              : "border-border focus:border-primary"
          }`}
        />
      </div>

      {/* Feedback — reserved space */}
      <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
        submitted
          ? isCorrect
            ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
            : "bg-destructive/8 text-destructive"
          : "invisible bg-muted"
      }`} style={{ minHeight: 44 }}>
        {submitted
          ? isCorrect
            ? `Правильно! ${q.pronoun} ${q.correct}`
            : `Правильно: ${q.pronoun} ${q.correct}`
          : "‎"}
      </div>

      {/* Submit button — hidden after answer */}
      <button
        onClick={handleSubmit}
        disabled={submitted || !input.trim()}
        className={`w-full min-h-[52px] rounded-2xl font-medium text-sm transition-all ${
          !submitted && input.trim()
            ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        Перевірити
      </button>

      {/* Auto-advance bar */}
      <div className="h-0.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary/60 rounded-full"
          style={{
            width: `${barWidth}%`,
            transition: barWidth === 100 ? `width ${ADVANCE_MS}ms linear` : "none",
          }} />
      </div>

      <button onClick={handleReset}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors py-1 text-right self-end">
        Скинути прогрес
      </button>
    </div>
  );
}
