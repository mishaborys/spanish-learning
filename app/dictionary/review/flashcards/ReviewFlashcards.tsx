"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReviewItem, ReviewToday } from "@/lib/review";
import { wordsToRetry, type Grade } from "@/lib/review/core";
import type { FlashcardSettings } from "@/lib/flashcardSettings";
import { flushReviewOutbox, queueAnswer, queueUndo } from "@/lib/reviewOutbox";
import { speakSpanish, speakUkrainian } from "@/lib/speak";
import { SwipeCounters, SwipeFlipCard, type SwipeDir, type SwipeFlipCardHandle } from "@/components/spanish/SwipeFlipCard";
import { SpeakerIcon, WordNotes } from "@/components/spanish/WordNotes";
import { shuffle as shuffled } from "@/lib/random";
import { CloseIcon, FlashcardsShell, GearIcon, Round, UndoIcon } from "../../[setId]/[groupId]/flashcards/FlashcardsMode";
import {
  GRADE_LABEL, GradeCounters, gradeCounts, REVIEW_HREF, ReviewDayGuard, useMoreWords, usePracticeWords, useReviewAnswers,
  wordsLabel,
} from "../shared";
import { ExitLink } from "@/components/spanish/ExitLink";
import { deckFromKeys, forgetOtherProgress, loadProgress, saveProgress, validIndex } from "@/lib/flashcardProgress";

const EXIT_LABEL = "До повторення";
const PROGRESS_PREFIX = "review:";

/**
 * Flashcards Повторення. Із сортуванням — оцінка «Знаю / Вагався / Не знаю» (свайп вправо / кнопка / вліво),
 * що йде в розклад; без сортування — просте гортання, як у групах, нічого не записується.
 */
export function ReviewFlashcards({ review, exitHref }: { review: ReviewToday; exitHref: string }) {
  // Де зупинився — окремо для кожної добірки; попередні добірки вже не потрібні
  const progressKey = `${PROGRESS_PREFIX}${review.day}:${review.batch}`;
  useEffect(() => forgetOtherProgress(PROGRESS_PREFIX, progressKey), [progressKey]);
  return (
    <>
      <FlashcardsShell exitHref={exitHref} exitLabel={EXIT_LABEL} progressKey={progressKey} empty={review.items.length === 0}
        round={(settings, paused, onOpenSettings) => settings.sorting ? (
          <GradingRound review={review} settings={settings} exitHref={exitHref} progressKey={progressKey}
            paused={paused} onOpenSettings={onOpenSettings} />
        ) : (
          <Round words={review.items.map(i => i.word)} settings={settings} exitHref={exitHref} exitLabel={EXIT_LABEL}
            progressKey={progressKey} paused={paused} onOpenSettings={onOpenSettings} />
        )} />
      <ReviewDayGuard day={review.day} />
    </>
  );
}

/**
 * Етапи сесії: `grade` — неоцінені слова, оцінка йде в розклад; `retry` — ще раз ті, що «не знаю» / «вагався»;
 * `training` — усе вже оцінено, просто тренування.
 */
type Phase = "grade" | "retry" | "training";
/** Результат картки; `recorded` — оцінку поставлено в розклад (тоді «Назад» її скасовує). */
type Result = { grade: Grade; recorded: boolean };

/** Збережена сесія оцінювання (колоди — ключами слів); з іншим перемішуванням недійсна. */
type SavedSession = {
  sorting: true;
  shuffle: boolean;
  phase: Phase;
  deck: string[];
  index: number;
  results: Result[];
  graded: { deck: string[]; results: Result[] } | null;
};

const GRADES: readonly unknown[] = ["known", "hesitant", "unknown"] satisfies Grade[];
const PHASES: readonly unknown[] = ["grade", "retry", "training"] satisfies Phase[];

function validResults(results: unknown, length: number): results is Result[] {
  return Array.isArray(results) && results.length === length
    && results.every(r => GRADES.includes(r?.grade) && typeof r?.recorded === "boolean");
}

/** Сесія, на якій зупинився, — якщо вона ще відповідає добірці й налаштуванням. */
function restoreSession(key: string, items: ReviewItem[], shuffle: boolean) {
  const saved = loadProgress<Partial<SavedSession>>(key);
  if (!saved || saved.sorting !== true || saved.shuffle !== shuffle || !PHASES.includes(saved.phase)) return null;
  const deck = deckFromKeys(saved.deck, items, i => i.key);
  if (!deck || deck.length === 0 || !validIndex(saved.index, deck.length) || !validResults(saved.results, saved.index)) return null;
  let graded: { deck: ReviewItem[]; results: Result[] } | null = null;
  if (saved.phase === "retry" && saved.graded) {
    const gradedDeck = deckFromKeys(saved.graded.deck, items, i => i.key);
    if (!gradedDeck || !validResults(saved.graded.results, gradedDeck.length)) return null;
    graded = { deck: gradedDeck, results: saved.graded.results };
  }
  return { phase: saved.phase!, deck, index: saved.index, results: saved.results, graded };
}

function GradingRound({ review, settings, exitHref, progressKey, paused, onOpenSettings }: {
  review: ReviewToday;
  settings: FlashcardSettings;
  exitHref: string;
  progressKey: string;
  paused: boolean;
  onOpenSettings: () => void;
}) {
  const { shuffle, front } = settings;
  const router = useRouter();
  const answers = useReviewAnswers(review);
  const order = (items: ReviewItem[]) => (shuffle ? shuffled(items) : items);
  // Де зупинився; інакше колода — з оцінок на момент старту: слова, оцінені під час сесії, з неї не зникають
  const [start] = useState(() => {
    const restored = restoreSession(progressKey, review.items, shuffle);
    if (restored) return restored;
    const ungraded = review.items.filter(i => !answers[i.key]);
    const fresh = { index: 0, results: [] as Result[], graded: null };
    return ungraded.length > 0
      ? { ...fresh, phase: "grade" as Phase, deck: order(ungraded) }
      : { ...fresh, phase: "training" as Phase, deck: order(review.items) };
  });
  const [phase, setPhase] = useState<Phase>(start.phase);
  const [deck, setDeck] = useState<ReviewItem[]>(start.deck);
  const [index, setIndex] = useState(start.index);
  const [results, setResults] = useState<Result[]>(start.results);
  /** Етап оцінювання, з якого перейшли на «ще раз» — щоб «Назад» міг туди повернутися. */
  const [graded, setGraded] = useState<{ deck: ReviewItem[]; results: Result[] } | null>(start.graded);

  // Запам'ятати, де зупинився
  useEffect(() => {
    const keys = (items: ReviewItem[]) => items.map(i => i.key);
    const saved: SavedSession = {
      sorting: true, shuffle, phase, deck: keys(deck), index, results,
      graded: graded && { deck: keys(graded.deck), results: graded.results },
    };
    saveProgress(progressKey, saved);
  }, [progressKey, shuffle, phase, deck, index, results, graded]);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [swipe, setSwipe] = useState<{ dir: SwipeDir | null; level: number }>({ dir: null, level: 0 });
  const cardRef = useRef<SwipeFlipCardHandle>(null);

  const item: ReviewItem | undefined = deck[index];
  const done = index >= deck.length;
  const grading = phase === "grade";
  // Підсумок проходу оцінювання: слова, яких не знав чи вагався, можна пройти ще раз
  const retryCount = done && grading ? wordsToRetry(deck, results.map(r => r.grade)).length : 0;
  const tally = { known: 0, hesitant: 0, unknown: 0 } as Record<Grade, number>;
  for (const r of results) tally[r.grade]++;

  // Сесію завершено — відправити чергу й оновити статистику з сервера
  useEffect(() => {
    if (!done) return;
    void flushReviewOutbox().then(() => { if (navigator.onLine) router.refresh(); });
  }, [done, router]);

  const commit = async (grade: Grade, dir: SwipeDir) => {
    if (!item || busy) return;
    setBusy(true);
    await cardRef.current?.flyOut(dir, grade);
    // Рахується перша оцінка слова за день: якщо його вже оцінив Learn, це просто тренування
    const recorded = grading && !answers[item.key];
    if (recorded) queueAnswer({ day: review.day, batch: review.batch, key: item.key }, grade);
    setResults(r => [...r, { grade, recorded }]);
    setFlipped(false);
    setBusy(false);
    setIndex(i => i + 1);
  };

  /** Після підсумку проходу оцінювання: ще раз слова, яких не знав чи вагався (уже без запису). */
  const startRetry = () => {
    if (!grading) return;
    const again = wordsToRetry(deck, results.map(r => r.grade));
    if (again.length === 0) return;
    setGraded({ deck, results });
    setPhase("retry");
    setDeck(order(again));
    setIndex(0);
    setResults([]);
    setFlipped(false);
  };

  /** Назад: попередня картка; її оцінка в розкладі скасовується повністю. */
  const back = () => {
    if (busy) return;
    if (index === 0) {
      // З першої картки «ще раз» — назад до підсумку оцінювання (оцінки лишаються)
      if (phase !== "retry" || !graded) return;
      setPhase("grade");
      setDeck(graded.deck);
      setResults(graded.results);
      setIndex(graded.deck.length);
      setGraded(null);
      setFlipped(false);
      return;
    }
    const last = results[results.length - 1];
    if (last?.recorded) queueUndo({ day: review.day, batch: review.batch, key: deck[index - 1].key });
    setResults(r => r.slice(0, -1));
    setFlipped(false);
    setIndex(i => i - 1);
  };
  const canGoBack = index > 0 || (phase === "retry" && graded !== null);

  // Клавіатура: ← не знаю, → знаю, ↓ вагався, пробіл — перевернути
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (done || paused || busy || e.repeat || target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") void commit("unknown", "left");
      else if (e.key === "ArrowRight") void commit("known", "right");
      else if (e.key === "ArrowDown" && grading) void commit("hesitant", "right");
      else if (e.key === " " && !target.closest("button, a, [role=button]")) { e.preventDefault(); setFlipped(f => !f); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const topBar = (
    <div className="flex items-center justify-between h-12 shrink-0">
      <ExitLink href={exitHref} aria-label="Закрити флешкартки"
        className="h-10 w-10 rounded-full border flex items-center justify-center text-foreground hover:bg-accent/40 transition-colors">
        <CloseIcon />
      </ExitLink>
      <div className="text-center">
        <p className="text-sm font-semibold tabular-nums">{Math.min(index + 1, deck.length)} / {deck.length}</p>
        {phase !== "grade" && (
          <p className="text-[10px] text-muted-foreground leading-none">{phase === "retry" ? "ще раз" : "тренування"}</p>
        )}
      </div>
      <button type="button" onClick={onOpenSettings} aria-label="Налаштування флешкарток"
        className="h-10 w-10 rounded-full border flex items-center justify-center text-foreground hover:bg-accent/40 transition-colors">
        <GearIcon />
      </button>
    </div>
  );

  const progress = (
    <div className="bg-muted rounded-full h-1 overflow-hidden shrink-0 mt-2">
      <div className="h-full bg-primary rounded-full transition-all duration-300"
        style={{ width: `${(Math.min(index, deck.length) / Math.max(deck.length, 1)) * 100}%` }} />
    </div>
  );

  if (done) {
    return (
      <>
        {topBar}
        {progress}
        <Summary review={review} answers={answers} training={phase === "training"} exitHref={exitHref}
          retryCount={retryCount} onRetry={startRetry} onBack={canGoBack ? back : undefined} />
      </>
    );
  }

  const word = item!.word;
  const spanishVisible = (front === "es") !== flipped;
  const es = (
    <>
      <span className="text-4xl font-bold tracking-tight">{word.spanish}</span>
      <span className="text-base text-muted-foreground mt-2 font-mono tracking-wide">{word.pronunciation}</span>
    </>
  );
  const uk = (
    <>
      {word.emoji && <span className="text-5xl mb-3">{word.emoji}</span>}
      <span className="text-3xl font-bold">{word.ukrainian}</span>
    </>
  );
  // Той самий переклад має кілька іспанських слів — підказка першою літерою
  const ukFront = (
    <>
      {uk}
      {item!.hint && <span className="text-sm text-muted-foreground mt-2">підказка: <span className="font-mono">{item!.hint}</span></span>}
    </>
  );

  return (
    <>
      {topBar}
      {progress}

      <div className="shrink-0 mt-3 h-10 relative">
        <SwipeCounters edge
          left={{ count: grading ? tally.unknown : tally.unknown + tally.hesitant }}
          right={{ count: tally.known }} progress={swipe} />
        {grading && tally.hesitant > 0 && (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted-foreground pointer-events-none">
            вагався: {tally.hesitant}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 py-3">
        <SwipeFlipCard
          key={`${phase}-${index}-${item!.key}`}
          ref={cardRef}
          fill
          stack={index + 1 < deck.length}
          flipped={flipped}
          onFlip={() => setFlipped(f => !f)}
          canFlip={!busy}
          canSwipe={!busy}
          labels={grading ? { unknown: "Не знаю" } : undefined}
          onSwipe={dir => commit(dir === "right" ? "known" : "unknown", dir)}
          onProgress={(dir, level) => setSwipe({ dir, level })}
          front={front === "es" ? es : ukFront}
          back={
            <>
              {front === "es" ? uk : es}
              <WordNotes word={word} className="mt-5 w-full pt-4 border-t" />
            </>
          }
        />
      </div>

      {grading && (
        <div className="grid grid-cols-3 gap-2 shrink-0">
          {/* Як свайп: «Не знаю» зліва, «Знаю» справа */}
          {(["unknown", "hesitant", "known"] as Grade[]).map(g => (
            <button key={g} type="button" disabled={busy}
              onClick={() => commit(g, g === "unknown" ? "left" : "right")}
              className={`min-h-[48px] rounded-2xl border-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 swipe-counter-${g}`}>
              {GRADE_LABEL[g]}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-4 h-12 shrink-0">
        <button type="button" onClick={back} disabled={busy || !canGoBack}
          aria-label="Скасувати останню оцінку"
          className="p-3 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
          <UndoIcon />
        </button>
        <span className="text-xs text-muted-foreground opacity-60">
          {grading ? "← не знаю · знаю →" : "← ще вчу · знаю →"}
        </span>
        <button type="button"
          onClick={() => (spanishVisible ? speakSpanish(word.spanish) : speakUkrainian(word.ukrainian))}
          aria-label={spanishVisible ? "Вимовити іспанське слово" : "Вимовити переклад"}
          className="p-3 rounded-full text-muted-foreground hover:text-foreground transition-colors">
          <SpeakerIcon />
        </button>
      </div>
    </>
  );
}

function Summary({ review, answers, training, exitHref, retryCount, onRetry, onBack }: {
  review: ReviewToday;
  answers: Record<string, Grade>;
  training: boolean;
  exitHref: string;
  /** Слів, які можна пройти ще раз («не знаю» / «вагався» цього проходу). */
  retryCount: number;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const { more, busy, error } = useMoreWords();
  const practice = usePracticeWords(review);
  const keys = review.items.map(i => i.key);
  const counts = gradeCounts(answers, keys);
  const allGraded = counts.known + counts.hesitant + counts.unknown === keys.length;
  const toPractice = practice?.length ?? 0;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center gap-5 py-6">
      <div className="text-center space-y-1">
        <p className="text-4xl">{allGraded && retryCount === 0 ? "🎉" : "💪"}</p>
        <p className="font-semibold text-lg">
          {training ? "Тренування завершено" : retryCount > 0 ? "Прохід завершено" : allGraded ? "На сьогодні все!" : "Сесію завершено"}
        </p>
      </div>
      <GradeCounters counts={counts} />
      <div className="rounded-2xl border bg-card p-4 text-sm space-y-1.5">
        <p>Повторено слів Словника: <strong>{review.stats.seen} з {review.stats.total}</strong></p>
        <p>Завтра на повторення: <strong>{review.stats.dueTomorrow}</strong> + нові</p>
      </div>
      <div className="space-y-2">
        {retryCount > 0 && (
          <button type="button" onClick={onRetry}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
            Ще раз: {retryCount} {wordsLabel(retryCount)}
          </button>
        )}
        {/* Далі — тренування слів, яких не знав чи вагався */}
        {toPractice > 0 && (
          <>
            <p className="text-sm text-center text-muted-foreground">Потренуй {toPractice} {wordsLabel(toPractice)}, яких не знав чи вагався:</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href={`${REVIEW_HREF}/learn`}
                className="min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center active:scale-[0.98] transition-all">
                Learn
              </Link>
              <Link href={`${REVIEW_HREF}/blast`}
                className="min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center active:scale-[0.98] transition-all">
                Blast
              </Link>
            </div>
          </>
        )}
        {allGraded && (
          <button type="button" onClick={more} disabled={busy}
            className={`w-full min-h-[52px] rounded-2xl text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-50 ${
              toPractice > 0 ? "border hover:bg-accent/40" : "bg-primary text-primary-foreground"}`}>
            {busy ? "…" : "Ще 10 слів"}
          </button>
        )}
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <ExitLink href={exitHref}
          className="w-full min-h-[52px] rounded-2xl border text-sm font-medium flex items-center justify-center hover:bg-accent/40 active:scale-[0.98] transition-all">
          {EXIT_LABEL}
        </ExitLink>
        {onBack && (
          <button type="button" onClick={onBack} className="w-full text-xs text-muted-foreground hover:text-foreground py-2">
            ↺ Повернути останню картку
          </button>
        )}
      </div>
    </div>
  );
}
