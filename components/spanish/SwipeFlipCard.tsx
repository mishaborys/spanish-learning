"use client";

import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";

/**
 * Картка з анімаціями як у Quizlet (Android 10.60, з декомпільованого коду):
 *
 * Перевертання — кут 0° → 180° навколо осі Y, tween 400 мс, FastOutSlowIn,
 * cameraDistance 12·density (≈ perspective 864px). До 90° видно лицьовий бік, після — зворотний.
 *
 * Свайп — картка йде за пальцем по X і Y, нахил = x · 8° / ширину.
 * Відпустив далі ніж 0.21·W/2 → картка відлітає до x = ±2W за 350 мс; інакше вертається за 300 мс.
 * Підсвітка «знаю / не знаю» росте як |x| / (0.35·W).
 */

export type SwipeDir = "left" | "right";
export type CardTint = "known" | "hesitant" | "unknown";

export type SwipeFlipCardHandle = {
  /** Відправити картку за край. Promise завершується, коли анімація закінчилась. */
  flyOut: (dir: SwipeDir, tint?: CardTint) => Promise<void>;
  /** Повернути картку на місце (наприклад, якщо збереження не вдалося). */
  reset: () => Promise<void>;
};

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)"; // FastOutSlowInEasing
const FLIP_MS = 400;
const FLY_OUT_MS = 350;
const SNAP_BACK_MS = 300;
const THRESHOLD = 0.21;     // частка ширини; спрацьовує на половині
const MAX_TILT_DEG = 8;     // нахил на зсуві в одну ширину
const TINT_FULL_AT = 0.35;  // підсвітка максимальна на 0.35·W
const TAP_SLOP = 8;         // px — менше вважаємо тапом

const TINT: Record<CardTint, { label: string; ring: string; text: string }> = {
  known: { label: "Знаю", ring: "ring-emerald-500", text: "text-emerald-600 dark:text-emerald-400 border-emerald-500" },
  hesitant: { label: "Вагався", ring: "ring-amber-500", text: "text-amber-600 dark:text-amber-400 border-amber-500" },
  unknown: { label: "Не знаю", ring: "ring-red-500", text: "text-red-600 dark:text-red-400 border-red-500" },
};

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Props = {
  front: ReactNode;
  back: ReactNode;
  /** Що видно під карткою, коли вона відлітає (зазвичай — лицьовий бік наступної). */
  under?: ReactNode;
  flipped: boolean;
  onFlip?: () => void;
  canFlip?: boolean;
  /** Свайп за поріг. Сама картка не відлітає — батько вирішує й викликає flyOut або reset. */
  onSwipe?: (dir: SwipeDir) => void;
  canSwipe?: boolean;
  /** Як підсвічувати свайп праворуч / ліворуч. */
  tintRight?: CardTint;
  tintLeft?: CardTint;
  minHeight?: number;
  ref?: Ref<SwipeFlipCardHandle>;
};

/** w — ширина картки на момент руху (для нахилу). */
type Motion = { x: number; y: number; w: number; ms: number; tint: CardTint | null; tintLevel: number };

const REST: Motion = { x: 0, y: 0, w: 1, ms: 0, tint: null, tintLevel: 0 };

export function SwipeFlipCard({
  front, back, under, flipped, onFlip, canFlip = true, onSwipe, canSwipe = true,
  tintRight = "known", tintLeft = "unknown", minHeight = 280, ref,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Motion>(REST);
  const drag = useRef<{ id: number; sx: number; sy: number; active: boolean } | null>(null);
  const locked = useRef(false); // під час відльоту/повернення нічого не приймаємо

  const width = () => elRef.current?.offsetWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
  const dur = (ms: number) => (reducedMotion() ? 0 : ms);
  const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const tintFor = (x: number): CardTint | null => (x > 0 ? tintRight : x < 0 ? tintLeft : null);

  const flyOut = async (dir: SwipeDir, tint?: CardTint) => {
    locked.current = true;
    const w = width();
    const distance = Math.max(2 * w, window.innerWidth); // ±2W, але точно за край екрана
    const ms = dur(FLY_OUT_MS);
    setM(prev => ({
      x: dir === "right" ? distance : -distance,
      y: prev.y,
      w,
      ms,
      tint: tint ?? (dir === "right" ? tintRight : tintLeft),
      tintLevel: 1,
    }));
    await wait(ms);
  };

  const reset = async () => {
    const ms = dur(SNAP_BACK_MS);
    setM(prev => ({ ...REST, w: prev.w, ms }));
    await wait(ms);
    locked.current = false;
  };

  useImperativeHandle(ref, () => ({ flyOut, reset }));

  const snapBack = () => {
    locked.current = true;
    void reset();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (locked.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, active: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || locked.current) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.active) {
      if (Math.hypot(dx, dy) < TAP_SLOP) return;
      d.active = true;
      elRef.current?.setPointerCapture(e.pointerId);
    }
    const w = width();
    const level = Math.min(Math.abs(dx) / (TINT_FULL_AT * w), 1);
    setM({ x: dx, y: dy, w, ms: 0, tint: tintFor(dx), tintLevel: level });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) {
      if (canFlip && onFlip && !locked.current) onFlip();
      return;
    }
    const x = e.clientX - d.sx;
    if (canSwipe && onSwipe && Math.abs(x) > (THRESHOLD * width()) / 2) {
      locked.current = true;
      onSwipe(x > 0 ? "right" : "left");
    } else {
      snapBack();
    }
  };

  const onPointerCancel = () => {
    if (drag.current?.active) snapBack();
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && canFlip && onFlip && !locked.current) {
      e.preventDefault();
      onFlip();
    }
  };

  const tilt = (m.x * MAX_TILT_DEG) / m.w;
  const tint = m.tint ? TINT[m.tint] : null;
  const faceClass = "card-face rounded-3xl border bg-card flex flex-col items-center justify-center p-6 text-center";

  return (
    <div className="relative" style={{ minHeight }}>
      {under && (
        <div aria-hidden className={`absolute inset-0 ${faceClass} pointer-events-none`}>
          {under}
        </div>
      )}

      <div
        ref={elRef}
        role="button"
        tabIndex={0}
        aria-label={flipped ? "Картка: зворотний бік" : "Картка: лицьовий бік"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        className="swipe-card relative select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-3xl"
        style={{
          minHeight,
          touchAction: "pan-y",
          transform: `translate3d(${m.x}px, ${m.y}px, 0) rotate(${tilt}deg)`,
          transition: m.ms ? `transform ${m.ms}ms ${EASE}` : "none",
          perspective: 864,
        }}
      >
        <div
          className="grid h-full"
          style={{
            minHeight,
            transformStyle: "preserve-3d",
            transform: `rotateY(${flipped ? 180 : 0}deg)`,
            transition: `transform ${FLIP_MS}ms ${EASE}`,
          }}
        >
          <div className={faceClass} style={{ gridArea: "1 / 1", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
            {front}
          </div>
          <div className={faceClass}
            style={{ gridArea: "1 / 1", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            {back}
          </div>
        </div>

        {/* Підсвітка свайпу: не перевертається разом з карткою */}
        {tint && (
          <div className={`absolute inset-0 rounded-3xl ring-4 ring-inset ${tint.ring} pointer-events-none flex items-start p-5 ${
              m.x >= 0 ? "justify-start" : "justify-end"}`}
            style={{ opacity: m.tintLevel }}>
            <span className={`rounded-xl border-4 bg-card/90 px-3 py-1 text-lg font-black uppercase tracking-wide ${tint.text} ${
                m.x >= 0 ? "-rotate-12" : "rotate-12"}`}>
              {tint.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
