"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { checkOrder, shuffledChips } from "@/lib/conjugation/core";
import {
  buildSentenceSession, isSentenceSessionFinished, RULE_LABEL, restoreSentenceSession, SENTENCE_SESSION_SIZE,
  sentenceProgress, sentencesToRetry, type DeckSentence, type SentenceDeck, type SentenceSession,
} from "@/lib/sentences/core";
import { loadProgress, saveProgress } from "@/lib/flashcardProgress";
import { flushSentencesOutbox, queuedCorrectIds, submitSentenceAnswer } from "@/lib/sentencesOutbox";
import { AUTO_ADVANCE_MS, AutoBar, Body, Footer, Frame, ProgressMeter, WordBuilder } from "@/components/spanish/practice";

/**
 * «Речення»: по-українськи показано речення — склади його іспанською зі слів (натисни або перетягни),
 * на весь екран, як відмінювання. Правильне відкриває наступне саме (смужка), після помилки — кнопка «Далі».
 * Прогрес — частка УСІХ речень колоди, які вже складали правильно; кожна відповідь іде на сервер через чергу.
 */
export function SentencePractice({ deck, initialDone }: { deck: SentenceDeck; initialDone: string[] }) {
  const byId = useMemo(() => new Map(deck.sentences.map(s => [s.id, s])), [deck]);
  const storageKey = `sentences:${deck.id}`;
  // Вкладка малюється лише в браузері (після кліку), тож збережене читаємо одразу
  const [saved] = useState(() => restoreSentenceSession(loadProgress(storageKey), deck));
  // Недопройдену сесію можна продовжити з того ж речення; пройдену не показуємо знову — чекає «Почати»
  const [session, setSession] = useState<SentenceSession | null>(saved && !isSentenceSessionFinished(saved) ? saved : null);
  const [open, setOpen] = useState(false);
  /** Речення останньої сесії: наступна бере інші, поки вони є. */
  const [previous, setPrevious] = useState<Set<string>>(() => new Set(saved?.ids));
  useEffect(() => { if (session) saveProgress(storageKey, session); }, [session, storageKey]);

  /** Правильні відповіді: з сервера плюс ті, що ще чекають у черзі на телефоні. */
  const [correctIds, setCorrectIds] = useState<Set<string>>(() => new Set([...initialDone, ...queuedCorrectIds(deck.id)]));
  /** Нових правильних речень, зароблених у цій сесії (разом із повтором помилок). */
  const [gained, setGained] = useState(0);
  const progress = useMemo(() => sentenceProgress(correctIds, deck), [correctIds, deck]);
  useEffect(() => { void flushSentencesOutbox(); }, []);

  const answer = (id: string, correct: boolean) => {
    void submitSentenceAnswer(deck.id, { id, correct });
    if (!correct || correctIds.has(id)) return;
    setCorrectIds(prev => new Set(prev).add(id));
    setGained(g => g + 1);
  };

  const begin = () => {
    const seen = new Set([...previous, ...(session?.ids ?? [])]);
    setPrevious(seen);
    setSession(buildSentenceSession(deck, { avoid: seen, done: correctIds }));
    setGained(0);
    setOpen(true);
  };

  const resumable = session && !isSentenceSessionFinished(session) ? session : null;
  if (!open || !session) {
    return <Start resume={resumable && { index: resumable.index, total: resumable.ids.length }} progress={progress}
      onStart={begin} onResume={() => setOpen(true)} />;
  }

  const { ids, index, round } = session;
  const done = isSentenceSessionFinished(session);
  const record = (correct: boolean) => setSession(s => s && ({ ...s, index: s.index + 1, results: [...s.results, correct] }));

  return (
    <Frame label={round > 1 ? "повтор помилок" : "Речення"} counter={done ? undefined : `${index + 1} / ${ids.length}`}
      progress={Math.min(index, ids.length) / ids.length} onClose={() => setOpen(false)}>
      {done ? (
        <Summary session={session} byId={byId} progress={progress} gained={gained}
          onRetry={() => setSession(s => s && ({ round: s.round + 1, ids: sentencesToRetry(s), index: 0, results: [] }))}
          onMore={begin} />
      ) : (
        <Item key={`${round}-${index}`} sentence={byId.get(ids[index])!} last={index === ids.length - 1}
          onAnswer={correct => answer(ids[index], correct)} onDone={record} />
      )}
    </Frame>
  );
}

/** Початковий екран у темі: одна кнопка. Недопройдену сесію можна продовжити. */
function Start({ resume, progress, onStart, onResume }: {
  resume: { index: number; total: number } | null;
  progress: { done: number; total: number };
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <div className="rounded-3xl border bg-card p-6 text-center space-y-4">
      <p className="text-4xl">🧩</p>
      <div className="space-y-1">
        <p className="font-semibold text-lg">{SENTENCE_SESSION_SIZE} речень</p>
        <p className="text-sm text-muted-foreground">Склади речення зі слів і прийменників уроку.</p>
      </div>
      <ProgressMeter done={progress.done} total={progress.total} />
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

/** Одне речення: скласти зі слів. Правильне — наступне саме; помилка — кнопка «Далі». */
function Item({ sentence, last, onAnswer, onDone }: {
  sentence: DeckSentence;
  last: boolean;
  /** Відповідь дано: зараховуємо в прогрес одразу. */
  onAnswer: (correct: boolean) => void;
  onDone: (correct: boolean) => void;
}) {
  const [chips] = useState(() => shuffledChips(sentence));
  /** Номери слів (у `chips`) у тому порядку, як їх поставив користувач. */
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  /** Свіжий `onDone` для таймера: батько перемальовується, а відлік не має починатися заново. */
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  const check = () => {
    if (placed.length !== chips.length) return;
    const ok = checkOrder(placed.map(i => chips[i]), sentence);
    setResult(ok);
    onAnswer(ok);
  };

  // Правильно: за кілька секунд саме відкривається наступне. Кнопка «Далі» є лише після помилки
  useEffect(() => {
    if (result !== true) return;
    const timer = setTimeout(() => doneRef.current(true), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [result]);

  // Після помилки курсор — на «Далі», щоб працював Enter
  useEffect(() => { if (result === false) nextRef.current?.focus(); }, [result]);

  const rules = (sentence.tags ?? []).map(t => RULE_LABEL[t]);
  return (
    <>
      <Body>
        <div className="rounded-3xl border bg-card p-4 text-center space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Склади речення</p>
          <p className="text-xl font-semibold leading-snug">{sentence.uk}</p>
        </div>

        <WordBuilder chips={chips} placed={placed} onChange={setPlaced} locked={result !== null}
          tone={result === null ? "idle" : result ? "ok" : "wrong"} />

        {result !== null && (
          <div className={`rounded-2xl border-2 px-3 py-2 text-center text-sm ${result ? "swipe-counter-known" : "swipe-counter-unknown"}`}>
            {result ? "Правильно!" : "Правильно:"} <strong className="text-base block">{sentence.es}</strong>
            {rules.length > 0 && <span className="block text-xs opacity-80">{rules.join(" · ")}</span>}
          </div>
        )}
      </Body>

      <Footer>
        {result === null ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setPlaced([])} disabled={placed.length === 0}
              className="min-h-[52px] px-5 rounded-2xl border text-sm font-medium disabled:opacity-40 hover:bg-accent/40 active:scale-[0.98] transition-all">
              Скинути
            </button>
            <button type="button" onClick={check} disabled={placed.length !== chips.length}
              className="min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all">
              Перевірити
            </button>
          </div>
        ) : result ? (
          <div className="min-h-[52px] flex items-center"><AutoBar /></div>
        ) : (
          <button ref={nextRef} type="button" onClick={() => onDone(false)}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
            {last ? "До підсумку" : "Далі →"}
          </button>
        )}
      </Footer>
    </>
  );
}

function Summary({ session, byId, progress, gained, onRetry, onMore }: {
  session: SentenceSession;
  byId: Map<string, DeckSentence>;
  progress: { done: number; total: number };
  /** Нових правильних речень, зароблених у цій сесії. */
  gained: number;
  onRetry: () => void;
  onMore: () => void;
}) {
  const retry = sentencesToRetry(session);
  const right = session.results.filter(Boolean).length;
  const perfect = retry.length === 0;
  return (
    <>
      <Body>
        <div className="text-center space-y-1">
          <p className="text-4xl">{perfect ? "🎉" : "💪"}</p>
          <p className="font-semibold text-lg">{perfect ? "Усе правильно!" : "Прохід завершено"}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{right} з {session.ids.length} з першого разу</p>
        </div>

        <ProgressMeter done={progress.done} total={progress.total} gained={gained} />

        {!perfect && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">Де були помилки:</p>
            {session.ids.map((id, i) => session.results[i] === false && (
              <div key={id} className="rounded-xl border bg-muted/30 px-4 py-2.5 text-sm space-y-0.5">
                <p className="text-muted-foreground">{byId.get(id)!.uk}</p>
                <p className="font-medium">{byId.get(id)!.es}</p>
              </div>
            ))}
          </div>
        )}
      </Body>

      <Footer>
        {!perfect && (
          <button type="button" onClick={onRetry}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
            Ще раз помилки: {retry.length}
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
