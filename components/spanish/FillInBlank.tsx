"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Word } from "@/lib/db";

type WordWithStatus = Word & { status?: string };
type Props = { words: WordWithStatus[] };

const ALL_PRONOUNS = ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos/ellas"] as const;
type Pronoun = typeof ALL_PRONOUNS[number];
const DEFAULT_PRONOUNS: Pronoun[] = ["yo", "tú", "él/ella"];
const ADVANCE_MS = 2000;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function conjugate(infinitive: string, pronoun: Pronoun): string {
  const ar: Record<Pronoun, string> = {
    yo: "o", tú: "as", "él/ella": "a", nosotros: "amos", vosotros: "áis", "ellos/ellas": "an",
  };
  const er: Record<Pronoun, string> = {
    yo: "o", tú: "es", "él/ella": "e", nosotros: "emos", vosotros: "éis", "ellos/ellas": "en",
  };
  const ir: Record<Pronoun, string> = {
    yo: "o", tú: "es", "él/ella": "e", nosotros: "imos", vosotros: "ís", "ellos/ellas": "en",
  };
  const stem = infinitive.slice(0, -2);
  if (infinitive.endsWith("ar")) return stem + ar[pronoun];
  if (infinitive.endsWith("er")) return stem + er[pronoun];
  if (infinitive.endsWith("ir")) return stem + ir[pronoun];
  return infinitive;
}

// Strip diacritics for EN-keyboard comparison
function normalize(s: string) {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Display label for pronoun (show both forms for él/ella and ellos/ellas)
const PRONOUN_LABELS: Record<Pronoun, string> = {
  yo: "yo", tú: "tú", "él/ella": "él / ella",
  nosotros: "nosotros", vosotros: "vosotros", "ellos/ellas": "ellos / ellas",
};

type Question = {
  word: WordWithStatus;
  pronoun: Pronoun;
  correct: string;
  sentence: string;
  infinitiveHint: string;
};

function buildQuestion(word: WordWithStatus, pronoun: Pronoun): Question {
  const correct = conjugate(word.spanish, pronoun);
  const displayPronoun = PRONOUN_LABELS[pronoun];

  // Try to extract sentence context from example_es
  let sentence = `${displayPronoun} ___.`;
  if (word.example_es) {
    const withoutPronoun = word.example_es
      .replace(/^(Yo|Tú|Él|Ella|Nosotros|Nosotras|Vosotros|Vosotras|Ellos|Ellas|Ustedes)\s+/i, "")
      .trim();
    const parts = withoutPronoun.split(/\s+/);
    if (parts.length > 1) {
      sentence = `${displayPronoun} ___ ${parts.slice(1).join(" ")}`;
    }
  }

  return { word, pronoun, correct, sentence, infinitiveHint: `(${word.spanish})` };
}

export function FillInBlank({ words }: Props) {
  const [activePronouns, setActivePronouns] = useState<Pronoun[]>([...DEFAULT_PRONOUNS]);
  const knownCount = words.filter(w => w.status === "known").length;

  const makeDeck = useCallback(() =>
    shuffle(words.filter(w => w.status !== "known")), [words]
  );

  const [deck, setDeck] = useState(() => shuffle(words.filter(w => w.status !== "known")));
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
    if (!word || activePronouns.length === 0) return null;
    const pronoun = activePronouns[deckIdx % activePronouns.length];
    return buildQuestion(word, pronoun);
  }, [word, deckIdx, activePronouns]);

  useEffect(() => {
    if (!submitted && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [deckIdx, submitted]);

  useEffect(() => {
    if (!submitted) { setBarWidth(0); return; }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setBarWidth(100)));
    const timer = setTimeout(() => {
      setBarWidth(0);
      const next = deckIdxRef.current + 1;
      if (next >= deckLenRef.current) setDone(true);
      else { setDeckIdx(next); setInput(""); setSubmitted(false); }
    }, ADVANCE_MS);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [submitted]);

  const resetSession = useCallback(() => {
    setDeck(makeDeck()); setDeckIdx(0); setInput("");
    setSubmitted(false); setScore(0); setDone(false); setWrongWords([]);
  }, [makeDeck]);

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

  const togglePronoun = (p: Pronoun) => {
    setActivePronouns(prev => {
      if (prev.includes(p) && prev.length === 1) return prev;
      const next = prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p];
      resetSession();
      return next;
    });
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
          <button onClick={resetSession}
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

      {/* Pronoun settings */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Особи:</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_PRONOUNS.map(p => (
            <button key={p} onClick={() => togglePronoun(p)}
              className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-all ${
                activePronouns.includes(p)
                  ? "bg-primary/10 border-primary/50 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}>
              {p}
            </button>
          ))}
          <button onClick={resetSession} title="Перемішати"
            className="text-base text-muted-foreground hover:text-foreground transition-colors ml-auto leading-none">
            🔀
          </button>
        </div>
      </div>

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
          <span className="font-mono">{q.infinitiveHint}</span>{" — "}{q.word.ukrainian}
        </p>
      </div>

      {/* Input — fixed height */}
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

      {/* Feedback */}
      <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
        submitted
          ? isCorrect
            ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
            : "bg-destructive/8 text-destructive"
          : "invisible bg-muted"
      }`} style={{ minHeight: 44 }}>
        {submitted
          ? isCorrect
            ? `Правильно! ${PRONOUN_LABELS[q.pronoun]} ${q.correct}`
            : `Правильно: ${PRONOUN_LABELS[q.pronoun]} ${q.correct}`
          : "‎"}
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={submitted || !input.trim()}
        className={`w-full min-h-[52px] rounded-2xl font-medium text-sm transition-all ${
          !submitted && input.trim()
            ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}>
        Перевірити
      </button>

      {/* Timer bar */}
      <div className="h-0.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary/60 rounded-full"
          style={{ width: `${barWidth}%`, transition: barWidth === 100 ? `width ${ADVANCE_MS}ms linear` : "none" }} />
      </div>

      <button onClick={handleReset}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors py-1 text-right self-end">
        Скинути прогрес
      </button>
    </div>
  );
}
