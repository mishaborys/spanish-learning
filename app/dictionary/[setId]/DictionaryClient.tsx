"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { VocabSet, VocabGroup, VocabWord } from "./page";

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

// ─── Flashcard View ───────────────────────────────────────────────────────────

function FlashcardView({ group, onBack }: { group: VocabGroup; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [showList, setShowList] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const isTapRef = useRef(true);

  const word: VocabWord = group.words[index];
  const isFirst = index === 0;
  const isLast = index === group.words.length - 1;

  const goNext = () => {
    if (isLast) return;
    setFlipped(false);
    setDragX(0);
    setTimeout(() => setIndex(i => i + 1), 30);
  };

  const goPrev = () => {
    if (isFirst) return;
    setFlipped(false);
    setDragX(0);
    setTimeout(() => setIndex(i => i - 1), 30);
  };

  const speak = () => {
    if (!word || speaking) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word.spanish);
    u.lang = "es-ES"; u.rate = 0.8;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  // Swipe to navigate
  const commitSwipeRef = useRef<(right: boolean) => void>(() => {});
  const commitSwipe = (toRight: boolean) => {
    const target = toRight ? -(window.innerWidth + 200) : (window.innerWidth + 200);
    setAnimatingOut(true);
    setDragX(target);
    setTimeout(() => {
      setDragX(0);
      setAnimatingOut(false);
      setFlipped(false);
      setIndex(i => toRight ? Math.max(0, i - 1) : Math.min(group.words.length - 1, i + 1));
    }, 280);
  };
  commitSwipeRef.current = commitSwipe;

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    let startX = 0, startY = 0, curDx = 0, isH = false;
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      curDx = 0; isH = false; isTapRef.current = true;
    };
    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (!isH && Math.abs(dx) > 10) isH = Math.abs(dx) > dy * 0.5;
      if (isH) {
        e.preventDefault();
        curDx = dx;
        if (Math.abs(dx) > 15) isTapRef.current = false;
        setDragX(dx); setIsDragging(true);
      }
    };
    const onEnd = () => {
      setIsDragging(false);
      if (isTapRef.current || Math.abs(curDx) < 15) { setDragX(0); isH = false; return; }
      if (Math.abs(curDx) >= 80) commitSwipeRef.current(curDx > 0);
      else setDragX(0);
      isH = false;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  const rotation = dragX * 0.05;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← {group.emoji} {group.title}
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((index + 1) / group.words.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {index + 1} / {group.words.length}
        </span>
      </div>

      {/* Card */}
      <div ref={cardRef} className="relative select-none" style={{ minHeight: 320 }}
        onClick={() => { if (isTapRef.current) setFlipped(f => !f); }}>
        <div className="card-flip-container" style={{ minHeight: 320 }}>
          <div className="card-flip-inner cursor-pointer"
            style={{
              minHeight: 320,
              transform: `translateX(${dragX}px) rotate(${rotation}deg) rotateY(${flipped ? 180 : 0}deg)`,
              transition: isDragging ? "none" : animatingOut
                ? "transform 0.28s cubic-bezier(0.4,0,1,1)"
                : "transform 0.45s cubic-bezier(0.4,0,0.2,1)",
            }}>

            {/* Front */}
            <div className="card-flip-face rounded-3xl border bg-card flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 320 }}>
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full mb-4">дієслово</span>
              <span className="text-4xl font-bold tracking-tight">{word.spanish}</span>
              <span className="text-base text-muted-foreground mt-2 font-mono tracking-wide">{word.pronunciation}</span>
              <span className="text-xs text-muted-foreground mt-8 opacity-40">натисни щоб відкрити</span>
            </div>

            {/* Back */}
            <div className="card-flip-back card-flip-face rounded-3xl border bg-card flex flex-col items-center p-6 text-center" style={{ minHeight: 320 }}>
              <span className="text-lg font-semibold text-muted-foreground mt-2">{word.spanish}</span>
              <span className="text-sm text-muted-foreground/60 font-mono mt-0.5">{word.pronunciation}</span>
              <span className="text-3xl font-bold mt-3">{word.ukrainian}</span>

              {/* Sound association + example */}
              <div className="mt-auto w-full pt-4 border-t space-y-2">
                <div className="flex items-start gap-2 text-left bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-3">
                  <span className="shrink-0 mt-0.5 text-amber-500"><BulbIcon /></span>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Звукова асоціація</p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{word.sound_association}</p>
                  </div>
                </div>
                <div className="text-left bg-sky-50 dark:bg-sky-950/30 rounded-2xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-1">Приклад</p>
                  <p className="text-sm font-medium text-sky-900 dark:text-sky-100 italic">{word.example_es}</p>
                  <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">{word.example_uk}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nav buttons */}
      <div className="flex items-center gap-2">
        <button onClick={goPrev} disabled={isFirst}
          className={`flex-1 min-h-[52px] rounded-2xl border text-sm font-medium transition-all ${
            isFirst ? "opacity-30 cursor-not-allowed" : "hover:bg-accent/40 active:scale-[0.98]"
          }`}>
          ← Назад
        </button>
        <button onClick={speak} className="min-h-[52px] px-4 rounded-2xl border bg-muted/50 text-muted-foreground hover:bg-muted active:scale-[0.98] transition-all"
          style={{ opacity: speaking ? 0.6 : 1 }}>
          <SpeakerIcon />
        </button>
        <button onClick={goNext} disabled={isLast}
          className={`flex-1 min-h-[52px] rounded-2xl border text-sm font-medium transition-all ${
            isLast ? "opacity-30 cursor-not-allowed" : "hover:bg-accent/40 active:scale-[0.98]"
          }`}>
          Далі →
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground opacity-40">← свайп / →</p>

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
            {group.words.map((w, i) => (
              <button key={w.spanish} onClick={() => { setIndex(i); setFlipped(false); setShowList(false); }}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-accent/30 transition-colors ${i === index ? "bg-primary/5" : ""}`}>
                <span className={`text-xs font-mono w-5 shrink-0 ${i === index ? "text-primary font-bold" : "text-muted-foreground"}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{w.spanish}</p>
                  <p className="text-xs font-mono text-muted-foreground">{w.pronunciation}</p>
                </div>
                <p className="text-sm text-muted-foreground shrink-0">{w.ukrainian}</p>
              </button>
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
