"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  answerKey, checkForm, checkOrder, insertIndex, isFinished, itemsToRetry, KIND_LABEL, moveWord, newSession,
  PERSON_LABEL, progressOf, restoreSession, SESSION_SIZE, shuffledChips, tally,
  type ConjVerb, type Item, type ItemResult, type Person, type Progress, type Session, type Step as AnswerStep,
} from "@/lib/conjugation/core";
import { loadProgress, saveProgress } from "@/lib/flashcardProgress";
import { flushConjugationOutbox, queuedCorrectKeys, submitAnswers } from "@/lib/conjugationOutbox";
import { useVisibleViewport } from "@/lib/useVisibleViewport";

const PROGRESS_KEY = "conjugation:presente";
/** Скільки показувати правильну форму, перш ніж саме перейти до речення. */
export const AUTO_ADVANCE_MS = 1800;

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

/**
 * Рамка на весь екран. Угорі ✕, лічильник і смужка; далі дві частини від вправи: `Body` (прокручується)
 * і `Footer` (закріплений знизу — поле вводу й кнопка). Клавіатура на iOS зсуває visual viewport,
 * тож рамка тримається рівно по видимій області: поле лишається над клавіатурою, зайвого зверху немає.
 */
function Frame({ label, counter, progress, onClose, children }: {
  label: string;
  counter?: string;
  progress: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const viewport = useVisibleViewport();
  return (
    <div className="fixed inset-0 z-50 bg-background"
      style={viewport ? { top: viewport.top, height: viewport.height, bottom: "auto" } : undefined}>
      <div className="h-full max-w-lg mx-auto flex flex-col px-4"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 12px)",
          // З клавіатурою нижній відступ під «домівку» не потрібен — вона закрита клавіатурою
          paddingBottom: viewport ? 12 : "max(env(safe-area-inset-bottom), 12px)",
        }}>
        <div className="flex items-center justify-between h-12 shrink-0">
          <button type="button" onClick={onClose} aria-label="Закрити вправу"
            className="h-10 w-10 rounded-full border flex items-center justify-center text-foreground hover:bg-accent/40 transition-colors">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
          <div className="text-center">
            {counter && <p className="text-sm font-semibold tabular-nums">{counter}</p>}
            <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
          </div>
          <div className="h-10 w-10" />
        </div>
        <div className="bg-muted rounded-full h-1 overflow-hidden shrink-0 mt-2">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Частина, що прокручується; вміст по центру, а коли не вміщається — прокручується від початку. */
function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <div className="min-h-full flex flex-col justify-center gap-3 py-2">{children}</div>
    </div>
  );
}

/** Закріплена знизу частина: поле вводу, кнопки. */
function Footer({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 space-y-2 pt-2">{children}</div>;
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
  return (
    <div className="space-y-2 text-left" data-progress>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">Прогрес</p>
        <p className="text-sm tabular-nums">
          <strong className="text-lg">{progress.percent}%</strong>
          <span className="text-muted-foreground"> · {progress.done} з {progress.total}</span>
        </p>
      </div>
      <div className="bg-muted rounded-full h-2 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        форми {progress.forms} / {progress.perStep} · речення {progress.sentences} / {progress.perStep}
        {gained ? <span className="text-primary font-medium"> · +{gained} у цій сесії</span> : null}
      </p>
    </div>
  );
}

/** Смужка, що заповнюється за `AUTO_ADVANCE_MS`: показує, що речення зараз відкриється (як у «Вписати»). */
function AutoBar() {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setWidth(100)));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div data-auto-bar className="h-0.5 w-full bg-muted rounded-full overflow-hidden">
      <div className="h-full bg-primary/60 rounded-full"
        style={{ width: `${width}%`, transition: width === 100 ? `width ${AUTO_ADVANCE_MS}ms linear` : "none" }} />
    </div>
  );
}

/** Слово, яке зараз тягнуть: звідки взяли, де палець, куди впаде. */
type Drag = {
  id: number;
  x: number; y: number;
  /** Зміщення пальця від лівого верхнього кута слова. */
  dx: number; dy: number;
  w: number; h: number;
  /** Місце в реченні (серед інших слів), куди впаде слово; `null` — палець поза реченням. */
  index: number | null;
};
const DRAG_THRESHOLD = 8;

/**
 * Речення, що складається, і слова під ним. Слово можна просто натиснути (піде в речення чи назад)
 * або перетягнути: з низу в потрібне місце речення, у реченні — на інше місце, а з речення вниз — прибрати.
 * Перетягування — на pointer-подіях, тож однаково працює і мишею, і пальцем.
 */
function WordBuilder({ chips, placed, onChange, locked, tone }: {
  chips: string[];
  placed: number[];
  onChange: (placed: number[]) => void;
  locked: boolean;
  tone: "idle" | "ok" | "wrong";
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  /** Свіжі значення для слухачів жесту: вони живуть довше за один рендер. */
  const latest = useRef({ placed, onChange });
  useEffect(() => { latest.current = { placed, onChange }; });
  /** Прибирає слухачів поточного жесту (якщо він іде). */
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  const free = chips.map((_, i) => i).filter(i => !placed.includes(i));

  /** Де в реченні опиниться слово, якщо відпустити в точці (x, y). */
  const slotAt = (x: number, y: number): number | null => {
    const zone = answerRef.current?.getBoundingClientRect();
    const pad = 12;
    if (!zone || x < zone.left - pad || x > zone.right + pad || y < zone.top - pad || y > zone.bottom + pad) return null;
    const rects = [...answerRef.current!.querySelectorAll<HTMLElement>("[data-chip]")].map(el => el.getBoundingClientRect());
    return insertIndex({ x, y }, rects);
  };

  const tap = (id: number) => {
    const { placed: now, onChange: change } = latest.current;
    change(now.includes(id) ? now.filter(x => x !== id) : [...now, id]);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: number) => {
    if (locked || (e.pointerType === "mouse" && e.button !== 0)) return;
    stopRef.current?.();
    const box = e.currentTarget.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, dx: e.clientX - box.left, dy: e.clientY - box.top, w: box.width, h: box.height };
    let dragging = false;

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
      dragging = true;
      setDrag({ id, x: ev.clientX, y: ev.clientY, dx: start.dx, dy: start.dy, w: start.w, h: start.h, index: slotAt(ev.clientX, ev.clientY) });
    };
    const finish = (ev: PointerEvent | null) => {
      stop();
      setDrag(null);
      if (!ev) return; // жест скасовано
      const { placed: now, onChange: change } = latest.current;
      if (!dragging) tap(id);
      else change(moveWord(now, id, slotAt(ev.clientX, ev.clientY)));
    };
    const up = (ev: PointerEvent) => finish(ev);
    const cancel = () => finish(null);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      stopRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    stopRef.current = stop;
  };

  // Клавіатура (Enter / пробіл на слові) дає click без координат; клік мишею чи пальцем уже оброблено на pointerup
  const onClick = (e: React.MouseEvent, id: number) => { if (!locked && e.detail === 0) tap(id); };

  const chipClass = "px-3 py-2 rounded-xl border text-base font-medium select-none touch-none transition-colors";
  const inSentence = placed.filter(id => id !== drag?.id);
  const over = drag?.index ?? null;
  const marker = <span key="marker" aria-hidden className="w-1 self-stretch min-h-9 rounded-full bg-primary" />;

  return (
    <>
      <div ref={answerRef} data-answer aria-label="Твоє речення"
        className={`min-h-[64px] flex flex-wrap items-center gap-2 rounded-2xl border-2 p-3 transition-colors ${
          tone === "ok" ? "swipe-counter-known" : tone === "wrong" ? "swipe-counter-unknown"
            : over !== null ? "border-primary bg-primary/5" : "border-dashed"}`}>
        {inSentence.map((id, pos) => (
          <span key={id} className="contents">
            {over === pos && marker}
            <button type="button" data-chip={id} disabled={locked}
              onPointerDown={e => onPointerDown(e, id)} onClick={e => onClick(e, id)}
              className={`${chipClass} bg-background text-foreground cursor-grab active:cursor-grabbing`}>
              {chips[id]}
            </button>
          </span>
        ))}
        {over === inSentence.length && marker}
        {inSentence.length === 0 && over === null && (
          <span className="text-sm text-muted-foreground self-center">Натискай слова нижче або перетягуй сюди</span>
        )}
      </div>

      {!locked && (
        <div data-pool className="flex flex-wrap gap-2 justify-center min-h-[56px]">
          {free.map(id => (
            <button key={id} type="button" onPointerDown={e => onPointerDown(e, id)} onClick={e => onClick(e, id)}
              className={`${chipClass} bg-muted/40 hover:bg-accent/40 cursor-grab active:cursor-grabbing ${drag?.id === id ? "invisible" : ""}`}>
              {chips[id]}
            </button>
          ))}
        </div>
      )}

      {/* Слово під пальцем */}
      {drag && (
        <div aria-hidden className={`${chipClass} fixed z-[70] pointer-events-none bg-background text-foreground shadow-lg border-primary scale-105 flex items-center`}
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w, height: drag.h }}>
          {chips[drag.id]}
        </div>
      )}
    </>
  );
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
