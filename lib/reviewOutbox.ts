// Оцінки Повторення з Flashcards: спершу лягають у чергу на телефоні, потім по черзі відправляються.
// Без інтернету (чи при тимчасовій помилці сервера) чекають, доки з'явиться зв'язок; порядок важливий —
// «Назад» (скасування) має дійти після оцінки, яку скасовує.
// Відправлені записи лишаються в журналі до кінця дня (`sent`): сторінка могла відкритися зі старої копії
// чи знімка, де цих оцінок ще немає, — журнал накладається поверх і показує актуальний стан.
import { kyivDay, type Grade } from "@/lib/review/core";

type Target = { day: string; batch: number; key: string };
export type ReviewOp = ((Target & { op: "answer"; grade: Grade; answeredOn: string }) | (Target & { op: "undo" })) & {
  /** Уже дійшло до сервера. */
  sent?: boolean;
};

const KEY = "review-outbox";
const listeners = new Set<() => void>();
let memory: string | null = null; // якщо сховище недоступне

function readRaw(): string {
  try { return window.localStorage.getItem(KEY) ?? "[]"; } catch { return memory ?? "[]"; }
}

function parse(raw: string): ReviewOp[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

const read = () => parse(readRaw());

function write(list: ReviewOp[]) {
  // Відправлене за минулі дні вже не потрібне — сторінки показують лише сьогоднішню добірку
  const today = kyivDay(new Date());
  const raw = JSON.stringify(list.filter(o => !o.sent || o.day >= today));
  try { window.localStorage.setItem(KEY, raw); } catch { memory = raw; }
  listeners.forEach(l => l());
}

const same = (a: Target, b: Target) => a.day === b.day && a.batch === b.batch && a.key === b.key;

/** Поставити оцінку: у чергу й одразу спробувати відправити. */
export function queueAnswer(t: Target, grade: Grade) {
  write([...read(), { op: "answer", ...t, grade, answeredOn: kyivDay(new Date()) }]);
  void flushReviewOutbox();
}

/** Скасувати оцінку. Якщо вона ще не пішла на сервер — просто прибрати її з черги. */
export function queueUndo(t: Target) {
  const list = read();
  const i = list.findLastIndex(o => o.op === "answer" && same(o, t));
  if (i >= 0 && !list[i].sent && JSON.stringify(list[i]) !== inFlight) {
    list.splice(i, 1);
    write(list);
  } else {
    write([...list, { op: "undo", ...t }]);
  }
  void flushReviewOutbox();
}

/**
 * Оцінки добірки з урахуванням журналу: серверні, поверх них по порядку — оцінки (перша рахується,
 * як і на сервері) і скасування. Повторне накладання вже врахованого сервером нічого не змінює.
 */
export function mergeAnswers(server: Record<string, Grade>, ops: ReviewOp[], day: string, batch: number): Record<string, Grade> {
  const merged = { ...server };
  for (const o of ops) {
    if (o.day !== day || o.batch !== batch) continue;
    if (o.op === "undo") delete merged[o.key];
    else if (!merged[o.key]) merged[o.key] = o.grade;
  }
  return merged;
}

// ─── Підписка для useSyncExternalStore ────────────────────────────────────────

export function subscribeOutbox(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}

/** Знімок черги рядком (стабільний між викликами, поки черга не змінилась). */
export const outboxSnapshot = readRaw;
export const parseOutbox = parse;

// ─── Відправка ────────────────────────────────────────────────────────────────

/** Сервер відхилив запит як некоректний (4xx) — повторювати немає сенсу. */
class RejectedError extends Error {}

async function post(op: ReviewOp) {
  const body = op.op === "answer"
    ? { action: "answer", day: op.day, batch: op.batch, key: op.key, grade: op.grade, answeredOn: op.answeredOn }
    : { action: "undo", day: op.day, batch: op.batch, key: op.key };
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status >= 400 && res.status < 500) throw new RejectedError();
  if (!res.ok) throw new Error("Сервер тимчасово недоступний");
}

let flushing: Promise<void> | null = null;
/** Запис, який зараз відправляється (рядком) — його вже не можна просто прибрати з черги. */
let inFlight: string | null = null;

/** Відправити чергу по порядку (одночасно — лише одна відправка). Зупиняється на першій тимчасовій помилці. */
export function flushReviewOutbox(): Promise<void> {
  flushing ??= flush().finally(() => { flushing = null; inFlight = null; });
  return flushing;
}

async function flush() {
  for (;;) {
    const first = read().find(o => !o.sent);
    if (!first) return;
    inFlight = JSON.stringify(first);
    let rejected = false;
    try {
      await post(first);
    } catch (e) {
      if (!(e instanceof RejectedError)) return; // немає мережі — решта чекає, порядок зберігаємо
      rejected = true;
    }
    // Позначаємо саме відправлений запис (за час відправки черга могла змінитися); відхилений — викидаємо
    const current = read();
    const i = current.findIndex(o => JSON.stringify(o) === inFlight);
    if (i >= 0) {
      if (rejected) current.splice(i, 1);
      else current[i] = { ...current[i], sent: true };
    }
    inFlight = null;
    write(current);
  }
}
