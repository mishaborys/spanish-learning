"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { VocabSet, VocabGroup, VocabWord } from "./page";
import { SwipeCounters, SwipeFlipCard, type SwipeDir, type SwipeFlipCardHandle } from "@/components/spanish/SwipeFlipCard";

// ─── Icons ────────────────────────────────────────────────────────────────────

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

// ─── Group List ───────────────────────────────────────────────────────────────

function GroupList({ set, onSelect }: { set: VocabSet; onSelect: (g: VocabGroup) => void }) {
  const total = set.groups.reduce((s, g) => s + g.words.length, 0);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/dictionary" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Словник
        </Link>
        <h1 className="text-xl font-bold mt-2">{set.title}</h1>
        <p className="text-sm text-muted-foreground">{total} слів · {set.groups.length} груп</p>
      </div>

      <div className="space-y-2">
        {set.groups.map(g => (
          <button key={g.id} onClick={() => onSelect(g)}
            className="w-full text-left rounded-2xl border bg-card p-4 hover:bg-accent/30 transition-colors active:scale-[0.99]">
            <div className="flex items-center gap-3">
              <span className="text-2xl w-9 text-center">{g.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{g.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{g.words.length} слів</p>
              </div>
              <span className="text-muted-foreground text-sm shrink-0">→</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Flashcard View (сортування як у Quizlet) ──────────────────────────────────

type Sort = "know" | "learning";

function UndoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

function FlashcardView({ group, onBack }: { group: VocabGroup; onBack: () => void }) {
  // Раунд: слова, які зараз сортуємо. Після раунду можна продовжити з тими, що «ще вчу».
  const [round, setRound] = useState<VocabWord[]>(group.words);
  const [roundNo, setRoundNo] = useState(1);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Sort[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showList, setShowList] = useState(false);
  const [swipe, setSwipe] = useState<{ dir: SwipeDir | null; level: number }>({ dir: null, level: 0 });
  const cardRef = useRef<SwipeFlipCardHandle>(null);

  const word: VocabWord | undefined = round[index];
  const done = index >= round.length;
  const knowCount = results.filter(r => r === "know").length;
  const learningCount = results.length - knowCount;

  const speak = () => {
    if (!word || speaking) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word.spanish);
    u.lang = "es-ES"; u.rate = 0.8;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const sort = async (dir: SwipeDir) => {
    if (!word || busy) return;
    setBusy(true);
    await cardRef.current?.flyOut(dir);
    setResults(r => [...r, dir === "right" ? "know" : "learning"]);
    setFlipped(false);
    setIndex(i => i + 1);
    setBusy(false);
  };

  const undo = () => {
    if (busy || index === 0) return;
    setResults(r => r.slice(0, -1));
    setFlipped(false);
    setIndex(i => i - 1);
  };

  const startRound = (words: VocabWord[], no: number) => {
    setRound(words);
    setRoundNo(no);
    setIndex(0);
    setResults([]);
    setFlipped(false);
  };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate">
        ← {group.emoji} {group.title}
      </button>
      {roundNo > 1 && <span className="text-xs text-muted-foreground shrink-0">Раунд {roundNo}</span>}
    </div>
  );

  if (done) {
    const learning = round.filter((_, i) => results[i] === "learning");
    return (
      <div className="space-y-5">
        {header}
        <div className="text-center space-y-1 pt-4">
          <p className="text-4xl">{learning.length === 0 ? "🎉" : "💪"}</p>
          <p className="font-semibold text-lg">
            {learning.length === 0 ? "Усі слова знаєш!" : "Раунд завершено"}
          </p>
        </div>
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
        {learning.length > 0 && (
          <button onClick={() => startRound(learning, roundNo + 1)}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
            Вчити далі: {learning.length} {learning.length === 1 ? "слово" : "слів"}
          </button>
        )}
        <button onClick={() => startRound(group.words, 1)}
          className="w-full min-h-[52px] rounded-2xl border text-sm font-medium hover:bg-accent/40 active:scale-[0.98] transition-all">
          Почати спочатку
        </button>
        {index > 0 && (
          <button onClick={undo} className="w-full text-xs text-muted-foreground hover:text-foreground py-2">
            ↺ Повернути останню картку
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(index / round.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {index + 1} / {round.length}
        </span>
      </div>

      {/* Лічильники як у Quizlet: зліва «Ще вчу», справа «Знаю» */}
      <SwipeCounters edge left={{ count: learningCount }} right={{ count: knowCount }} progress={swipe} />

      {/* Картка на статичній колоді: тап — перевернути, свайп праворуч — «Знаю», ліворуч — «Ще вчу» */}
      <SwipeFlipCard
        key={`${roundNo}-${index}-${word!.spanish}`}
        ref={cardRef}
        stack={index + 1 < round.length}
        flipped={flipped}
        onFlip={() => setFlipped(f => !f)}
        canFlip={!busy}
        canSwipe={!busy}
        onSwipe={sort}
        onProgress={(dir, level) => setSwipe({ dir, level })}
        minHeight={380}
        front={
          <>
            <span className="text-4xl font-bold tracking-tight">{word!.spanish}</span>
            <span className="text-base text-muted-foreground mt-2 font-mono tracking-wide">{word!.pronunciation}</span>
          </>
        }
        back={
          <div className="flex flex-col items-center w-full">
            <span className="text-lg font-semibold text-muted-foreground">{word!.spanish}</span>
            <span className="text-sm text-muted-foreground/60 font-mono mt-0.5">{word!.pronunciation}</span>
            {word!.emoji && <span className="text-5xl mt-3">{word!.emoji}</span>}
            <span className="text-3xl font-bold mt-2">{word!.ukrainian}</span>
            <div className="mt-4 w-full pt-4 border-t space-y-2">
              {word!.sound_association && (
                <div className="flex items-start gap-2 text-left bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-3">
                  <span className="shrink-0 mt-0.5 text-amber-500"><BulbIcon /></span>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Звукова асоціація</p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{word!.sound_association}</p>
                  </div>
                </div>
              )}
              {word!.example_es && (
                <div className="text-left bg-sky-50 dark:bg-sky-950/30 rounded-2xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-1">Приклад</p>
                  <p className="text-sm font-medium text-sky-900 dark:text-sky-100 italic">{word!.example_es}</p>
                  <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">{word!.example_uk}</p>
                </div>
              )}
            </div>
          </div>
        }
      />

      {/* Нижня панель як у Quizlet: скасувати зліва, звук справа */}
      <div className="flex items-center justify-between px-6">
        <button onClick={undo} disabled={busy || index === 0} aria-label="Повернути попередню картку"
          className="p-3 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
          <UndoIcon />
        </button>
        <span className="text-xs text-muted-foreground opacity-60">← ще вчу · знаю →</span>
        <button onClick={speak} aria-label="Вимовити"
          className="p-3 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          style={{ opacity: speaking ? 0.6 : 1 }}>
          <SpeakerIcon />
        </button>
      </div>

      {/* Word list toggle */}
      <button onClick={() => setShowList(v => !v)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors py-2 flex items-center gap-1">
        {showList ? "Сховати список ▲" : "Показати всі слова ▼"}
      </button>
      {showList && (
        <div className="rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.emoji} {group.title}</p>
          </div>
          <div className="divide-y">
            {group.words.map(w => (
              <div key={w.spanish} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{w.spanish}</p>
                  <p className="text-xs font-mono text-muted-foreground">{w.pronunciation}</p>
                </div>
                <p className="text-sm text-muted-foreground shrink-0">{w.ukrainian}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DictionaryClient({ set }: { set: VocabSet }) {
  const [activeGroup, setActiveGroup] = useState<VocabGroup | null>(null);

  if (activeGroup) {
    return <FlashcardView group={activeGroup} onBack={() => setActiveGroup(null)} />;
  }
  return <GroupList set={set} onSelect={setActiveGroup} />;
}
