"use client";

import { useEffect, useRef, useState } from "react";
import { insertIndex, moveWord } from "@/lib/conjugation/core";
import { useVisibleViewport } from "@/lib/useVisibleViewport";

// Спільні частини вправ «склади речення зі слів» (Відмінювання, Речення): повноекранна рамка,
// закріплений низ, речення з перетягуванням слів, смужка автопереходу і загальний прогрес.

/** Скільки показувати правильну відповідь, перш ніж саме перейти далі. */
export const AUTO_ADVANCE_MS = 1800;

/**
 * Рамка на весь екран. Угорі ✕, лічильник і смужка; далі дві частини від вправи: `Body` (прокручується)
 * і `Footer` (закріплений знизу — поле вводу й кнопка). Клавіатура на iOS зсуває visual viewport,
 * тож рамка тримається рівно по видимій області: поле лишається над клавіатурою, зайвого зверху немає.
 */
export function Frame({ label, counter, progress, onClose, children }: {
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
export function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <div className="min-h-full flex flex-col justify-center gap-3 py-2">{children}</div>
    </div>
  );
}

/** Закріплена знизу частина: поле вводу, кнопки. */
export function Footer({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 space-y-2 pt-2">{children}</div>;
}

/** Смужка, що заповнюється за `AUTO_ADVANCE_MS`: показує, що речення зараз відкриється (як у «Вписати»). */
export function AutoBar() {
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
export function WordBuilder({ chips, placed, onChange, locked, tone }: {
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

/** Загальний прогрес: смужка, відсоток і «N з M»; `detail` — рядок під смужкою, `gained` — «+N у цій сесії». */
export function ProgressMeter({ done, total, detail, gained }: { done: number; total: number; detail?: string; gained?: number }) {
  return (
    <div className="space-y-2 text-left" data-progress>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">Прогрес</p>
        <p className="text-sm tabular-nums">
          <strong className="text-lg">{total ? Math.floor((done / total) * 100) : 0}%</strong>
          <span className="text-muted-foreground"> · {done} з {total}</span>
        </p>
      </div>
      <div className="bg-muted rounded-full h-2 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      {(detail || gained) ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {detail}
          {gained ? <span className="text-primary font-medium">{detail ? " · " : ""}+{gained} у цій сесії</span> : null}
        </p>
      ) : null}
    </div>
  );
}
