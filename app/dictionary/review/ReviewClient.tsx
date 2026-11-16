"use client";

import type { ReviewToday } from "@/lib/review";
import { groupProgress, type Stage } from "@/lib/learn/core";
import { BlastIcon, CardsIcon, LearnIcon, ModeButton, WordRow } from "../[setId]/[groupId]/GroupClient";
import {
  GRADE_DOT, GRADE_LABEL, GRADE_ORDER, GradeCounters, gradeCounts, REVIEW_HREF, ReviewDayGuard, useMoreWords, usePracticeWords,
  useReviewAnswers, wordsLabel,
} from "./shared";
import { ExitLink } from "@/components/spanish/ExitLink";

/**
 * Сторінка Повторення — як сторінка групи Словника: прогрес дня, режими Flashcards / Learn / Blast
 * і слова поточної добірки за оцінками. Ще не оцінені слова не показуємо — це була б підказка до тесту.
 * Порядок: спершу Flashcards оцінюють усю добірку, потім Learn і Blast тренують «не знаю» й «вагався».
 */
export function ReviewClient({ review, stages, blastBest }: {
  review: ReviewToday;
  /** Етапи Learn цієї добірки; null — база недоступна. */
  stages: Record<string, Stage> | null;
  blastBest: { score: number; level: number } | null;
}) {
  const answers = useReviewAnswers(review);
  const { more, busy, error } = useMoreWords();
  const keys = review.items.map(i => i.key);
  const total = keys.length;
  const counts = gradeCounts(answers, keys);
  const graded = counts.known + counts.hesitant + counts.unknown;
  const allGraded = total > 0 && graded === total;
  // «Сьогодні» з сервера — за знімком сторінки; різницю в поточній добірці (черга, скасування) докладаємо
  const today = review.stats.today + graded - keys.filter(k => review.answers[k]).length;
  const practice = usePracticeWords(review);
  const learn = groupProgress((practice ?? []).map(i => i.key), stages ?? {});
  // Learn і Blast відкриваються після Flashcards і лише для слів, які є що тренувати
  const practiceNote = !practice ? "спершу Flashcards" : practice.length === 0 ? "тренувати нічого ✓" : null;

  return (
    <div className="space-y-5">
      <ReviewDayGuard day={review.day} />
      <ExitLink href="/dictionary" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← Словник
      </ExitLink>

      <div>
        <h1 className="text-xl font-bold">🔁 Повторення</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Слова зі Словника · {review.stats.seen} з {review.stats.total} вже повторено
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Сьогодні немає слів для повторення.
        </div>
      ) : (
        <>
          {/* Прогрес дня */}
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">Сьогодні: {today} {wordsLabel(today)}</p>
              <p className="text-xs text-muted-foreground">Завтра: {review.stats.dueTomorrow} + нові</p>
            </div>
            <GradeCounters counts={counts} />
          </div>

          {/* Режими */}
          <div className="space-y-2">
            <ModeButton href={`${REVIEW_HREF}/flashcards`} icon={<CardsIcon />} label="Flashcards"
              note={allGraded ? "усе оцінено ✓" : `оцінено ${graded} з ${total}`} />
            <ModeButton href={stages && !practiceNote ? `${REVIEW_HREF}/learn` : undefined} icon={<LearnIcon />} label="Learn"
              note={practiceNote ?? (!stages ? "немає зв'язку з базою" : learn.done ? "усе вивчено ✓" : `вивчено ${learn.mastered} з ${learn.total}`)} />
            <ModeButton href={!practiceNote ? `${REVIEW_HREF}/blast` : undefined} icon={<BlastIcon />} label="Blast"
              note={practiceNote ?? (blastBest ? `рекорд ${blastBest.score} · рівень ${blastBest.level}` : `${practice!.length} ${wordsLabel(practice!.length)}`)} />
          </div>

          {/* Прогрес добірки */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Добірка</span>
              <span className="tabular-nums">оцінено {graded} з {total}</span>
            </div>
            <div className="bg-muted rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-[#18AE79] transition-all duration-300"
                style={{ width: `${(graded / total) * 100}%` }} />
            </div>
          </div>

          {allGraded && (
            <div className="space-y-2">
              <button type="button" onClick={more} disabled={busy}
                className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-50">
                {busy ? "…" : "Ще 10 слів"}
              </button>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
            </div>
          )}

          {/* Слова за оцінками */}
          {GRADE_ORDER.map(g => {
            const items = review.items.filter(i => answers[i.key] === g);
            if (items.length === 0) return null;
            return (
              <section key={g} className="space-y-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${GRADE_DOT[g]}`} />
                  {GRADE_LABEL[g]} · {items.length}
                </h2>
                <div className="rounded-2xl border bg-card divide-y overflow-hidden">
                  {items.map(i => <WordRow key={i.key} word={i.word} />)}
                </div>
              </section>
            );
          })}
          {total - graded > 0 && (
            <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Ще {total - graded} {wordsLabel(total - graded)} {total - graded === 1 ? "чекає" : "чекають"} на повторення
            </div>
          )}
        </>
      )}
    </div>
  );
}
