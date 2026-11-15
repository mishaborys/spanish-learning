"use client";

import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";

/**
 * Картка, яка виглядає й рухається як флешкарти Quizlet (Android 10.60, «Basic sorting»).
 * Значення взяті з декомпільованого коду:
 *
 * Перевертання (assembly/components/flashcards): кут 0° → 180°, rotationY, tween 400 мс
 *   FastOutSlowIn, cameraDistance 12·density; до 90° видно лицьовий бік, після — зворотний.
 * Свайп (ui/compose SwipeableCard, параметри за замовчуванням):
 *   — картка йде за пальцем по X і Y;
 *   — нахил з'являється, коли |x| > 0.1·W: rotationZ = x · 8 / W (W — ширина екрана);
 *   — відпустив при |x| > 0.7·W/2 → відлітає до x = ±2W за 300 мс, інакше повертається за 300 мс;
 *   — прогрес = |x| / (0.35·W).
 * Підсвітка (flashcards sorting_card_view): поверх картки шар з фоном картки, рамкою 2dp
 *   кольору категорії та написом 32sp bold по центру; прозорість шару = прогрес.
 *   Know #59E8B5, Still learning #FF983A. Кути картки 48dp.
 */

export type SwipeDir = "left" | "right";
export type CardTint = "known" | "hesitant" | "unknown";

export type SwipeFlipCardHandle = {
  /** Відправити картку за край. Promise завершується, коли анімація закінчилась. */
  flyOut: (dir: SwipeDir, tint?: CardTint) => Promise<void>;
  /** Повернути картку на місце (наприклад, якщо збереження не вдалося). */
  reset: () => Promise<void>;
};

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)"; // FastOutSlowInEasing — дефолт Compose tween
const FLIP_MS = 400;
const FLY_OUT_MS = 300;
const SNAP_BACK_MS = 300;
const THRESHOLD = 0.7;       // спрацьовує при |x| > THRESHOLD·W/2
const PROGRESS_FULL = 0.35;  // прогрес = |x| / (0.35·W)
const TILT_START = 0.1;      // нахил лише після 0.1·W
const TILT_DEG = 8;          // x · 8 / W
const TAP_SLOP = 8;
const RADIUS = 48;
const MAX_W = 480;           // на телефоні W = ширина екрана; на десктопі не даємо порогу стати величезним

export const SWIPE_COLORS: Record<CardTint, string> = {
  known: "#59E8B5",
  hesitant: "#FFC94D",
  unknown: "#FF983A",
};

const DEFAULT_LABELS: Record<CardTint, string> = {
  known: "Знаю",
  hesitant: "Вагався",
  unknown: "Ще вчу",
};

const screenW = () => (typeof window === "undefined" ? 400 : Math.min(window.innerWidth, MAX_W));
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = {
  front: ReactNode;
  back: ReactNode;
  flipped: boolean;
  onFlip?: () => void;
  canFlip?: boolean;
  /** Свайп за поріг. Картка сама не відлітає — батько викликає flyOut або reset. */
  onSwipe?: (dir: SwipeDir) => void;
  canSwipe?: boolean;
  /** Прогрес свайпу 0…1 — для лічильників «+1» над карткою. */
  onProgress?: (dir: SwipeDir | null, level: number) => void;
  tintRight?: CardTint;
  tintLeft?: CardTint;
  labels?: Partial<Record<CardTint, string>>;
  minHeight?: number;
  ref?: Ref<SwipeFlipCardHandle>;
};

type Motion = { x: number; y: number; w: number; ms: number; tint: CardTint | null; level: number };
const REST: Motion = { x: 0, y: 0, w: 400, ms: 0, tint: null, level: 0 };

export function SwipeFlipCard({
  front, back, flipped, onFlip, canFlip = true, onSwipe, canSwipe = true, onProgress,
  tintRight = "known", tintLeft = "unknown", labels, minHeight = 320, ref,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Motion>(REST);
  const drag = useRef<{ id: number; sx: number; sy: number; active: boolean } | null>(null);
  const locked = useRef(false);

  const wait = (ms: number) => new Promise<void>(r => setTimeout(r, reducedMotion() ? 0 : ms));

  const flyOut = async (dir: SwipeDir, tint?: CardTint) => {
    locked.current = true;
    const w = screenW();
    const distance = Math.max(2 * w, window.innerWidth);
    setM(prev => ({
      x: dir === "right" ? distance : -distance,
      y: prev.y,
      w,
      ms: FLY_OUT_MS,
      tint: tint ?? (dir === "right" ? tintRight : tintLeft),
      level: 1,
    }));
    onProgress?.(dir, 1);
    await wait(FLY_OUT_MS);
    onProgress?.(null, 0);
  };

  const reset = async () => {
    setM(prev => ({ ...prev, x: 0, y: 0, ms: SNAP_BACK_MS, level: 0 }));
    onProgress?.(null, 0);
    await wait(SNAP_BACK_MS);
    setM(prev => ({ ...prev, tint: null }));
    locked.current = false;
  };

  useImperativeHandle(ref, () => ({ flyOut, reset }));

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
    const w = screenW();
    const level = canSwipe ? Math.min(Math.abs(dx) / (PROGRESS_FULL * w), 1) : 0;
    const dir: SwipeDir | null = dx > 0 ? "right" : dx < 0 ? "left" : null;
    setM({ x: dx, y: dy, w, ms: 0, tint: dir === "right" ? tintRight : dir === "left" ? tintLeft : null, level });
    onProgress?.(dir, level);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) {
      // Тап по кнопці/посиланню всередині картки (напр. «Звукова асоціація») — не перевертаємо
      const interactive = (e.target as HTMLElement).closest("button, a, input, textarea, select");
      if (interactive && interactive !== elRef.current) return;
      if (canFlip && onFlip && !locked.current) onFlip();
      return;
    }
    const x = e.clientX - d.sx;
    if (canSwipe && onSwipe && Math.abs(x) > (THRESHOLD * screenW()) / 2) {
      locked.current = true;
      onSwipe(x > 0 ? "right" : "left");
    } else {
      locked.current = true;
      void reset();
    }
  };

  const onPointerCancel = () => {
    if (drag.current?.active) {
      locked.current = true;
      void reset();
    }
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return; // Enter на кнопці всередині картки
    if ((e.key === "Enter" || e.key === " ") && canFlip && onFlip && !locked.current) {
      e.preventDefault();
      onFlip();
    }
  };

  const tilt = Math.abs(m.x) > TILT_START * m.w ? (m.x * TILT_DEG) / m.w : 0;
  const color = m.tint ? SWIPE_COLORS[m.tint] : "transparent";
  const label = m.tint ? labels?.[m.tint] ?? DEFAULT_LABELS[m.tint] : "";
  const face = "min-w-0 break-words border bg-card shadow-sm flex flex-col items-center justify-center px-8 py-10 text-center overflow-hidden";
  const faceStyle = { borderRadius: RADIUS, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" } as const;

  return (
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
      className="swipe-card relative select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        minHeight,
        borderRadius: RADIUS,
        touchAction: "pan-y",
        transform: `translate3d(${m.x}px, ${m.y}px, 0) rotate(${tilt}deg)`,
        transition: m.ms ? `transform ${m.ms}ms ${EASE}` : "none",
        perspective: 864,
      }}
    >
      {/* Обидва боки в одній клітинці grid: висота = більший із них */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "minmax(0, 1fr)",
          minHeight,
          transformStyle: "preserve-3d",
          transform: `rotateY(${flipped ? 180 : 0}deg)`,
          transition: `transform ${FLIP_MS}ms ${EASE}`,
        }}
      >
        <div className={face} style={{ gridArea: "1 / 1", ...faceStyle }}>{front}</div>
        <div className={face} style={{ gridArea: "1 / 1", ...faceStyle, transform: "rotateY(180deg)" }}>{back}</div>
      </div>

      {/* Шар підсвітки Quizlet: фон картки + рамка 2dp + напис по центру, прозорість = прогрес */}
      <div
        aria-hidden
        className="absolute inset-0 bg-card flex items-center justify-center pointer-events-none"
        style={{
          borderRadius: RADIUS,
          border: `2px solid ${color}`,
          opacity: m.level,
          transition: m.ms ? `opacity ${m.ms}ms ${EASE}` : "none",
        }}
      >
        <span className="font-bold" style={{ color, fontSize: 32, lineHeight: "44px" }}>{label}</span>
      </div>
    </div>
  );
}

/**
 * Лічильники над карткою як у Quizlet: зліва «Still learning», справа «Know».
 * Під час свайпу поверх лічильника проявляється заповнений «+1».
 */
export function SwipeCounters({
  left, right, progress,
}: {
  left: { count: number; label: string; tint?: CardTint };
  right: { count: number; label: string; tint?: CardTint };
  progress: { dir: SwipeDir | null; level: number };
}) {
  return (
    <div className="flex items-center gap-3">
      <Counter count={left.count} tint={left.tint ?? "unknown"} plus={progress.dir === "left" ? progress.level : 0} />
      <span className="text-sm font-semibold swipe-text-unknown">{left.label}</span>
      <div className="flex-1" />
      <span className="text-sm font-semibold swipe-text-known">{right.label}</span>
      <Counter count={right.count} tint={right.tint ?? "known"} plus={progress.dir === "right" ? progress.level : 0} />
    </div>
  );
}

function Counter({ count, tint, plus }: { count: number; tint: CardTint; plus: number }) {
  return (
    <div className="relative">
      <div className={`min-w-[60px] rounded-full border px-4 py-2 text-center text-sm font-semibold tabular-nums swipe-counter-${tint}`}>
        {count}
      </div>
      <div
        aria-hidden
        className="absolute inset-0 rounded-full px-4 py-2 text-center text-sm font-semibold text-white"
        style={{ background: SWIPE_COLORS[tint], opacity: plus }}
      >
        +1
      </div>
    </div>
  );
}
