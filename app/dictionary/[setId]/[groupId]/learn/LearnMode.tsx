"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VocabGroup, VocabWord } from "@/lib/vocabulary";
import type { LearnMaterials } from "@/lib/learn";
import { wordKey } from "@/lib/review/core";
import {
  buildRound, checkWritten, groupProgress, nextStage, pickOptions, seededRng,
  type Option, type Question, type Stage,
} from "@/lib/learn/core";
import { speakSpanish } from "@/lib/speak";
import { useVisibleViewport } from "@/lib/useVisibleViewport";
import { SpeakerIcon, WordNotes } from "@/components/spanish/WordNotes";
import { ExitLink } from "@/components/spanish/ExitLink";

/** Скільки показувати «Правильно!», перш ніж перейти далі самому. */
const CORRECT_PAUSE_MS = 1300;
const KIND_LABEL: Record<Question["kind"], string> = { choice: "слово → переклад", reverse: "переклад → слово", write: "вписати" };
/** Скільки триває зникнення питання перед наступним (має збігатися з `.learn-step` у globals.css). */
const LEAVE_MS = 180;

type Feedback =
  | { result: "correct"; spelling: boolean; typed?: string; picked?: string }
  | { result: "wrong"; typed?: string; picked?: string; dontKnow: boolean };

type RoundAnswer = { key: string; correct: boolean };

/**
 * Learn як у Quizlet: раунди до 7 питань — спершу вибір із 4 перекладів,
 * потім те саме слово треба вписати іспанською. Етапи пишуться в базу після кожної відповіді.
 */
export function LearnMode({ group, initialStages, materials, exitHref, exitLabel = "До групи", scope, seed }: {
  group: VocabGroup;
  /** Підпис кнопки виходу після завершення. */
  exitLabel?: string;
  initialStages: Record<string, Stage>;
  materials: LearnMaterials;
  exitHref: string;
  scope: string;
  seed: number;
}) {
  const byKey = useMemo(() => new Map(group.words.map(w => [wordKey(w.spanish), w])), [group.words]);
  const keys = useMemo(() => [...byKey.keys()], [byKey]);
  const [stages, setStages] = useState<Record<string, Stage>>(initialStages);
  const [missed, setMissed] = useState<Set<string>>(() => new Set());
  const [roundNo, setRoundNo] = useState(1);
  const [round, setRound] = useState<Question[]>(() =>
    buildRound({ words: keys.map(k => ({ key: k, stage: initialStages[k] ?? "new" })), rng: seededRng(seed) }));
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<RoundAnswer[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const viewport = useVisibleViewport();

  // Відповіді пишемо по черзі, щоб «Я мав на увазі це» не обігнало попередній запис
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const save = (body: object) => {
    saving.current = saving.current.then(async () => {
      const res = await fetch("/api/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Помилка збереження");
    }).catch((e: Error) => setError(`${e.message} — прогрес цієї відповіді може не зберегтися`));
  };

  const progress = groupProgress(keys, stages);
  const question = round[qIndex];
  const word = question ? byKey.get(question.key) : undefined;
  const roundDone = qIndex >= round.length;

  /** Записати відповідь: локально одразу, у базу — у фоні. */
  const answer = (q: Question, correct: boolean) => {
    setStages(s => ({ ...s, [q.key]: nextStage(s[q.key] ?? "new", q.kind, correct) }));
    setMissed(m => {
      const next = new Set(m);
      if (correct) next.delete(q.key); else next.add(q.key);
      return next;
    });
    // «Я мав на увазі це» замінює попередню відповідь на це ж слово
    setAnswers(a => [...a.filter(x => x.key !== q.key), { key: q.key, correct }]);
    save({ action: "answer", scope, key: q.key, kind: q.kind, correct });
  };

  // Перехід до наступного питання: коротке зникнення, потім заміна. Ref — щоб подвійний клік не пропустив питання.
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const next = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    leaveTimer.current = setTimeout(() => {
      setFeedback(null);
      setQIndex(i => i + 1);
      leavingRef.current = false;
      setLeaving(false);
    }, LEAVE_MS);
  };

  const startNextRound = () => {
    const nextRound = buildRound({ words: keys.map(k => ({ key: k, stage: stages[k] ?? "new" })), missed });
    setRound(nextRound);
    setRoundNo(n => n + 1);
    setQIndex(0);
    setAnswers([]);
    setFeedback(null);
  };

  const learnAgain = async () => {
    setResetting(true);
    setError(null);
    try {
      await saving.current;
      const res = await fetch("/api/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", scope, keys }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Не вдалося скинути прогрес");
      setStages({});
      setMissed(new Set());
      setRound(buildRound({ words: keys.map(k => ({ key: k, stage: "new" as Stage })) }));
      setRoundNo(1);
      setQIndex(0);
      setAnswers([]);
      setFeedback(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResetting(false);
    }
  };

  // Правильна відповідь без підказки — коротке «Правильно!» і далі само
  useEffect(() => {
    if (feedback?.result !== "correct" || feedback.spelling) return;
    const t = setTimeout(next, CORRECT_PAUSE_MS);
    return () => clearTimeout(t);
  }, [feedback]);

  const finished = progress.done && (roundDone || round.length === 0);
  // Після помилки (чи правильної відповіді з підказкою написання) далі переходить сам користувач
  const needsNext = !!question && !roundDone && !finished && !!feedback
    && (feedback.result === "wrong" || feedback.spelling);

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto overscroll-contain"
      // Клавіатура на iOS зсуває visual viewport — тримаємо оверлей рівно по видимій області
      style={viewport ? { top: viewport.top, height: viewport.height, bottom: "auto" } : undefined}>
      <div className="min-h-full max-w-lg mx-auto flex flex-col px-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        {/* Верхня панель */}
        <div className="flex items-center justify-between h-12 shrink-0">
          <ExitLink href={exitHref} aria-label="Закрити Learn"
            className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-accent/40 transition-colors">
            <CloseIcon />
          </ExitLink>
          <div className="text-center">
            <p className="text-sm font-semibold">Learn</p>
            <p className="text-[10px] text-muted-foreground leading-none">
              {finished ? group.title : `раунд ${roundNo}${!roundDone && round.length ? ` · ${KIND_LABEL[round[0].kind]} · ${qIndex + 1} / ${round.length}` : ""}`}
            </p>
          </div>
          <div className="h-10 w-10" />
        </div>
        <ProgressBar progress={progress} />

        {error && <p className="text-xs text-destructive text-center mt-2">{error}</p>}

        <div className="flex-1 flex flex-col pt-5 pb-4"
          style={needsNext ? undefined : { paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
          {/* key змінюється з кожним питанням/екраном — так спрацьовує анімація появи */}
          <div key={finished ? "finished" : roundDone || round.length === 0 ? `summary-${roundNo}` : `${roundNo}-${qIndex}`}
            className={`learn-step flex-1 flex flex-col ${leaving ? "learn-step-leaving" : ""}`}>
          {finished ? (
            <Finished total={progress.total} onAgain={learnAgain} busy={resetting} exitHref={exitHref} exitLabel={exitLabel} />
          ) : roundDone || round.length === 0 ? (
            <RoundSummary roundNo={roundNo} answers={answers} byKey={byKey} progress={progress}
              onContinue={startNextRound} exitHref={exitHref} />
          ) : question && word ? (
            question.kind !== "write" ? (
              <ChoiceQuestion key={`${roundNo}-${qIndex}`} word={word} wordKeyValue={question.key}
                reverse={question.kind === "reverse"}
                seed={seed + roundNo * 1000 + qIndex}
                layers={question.kind === "reverse" ? materials.reverseLayers : materials.layers} feedback={feedback}
                onAnswer={(picked, correct) => {
                  answer(question, correct);
                  setFeedback(correct ? { result: "correct", spelling: false, picked } : { result: "wrong", picked, dontKnow: picked === "" });
                }}
                />
            ) : (
              <WriteQuestion key={`${roundNo}-${qIndex}`} word={word}
                sameTranslation={materials.sameTranslation[question.key] ?? []} feedback={feedback}
                onAnswer={(typed, correct, spelling) => {
                  answer(question, correct);
                  setFeedback(correct ? { result: "correct", spelling, typed } : { result: "wrong", typed, dontKnow: typed === "" });
                }}
                onOverride={() => {
                  answer(question, true);
                  setFeedback(f => f && f.result === "wrong" ? { result: "correct", spelling: true, typed: f.typed } : f);
                }}
              />
            )
          ) : null}
          </div>
        </div>

        {/* «Далі» липне до низу екрана: пояснення можна гортати, а кнопка завжди під пальцем */}
        {needsNext && (
          <div className={`learn-footer sticky bottom-0 -mx-4 px-4 pt-3 border-t bg-background/95 backdrop-blur ${leaving ? "learn-footer-leaving" : ""}`}
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
            <NextButton onNext={next} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Питання: вибір ───────────────────────────────────────────────────────────

function ChoiceQuestion({ word, wordKeyValue, reverse, seed, layers, feedback, onAnswer }: {
  word: VocabWord;
  wordKeyValue: string;
  /** Показати переклад і обирати іспанське слово (інакше — навпаки). */
  reverse: boolean;
  seed: number;
  layers: Option[][];
  feedback: Feedback | null;
  onAnswer: (pickedKey: string, correct: boolean) => void;
}) {
  const [options] = useState(() => pickOptions({
    target: reverse ? { key: wordKeyValue, text: word.spanish, meaning: word.ukrainian } : { key: wordKeyValue, text: word.ukrainian },
    layers, rng: seededRng(seed),
  }));
  const answered = feedback !== null;

  return (
    <div className="flex-1 flex flex-col gap-5">
      {reverse ? (
        // Переклад → іспанське: ні озвучення, ні вимова, бо вони підказують відповідь
        <div className="rounded-3xl border bg-card p-6 min-h-[180px] flex flex-col items-center justify-center text-center relative">
          <p className="absolute top-4 left-5 text-xs text-muted-foreground">Переклад</p>
          {word.emoji && <span className="text-5xl mb-2">{word.emoji}</span>}
          <span className="text-2xl font-bold break-words">{word.ukrainian}</span>
        </div>
      ) : (
        <div className="rounded-3xl border bg-card p-6 min-h-[180px] flex flex-col items-center justify-center text-center relative">
          <p className="absolute top-4 left-5 text-xs text-muted-foreground">Слово</p>
          <SpeakButton word={word} />
          <span className="text-3xl font-bold tracking-tight break-words">{word.spanish}</span>
          <span className="text-sm text-muted-foreground mt-1.5 font-mono">{word.pronunciation}</span>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          {!answered ? (reverse ? "Обери слово іспанською" : "Обери правильний переклад") : feedback.result === "correct" ? "Правильно! 🎉" : feedback.dontKnow ? "Нічого, запам'ятаємо:" : "Ще не зовсім — правильна відповідь:"}
        </p>
        {options.map(o => {
          const isCorrect = o.key === wordKeyValue;
          const isPicked = feedback?.picked === o.key;
          const state = !answered ? "idle" : isCorrect ? "correct" : isPicked ? "wrong" : "dim";
          return (
            <button key={o.key} type="button" disabled={answered} onClick={() => onAnswer(o.key, isCorrect)}
              className={`w-full min-h-[56px] rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition-all ${
                state === "idle" ? "hover:bg-accent/40 active:scale-[0.99]"
                : state === "correct" ? "border-[#18AE79] bg-[#E6FCF4] text-[#0f7a55] dark:bg-emerald-950/40 dark:text-emerald-300"
                : state === "wrong" ? "border-[#FF983A] bg-[#FFF6EF] text-[#CC4E00] dark:bg-orange-950/40 dark:text-orange-300"
                : "opacity-40"}`}>
              {o.text}
            </button>
          );
        })}
      </div>

      {!answered && (
        <button type="button" onClick={() => onAnswer("", false)}
          className="self-center text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline py-2">
          Не знаю
        </button>
      )}

      {feedback?.result === "wrong" && <WrongPanel word={word} />}
    </div>
  );
}

// ─── Питання: вписати ─────────────────────────────────────────────────────────

function WriteQuestion({ word, sameTranslation, feedback, onAnswer, onOverride }: {
  word: VocabWord;
  sameTranslation: string[];
  feedback: Feedback | null;
  onAnswer: (typed: string, correct: boolean, showSpelling: boolean) => void;
  onOverride: () => void;
}) {
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const submit = () => {
    if (!typed.trim() || feedback) return;
    const { correct, showSpelling } = checkWritten(typed, word.spanish, sameTranslation);
    onAnswer(typed.trim(), correct, showSpelling);
  };

  return (
    <div className="flex-1 flex flex-col gap-5">
      <div className="rounded-3xl border bg-card p-6 min-h-[180px] flex flex-col items-center justify-center text-center relative">
        <p className="absolute top-4 left-5 text-xs text-muted-foreground">Переклад</p>
        {word.emoji && <span className="text-5xl mb-2">{word.emoji}</span>}
        <span className="text-2xl font-bold break-words">{word.ukrainian}</span>
      </div>

      {!feedback && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Напиши іспанською</p>
          <div className="flex gap-2">
            <input ref={input} value={typed} onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder="Іспанською…" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
              className="flex-1 min-w-0 min-h-[52px] rounded-2xl border bg-background px-4 text-base outline-none focus:ring-2 focus:ring-primary/40" />
            <button type="button" onClick={submit} disabled={!typed.trim()}
              className="min-h-[52px] px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">
              Перевірити
            </button>
          </div>
          <button type="button" onClick={() => onAnswer("", false, true)}
            className="w-full text-sm text-muted-foreground hover:text-foreground py-2">
            Не знаю
          </button>
        </div>
      )}

      {feedback?.result === "correct" && (
        <div className="space-y-3 learn-rise">
          <div className="rounded-2xl border-2 border-[#18AE79] bg-[#E6FCF4] dark:bg-emerald-950/40 p-4">
            <p className="text-sm font-semibold text-[#0f7a55] dark:text-emerald-300">Правильно! 🎉</p>
            {feedback.spelling && (
              <p className="text-sm text-[#0f7a55] dark:text-emerald-300 mt-1">
                Ти написав «{feedback.typed}», правильно пишеться: <strong>{word.spanish}</strong>
              </p>
            )}
          </div>
        </div>
      )}

      {feedback?.result === "wrong" && (
        <div className="space-y-3">
          {!feedback.dontKnow && (
            <div className="rounded-2xl border-2 border-[#FF983A] bg-[#FFF6EF] dark:bg-orange-950/40 p-4 flex items-start justify-between gap-3">
              <p className="text-sm text-[#CC4E00] dark:text-orange-300">Ти написав: <strong>{feedback.typed}</strong></p>
              <button type="button" onClick={onOverride} className="shrink-0 text-xs underline text-[#CC4E00] dark:text-orange-300">
                Я мав на увазі це
              </button>
            </div>
          )}
          <WrongPanel word={word} />
        </div>
      )}
    </div>
  );
}

// ─── Спільні частини ──────────────────────────────────────────────────────────

/** Правильна відповідь після помилки: слово, вимова, асоціація й приклад. */
function WrongPanel({ word }: { word: VocabWord }) {
  return (
    <div className="space-y-3 learn-rise">
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Правильна відповідь</p>
            <p className="text-xl font-bold mt-0.5">{word.spanish}</p>
            <p className="text-sm font-mono text-muted-foreground">{word.pronunciation}</p>
            <p className="text-sm mt-1">{word.emoji} {word.ukrainian}</p>
          </div>
          <button type="button" onClick={() => speakSpanish(word.spanish)} aria-label={`Вимовити «${word.spanish}»`}
            className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/40">
            <SpeakerIcon />
          </button>
        </div>
        <WordNotes word={word} />
      </div>
    </div>
  );
}

function NextButton({ onNext }: { onNext: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <button ref={ref} type="button" onClick={onNext}
      className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
      Далі →
    </button>
  );
}

function SpeakButton({ word }: { word: VocabWord }) {
  return (
    <button type="button" onClick={() => speakSpanish(word.spanish)} aria-label={`Вимовити «${word.spanish}»`}
      className="absolute top-3 right-3 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/40">
      <SpeakerIcon />
    </button>
  );
}

function ProgressBar({ progress }: { progress: ReturnType<typeof groupProgress> }) {
  const pct = (n: number) => `${(n / Math.max(progress.total, 1)) * 100}%`;
  return (
    <div className="shrink-0 mt-2 space-y-1">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        <div className="bg-[#18AE79] transition-all duration-300" style={{ width: pct(progress.mastered) }} />
        <div className="bg-[#FF983A] transition-all duration-300" style={{ width: pct(progress.learning) }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>вивчено {progress.mastered}</span>
        <span>ще вчу {progress.learning}</span>
        <span>не вивчав {progress.new}</span>
      </div>
    </div>
  );
}

function RoundSummary({ roundNo, answers, byKey, progress, onContinue, exitHref }: {
  roundNo: number;
  answers: RoundAnswer[];
  byKey: Map<string, VocabWord>;
  progress: ReturnType<typeof groupProgress>;
  onContinue: () => void;
  exitHref: string;
}) {
  const right = answers.filter(a => a.correct).length;
  return (
    <div className="flex-1 flex flex-col gap-5">
      <div className="text-center space-y-1 pt-2">
        <p className="text-4xl">💪</p>
        <p className="font-semibold text-lg">Раунд {roundNo} пройдено</p>
        <p className="text-sm text-muted-foreground">Правильно {right} з {answers.length} · вивчено {progress.mastered} з {progress.total}</p>
      </div>
      <div className="rounded-2xl border bg-card divide-y overflow-hidden">
        {answers.map(a => {
          const w = byKey.get(a.key);
          if (!w) return null;
          return (
            <div key={a.key} className="flex items-start gap-3 px-4 py-2.5">
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${a.correct ? "bg-[#18AE79]" : "bg-[#FF983A]"}`} />
              <span className="shrink-0 max-w-[45%] break-words text-sm font-medium">{w.spanish}</span>
              <span className="flex-1 min-w-0 break-words text-sm text-muted-foreground text-right">{w.ukrainian}</span>
            </div>
          );
        })}
      </div>
      <div className="space-y-2 mt-auto">
        <button type="button" onClick={onContinue}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
          Продовжити
        </button>
        <ExitLink href={exitHref}
          className="w-full min-h-[52px] rounded-2xl border text-sm font-medium flex items-center justify-center hover:bg-accent/40 transition-all">
          Завершити на сьогодні
        </ExitLink>
      </div>
    </div>
  );
}

function Finished({ total, onAgain, busy, exitHref, exitLabel }: { total: number; onAgain: () => void; busy: boolean; exitHref: string; exitLabel: string }) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-5 text-center">
      <div className="space-y-1">
        <p className="text-5xl">🎉</p>
        <p className="font-semibold text-xl">Усе вивчено!</p>
        <p className="text-sm text-muted-foreground">Ти пройшов усі {total} слів: і вибір, і написання.</p>
      </div>
      <div className="space-y-2">
        <ExitLink href={exitHref}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center active:scale-[0.98] transition-all">
          {exitLabel}
        </ExitLink>
        <button type="button" onClick={onAgain} disabled={busy}
          className="w-full min-h-[52px] rounded-2xl border text-sm font-medium hover:bg-accent/40 disabled:opacity-50 transition-all">
          {busy ? "…" : "Вчити знову"}
        </button>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}
