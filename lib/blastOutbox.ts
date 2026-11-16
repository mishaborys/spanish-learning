// Рекорди Blast, зароблені без інтернету: зберігаються на телефоні й відправляються, коли з'явиться мережа.

export type BlastScore = { setId: string; groupId: string; score: number; level: number };
export type BlastRecord = { score: number; level: number };

const KEY = "blast-outbox";

function read(): BlastScore[] {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function write(list: BlastScore[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* немає сховища — результат загубиться */ }
}

/** Сервер відхилив результат як некоректний (4xx) — повторювати немає сенсу. */
class RejectedError extends Error {}

async function post(entry: BlastScore): Promise<BlastRecord> {
  const res = await fetch("/api/blast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "score", ...entry }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status >= 400 && res.status < 500) throw new RejectedError(data.error ?? "Некоректний результат");
  // 5xx (напр. база на мить недоступна) — як відсутність мережі: результат чекатиме в черзі
  if (!res.ok) throw new Error(data.error ?? "Сервер тимчасово недоступний");
  return data.best;
}

/**
 * Надіслати результат гри. Без мережі чи при тимчасовій помилці сервера — покласти в чергу й повернути
 * `queued`; відхилений сервером (некоректний рахунок) — кинути.
 */
export async function submitScore(entry: BlastScore): Promise<{ queued: false; best: BlastRecord } | { queued: true }> {
  try {
    return { queued: false, best: await post(entry) };
  } catch (e) {
    if (e instanceof RejectedError) throw e;
    write([...read(), entry]);
    return { queued: true };
  }
}

let flushing: Promise<void> | null = null;

/** Відправити все, що чекає в черзі (одночасно — лише одна відправка). Відхилене сервером викидаємо. */
export function flushOutbox(): Promise<void> {
  flushing ??= flush().finally(() => { flushing = null; });
  return flushing;
}

async function flush() {
  const pending = read();
  if (pending.length === 0) return;
  const settled: BlastScore[] = [];
  for (const entry of pending) {
    try { await post(entry); settled.push(entry); }
    catch (e) { if (e instanceof RejectedError) settled.push(entry); }
  }
  // Прибираємо саме відправлені записи; нові, що додались за цей час, лишаються
  const current = read();
  for (const s of settled) {
    const i = current.indexOf(current.find(c => JSON.stringify(c) === JSON.stringify(s))!);
    if (i >= 0) current.splice(i, 1);
  }
  write(current);
}
