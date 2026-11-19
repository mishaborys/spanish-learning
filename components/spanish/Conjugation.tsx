"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkForm, checkOrder, FILTER_LABEL, itemsToRetry, KIND_LABEL, newSession, PERSON_LABEL,
  restoreSession, shuffledChips, tally, type ConjVerb, type Filter, type ItemResult, type Person, type Session,
} from "@/lib/conjugation/core";
import { loadProgress, saveProgress } from "@/lib/flashcardProgress";

const PROGRESS_KEY = "conjugation:presente";
const FILTERS = Object.keys(FILTER_LABEL) as Filter[];

/**
 * Відмінювання: показуємо інфінітив і особу — вписуєш форму; одразу після цього речення з цією формою —
 * склади його зі слів. Помилки можна пройти ще раз; місце, де зупинився, запам'ятовується в браузері.
 */
export function Conjugation({ verbs }: { verbs: ConjVerb[] }) {
  const byInfinitive = useMemo(() => new Map(verbs.map(v => [v.infinitive, v])), [verbs]);
  // Вкладка малюється лише в браузері (після кліку), тож збережене читаємо одразу
  const [session, setSession] = useState<Session>(() => restoreSession(loadProgress(PROGRESS_KEY), verbs) ?? newSession(verbs, "all"));
  useEffect(() => saveProgress(PROGRESS_KEY, session), [session]);

  const { items, index, results, round } = session;
  const done = index >= items.length;
  const retry = itemsToRetry(items, results);
  const seen = () => new Set(items.map(i => i.verb));

  const record = (result: ItemResult) =>
    setSession(s => ({ ...s, index: s.index + 1, results: [...s.results, result] }));

  return (
    <div className="space-y-4">
      <div className="flex rounded-2xl bg-muted p-1 gap-1" role="group" aria-label="Які дієслова тренувати">
        {FILTERS.map(f => (
          <button key={f} type="button" aria-pressed={session.filter === f}
            onClick={() => setSession(newSession(verbs, f, seen()))}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
              session.filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{round > 1 ? "Повтор помилок" : "Сесія"}</span>
          <span className="tabular-nums">{Math.min(index + 1, items.length)} / {items.length}</span>
        </div>
        <div className="bg-muted rounded-full h-1 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(Math.min(index, items.length) / items.length) * 100}%` }} />
        </div>
      </div>

      {done ? (
        <Summary results={results} items={items} byInfinitive={byInfinitive} retryCount={retry.length}
          onRetry={() => setSession(s => ({ ...s, round: s.round + 1, items: retry, index: 0, results: [] }))}
          onMore={() => setSession(newSession(verbs, session.filter, seen()))} />
      ) : (
        <Pair key={`${round}-${index}`} verb={byInfinitive.get(items[index].verb)!} person={items[index].person}
          last={index === items.length - 1} onDone={record} />
      )}
    </div>
  );
}

type Step = "form" | "formDone" | "build" | "buildDone";

/** Одна пара: спершу форма, потім речення з нею. */
function Pair({ verb, person, last, onDone }: {
  verb: ConjVerb;
  person: Person;
  last: boolean;
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

  const checkAnswer = () => {
    if (!answer.trim()) return;
    setFormOk(checkForm(answer, expected));
    setStep("formDone");
  };

  const checkSentence = () => {
    if (placed.length !== chips.length) return;
    setOrderOk(checkOrder(placed.map(i => chips[i]), sentence));
    setStep("buildDone");
  };

  const building = step === "build";
  const free = chips.map((_, i) => i).filter(i => !placed.includes(i));

  if (step === "form" || step === "formDone") {
    const checked = step === "formDone";
    return (
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (checked) setStep("build"); else checkAnswer(); }}>
        <div className="rounded-3xl border bg-card p-6 text-center space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Впиши форму</p>
          <p className="text-4xl font-bold tracking-tight">{verb.infinitive}</p>
          <p className="text-sm text-muted-foreground">{verb.ukrainian}</p>
          <p className="inline-block mt-2 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-lg font-semibold">
            {PERSON_LABEL[person]}
          </p>
        </div>

        <input ref={inputRef} value={answer} onChange={e => setAnswer(e.target.value)} disabled={checked}
          autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="done"
          aria-label={`${verb.infinitive}, ${PERSON_LABEL[person]}`} placeholder="…"
          className={`w-full h-14 rounded-2xl border-2 bg-background px-4 text-center text-xl font-medium outline-none focus:border-primary ${
            checked ? (formOk ? "swipe-counter-known" : "swipe-counter-unknown") : ""}`} />

        {checked && (
          <div className={`rounded-2xl border-2 p-3 text-center text-sm ${formOk ? "swipe-counter-known" : "swipe-counter-unknown"}`}>
            {formOk ? "Правильно!" : <>Правильно: <strong className="text-base">{expected}</strong></>}
            <span className="block text-xs opacity-80 mt-0.5">{KIND_LABEL[verb.kind]}</span>
          </div>
        )}

        <button ref={nextRef} type="submit" disabled={!checked && !answer.trim()}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all">
          {checked ? "Далі: речення →" : "Перевірити"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border bg-card p-6 text-center space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Склади речення · {verb.infinitive}, {PERSON_LABEL[person]}
        </p>
        <p className="text-xl font-semibold leading-snug">{sentence.uk}</p>
      </div>

      {/* Те, що вже поставлено; натисни слово, щоб повернути його вниз */}
      <div aria-label="Твоє речення"
        className={`min-h-[64px] flex flex-wrap gap-2 rounded-2xl border-2 p-3 ${
          step === "buildDone" ? (orderOk ? "swipe-counter-known" : "swipe-counter-unknown") : "border-dashed"}`}>
        {placed.map(i => (
          <button key={i} type="button" disabled={!building}
            onClick={() => setPlaced(p => p.filter(x => x !== i))}
            className="px-3 py-2 rounded-xl border bg-background text-foreground text-base font-medium active:scale-95 transition-all">
            {chips[i]}
          </button>
        ))}
        {placed.length === 0 && <span className="text-sm text-muted-foreground self-center">Натискай слова нижче по порядку</span>}
      </div>

      {building && (
        <div className="flex flex-wrap gap-2 justify-center min-h-[56px]">
          {free.map(i => (
            <button key={i} type="button" onClick={() => setPlaced(p => [...p, i])}
              className="px-3 py-2 rounded-xl border bg-muted/40 text-base font-medium hover:bg-accent/40 active:scale-95 transition-all">
              {chips[i]}
            </button>
          ))}
        </div>
      )}

      {step === "buildDone" && (
        <div className={`rounded-2xl border-2 p-3 text-center text-sm ${orderOk ? "swipe-counter-known" : "swipe-counter-unknown"}`}>
          {orderOk ? "Правильно!" : "Правильно:"} <strong className="text-base block mt-0.5">{sentence.es}</strong>
        </div>
      )}

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
    </div>
  );
}

function Summary({ results, items, byInfinitive, retryCount, onRetry, onMore }: {
  results: ItemResult[];
  items: Session["items"];
  byInfinitive: Map<string, ConjVerb>;
  retryCount: number;
  onRetry: () => void;
  onMore: () => void;
}) {
  const { forms, sentences, total } = tally(results);
  const perfect = retryCount === 0;
  return (
    <div className="space-y-5 py-2">
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

      <div className="space-y-2">
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
      </div>
    </div>
  );
}
