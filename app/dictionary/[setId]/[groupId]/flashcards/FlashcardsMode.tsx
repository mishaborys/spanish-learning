"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { VocabGroup, VocabWord } from "@/lib/vocabulary";
import { setFlashcardSettings, useFlashcardSettings, type FlashcardSettings } from "@/lib/flashcardSettings";
import { speakSpanish, speakUkrainian } from "@/lib/speak";
import { SwipeCounters, SwipeFlipCard, type SwipeDir, type SwipeFlipCardHandle } from "@/components/spanish/SwipeFlipCard";
import { SpeakerIcon, WordNotes } from "@/components/spanish/WordNotes";
import { ExitLink } from "@/components/spanish/ExitLink";
import { clearProgress, deckFromKeys, loadProgress, saveProgress, validIndex } from "@/lib/flashcardProgress";

/**
 * Флешкартки групи на весь екран, як у Quizlet: хрестик, лічильник, шестерня.
 * Із сортуванням — «Знаю / Ще вчу» з раундами; без — просте гортання в обидва боки.
 */
export function FlashcardsMode({ group, exitHref, progressKey }: { group: VocabGroup; exitHref: string; progressKey: string }) {
  return (
    <FlashcardsShell exitHref={exitHref} progressKey={progressKey} empty={group.words.length === 0}
      round={(settings, paused, onOpenSettings) => (
        <Round words={group.words} settings={settings} exitHref={exitHref} progressKey={progressKey}
          paused={paused} onOpenSettings={onOpenSettings} />
      )} />
  );
}

/**
 * Рамка флешкарток на весь екран із налаштуваннями. `round` малює сам раунд; він починається заново
 * («Почати спочатку», зміна перемішування чи сортування) — через новий key.
 * `progressKey` — де збережено, на якій картці зупинився (`lib/flashcardProgress.ts`).
 */
export function FlashcardsShell({ exitHref, exitLabel = "До групи", progressKey, empty, round }: {
  exitHref: string;
  exitLabel?: string;
  progressKey: string;
  empty: boolean;
  round: (settings: FlashcardSettings, paused: boolean, onOpenSettings: () => void) => React.ReactNode;
}) {
  const settings = useFlashcardSettings(); // null, поки сторінка не ожила в браузері
  const [run, setRun] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="h-full max-w-lg mx-auto flex flex-col px-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)", paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        {settings && empty && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
            <p>Тут ще немає слів.</p>
            <ExitLink href={exitHref} className="underline">{exitLabel}</ExitLink>
          </div>
        )}
        {settings && !empty && (
          // Перемішування й сортування міняють сам раунд — починаємо його заново
          <Fragment key={`${run}-${settings.shuffle}-${settings.sorting}`}>
            {round(settings, showSettings, () => setShowSettings(true))}
          </Fragment>
        )}
      </div>
      {settings && showSettings && (
        <SettingsSheet settings={settings}
          onClose={() => setShowSettings(false)}
          onRestart={() => { clearProgress(progressKey); setRun(r => r + 1); setShowSettings(false); }} />
      )}
    </div>
  );
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Sort = "know" | "learning";

/** Збережений раунд: колода — іспанськими словами; з іншим перемішуванням чи сортуванням недійсний. */
type SavedRound = { sorting: boolean; shuffle: boolean; deck: string[]; roundNo: number; index: number; results: Sort[] };

/** Раунд, на якому зупинився, — якщо він ще відповідає словам і налаштуванням. */
function restoreRound(key: string, words: VocabWord[], sorting: boolean, shuffle: boolean) {
  const saved = loadProgress<Partial<SavedRound>>(key);
  if (!saved || saved.sorting !== sorting || saved.shuffle !== shuffle) return null;
  const deck = deckFromKeys(saved.deck, words, w => w.spanish);
  const { roundNo, index, results } = saved;
  if (!deck || deck.length === 0 || !Number.isInteger(roundNo) || roundNo! < 1) return null;
  // Перший раунд — уся група: якщо слів додали, починаємо заново
  if (roundNo === 1 && deck.length !== words.length) return null;
  if (!validIndex(index, deck.length) || !Array.isArray(results)) return null;
  if (results.length !== (sorting ? index : 0) || results.some(r => r !== "know" && r !== "learning")) return null;
  return { deck, roundNo: roundNo!, index, results };
}

export function Round({ words, settings, exitHref, exitLabel = "До групи", progressKey, paused, onOpenSettings }: {
  words: VocabWord[];
  settings: FlashcardSettings;
  exitHref: string;
  exitLabel?: string;
  progressKey: string;
  /** Відкриті налаштування: клавіатура не має керувати карткою під ними. */
  paused: boolean;
  onOpenSettings: () => void;
}) {
  const { sorting, shuffle, front } = settings;
  // Раунд малюється лише в браузері (налаштування з localStorage), тож читати збережене тут безпечно
  const [initial] = useState(() => restoreRound(progressKey, words, sorting, shuffle)
    ?? { deck: shuffle ? shuffled(words) : words, roundNo: 1, index: 0, results: [] as Sort[] });
  const [deck, setDeck] = useState<VocabWord[]>(initial.deck);
  const [roundNo, setRoundNo] = useState(initial.roundNo);
  const [index, setIndex] = useState(initial.index);
  const [results, setResults] = useState<Sort[]>(initial.results);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [swipe, setSwipe] = useState<{ dir: SwipeDir | null; level: number }>({ dir: null, level: 0 });
  const cardRef = useRef<SwipeFlipCardHandle>(null);

  const word: VocabWord | undefined = deck[index];
  const done = index >= deck.length;
  const knowCount = results.filter(r => r === "know").length;
  const learningCount = results.length - knowCount;

  // Запам'ятати, де зупинився
  useEffect(() => {
    const saved: SavedRound = { sorting, shuffle, deck: deck.map(w => w.spanish), roundNo, index, results };
    saveProgress(progressKey, saved);
  }, [progressKey, sorting, shuffle, deck, roundNo, index, results]);

  const startRound = (next: VocabWord[], no: number) => {
    setDeck(next);
    setRoundNo(no);
    setIndex(0);
    setResults([]);
    setFlipped(false);
  };

  /** Свайп: із сортуванням — оцінка; без — ліворуч наступна, праворуч попередня. */
  const onSwipe = async (dir: SwipeDir) => {
    if (!word || busy) return;
    if (!sorting && dir === "right" && index === 0) {
      void cardRef.current?.reset(); // перед першою карткою нічого немає
      return;
    }
    setBusy(true);
    await cardRef.current?.flyOut(dir);
    if (sorting) setResults(r => [...r, dir === "right" ? "know" : "learning"]);
    setFlipped(false);
    setIndex(i => (sorting || dir === "left" ? i + 1 : i - 1));
    setBusy(false);
  };

  /** Крок назад: із сортуванням скасовує останню оцінку. */
  const back = () => {
    if (busy || index === 0) return;
    if (sorting) setResults(r => r.slice(0, -1));
    setFlipped(false);
    setIndex(i => i - 1);
  };

  // Клавіатура на комп'ютері. Із сортуванням ← → — як свайп («ще вчу» / «знаю»);
  // без сортування → наступна, ← попередня. Пробіл — перевернути.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (done || paused || busy || e.repeat || target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") void onSwipe(sorting ? "left" : "right");
      else if (e.key === "ArrowRight") void onSwipe(sorting ? "right" : "left");
      // На кнопці чи самій картці пробіл уже має свою дію
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
        {roundNo > 1 && <p className="text-[10px] text-muted-foreground leading-none">раунд {roundNo}</p>}
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
    const learning = deck.filter((_, i) => results[i] === "learning");
    const allKnown = sorting && learning.length === 0;
    return (
      <>
        {topBar}
        {progress}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center gap-5 py-6">
          <div className="text-center space-y-1">
            <p className="text-4xl">{!sorting ? "✅" : allKnown ? "🎉" : "💪"}</p>
            <p className="font-semibold text-lg">
              {!sorting ? "Усі картки переглянуто" : allKnown ? "Усі слова знаєш!" : "Раунд завершено"}
            </p>
          </div>
          {sorting && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border p-3 text-center swipe-counter-known">
                <p className="text-2xl font-bold tabular-nums">{knowCount}</p>
                <p className="text-xs">Знаю</p>
              </div>
              <div className="rounded-2xl border p-3 text-center swipe-counter-unknown">
                <p className="text-2xl font-bold tabular-nums">{learningCount}</p>
                <p className="text-xs">Ще вчу</p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {sorting && learning.length > 0 && (
              <button type="button" onClick={() => startRound(learning, roundNo + 1)}
                className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
                Вчити далі: {learning.length} {learning.length === 1 ? "слово" : "слів"}
              </button>
            )}
            <button type="button" onClick={() => startRound(shuffle ? shuffled(words) : words, 1)}
              className="w-full min-h-[52px] rounded-2xl border text-sm font-medium hover:bg-accent/40 active:scale-[0.98] transition-all">
              Почати спочатку
            </button>
            <ExitLink href={exitHref}
              className="w-full min-h-[52px] rounded-2xl border text-sm font-medium flex items-center justify-center hover:bg-accent/40 active:scale-[0.98] transition-all">
              {exitLabel}
            </ExitLink>
            {index > 0 && (
              <button type="button" onClick={back} className="w-full text-xs text-muted-foreground hover:text-foreground py-2">
                ↺ Повернути останню картку
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  // Який бік картки зараз видно: лицьовий — за налаштуванням, після перевертання — інший
  const spanishVisible = (front === "es") !== flipped;
  const es = (
    <>
      <span className="text-4xl font-bold tracking-tight">{word!.spanish}</span>
      <span className="text-base text-muted-foreground mt-2 font-mono tracking-wide">{word!.pronunciation}</span>
    </>
  );
  const uk = (
    <>
      {word!.emoji && <span className="text-5xl mb-3">{word!.emoji}</span>}
      <span className="text-3xl font-bold">{word!.ukrainian}</span>
    </>
  );

  return (
    <>
      {topBar}
      {progress}

      {/* Лічильники «Ще вчу» / «Знаю»; без сортування місце лишається, щоб картка не стрибала */}
      <div className="shrink-0 mt-3 h-10">
        {sorting && <SwipeCounters edge left={{ count: learningCount }} right={{ count: knowCount }} progress={swipe} />}
      </div>

      {/* Картка фіксованого розміру: займає все вільне місце, довгий зворот прокручується всередині */}
      <div className="flex-1 min-h-0 py-3">
        <SwipeFlipCard
          key={`${roundNo}-${index}-${word!.spanish}`}
          ref={cardRef}
          fill
          plain={!sorting}
          stack={index + 1 < deck.length}
          flipped={flipped}
          onFlip={() => setFlipped(f => !f)}
          canFlip={!busy}
          canSwipe={!busy}
          onSwipe={onSwipe}
          onProgress={(dir, level) => setSwipe({ dir, level })}
          front={front === "es" ? es : uk}
          back={
            <>
              {front === "es" ? uk : es}
              <WordNotes word={word!} className="mt-5 w-full pt-4 border-t" />
            </>
          }
        />
      </div>

      {/* Нижня панель як у Quizlet: назад зліва, звук справа */}
      <div className="flex items-center justify-between px-4 h-12 shrink-0">
        <button type="button" onClick={back} disabled={busy || index === 0}
          aria-label={sorting ? "Скасувати останню оцінку" : "Попередня картка"}
          className="p-3 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
          <UndoIcon />
        </button>
        <span className="text-xs text-muted-foreground opacity-60">
          {sorting ? "← ще вчу · знаю →" : "← наступна · попередня →"}
        </span>
        {/* Звук — того боку, який зараз видно: інакше з українського боку він підказував би іспанське слово */}
        <button type="button"
          onClick={() => (spanishVisible ? speakSpanish(word!.spanish) : speakUkrainian(word!.ukrainian))}
          aria-label={spanishVisible ? "Вимовити іспанське слово" : "Вимовити переклад"}
          className="p-3 rounded-full text-muted-foreground hover:text-foreground transition-colors">
          <SpeakerIcon />
        </button>
      </div>
    </>
  );
}

// ─── Налаштування ─────────────────────────────────────────────────────────────

function SettingsSheet({ settings, onClose, onRestart }: {
  settings: FlashcardSettings;
  onClose: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Налаштування флешкарток">
      <button type="button" aria-label="Закрити налаштування" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-background border-t p-5 space-y-5"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Налаштування</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Готово</button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Лицьовий бік</p>
          <div className="flex rounded-2xl bg-muted p-1 gap-1">
            {([["es", "Іспанська"], ["uk", "Українська"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFlashcardSettings({ front: value })}
                aria-pressed={settings.front === value}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  settings.front === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <Toggle label="Перемішати картки" hint="Вимкнено — порядок як у списку"
          checked={settings.shuffle} onChange={v => setFlashcardSettings({ shuffle: v })} />
        <Toggle label="Сортування" hint="«Знаю / Ще вчу»; вимкнено — просте гортання"
          checked={settings.sorting} onChange={v => setFlashcardSettings({ sorting: v })} />

        <button type="button" onClick={onRestart}
          className="w-full min-h-[48px] rounded-2xl border text-sm font-medium hover:bg-accent/40 active:scale-[0.98] transition-all">
          Почати спочатку
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 text-left">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className={`shrink-0 h-7 w-12 rounded-full p-0.5 transition-colors ${checked ? "bg-primary" : "bg-muted"}`}>
        <span className={`block h-6 w-6 rounded-full bg-background shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

// ─── Іконки ───────────────────────────────────────────────────────────────────

const stroke = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function CloseIcon() {
  return <svg {...stroke}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
}

export function UndoIcon() {
  return <svg {...stroke}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>;
}

export function GearIcon() {
  return (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
