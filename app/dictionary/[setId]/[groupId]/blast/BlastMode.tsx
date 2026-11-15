"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { accuracy, createGame, multiplierFor, tap, type BlastGame, type TapResult } from "@/lib/blast/core";

export type BlastModeWord = { key: string; spanish: string; prompt: string; emoji?: string };

/** Пауза після останнього влучання, щоб вибух доіграв перед екраном результату. */
const FINISH_DELAY_MS = 650;

/**
 * Blast: унизу переклад, по полю дрейфують до 4 астероїдів з іспанськими словами групи.
 * Влучив у правильний — вибух і прилітає наступне слово; промах — астероїд тремтить і лишається.
 */
export function BlastMode({ words, title, setId, groupId, exitHref, initialBest, dbOk }: {
  words: BlastModeWord[];
  title: string;
  setId: string;
  groupId: string;
  exitHref: string;
  initialBest: number | null;
  dbOk: boolean;
}) {
  const [phase, setPhase] = useState<"intro" | "playing" | "over">("intro");
  const [game, setGame] = useState<BlastGame | null>(null);
  const [runId, setRunId] = useState(0);
  const [best, setBest] = useState<number | null>(initialBest);
  const [newRecord, setNewRecord] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Актуальний стан гри для обробників тапів (швидкі тапи не повинні бачити застарілий стан)
  const gameRef = useRef<BlastGame | null>(null);
  const shownAt = useRef(0);

  const start = () => {
    const g = createGame(words.map(w => ({ key: w.key, prompt: w.prompt })));
    gameRef.current = g;
    shownAt.current = performance.now();
    setGame(g);
    setRunId(r => r + 1);
    setNewRecord(false);
    setSaveError(null);
    setPhase("playing");
  };

  const finishTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(finishTimer.current), []);

  /** Кінець гри: рекорд зберігаємо одразу (навіть якщо гравець закриє гру під час вибуху), результати — після паузи. */
  const finish = async (final: BlastGame) => {
    setNewRecord(final.score > 0 && (best === null || final.score > best));
    finishTimer.current = setTimeout(() => setPhase("over"), FINISH_DELAY_MS);
    if (!dbOk) return;
    try {
      const res = await fetch("/api/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "score", setId, groupId, score: final.score }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Не вдалося зберегти рекорд");
      setBest(data.best);
    } catch (e) {
      // Рекорд на екрані не змінюємо: у базі його немає
      setSaveError((e as Error).message);
    }
  };

  const onTap = (key: string): TapResult | null => {
    const g = gameRef.current;
    // Повторний тап по щойно збитому астероїду (до перемальовування) — ігноруємо, це не промах
    if (!g || g.done || !g.visible.includes(key)) return null;
    const result = tap(g, key, performance.now() - shownAt.current);
    if (result.correct) shownAt.current = performance.now(); // нова підказка — новий відлік
    gameRef.current = result.game;
    setGame(result.game);
    if (result.game.done) void finish(result.game);
    return result;
  };

  const byKey = new Map(words.map(w => [w.key, w]));
  const target = game?.target ? byKey.get(game.target) : undefined;
  const multiplier = game ? multiplierFor(game.streak) : 1;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="h-full max-w-lg mx-auto flex flex-col px-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)", paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        {/* Верхня панель */}
        <div className="flex items-center justify-between h-12 shrink-0">
          <Link href={exitHref} aria-label="Закрити Blast"
            className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-accent/40 transition-colors">
            <CloseIcon />
          </Link>
          <div className="text-center">
            <p className="text-sm font-semibold">Blast</p>
            <p className="text-[10px] text-muted-foreground leading-none tabular-nums">
              {phase === "playing" && game ? `збито ${game.hits} з ${words.length}` : title}
            </p>
          </div>
          <div className="min-w-10 text-right">
            {phase === "playing" && game && (
              <div className="leading-tight">
                <p className="text-base font-bold tabular-nums" aria-label={`Рахунок ${game.score}`}>{game.score}</p>
                {multiplier > 1 && (
                  <p key={multiplier} className="text-[11px] font-bold text-[#CC4E00] dark:text-[#FF983A] animate-in zoom-in-50">
                    ×{multiplier}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {phase === "intro" && (
          <Intro title={title} count={words.length} best={best} dbOk={dbOk} onStart={start} />
        )}

        {phase === "playing" && game && (
          <>
            <div className="bg-muted rounded-full h-1 overflow-hidden shrink-0 mt-2">
              <div className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(game.hits / Math.max(words.length, 1)) * 100}%` }} />
            </div>
            <Playfield key={runId} visible={game.visible} byKey={byKey} onTap={onTap} />
            {/* Підказка: переклад слова, яке треба збити */}
            <div className="shrink-0 rounded-3xl border bg-card px-5 py-4 min-h-[88px] flex items-center justify-center gap-3 text-center"
              aria-live="polite">
              {target && (
                <div key={game.target} className="flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                  {target.emoji && <span className="text-4xl">{target.emoji}</span>}
                  <span className="text-xl font-bold break-words">{target.prompt}</span>
                </div>
              )}
            </div>
          </>
        )}

        {phase === "over" && game && (
          <Results game={game} total={words.length} best={best} newRecord={newRecord}
            saveError={saveError} dbOk={dbOk} onAgain={start} exitHref={exitHref} />
        )}
      </div>
    </div>
  );
}

// ─── Поле з астероїдами ───────────────────────────────────────────────────────

/** entering — ще залітає з-за краю (стіни не діють); enteredBy — після цього часу примусово на полі. */
type Body = { x: number; y: number; vx: number; vy: number; entering: boolean; enteredBy: number };

/** Найдовше, скільки астероїд може залітати на поле. */
const MAX_ENTER_MS = 3000;
type Effect =
  | { id: number; kind: "burst"; x: number; y: number }
  | { id: number; kind: "popup"; x: number; y: number; text: string; good: boolean }
  | { id: number; kind: "shot"; x: number; y: number; len: number; angle: number; good: boolean };

/** Ефект без id: Omit, що працює для кожного варіанта об'єднання окремо. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewEffect = DistributiveOmit<Effect, "id">;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Playfield({ visible, byKey, onTap }: {
  visible: string[];
  byKey: Map<string, BlastModeWord>;
  onTap: (key: string) => TapResult | null;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const bodies = useRef(new Map<string, Body>());
  const els = useRef(new Map<string, HTMLElement>());
  const size = useRef({ w: 0, h: 0, d: 100 });
  const started = useRef(false);
  const [d, setD] = useState(100);
  const [effects, setEffects] = useState<Effect[]>([]);
  const effectId = useRef(0);

  const measure = useCallback(() => {
    const el = fieldRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    // Діаметр: чотири астероїди мають вільно літати навіть на вузькому телефоні
    const diameter = Math.round(Math.min(124, Math.max(88, Math.min(w * 0.29, h * 0.3))));
    size.current = { w, h, d: diameter };
    setD(diameter);
  }, []);

  const place = (key: string) => {
    const el = els.current.get(key);
    const b = bodies.current.get(key);
    if (el && b) el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
  };

  const randomVelocity = () => {
    const speed = (28 + Math.random() * 24) * (reducedMotion() ? 0.5 : 1);
    const a = Math.random() * Math.PI * 2;
    return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
  };

  // Нові слова отримують «тіло»: на старті — одразу на полі без накладань, потім — прилітають з-за краю
  useLayoutEffect(() => {
    if (!size.current.w) measure();
    const { w, h, d: dia } = size.current;
    for (const key of [...bodies.current.keys()]) if (!visible.includes(key)) bodies.current.delete(key);
    for (const key of visible) {
      if (bodies.current.has(key)) continue;
      if (!started.current) {
        let x = 0, y = 0;
        for (let i = 0; i < 40; i++) {
          x = Math.random() * Math.max(w - dia, 1);
          y = Math.random() * Math.max(h - dia, 1);
          const clear = [...bodies.current.values()].every(o => Math.hypot(o.x - x, o.y - y) > dia * 1.05);
          if (clear) break;
        }
        bodies.current.set(key, { x, y, ...randomVelocity(), entering: false, enteredBy: 0 });
      } else {
        // З випадкового краю, курсом усередину поля
        const side = Math.floor(Math.random() * 4);
        const x = side === 0 ? -dia : side === 1 ? w : Math.random() * Math.max(w - dia, 1);
        const y = side === 2 ? -dia : side === 3 ? h : Math.random() * Math.max(h - dia, 1);
        // Ціль — точка, де астероїд повністю на полі (навіть коли поле низьке, напр. телефон боком)
        const tx = Math.max(w - dia, 0) * (0.25 + Math.random() * 0.5);
        const ty = Math.max(h - dia, 0) * (0.25 + Math.random() * 0.5);
        const len = Math.hypot(tx - x, ty - y) || 1;
        const speed = (60 + Math.random() * 20) * (reducedMotion() ? 0.5 : 1);
        bodies.current.set(key, {
          x, y, vx: (tx - x) / len * speed, vy: (ty - y) / len * speed,
          entering: true, enteredBy: performance.now() + MAX_ENTER_MS,
        });
      }
      place(key);
    }
    started.current = true;
  }, [visible, measure]);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Політ: позиції пишемо прямо в DOM, без перемальовування React на кожному кадрі
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const { w, h, d: dia } = size.current;
      const list = [...bodies.current.values()];
      for (const b of list) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.entering) {
          const inside = b.x >= 0 && b.y >= 0 && b.x <= w - dia && b.y <= h - dia;
          // Поле могло зменшитись під час підльоту — тоді далі діють стіни й повертають астероїд на поле
          if (inside || now > b.enteredBy) b.entering = false;
          else continue;
        }
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
        if (b.x > w - dia) { b.x = Math.max(w - dia, 0); b.vx = -Math.abs(b.vx); }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
        if (b.y > h - dia) { b.y = Math.max(h - dia, 0); b.vy = -Math.abs(b.vy); }
      }
      // Пружні зіткнення однакових кульок: астероїди не накладаються й не ховають слова
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.entering || b.entering) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= dia || dist === 0) continue;
          const nx = dx / dist, ny = dy / dist;
          const overlap = (dia - dist) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel > 0) {
            a.vx -= rel * nx; a.vy -= rel * ny;
            b.vx += rel * nx; b.vy += rel * ny;
          }
        }
      }
      for (const key of bodies.current.keys()) place(key);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const addEffects = (list: NewEffect[]) => {
    const fresh = list.map(e => ({ ...e, id: ++effectId.current }) as Effect);
    setEffects(prev => [...prev, ...fresh]);
    setTimeout(() => setEffects(prev => prev.filter(e => !fresh.includes(e))), 800);
  };

  /** Постріл по астероїду: перевірка відповіді й ефекти. */
  const fire = (key: string) => {
    const b = bodies.current.get(key);
    const result = onTap(key);
    if (!b || !result) return;
    const { w, h, d: dia } = size.current;
    const cx = b.x + dia / 2, cy = b.y + dia / 2;
    // Постріл від корабля внизу по центру
    const sx = w / 2, sy = h - 6;
    const shot = { kind: "shot" as const, x: sx, y: sy, len: Math.hypot(cx - sx, cy - sy), angle: Math.atan2(cy - sy, cx - sx), good: result.correct };
    if (result.correct) {
      addEffects([shot, { kind: "burst", x: cx, y: cy }, { kind: "popup", x: cx, y: cy, text: `+${result.points}`, good: true }]);
    } else {
      addEffects([shot, ...(result.points < 0 ? [{ kind: "popup" as const, x: cx, y: cy, text: `${result.points}`, good: false }] : [])]);
      const rock = els.current.get(key)?.firstElementChild as HTMLElement | null;
      if (rock) {
        rock.classList.remove("blast-shake");
        void rock.offsetWidth; // перезапуск анімації
        rock.classList.add("blast-shake");
      }
    }
  };

  return (
    <div ref={fieldRef} className="relative flex-1 min-h-0 my-3 overflow-hidden rounded-3xl blast-space" style={{ touchAction: "manipulation" }}>
      {visible.map(key => {
        const w = byKey.get(key);
        if (!w) return null;
        return (
          <div key={key} className="absolute left-0 top-0 will-change-transform"
            style={{ width: d, height: d, transform: "translate3d(-9999px, 0, 0)" }}
            ref={el => { if (el) { els.current.set(key, el); place(key); } else els.current.delete(key); }}>
            <button type="button" lang="es" aria-label={`Астероїд «${w.spanish}»`}
              // pointerdown — без затримки кліку на телефоні; click з detail 0 — клавіатура й допоміжні технології
              onPointerDown={e => { e.preventDefault(); fire(key); }}
              onClick={e => { if (e.detail === 0) fire(key); }}
              className="blast-rock w-full h-full flex items-center justify-center px-2.5 text-center text-[15px] font-semibold leading-tight break-words hyphens-auto select-none cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {w.spanish}
            </button>
          </div>
        );
      })}

      {effects.map(e => e.kind === "burst" ? (
        <div key={e.id} aria-hidden className="blast-fx blast-burst absolute pointer-events-none" style={{ left: e.x, top: e.y }} />
      ) : e.kind === "popup" ? (
        <div key={e.id} aria-hidden className={`blast-fx blast-popup absolute pointer-events-none font-bold text-lg ${e.good ? "text-[#18AE79]" : "text-[#CC4E00] dark:text-[#FF983A]"}`}
          style={{ left: e.x, top: e.y }}>
          {e.text}
        </div>
      ) : (
        <div key={e.id} aria-hidden className="blast-fx blast-shot absolute pointer-events-none"
          style={{ left: e.x, top: e.y, width: e.len, transform: `rotate(${e.angle}rad)`, background: e.good ? "#59E8B5" : "#FF983A" }} />
      ))}

      {/* Корабель */}
      <div aria-hidden className="absolute left-1/2 bottom-1 -translate-x-1/2 text-primary pointer-events-none">
        <ShipIcon />
      </div>
    </div>
  );
}

// ─── Екрани до й після гри ────────────────────────────────────────────────────

function Intro({ title, count, best, dbOk, onStart }: { title: string; count: number; best: number | null; dbOk: boolean; onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-6 py-6 text-center">
      <div className="space-y-2">
        <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <ShipIcon size={44} />
        </div>
        <p className="text-2xl font-bold">Blast</p>
        <p className="text-sm text-muted-foreground">{title} · {count} слів</p>
      </div>
      <ul className="text-sm text-left space-y-2 rounded-2xl border bg-card p-4">
        <li>☄️ Внизу — переклад. Збий астероїд з іспанським словом, що йому відповідає.</li>
        <li>⚡ Швидше — більше очок: повний бонус, якщо влучив за 2 секунди.</li>
        <li>🔥 Серія без промахів множить очки: ×2 після 3 поспіль, ×3 після 6.</li>
        <li>💥 Промах — мінус 50 і серія з початку.</li>
      </ul>
      <div className="space-y-2">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">У цій групі ще немає слів.</p>
        ) : (
          <button type="button" onClick={onStart}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
            Почати
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          {best !== null ? `Рекорд: ${best}` : "Рекорду ще немає"}
          {!dbOk && " · немає зв'язку з базою — рекорд не збережеться"}
        </p>
      </div>
    </div>
  );
}

function Results({ game, total, best, newRecord, saveError, dbOk, onAgain, exitHref }: {
  game: BlastGame;
  total: number;
  best: number | null;
  newRecord: boolean;
  saveError: string | null;
  dbOk: boolean;
  onAgain: () => void;
  exitHref: string;
}) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-6 py-6 text-center">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Гру завершено</p>
        <p className="text-5xl font-bold tabular-nums">{game.score}</p>
        {newRecord ? (
          <p className="text-sm font-semibold text-[#18AE79] animate-in zoom-in-75">🏆 Новий рекорд!</p>
        ) : (
          best !== null && <p className="text-sm text-muted-foreground">Рекорд: {best}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={`${accuracy(game)}%`} label="точність" />
        <Stat value={`${game.hits}/${total}`} label="збито" />
        <Stat value={String(game.misses)} label="промахів" />
      </div>
      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      {!dbOk && <p className="text-xs text-muted-foreground">Немає зв&apos;язку з базою — рекорд не збережено.</p>}
      <div className="space-y-2">
        <button type="button" onClick={onAgain}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
          Ще раз
        </button>
        <Link href={exitHref}
          className="w-full min-h-[52px] rounded-2xl border text-sm font-medium flex items-center justify-center hover:bg-accent/40 transition-all">
          До групи
        </Link>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Іконки ───────────────────────────────────────────────────────────────────

function ShipIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.1 2.1 0 0 0-2.9-.1z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z" />
      <path d="M9 12H4s.5-3 2-4c1.6-1.1 5 0 5 0" />
      <path d="M12 15v5s3-.5 4-2c1.1-1.6 0-5 0-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}
