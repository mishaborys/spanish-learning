"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  accuracy, createGame, endRound, goalFor, isRoundComplete, MAX_MULTIPLIER, multiplierFor, ROUND_MS, STREAK_STEP, tap,
  type BlastGame, type TapResult,
} from "@/lib/blast/core";
import { BlastMusic, readMuted, saveMuted, subscribeMuted } from "@/lib/blastMusic";
import { submitScore } from "@/lib/blastOutbox";
import { ExitLink } from "@/components/spanish/ExitLink";

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};

export type BlastModeWord = { key: string; spanish: string; prompt: string; emoji?: string };
export type BlastRecord = { score: number; level: number };

/** Скільки показувати «Ціль: N балів» перед раундом і «Рівень N пройдено» після. */
const GOAL_BANNER_MS = 1600;
/** Поділок на шкалі серії: від ×1.0 до стелі з кроком 0.2. */
const STREAK_SEGMENTS = Math.round((MAX_MULTIPLIER - 1) / STREAK_STEP);

/** clearing — ціль набрано: астероїди, що лишились, лопаються по черзі; levelDone — підсумок рівня з кнопкою «Далі». */
type Phase = "intro" | "goal" | "playing" | "clearing" | "levelDone" | "over";
/** Пауза між «лопанням» астероїдів після набраної цілі. */
const POP_EVERY_MS = 180;

/**
 * Blast — механіка як у Quizlet: у кожному раунді за 60 секунд треба набрати ціль (50, 75, 125, 200, 250…);
 * раунд закінчується, щойно її набрано. 5 балів × множник серії (+0.2 за влучання поспіль, до ×3);
 * промах −2 і серія з нуля. Не набрав ціль за 60 секунд — гра закінчується.
 */
export function BlastMode({ words, title, setId, groupId, exitHref, initialBest, dbOk }: {
  words: BlastModeWord[];
  title: string;
  setId: string;
  groupId: string;
  exitHref: string;
  initialBest: BlastRecord | null;
  dbOk: boolean;
}) {
  const [phase, setPhaseState] = useState<Phase>("intro");
  // Фаза в ref міняється синхронно: тап одразу після кінця раунду вже не зарахується
  const phaseRef = useRef<Phase>("intro");
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const [game, setGame] = useState<BlastGame | null>(null);
  const [runId, setRunId] = useState(0);
  const [best, setBest] = useState<BlastRecord | null>(initialBest);
  const [newRecord, setNewRecord] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  /** Скільки секунд знадобилось на пройдений раунд (для підсумку). */
  const [roundSeconds, setRoundSeconds] = useState(0);

  // Пауза: час раунду, політ астероїдів і музика стоять; екран розмитий
  // pausedAt — єдине джерело правди для логіки (null = гра йде); `paused` — лише для рендера
  const [paused, setPausedState] = useState(false);
  const pausedAt = useRef<number | null>(null);
  const isPaused = () => pausedAt.current !== null;
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => false);
  const tabHidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const music = useRef<BlastMusic | null>(null);
  useEffect(() => () => music.current?.dispose(), []);

  // Актуальний стан гри для обробників тапів (швидкі тапи не повинні бачити застарілий стан)
  const gameRef = useRef<BlastGame | null>(null);
  const deadline = useRef(0);
  // Відкладені переходи між екранами; у кожен момент чекає щонайбільше один
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = (fn: () => void, ms: number) => { clearTimeout(pending.current); pending.current = setTimeout(fn, ms); };
  useEffect(() => () => clearTimeout(pending.current), []);

  const update = (g: BlastGame) => { gameRef.current = g; setGame(g); };

  /** Показати ціль рівня, потім запустити 60 секунд. */
  const announceLevel = () => {
    setPhase("goal");
    later(() => {
      deadline.current = performance.now() + ROUND_MS;
      setPhase("playing");
    }, GOAL_BANNER_MS);
  };

  const start = () => {
    // Звук браузер дозволяє лише з кліку — тому аудіо створюється тут
    music.current ??= new BlastMusic();
    if (!readMuted()) music.current.start();
    pausedAt.current = null;
    setPausedState(false);
    update(createGame(words.map(w => ({ key: w.key, prompt: w.prompt }))));
    setRunId(r => r + 1);
    setNewRecord(false);
    setSaveError(null);
    setSavedOffline(false);
    announceLevel();
  };

  /** Кінець гри: рекорд — загальний рахунок і рівень, до якого дійшов. */
  const finish = async (final: BlastGame) => {
    setNewRecord(final.totalScore > 0 && (best === null || final.totalScore > best.score));
    setPhase("over");
    if (!dbOk) return;
    try {
      const result = await submitScore({ setId, groupId, score: final.totalScore, level: final.level });
      if (result.queued) {
        // Без інтернету: рекорд чекає на телефоні; на екрані вже показуємо кращий
        setSavedOffline(true);
        if (best === null || final.totalScore > best.score) setBest({ score: final.totalScore, level: final.level });
      } else {
        setBest(result.best);
      }
    } catch (e) {
      // Рекорд на екрані не змінюємо: у базі його немає
      setSaveError((e as Error).message);
    }
  };

  /** Пауза можлива лише посеред раунду. */
  const pause = useCallback(() => {
    if (pausedAt.current !== null || phaseRef.current !== "playing") return;
    pausedAt.current = performance.now();
    setPausedState(true);
  }, []);

  const resume = useCallback(() => {
    if (pausedAt.current === null) return;
    deadline.current += performance.now() - pausedAt.current;
    pausedAt.current = null;
    setPausedState(false);
  }, []);

  /** Скільки мс лишилось у раунді; на паузі — застигає. */
  const remaining = useCallback(
    () => Math.max(0, deadline.current - (pausedAt.current ?? performance.now())), []);

  // Музика грає під час гри; на паузі, з мютом, у схованій вкладці, до старту й після кінця — мовчить
  const inGame = phase === "goal" || phase === "playing" || phase === "clearing" || phase === "levelDone";
  const musicOn = inGame && !paused && !muted && !tabHidden;
  useEffect(() => {
    if (!music.current) return;
    if (musicOn) music.current.start();
    else music.current.pause();
  }, [musicOn]);

  /** Мют — з кліку: увімкнення звуку мусить статись у жесті користувача (iOS). */
  const toggleMute = () => {
    const next = !muted;
    saveMuted(next);
    if (!next && inGame && !paused) {
      music.current ??= new BlastMusic();
      music.current.start();
    }
  };

  // Esc або P — пауза / продовжити (без автоповтору й без Cmd/Ctrl, щоб Cmd+P не ставив на паузу)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "Escape" && e.key.toLowerCase() !== "p" && e.key.toLowerCase() !== "з") return;
      if (pausedAt.current !== null) resume(); else pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, resume]);

  // Кінець раунду за часом. Сховали вкладку — пауза (і ще під час заставки «Ціль» теж).
  // Секунди на екрані малюють окремі компоненти, щоб не перемальовувати все поле 10 разів на секунду.
  useEffect(() => {
    if (phase !== "playing") return;
    if (document.hidden) pause();
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVisibility);
    const id = setInterval(() => {
      if (isPaused()) return;
      const g = gameRef.current;
      if (deadline.current > performance.now() || !g) return;
      // Ціль набрали в останню мить — раунд уже закінчує onTap, це не кінець гри
      if (phaseRef.current !== "playing" || isRoundComplete(g)) { clearInterval(id); return; }
      // Час вийшов, а ціль не набрано
      clearInterval(id);
      const next = endRound(g);
      update(next);
      void finish(next);
    }, 100);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisibility); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Стабільний обробник (лише ref-и), щоб поле з астероїдами не перемальовувалось без потреби
  const onTap = useCallback((key: string): TapResult | null => {
    const g = gameRef.current;
    // Повторний тап по щойно збитому астероїду (до перемальовування) — ігноруємо, це не промах
    if (!g || g.over || pausedAt.current !== null || phaseRef.current !== "playing" || !g.visible.includes(key)) return null;
    const result = tap(g, key);
    gameRef.current = result.game;
    setGame(result.game);
    // Ціль набрано — раунд закінчено: час стоїть, решта астероїдів лопається, потім підсумок
    if (isRoundComplete(result.game)) {
      setRoundSeconds(Math.round((ROUND_MS - remaining()) / 1000));
      setPhase("clearing"); // з цієї миті тапи не приймаються, а таймер раунду не завершить гру
    }
    return result;
    // Помічники вище працюють лише з ref-ами та сетерами стану, тож перша їх версія завжди актуальна
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Усі астероїди лопнули — показати підсумок рівня. */
  const onCleared = useCallback(() => {
    if (phaseRef.current === "clearing") setPhase("levelDone");
  }, []);
  /** «Далі» на підсумку: наступний рівень. */
  const nextLevel = () => {
    if (phaseRef.current !== "levelDone" || !gameRef.current) return;
    update(endRound(gameRef.current));
    announceLevel();
  };

  const byKey = useMemo(() => new Map(words.map(w => [w.key, w])), [words]);
  const target = game?.target ? byKey.get(game.target) : undefined;
  const goal = game ? goalFor(game.level) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="h-full max-w-lg mx-auto flex flex-col px-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)", paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        {/* Верхня панель */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-12 shrink-0">
          <ExitLink href={exitHref} aria-label="Закрити Blast"
            className="justify-self-start h-10 w-10 rounded-full border flex items-center justify-center hover:bg-accent/40 transition-colors">
            <CloseIcon />
          </ExitLink>
          <div className="text-center">
            <p className="text-sm font-semibold">Blast</p>
            <p className="text-[10px] text-muted-foreground leading-none">{title}</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={toggleMute} aria-pressed={muted}
              aria-label={muted ? "Увімкнути музику" : "Вимкнути музику"}
              className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-accent/40 transition-colors">
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            {inGame && (
              <button type="button" onClick={paused ? resume : pause} disabled={phase !== "playing" && !paused}
                aria-label={paused ? "Продовжити гру" : "Пауза"} aria-pressed={paused}
                className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-accent/40 disabled:opacity-40 transition-colors">
                {paused ? <Play size={20} /> : <Pause size={20} />}
              </button>
            )}
          </div>
        </div>

        {phase === "intro" && (
          <Intro title={title} count={words.length} best={best} dbOk={dbOk} onStart={start} />
        )}

        {inGame && game && (
          <div className="relative flex-1 min-h-0 flex flex-col">
          {/* На паузі все розмито: не видно ні підказки, ні слів на астероїдах */}
          <div aria-hidden={paused} className={`flex-1 min-h-0 flex flex-col transition-[filter] duration-200 ${
            paused ? "blur-xl pointer-events-none select-none" : ""}`}>
            {/* Підказка й час раунду */}
            <div className="shrink-0 mt-2 rounded-3xl border bg-card overflow-hidden">
              <div className="px-5 py-3 min-h-[64px] flex items-center justify-center gap-3 text-center" aria-live="polite">
                {phase === "playing" && target && (
                  <div key={`${game.hits}-${game.target}`} className="flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                    {target.emoji && <span className="text-3xl">{target.emoji}</span>}
                    <span className="text-xl font-bold break-words">{target.prompt}</span>
                  </div>
                )}
              </div>
              <TimeBar key={`${runId}-${game.level}`} remaining={remaining} phase={phase} paused={paused} />
            </div>

            <div className="relative flex-1 min-h-0 flex flex-col">
              {(phase === "playing" || phase === "clearing") && (
                <>
                  <Seconds remaining={remaining} running={phase === "playing" && !paused} />
                  <Playfield key={`${runId}-${game.level}`} visible={game.visible} byKey={byKey} onTap={onTap} paused={paused}
                    clearing={phase === "clearing"} onCleared={onCleared} />
                </>
              )}
              {phase === "goal" && (
                <Banner title={`Ціль: ${goal} балів`} subtitle={game.level > 1 ? `Рівень ${game.level}` : "60 секунд на раунд"} />
              )}
              {phase === "levelDone" && (
                <LevelSummary game={game} seconds={roundSeconds} onNext={nextLevel} />
              )}
            </div>

            {/* Нижня панель: рівень і бали до цілі, серія */}
            <Hud level={game.level} levelScore={game.levelScore} goal={goal} streak={game.streak} />
          </div>
          {paused && <PauseOverlay onResume={resume} exitHref={exitHref} />}
          </div>
        )}

        {phase === "over" && game && (
          <Results game={game} best={best} newRecord={newRecord} savedOffline={savedOffline}
            saveError={saveError} dbOk={dbOk} onAgain={start} exitHref={exitHref} />
        )}
      </div>
    </div>
  );
}

/**
 * Скільки мс лишилось до кінця раунду; оновлюється сама, не чіпаючи решту екрана.
 * Поки `running` = false (пауза), показує застигле останнє значення.
 */
function useMsLeft(remaining: () => number, running: boolean, everyMs: number): number {
  const [left, setLeft] = useState(ROUND_MS);
  useEffect(() => {
    if (!running) return;
    const tick = () => setLeft(remaining());
    tick();
    const id = setInterval(tick, everyMs);
    return () => clearInterval(id);
  }, [remaining, running, everyMs]);
  return left;
}

/** Смуга часу під підказкою: заповнюється за 60 секунд раунду. */
function TimeBar({ remaining, phase, paused }: { remaining: () => number; phase: Phase; paused: boolean }) {
  const left = useMsLeft(remaining, phase === "playing" && !paused, 100);
  // Ціль набрано: смуга зеленіє й застигає там, де зупинився час
  const done = phase === "clearing" || phase === "levelDone";
  // Під час заставки «Ціль» раунд ще не почався — смуга порожня (а не з минулого раунду)
  const elapsed = phase === "goal" ? 0 : ROUND_MS - left;
  return (
    <div className="h-1.5 bg-muted" aria-hidden>
      <div className={`h-full transition-[width] duration-100 ease-linear ${done ? "bg-[#18AE79]" : "bg-primary"}`}
        style={{ width: `${(elapsed / ROUND_MS) * 100}%` }} />
    </div>
  );
}

/** Секунди до кінця раунду — великим блідим числом над полем. */
function Seconds({ remaining, running }: { remaining: () => number; running: boolean }) {
  const seconds = Math.ceil(useMsLeft(remaining, running, 250) / 1000);
  return (
    <p aria-label={`Лишилось ${seconds} с`}
      className={`absolute top-5 inset-x-0 text-center text-4xl font-bold tabular-nums pointer-events-none z-10 ${
        seconds <= 10 ? "text-[#CC4E00]/60 dark:text-[#FF983A]/60" : "text-foreground/15"}`}>
      {seconds}
    </p>
  );
}

function PauseOverlay({ onResume, exitHref }: { onResume: () => void; exitHref: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div role="dialog" aria-label="Пауза"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 text-center animate-in fade-in duration-150">
      <div className="space-y-1">
        <p className="text-3xl font-bold">Пауза</p>
        <p className="text-sm text-muted-foreground">Час раунду стоїть</p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        <button ref={ref} type="button" onClick={onResume}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
          Продовжити
        </button>
        <ExitLink href={exitHref}
          className="w-full min-h-[52px] rounded-2xl border bg-background text-sm font-medium flex items-center justify-center hover:bg-accent/40 transition-all">
          Вийти з гри
        </ExitLink>
      </div>
    </div>
  );
}

/** Підсумок пройденого рівня; далі — лише кнопкою. */
function LevelSummary({ game, seconds, onNext }: { game: BlastGame; seconds: number; onNext: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 my-3 px-6 rounded-3xl blast-space text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="space-y-1">
        <p className="text-4xl">🎉</p>
        <p className="text-2xl font-bold">Рівень {game.level} пройдено</p>
        <p className="text-sm text-muted-foreground">за {seconds} с</p>
      </div>
      <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
        <SummaryStat value={`+${game.levelScore}`} label="за раунд" />
        <SummaryStat value={String(game.totalScore)} label="загалом" />
        <SummaryStat value={`×${multiplierFor(game.streak)}`} label="серія" />
      </div>
      <p className="text-sm text-muted-foreground">Далі — рівень {game.level + 1}, ціль {goalFor(game.level + 1)} балів</p>
      <button ref={ref} type="button" onClick={onNext}
        className="w-full max-w-xs min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
        Далі →
      </button>
    </div>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border bg-background/70 p-2.5">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Banner({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-1 my-3 rounded-3xl blast-space animate-in fade-in zoom-in-95 duration-300">
      <p className="text-3xl font-bold">{title}</p>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Hud({ level, levelScore, goal, streak }: { level: number; levelScore: number; goal: number; streak: number }) {
  const multiplier = multiplierFor(streak);
  const lit = Math.round((multiplier - 1) / STREAK_STEP);
  const reached = isRoundComplete({ level, levelScore });
  return (
    <div className="shrink-0 grid grid-cols-2 gap-6 pt-1 pb-1">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-sm font-bold tabular-nums">
          <span>Рівень {level}</span>
          <span aria-label={`Бали ${levelScore} з ${goal}`} className={reached ? "text-[#18AE79]" : ""}>{levelScore}/{goal}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${reached ? "bg-[#18AE79]" : "bg-primary"}`}
            style={{ width: `${Math.min(levelScore / goal, 1) * 100}%` }} />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-right text-sm font-bold">
          Серія <span key={multiplier} className="inline-block animate-in zoom-in-50 text-[#CC4E00] dark:text-[#FF983A] tabular-nums">×{multiplier}</span>
        </p>
        <div className="flex gap-0.5" aria-hidden>
          {Array.from({ length: STREAK_SEGMENTS }, (_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full transition-colors ${i < lit ? "bg-[#FF983A]" : "bg-muted"}`} />
          ))}
        </div>
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

/** Швидкість дрейфу астероїда на полі, px/с. */
const driftSpeed = () => (28 + Math.random() * 24) * (reducedMotion() ? 0.5 : 1);

const Playfield = memo(function Playfield({ visible, byKey, onTap, paused, clearing, onCleared }: {
  visible: string[];
  byKey: Map<string, BlastModeWord>;
  onTap: (key: string) => TapResult | null;
  /** На паузі астероїди застигають. */
  paused: boolean;
  /** Ціль набрано: астероїди на полі лопаються по черзі, потім `onCleared`. */
  clearing: boolean;
  onCleared: () => void;
}) {
  const [popped, setPopped] = useState<Set<string>>(() => new Set());

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
    const speed = driftSpeed();
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
        // Залітає швидко, щоб нове слово з'являлось без затримки; на полі сповільнюється до дрейфу
        const speed = (120 + Math.random() * 40) * (reducedMotion() ? 0.5 : 1);
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

  // Політ: позиції пишемо прямо в DOM, без перемальовування React на кожному кадрі.
  // На паузі цикл не крутиться; після паузи час підльоту зсувається на її тривалість.
  const pausedSince = useRef<number | null>(null);
  useEffect(() => {
    if (paused) {
      pausedSince.current = performance.now();
      return;
    }
    if (pausedSince.current !== null) {
      const away = performance.now() - pausedSince.current;
      for (const b of bodies.current.values()) b.enteredBy += away;
      pausedSince.current = null;
    }
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
          if (inside || now > b.enteredBy) {
            b.entering = false;
            // Залетів — тепер дрейфує з тією ж швидкістю, що й решта, у тому ж напрямку
            const v = Math.hypot(b.vx, b.vy) || 1;
            const drift = driftSpeed();
            b.vx = (b.vx / v) * drift;
            b.vy = (b.vy / v) * drift;
          }
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
  }, [paused]);

  const addEffects = (list: NewEffect[]) => {
    const fresh = list.map(e => ({ ...e, id: ++effectId.current }) as Effect);
    setEffects(prev => [...prev, ...fresh]);
    setTimeout(() => setEffects(prev => prev.filter(e => !fresh.includes(e))), 800);
  };

  // Зачистка: астероїди на полі лопаються по одному, ті, що ще не залетіли, просто зникають
  useEffect(() => {
    if (!clearing) return;
    const { w, h, d: dia } = size.current;
    const onField = [...bodies.current.entries()].filter(([, b]) =>
      b.x + dia / 2 >= 0 && b.x + dia / 2 <= w && b.y + dia / 2 >= 0 && b.y + dia / 2 <= h);
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Спершу ховаємо тих, хто ще за краєм
    const offField = [...bodies.current.keys()].filter(k => !onField.some(([key]) => key === k));
    if (offField.length) setPopped(prev => new Set([...prev, ...offField]));
    onField.forEach(([key, b], i) => {
      timers.push(setTimeout(() => {
        addEffects([{ kind: "burst", x: b.x + dia / 2, y: b.y + dia / 2 }]);
        setPopped(prev => new Set(prev).add(key));
      }, (i + 1) * POP_EVERY_MS + 250)); // +250 мс — дати догоріти вибуху останнього влучання
    });
    timers.push(setTimeout(onCleared, (onField.length + 1) * POP_EVERY_MS + 250 + 550));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearing]);

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
        if (!w || popped.has(key)) return null;
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
});

// ─── Екрани до й після гри ────────────────────────────────────────────────────

function Intro({ title, count, best, dbOk, onStart }: { title: string; count: number; best: BlastRecord | null; dbOk: boolean; onStart: () => void }) {
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
        <li>☄️ Угорі — переклад. Збий астероїд з іспанським словом, що йому відповідає.</li>
        <li>⏱️ На раунд — 60 секунд: набери ціль (50, 75, 125, 200, 250…), і раунд одразу закінчиться — далі наступний рівень.</li>
        <li>🔥 Влучання — 5 балів × серія: кожне правильне поспіль додає +0.2, до ×3.</li>
        <li>💥 Промах — мінус 2 бали, серія з початку.</li>
        <li>🏁 Не встиг набрати ціль — гра закінчується. Бали всіх раундів складаються в загальний рахунок.</li>
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
          {best ? `Рекорд: ${best.score} · рівень ${best.level}` : "Рекорду ще немає"}
          {!dbOk && " · немає зв'язку з базою — рекорд не збережеться"}
        </p>
      </div>
    </div>
  );
}

function Results({ game, best, newRecord, savedOffline, saveError, dbOk, onAgain, exitHref }: {
  game: BlastGame;
  best: BlastRecord | null;
  newRecord: boolean;
  savedOffline: boolean;
  saveError: string | null;
  dbOk: boolean;
  onAgain: () => void;
  exitHref: string;
}) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-6 py-6 text-center">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Час вийшов на рівні {game.level}: {game.levelScore} з {goalFor(game.level)}</p>
        <p className="text-5xl font-bold tabular-nums">{game.totalScore}</p>
        <p className="text-sm text-muted-foreground">загальний рахунок</p>
        {newRecord ? (
          <p className="text-sm font-semibold text-[#18AE79] animate-in zoom-in-75">🏆 Новий рекорд!</p>
        ) : (
          best && <p className="text-sm text-muted-foreground">Рекорд: {best.score} · рівень {best.level}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={String(game.level - 1)} label="рівнів пройдено" />
        <Stat value={`${accuracy(game)}%`} label="точність" />
        <Stat value={String(game.hits)} label="влучань" />
      </div>
      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      {savedOffline && <p className="text-xs text-muted-foreground">Немає інтернету — результат збережено на телефоні й відправиться, щойно з&apos;явиться зв&apos;язок.</p>}
      {!dbOk && <p className="text-xs text-muted-foreground">Немає зв&apos;язку з базою — рекорд не збережено.</p>}
      <div className="space-y-2">
        <button type="button" onClick={onAgain}
          className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98] transition-all">
          Ще раз
        </button>
        <ExitLink href={exitHref}
          className="w-full min-h-[52px] rounded-2xl border text-sm font-medium flex items-center justify-center hover:bg-accent/40 transition-all">
          До групи
        </ExitLink>
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
