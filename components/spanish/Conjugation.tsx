"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  answerKey, checkForm, checkOrder, isFinished, itemsToRetry, KIND_LABEL, newSession,
  PERSON_LABEL, progressOf, restoreSession, SESSION_SIZE, shuffledChips, tally,
  type ConjVerb, type Item, type ItemResult, type Person, type Progress, type Session, type Step as AnswerStep,
} from "@/lib/conjugation/core";
import { loadProgress, saveProgress } from "@/lib/flashcardProgress";
import { flushConjugationOutbox, queuedCorrectKeys, submitAnswers } from "@/lib/conjugationOutbox";
import { AUTO_ADVANCE_MS, AutoBar, Body, Footer, Frame, ProgressMeter, WordBuilder } from "@/components/spanish/practice";

export { AUTO_ADVANCE_MS };

const PROGRESS_KEY = "conjugation:presente";

/**
 * Відмінювання: показуємо інфінітив і особу — вписуєш форму; одразу після цього речення з цією формою —
 * склади його зі слів. Сама вправа — на весь екран (як Flashcards): угорі ✕ і лічильник, поле вводу й кнопка
 * закріплені знизу над клавіатурою. Помилки можна пройти ще раз; місце, де зупинився, запам'ятовується.
 * Прогрес — частка УСІХ можливих відповідей (дієслово × особа × форма й речення), на які вже відповідали
 * правильно; кожна відповідь іде на сервер через чергу (`lib/conjugationOutbox.ts`).
 */
export function Conjugation({ verbs, initialDone }: { verbs: ConjVerb[]; initialDone: string[] }) {
  const byInfinitive = useMemo(() => new Map(verbs.map(v => [v.infinitive, v])), [verbs]);
  // Вкладка малюється лише в браузері (після кліку), тож збережене читаємо одразу
  const [saved] = useState(() => restoreSession(loadProgress(PROGRESS_KEY), verbs));
  // Недопройдену сесію можна продовжити з тієї ж пари; пройдену не показуємо знову — чекає «Почати»
  const [session, setSession] = useState<Session | null>(saved && !isFinished(saved) ? saved : null);
  const [open, setOpen] = useState(false);
  /** Дієслова останньої сесії: наступна бере інші, поки вони є. */
  const [previous, setPrevious] = useState<Set<string>>(() => new Set(saved?.items.map(i => i.verb)));
  useEffect(() => { if (session) saveProgress(PROGRESS_KEY, session); }, [session]);

  /** Правильні відповіді: з сервера плюс ті, що ще чекають у черзі на телефоні. */
  const [correctKeys, setCorrectKeys] = useState<Set<string>>(() => new Set([...initialDone, ...queuedCorrectKeys()]));
  /** Нових правильних відповідей, зароблених у цій сесії (разом із повтором помилок). */
  const [gained, setGained] = useState(0);
  const progress = useMemo(() => progressOf(correctKeys, verbs), [correctKeys, verbs]);
  useEffect(() => { void flushConjugationOutbox(); }, []);

  const answer = (item: Item, step: AnswerStep, correct: boolean) => {
    void submitAnswers([{ verb: item.verb, person: item.person, step, correct }]);
    const key = answerKey(item.verb, item.person, step);
    if (!correct || correctKeys.has(key)) return;
    setCorrectKeys(prev => new Set(prev).add(key));
    setGained(g => g + 1);
  };

  const begin = () => {
    const seen = new Set([...previous, ...(session?.items.map(i => i.verb) ?? [])]);
    setPrevious(seen);
    setSession(newSession(verbs, { avoid: seen, done: correctKeys }));
    setGained(0);
    setOpen(true);
  };

  const resumable = session && !isFinished(session) ? session : null;
  if (!open || !session) {
    return <Start resume={resumable && { index: resumable.index, total: resumable.items.length }}
      progress={progress} onStart={begin} onResume={() => setOpen(true)} />;
  }

  const { items, index, results, round } = session;
  const done = isFinished(session);
  const retry = itemsToRetry(items, results);
  const record = (result: ItemResult) =>
    setSession(s => s && ({ ...s, index: s.index + 1, results: [...s.results, result] }));

  return (
    <Frame label={round > 1 ? "повтор помилок" : "Відмінювання"} counter={done ? undefined : `${index + 1} / ${items.length}`}
      progress={Math.min(index, items.length) / items.length} onClose={() => setOpen(false)}>
      {done ? (
        <Summary results={results} items={items} byInfinitive={byInfinitive} retryCount={retry.length}
          progress={progress} gained={gained}
          onRetry={() => setSession(s => s && ({ ...s, round: s.round + 1, items: retry, index: 0, results: [] }))}
          onMore={begin} />
      ) : (
        <Pair key={`${round}-${index}`} verb={byInfinitive.get(items[index].verb)!} person={items[index].person}
          last={index === items.length - 1} onAnswer={(step, correct) => answer(items[index], step, correct)} onDone={record} />
      )}
    </Frame>
  );
}

/** Початковий екран у темі: одна кнопка. Недопройдену сесію можна продовжити. */
function Start({ resume, progress, onStart, onResume }: {
  resume: { index: number; total: number } | null;
  progress: Progress;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <div className="rounded-3xl border bg-card p-6 text-center space-y-4">
      <p className="text-4xl">🔄</p>
      <div className="space-y-1">
        <p className="font-semibold text-lg">{SESSION_SIZE} дієслів</p>
        <p className="text-sm text-muted-foreground">Впишеш форму, а потім складеш речення з нею.</p>
      </div>
      <ProgressBlock progress={progress} />
      {resume ? (
        <div className="space-y-2">
          <button type="button" onClick={onResume}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
            Продовжити · {resume.index + 1} / {resume.total}
          </button>
          <button type="button" onClick={onStart} className="w-full text-xs text-muted-foreground hover:text-foreground py-2">
            Почати спочатку
          </button>
        </div>
      ) : (
        <button type="button" onClick={onStart}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
          Почати
        </button>
      )}
    </div>
  );
}

type Step = "form" | "formDone" | "build" | "buildDone";

/** Одна пара: спершу форма, потім речення з нею. */
function Pair({ verb, person, last, onAnswer, onDone }: {
  verb: ConjVerb;
  person: Person;
  last: boolean;
  /** Відповідь дано (форма чи речення): їх зараховуємо в прогрес одразу, а не в кінці пари. */
  onAnswer: (step: AnswerStep, correct: boolean) => void;
  onDone: (result: ItemResult) => void;
}) {
  const sentence = verb.sentences[person];
  const expected = verb.forms[person];
  const [step, setStep] = useState<Step>("form");
  const [answer, setAnswer] = useState("");
  const [formOk, setFormOk] = useState(false);
  const [chips] = useState(() => shuffledChips(sentence));
  /** Номери слів (у `chips`) у тому порядку, як їх поставив користувач. */
  const [placed, setPlaced] = useState<number[]>([]);
  const [orderOk, setOrderOk] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Курсор — у поле, а після відповіді — на «Далі», щоб працював Enter
  useEffect(() => {
    if (step === "form") inputRef.current?.focus();
    else if (step === "formDone" || step === "buildDone") nextRef.current?.focus();
  }, [step]);

  // Правильна форма: за кілька секунд саме відкривається речення. Кнопка «Далі» є лише після помилки
  useEffect(() => {
    if (step !== "formDone" || !formOk) return;
    const timer = setTimeout(() => setStep("build"), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [step, formOk]);

  const checkAnswer = () => {
    if (!answer.trim()) return;
    const ok = checkForm(answer, expected);
    setFormOk(ok);
    setStep("formDone");
    onAnswer("form", ok);
  };

  const checkSentence = () => {
    if (placed.length !== chips.length) return;
    const ok = checkOrder(placed.map(i => chips[i]), sentence);
    setOrderOk(ok);
    setStep("buildDone");
    onAnswer("order", ok);
  };

  const building = step === "build";

  if (step === "form" || step === "formDone") {
    const checked = step === "formDone";
    return (
      <>
        <Body>
          <div className="rounded-3xl border bg-card p-4 text-center space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Впиши форму</p>
            <p className="text-4xl font-bold tracking-tight">{verb.infinitive}</p>
            <p className="text-sm text-muted-foreground">{verb.ukrainian}</p>
            <p className="inline-block mt-0.5 rounded-full bg-primary/10 text-primary px-4 py-1 text-lg font-semibold">
              {PERSON_LABEL[person]}
            </p>
          </div>

          {checked && (
            <div className={`rounded-2xl border-2 px-3 py-2 text-center text-sm ${formOk ? "swipe-counter-known" : "swipe-counter-unknown"}`}>
              {formOk ? "Правильно!" : <>Правильно: <strong className="text-base">{expected}</strong></>}
              <span className="block text-xs opacity-80">
                {KIND_LABEL[verb.kind]}
              </span>
            </div>
          )}
        </Body>

        {/* Поле й кнопка закріплені знизу — над клавіатурою */}
        <form className="shrink-0 space-y-2 pt-2"
          onSubmit={e => { e.preventDefault(); if (!checked) checkAnswer(); else if (!formOk) setStep("build"); }}>
          <input ref={inputRef} value={answer} onChange={e => setAnswer(e.target.value)} disabled={checked}
            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="done"
            aria-label={`${verb.infinitive}, ${PERSON_LABEL[person]}`} placeholder="…"
            className={`w-full h-14 rounded-2xl border-2 bg-background px-4 text-center text-xl font-medium outline-none focus:border-primary ${
              checked ? (formOk ? "swipe-counter-known" : "swipe-counter-unknown") : ""}`} />
          {/* Після правильної форми кнопки немає: смужка заповнюється, і речення відкривається саме */}
          {checked && formOk ? <div className="min-h-[52px] flex items-center"><AutoBar /></div> : (
            <button ref={nextRef} type="submit" disabled={!checked && !answer.trim()}
              className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all">
              {checked ? "Далі: речення →" : "Перевірити"}
            </button>
          )}
        </form>
      </>
    );
  }

  return (
    <>
      <Body>
        <div className="rounded-3xl border bg-card p-4 text-center space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Склади речення · {verb.infinitive}, {PERSON_LABEL[person]}
          </p>
          <p className="text-xl font-semibold leading-snug">{sentence.uk}</p>
        </div>

        <WordBuilder chips={chips} placed={placed} onChange={setPlaced} locked={!building}
          tone={step === "buildDone" ? (orderOk ? "ok" : "wrong") : "idle"} />

        {step === "buildDone" && (
          <div className={`rounded-2xl border-2 p-3 text-center text-sm ${orderOk ? "swipe-counter-known" : "swipe-counter-unknown"}`}>
            {orderOk ? "Правильно!" : "Правильно:"} <strong className="text-base block mt-0.5">{sentence.es}</strong>
          </div>
        )}
      </Body>

      <Footer>
        {building ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setPlaced([])} disabled={placed.length === 0}
              className="min-h-[52px] px-5 rounded-2xl border text-sm font-medium disabled:opacity-40 hover:bg-accent/40 active:scale-[0.98] transition-all">
              Скинути
            </button>
            <button type="button" onClick={checkSentence} disabled={placed.length !== chips.length}
              className="min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all">
              Перевірити
            </button>
          </div>
        ) : (
          <button ref={nextRef} type="button" onClick={() => onDone({ form: formOk, order: orderOk })}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
            {last ? "До підсумку" : "Далі →"}
          </button>
        )}
      </Footer>
    </>
  );
}

/** Загальний прогрес: правильні відповіді з усіх можливих (форми й речення, кожне дієслово в усіх особах). */
function ProgressBlock({ progress, gained }: { progress: Progress; gained?: number }) {
  return <ProgressMeter done={progress.done} total={progress.total} gained={gained}
    detail={`форми ${progress.forms} / ${progress.perStep} · речення ${progress.sentences} / ${progress.perStep}`} />;
}

function Summary({ results, items, byInfinitive, retryCount, progress, gained, onRetry, onMore }: {
  results: ItemResult[];
  items: Session["items"];
  byInfinitive: Map<string, ConjVerb>;
  retryCount: number;
  progress: Progress;
  /** Нових правильних відповідей, зароблених у цій сесії. */
  gained: number;
  onRetry: () => void;
  onMore: () => void;
}) {
  const { forms, sentences, total } = tally(results);
  const perfect = retryCount === 0;
  return (
    <>
      <Body>
        <div className="text-center space-y-1">
          <p className="text-4xl">{perfect ? "🎉" : "💪"}</p>
          <p className="font-semibold text-lg">{perfect ? "Усе правильно!" : "Прохід завершено"}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">{forms} / {total}</p>
            <p className="text-xs text-muted-foreground">форми</p>
          </div>
          <div className="rounded-2xl border p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">{sentences} / {total}</p>
            <p className="text-xs text-muted-foreground">речення</p>
          </div>
        </div>

        <ProgressBlock progress={progress} gained={gained} />

        {!perfect && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">Де були помилки:</p>
            {items.map((item, i) => {
              const r = results[i];
              if (!r || (r.form && r.order)) return null;
              const verb = byInfinitive.get(item.verb)!;
              return (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2.5 text-sm">
                  <span><strong>{verb.infinitive}</strong> · {PERSON_LABEL[item.person]}</span>
                  <span className="font-medium">{verb.forms[item.person]}</span>
                </div>
              );
            })}
          </div>
        )}
      </Body>

      <Footer>
        {!perfect && (
          <button type="button" onClick={onRetry}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
            Ще раз помилки: {retryCount}
          </button>
        )}
        <button type="button" onClick={onMore}
          className={`w-full min-h-[52px] rounded-2xl text-sm font-medium active:scale-[0.98] transition-all ${
            perfect ? "bg-primary text-primary-foreground" : "border hover:bg-accent/40"}`}>
          Ще 10
        </button>
      </Footer>
    </>
  );
}
