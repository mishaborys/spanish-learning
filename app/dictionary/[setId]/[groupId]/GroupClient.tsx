"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { wordKey } from "@/lib/review/core";
import { groupProgress, type Stage } from "@/lib/learn/core";
import type { VocabGroup, VocabWord } from "@/lib/vocabulary";
import { DEFAULT_FLASHCARD_SETTINGS, useFlashcardSettings } from "@/lib/flashcardSettings";
import { speakSpanish } from "@/lib/speak";
import { SpeakerIcon, WordNotes } from "@/components/spanish/WordNotes";

/** Статус слова веде тільки Learn. */
const STATUS_ORDER: Stage[] = ["learning", "new", "mastered"];
const STATUS_LABEL: Record<Stage, string> = { learning: "Ще вчу", new: "Не вивчав", mastered: "Вивчено" };
const STATUS_DOT: Record<Stage, string> = {
  learning: "bg-[#FF983A]",
  new: "bg-muted-foreground/30",
  mastered: "bg-[#18AE79]",
};

type Props = {
  group: VocabGroup;
  setTitle: string;
  groupHref: string;
  backHref: string;
  backLabel: string;
  /** Етапи Learn за ключем слова; null — база недоступна. */
  stages: Record<string, Stage> | null;
  /** Область прогресу Learn ('' або 'all:<набір>'). */
  scope: string;
};

export function GroupClient({ group, setTitle, groupHref, backHref, backLabel, stages, scope }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = stages ?? {};
  const statusOf = (w: VocabWord): Stage => known[wordKey(w.spanish)] ?? "new";
  const keys = [...new Set(group.words.map(w => wordKey(w.spanish)))];
  const progress = groupProgress(keys, known);
  const mastered = progress.mastered;

  const resetProgress = async () => {
    setMenuOpen(false);
    if (!confirm(`Скинути прогрес Learn для «${group.title}»? Усі ${keys.length} слів стануть «не вивчав».`)) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", scope, keys }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Не вдалося скинути прогрес");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate">
          ← {backLabel}
        </Link>
        {stages && (
          <div className="relative shrink-0">
            <button type="button" onClick={() => setMenuOpen(v => !v)} aria-label="Ще дії" aria-expanded={menuOpen}
              className="h-9 w-9 rounded-full border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors">
              <DotsIcon />
            </button>
            {menuOpen && (
              <>
                <button type="button" aria-label="Закрити меню" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-10 cursor-default" />
                <div className="absolute right-0 top-11 z-20 w-56 rounded-2xl border bg-background shadow-lg p-1">
                  <button type="button" onClick={resetProgress} disabled={resetting || mastered + progress.learning === 0}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:hover:bg-transparent">
                    Скинути прогрес
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <PreviewCarousel words={group.words} />

      <div>
        <h1 className="text-xl font-bold">{group.emoji} {group.title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{setTitle} · {group.words.length} слів</p>
      </div>

      {/* Режими */}
      <div className="space-y-2">
        <ModeButton href={`${groupHref}/flashcards`} icon={<CardsIcon />} label="Flashcards" />
        <ModeButton href={stages ? `${groupHref}/learn` : undefined} icon={<LearnIcon />} label="Learn"
          note={!stages ? "немає зв'язку з базою" : progress.done ? "усе вивчено ✓" : `вивчено ${mastered} з ${progress.total}`} />
        <ModeButton icon={<BlastIcon />} label="Blast" note="скоро" />
      </div>

      {/* Прогрес */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Прогрес</span>
          <span className="tabular-nums">вивчено {mastered} з {group.words.length}</span>
        </div>
        <div className="bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-full rounded-full bg-[#18AE79] transition-all duration-300"
            style={{ width: `${(mastered / Math.max(group.words.length, 1)) * 100}%` }} />
        </div>
      </div>

      {/* Список слів, згрупований за статусом */}
      {STATUS_ORDER.map(status => {
        const words = group.words.filter(w => statusOf(w) === status);
        if (words.length === 0) return null;
        return (
          <section key={status} className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
              {STATUS_LABEL[status]} · {words.length}
            </h2>
            <div className="rounded-2xl border bg-card divide-y overflow-hidden">
              {words.map(w => <WordRow key={w.spanish} word={w} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Карусель-прев'ю ──────────────────────────────────────────────────────────

/** Картки групи: гортаються свайпом, тап перевертає. Порядок — як у списку. */
function PreviewCarousel({ words }: { words: VocabWord[] }) {
  const front = (useFlashcardSettings() ?? DEFAULT_FLASHCARD_SETTINGS).front;
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    // Крок між картками = ширина картки + проміжок (не ширина контейнера: у нього є бічні відступи)
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0") : el.clientWidth;
    setActive(Math.max(0, Math.min(words.length - 1, Math.round(el.scrollLeft / step))));
  };

  return (
    <div className="space-y-3">
      <div ref={scroller} onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory -mx-4 px-4 gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {words.map(w => <PreviewCard key={w.spanish} word={w} front={front} />)}
      </div>
      {words.length <= 14 ? (
        <div className="flex justify-center gap-1.5" aria-hidden>
          {words.map((w, i) => (
            <span key={w.spanish}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${i === active ? "bg-foreground" : "bg-muted-foreground/30"}`} />
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground tabular-nums">{active + 1} / {words.length}</p>
      )}
    </div>
  );
}

function PreviewCard({ word, front }: { word: VocabWord; front: "es" | "uk" }) {
  const [flipped, setFlipped] = useState(false);
  const es = (
    <>
      <span className="text-3xl font-bold tracking-tight">{word.spanish}</span>
      <span className="text-sm text-muted-foreground mt-1.5 font-mono">{word.pronunciation}</span>
    </>
  );
  const uk = (
    <>
      {word.emoji && <span className="text-4xl mb-2">{word.emoji}</span>}
      <span className="text-2xl font-bold">{word.ukrainian}</span>
    </>
  );
  const face = "absolute inset-0 rounded-3xl border bg-card flex flex-col items-center justify-center p-6 text-center break-words";
  const hidden = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" } as const;
  return (
    <button type="button" onClick={() => setFlipped(f => !f)}
      aria-label={`Картка «${word.spanish}»: перевернути`}
      className="snap-center shrink-0 w-full h-52" style={{ perspective: 864 }}>
      <div className="relative h-full w-full"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateY(${flipped ? 180 : 0}deg)`,
          transition: "transform 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
        <div className={face} style={hidden}>{front === "es" ? es : uk}</div>
        <div className={face} style={{ ...hidden, transform: "rotateY(180deg)" }}>{front === "es" ? uk : es}</div>
      </div>
    </button>
  );
}

// ─── Кнопки режимів ───────────────────────────────────────────────────────────

function ModeButton({ href, icon, label, note }: { href?: string; icon: React.ReactNode; label: string; note?: string }) {
  const body = (
    <>
      <span className="shrink-0 text-primary">{icon}</span>
      <span className="flex-1 font-semibold text-sm text-left">{label}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </>
  );
  const cls = "w-full flex items-center gap-3 rounded-2xl border bg-card px-4 min-h-[56px]";
  if (!href) return <div aria-disabled className={`${cls} opacity-50`}>{body}</div>;
  return (
    <Link href={href} className={`${cls} hover:bg-accent/30 transition-colors active:scale-[0.99]`}>
      {body}
    </Link>
  );
}

const iconProps = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4" width="14" height="12" rx="2.5" />
      <path d="M7 20h11a3 3 0 0 0 3-3V9" />
    </svg>
  );
}

function LearnIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

function BlastIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.1 2.1 0 0 0-2.9-.1z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z" />
      <path d="M9 12H4s.5-3 2-4c1.6-1.1 5 0 5 0" />
      <path d="M12 15v5s3-.5 4-2c1.1-1.6 0-5 0-5" />
    </svg>
  );
}

// ─── Рядок слова ──────────────────────────────────────────────────────────────

function WordRow({ word }: { word: VocabWord }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(word.sound_association || word.example_es);
  return (
    <div>
      <div className="flex items-center gap-2 pr-2">
        <button type="button" onClick={() => setOpen(v => !v)} disabled={!hasDetails} aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{word.spanish}</p>
            <p className="text-xs font-mono text-muted-foreground">{word.pronunciation}</p>
          </div>
          <p className="text-sm text-muted-foreground text-right max-w-[45%]">
            {word.emoji && <span className="mr-1">{word.emoji}</span>}{word.ukrainian}
          </p>
        </button>
        <button type="button" onClick={() => speakSpanish(word.spanish)} aria-label={`Вимовити «${word.spanish}»`}
          className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors">
          <SpeakerIcon />
        </button>
      </div>
      {open && <WordNotes word={word} className="px-4 pb-3" />}
    </div>
  );
}
