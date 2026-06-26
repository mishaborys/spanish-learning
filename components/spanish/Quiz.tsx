"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Word } from "@/lib/db";

type WordWithStatus = Word & { status?: string };
type Props = { words: WordWithStatus[] };
type QuizMode = "translation" | "conjugation";
type Direction = "es-ua" | "ua-es";

const ARTICLE_RE = /^(el|la|los|las) (.+)$/;
const ALL_ARTICLES = ["el", "la", "los", "las"];
const SINGULAR_ARTICLES = ["el", "la"];
const VERB_RE = /^.+(ar|er|ir)$/i;
const ADVANCE_MS = 2000;

const ALL_PRONOUNS = [
  "yo", "tú", "él/ella", "nosotros", "vosotros", "ellos/ellas",
] as const;
type Pronoun = typeof ALL_PRONOUNS[number];
const DEFAULT_PRONOUNS: Pronoun[] = ["yo", "tú", "él/ella"];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Full present-tense conjugation for regular verbs
function conjugate(infinitive: string, pronoun: Pronoun | string): string {
  const ar: Record<string, string> = {
    yo: "o", tú: "as", "él/ella": "a",
    nosotros: "amos", vosotros: "áis", "ellos/ellas": "an",
  };
  const er: Record<string, string> = {
    yo: "o", tú: "es", "él/ella": "e",
    nosotros: "emos", vosotros: "éis", "ellos/ellas": "en",
  };
  const ir: Record<string, string> = {
    yo: "o", tú: "es", "él/ella": "e",
    nosotros: "imos", vosotros: "ís", "ellos/ellas": "en",
  };
  const stem = infinitive.slice(0, -2);
  if (infinitive.endsWith("ar")) return stem + (ar[pronoun] ?? "");
  if (infinitive.endsWith("er")) return stem + (er[pronoun] ?? "");
  if (infinitive.endsWith("ir")) return stem + (ir[pronoun] ?? "");
  return infinitive;
}

type Question = {
  word: WordWithStatus;
  question: string;
  hint: string | null;
  correct: string;
  options: string[];
  type: "translate" | "article" | "conjugate";
  pronoun?: string;
};

function buildTranslateQ(word: WordWithStatus, allWords: WordWithStatus[], dir: Direction): Question {
  const fallback = ["———", "– – –", "· · ·", "× × ×"];
  if (dir === "ua-es") {
    const pool = shuffle(allWords.filter(w => w.id !== word.id)).slice(0, 3).map(w => w.spanish);
    while (pool.length < 3) pool.push(fallback[pool.length]);
    return { word, question: word.ukrainian, hint: null, correct: word.spanish, options: shuffle([word.spanish, ...pool]), type: "translate" };
  }
  const pool = shuffle(allWords.filter(w => w.id !== word.id)).slice(0, 3).map(w => w.ukrainian);
  while (pool.length < 3) pool.push(fallback[pool.length]);
  return { word, question: word.spanish, hint: word.pronunciation ?? null, correct: word.ukrainian, options: shuffle([word.ukrainian, ...pool]), type: "translate" };
}

function buildArticleQ(word: WordWithStatus, articleOptions: string[]): Question {
  const m = word.spanish.match(ARTICLE_RE)!;
  return {
    word, question: m[2], hint: word.pronunciation?.replace(/^(ель|ла|лос|лас) /i, "") ?? null,
    correct: m[1], options: shuffle([...articleOptions]), type: "article",
  };
}

function buildConjugateQ(word: WordWithStatus, pronoun: Pronoun): Question {
  const correct = conjugate(word.spanish, pronoun);
  // Distractors: forms from all other pronouns (all 6 gives 6 forms, pick 3 ≠ correct)
  const others = ALL_PRONOUNS
    .filter(p => p !== pronoun)
    .map(p => conjugate(word.spanish, p))
    .filter(f => f !== correct);
  const distractors = shuffle([...new Set(others)]).slice(0, 3);
  while (distractors.length < 3) distractors.push(distractors[0] + "s"); // fallback (rare)
  return {
    word, question: word.spanish, hint: word.pronunciation ?? null,
    correct, options: shuffle([correct, ...distractors]), type: "conjugate", pronoun,
  };
}

export function Quiz({ words }: Props) {
  const isVerbTopic = useMemo(() => words.filter(w => VERB_RE.test(w.spanish)).length > words.length * 0.7, [words]);
  const isArticleTopic = useMemo(() => words.filter(w => ARTICLE_RE.test(w.spanish)).length > words.length * 0.5, [words]);
  const isSingularArticleTopic = useMemo(() => isArticleTopic && !words.some(w => /^(los|las) /.test(w.spanish)), [words, isArticleTopic]);

  // Mode
  const [mode, setMode] = useState<QuizMode>("translation");
  // Translation settings
  const [direction, setDirection] = useState<Direction>("es-ua");
  // Conjugation settings
  const [activePronouns, setActivePronouns] = useState<Pronoun[]>([...DEFAULT_PRONOUNS]);

  const knownCount = words.filter(w => w.status === "known").length;
  const makeDeck = useCallback(() => shuffle(words.filter(w => w.status !== "known")), [words]);

  const [deck, setDeck] = useState(() => shuffle(words.filter(w => w.status !== "known")));
  const [deckIdx, setDeckIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [wrongWords, setWrongWords] = useState<WordWithStatus[]>([]);
  const [barWidth, setBarWidth] = useState(0);

  const deckIdxRef = useRef(deckIdx);
  const deckLenRef = useRef(deck.length);
  deckIdxRef.current = deckIdx;
  deckLenRef.current = deck.length;

  const word = deck[deckIdx];

  const q = useMemo((): Question | null => {
    if (!word) return null;
    if (mode === "conjugation" && activePronouns.length > 0) {
      const pronoun = activePronouns[deckIdx % activePronouns.length];
      return buildConjugateQ(word, pronoun);
    }
    if (isArticleTopic && ARTICLE_RE.test(word.spanish)) return buildArticleQ(word, isSingularArticleTopic ? SINGULAR_ARTICLES : ALL_ARTICLES);
    return buildTranslateQ(word, words, direction);
  }, [word, words, mode, direction, activePronouns, deckIdx, isArticleTopic, isSingularArticleTopic]);

  useEffect(() => {
    if (selected === null) { setBarWidth(0); return; }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setBarWidth(100)));
    const timer = setTimeout(() => {
      setBarWidth(0);
      const next = deckIdxRef.current + 1;
      if (next >= deckLenRef.current) setDone(true);
      else { setDeckIdx(next); setSelected(null); }
    }, ADVANCE_MS);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [selected]);

  const resetSession = useCallback(() => {
    setDeck(makeDeck()); setDeckIdx(0); setSelected(null);
    setBarWidth(0); setScore(0); setDone(false); setWrongWords([]);
  }, [makeDeck]);

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

  const handleReset = async () => {
    if (!confirm("Скинути прогрес по цій темі?")) return;
    await fetch("/api/progress/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_ids: words.map(w => w.id) }),
    });
    window.location.reload();
  };

  const togglePronoun = (p: Pronoun) => {
    setActivePronouns(prev => {
      if (prev.includes(p) && prev.length === 1) return prev; // keep at least 1
      const next = prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p];
      return next;
    });
    resetSession();
  };

  const switchMode = (m: QuizMode) => { setMode(m); resetSession(); };
  const switchDirection = (d: Direction) => { setDirection(d); resetSession(); };

  if (words.length < 2) return <p className="text-muted-foreground text-sm py-8 text-center">Потрібно мінімум 2 слова.</p>;

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
  const isCorrect = selected === q.correct;

  return (
    <div className="flex flex-col gap-3">

      {/* Mode selector — only for verb topics */}
      {isVerbTopic && (
        <div className="flex rounded-2xl bg-muted p-1 gap-1">
          {([["translation", "📖 Переклад"], ["conjugation", "∿ Форми"]] as [QuizMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => switchMode(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Settings for translation mode */}
      {mode === "translation" && (
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-muted p-0.5 gap-0.5 flex-1">
            {(["es-ua", "ua-es"] as Direction[]).map(d => (
              <button key={d} onClick={() => switchDirection(d)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${
                  direction === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {d === "es-ua" ? "🇪🇸 → 🇺🇦" : "🇺🇦 → 🇪🇸"}
              </button>
            ))}
          </div>
          <button onClick={resetSession} title="Перемішати"
            className="shrink-0 text-base text-muted-foreground hover:text-foreground transition-colors">🔀</button>
        </div>
      )}

      {/* Settings for conjugation mode */}
      {mode === "conjugation" && (
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
              className="text-base text-muted-foreground hover:text-foreground transition-colors ml-auto">🔀</button>
          </div>
        </div>
      )}

      {/* Progress bar */}
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

      {/* Question card */}
      <div className="rounded-3xl border bg-card flex flex-col items-center justify-center p-5 text-center"
        style={{ height: 120 }}>
        {q.type === "conjugate" ? (
          <>
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Як відмінити?</p>
            <div className="flex items-baseline gap-2.5 justify-center">
              <span className="text-base font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-lg leading-none">
                {q.pronoun}
              </span>
              <span className="text-3xl font-bold tracking-tight leading-none uppercase">{q.question}</span>
            </div>
            {q.hint && <p className="text-xs text-muted-foreground font-mono mt-2">{q.hint}</p>}
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">
              {q.type === "article" ? "Який артикль?" : direction === "ua-es" ? "Як іспанською?" : "Як перекласти?"}
            </p>
            <p className="text-4xl font-bold tracking-tight leading-none">{q.question}</p>
            {q.hint && <p className="text-sm text-muted-foreground font-mono mt-2 leading-none">{q.hint}</p>}
          </>
        )}
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-2.5">
        {q.options.map((opt) => {
          const thisCorrect = selected !== null && opt === q.correct;
          const thisWrong   = selected === opt && opt !== q.correct;
          const dimmed      = selected !== null && !thisCorrect && opt !== selected;
          return (
            <button key={opt} onClick={() => handleSelect(opt)} disabled={selected !== null}
              style={{ height: 60 }}
              className={`rounded-2xl border-2 px-3 font-medium text-center leading-tight transition-colors duration-150
                ${q.type === "article" ? "text-2xl" : q.type === "conjugate" ? "text-lg" : "text-sm"}
                ${thisCorrect ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 dark:border-green-700"
                  : thisWrong  ? "border-destructive/60 bg-destructive/8 text-destructive"
                  : dimmed     ? "border-border bg-muted/20 text-muted-foreground opacity-40"
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
        {selected !== null
          ? isCorrect ? "Правильно!" : `Правильна відповідь: ${q.correct}`
          : "‎"}
      </div>

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
