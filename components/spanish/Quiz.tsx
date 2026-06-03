"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Word } from "@/lib/db";

type WordWithStatus = Word & { status?: string };
type Props = { words: WordWithStatus[] };

const ARTICLE_RE = /^(el|la|los|las) (.+)$/;
const ALL_ARTICLES = ["el", "la", "los", "las"];
const ADVANCE_MS = 2000;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

type Question = {
  word: WordWithStatus;
  question: string;
  hint: string | null;
  correct: string;
  options: string[];
  isArticle: boolean;
};

function buildQuestion(word: WordWithStatus, allWords: WordWithStatus[], articleMode: boolean): Question {
  if (articleMode) {
    const match = word.spanish.match(ARTICLE_RE);
    if (match) {
      const [, correctArticle, noun] = match;
      const hint = word.pronunciation?.replace(/^(ель|ла|лос|лас) /i, "") ?? null;
      return { word, question: noun, hint, correct: correctArticle, options: shuffle(ALL_ARTICLES), isArticle: true };
    }
  }
  const pool = shuffle(allWords.filter(w => w.id !== word.id));
  const distractors = pool.slice(0, 3).map(w => w.ukrainian);
  const fallback = ["———", "– – –", "· · ·", "× × ×"];
  while (distractors.length < 3) distractors.push(fallback[distractors.length]);
  return {
    word,
    question: word.spanish,
    hint: word.pronunciation ?? null,
    correct: word.ukrainian,
    options: shuffle([word.ukrainian, ...distractors]),
    isArticle: false,
  };
}

export function Quiz({ words }: Props) {
  const articleMode = useMemo(() => {
    const n = words.filter(w => ARTICLE_RE.test(w.spanish)).length;
    return n > words.length * 0.5;
  }, [words]);

  const knownCount = words.filter(w => (w as WordWithStatus).status === "known").length;

  const makeDeck = useCallback(() =>
    shuffle(words.filter(w => (w as WordWithStatus).status !== "known")),
    [words]
  );

  const [deck, setDeck] = useState<WordWithStatus[]>(() =>
    shuffle(words.filter(w => (w as WordWithStatus).status !== "known"))
  );
  const [deckIdx, setDeckIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [wrongWords, setWrongWords] = useState<WordWithStatus[]>([]);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [barWidth, setBarWidth] = useState(0);

  const deckIdxRef = useRef(deckIdx);
  const deckLenRef = useRef(deck.length);
  deckIdxRef.current = deckIdx;
  deckLenRef.current = deck.length;

  const word = deck[deckIdx];
  const q = useMemo(() => word ? buildQuestion(word, words, articleMode) : null, [word, words, articleMode]);

  // Auto-advance after ADVANCE_MS when answer selected
  useEffect(() => {
    if (selected === null) { setBarWidth(0); return; }
    // Double rAF so browser paints width:0 before transition starts
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setBarWidth(100))
    );
    const timer = setTimeout(() => {
      const next = deckIdxRef.current + 1;
      setBarWidth(0);
      if (next >= deckLenRef.current) {
        setDone(true);
      } else {
        setDeckIdx(next);
        setSelected(null);
      }
    }, ADVANCE_MS);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [selected]);

  const handleSelect = async (option: string) => {
    if (selected !== null || !q) return;
    setSelected(option);
    const correct = option === q.correct;
    if (correct) setScore(s => s + 1);
    else setWrongWords(prev => [...prev, q.word]);
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: q.word.id, correct, force_known: correct }),
    });
  };

  const handleShuffle = () => {
    setDeck(makeDeck());
    setDeckIdx(0);
    setSelected(null);
    setBarWidth(0);
    setScore(0);
    setDone(false);
    setWrongWords([]);
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

  if (words.length < 2) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Потрібно мінімум 2 слова.</p>;
  }

  // All words already known or session done
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
            <p className="text-sm font-medium text-muted-foreground">Повтори:</p>
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
  const isCorrect = selected === q.correct;

  return (
    <div className="flex flex-col gap-3">

      {/* Header: progress bar + counter + shuffle */}
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
        style={{ height: 120 }}>
        <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">
          {q.isArticle ? "Який артикль?" : "Як перекласти?"}
        </p>
        <p className="text-4xl font-bold tracking-tight leading-none">{q.question}</p>
        {q.hint && <p className="text-sm text-muted-foreground font-mono mt-2 leading-none">{q.hint}</p>}
      </div>

      {/* Options — fixed 2×2 grid, each button fixed height */}
      <div className="grid grid-cols-2 gap-2.5">
        {q.options.map((opt) => {
          const thisCorrect = selected !== null && opt === q.correct;
          const thisWrong   = selected === opt && opt !== q.correct;
          const dimmed      = selected !== null && !thisCorrect && opt !== selected;

          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              disabled={selected !== null}
              style={{ height: 60 }}
              className={`
                rounded-2xl border-2 px-3 font-medium text-center leading-tight
                ${q.isArticle ? "text-2xl" : "text-sm"}
                transition-colors duration-150
                ${thisCorrect ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 dark:border-green-700"
                  : thisWrong  ? "border-destructive/60 bg-destructive/8 text-destructive"
                  : dimmed     ? "border-border bg-muted/20 text-muted-foreground opacity-40"
                  : "border-border bg-card hover:bg-accent/40 active:scale-[0.97]"
                }
              `}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Feedback — always takes space, visibility toggle only */}
      <div
        className={`rounded-2xl px-4 py-3 text-sm font-medium ${
          selected !== null
            ? isCorrect
              ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
              : "bg-destructive/8 text-destructive"
            : "invisible bg-muted"
        }`}
        style={{ minHeight: 44 }}
      >
        {selected !== null
          ? isCorrect ? "Правильно!" : `Правильна відповідь: ${q.correct}`
          : "‎"
        }
      </div>

      {/* Auto-advance timer bar — always present */}
      <div className="h-0.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/60 rounded-full"
          style={{
            width: `${barWidth}%`,
            transition: barWidth === 100 ? `width ${ADVANCE_MS}ms linear` : "none",
          }}
        />
      </div>

      {/* Reset */}
      <button onClick={handleReset}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors py-1 text-right self-end">
        Скинути прогрес
      </button>
    </div>
  );
}
