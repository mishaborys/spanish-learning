// Відповіді «Речень»: спершу в чергу на телефоні, звідти — на сервер. Без мережі чекають і не губляться.
import type { SentenceAnswer } from "@/lib/sentences/core";

type Entry = SentenceAnswer & { deck: string };

const KEY = "sentences-outbox";
const BATCH = 100;

function read(): Entry[] {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function write(list: Entry[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* немає сховища — відповіді не збережуться */ }
}

/** Сервер відхилив пачку як некоректну (4xx) — повторювати немає сенсу. */
class RejectedError extends Error {}

async function post(deck: string, answers: SentenceAnswer[]) {
  const res = await fetch("/api/sentences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deck, answers }),
  });
  if (res.status >= 400 && res.status < 500) throw new RejectedError();
  // 5xx (напр. база на мить недоступна) — як відсутність мережі: відповіді чекатимуть у черзі
  if (!res.ok) throw new Error("Сервер тимчасово недоступний");
}

async function flushOnce() {
  for (;;) {
    const pending = read();
    if (pending.length === 0) return;
    // Пачка — підряд записи однієї колоди (на практиці колода одна)
    const deck = pending[0].deck;
    const batch = pending.filter(e => e.deck === deck).slice(0, BATCH);
    try { await post(deck, batch.map(({ id, correct }) => ({ id, correct }))); }
    catch (e) { if (!(e instanceof RejectedError)) return; } // немає зв'язку — спробуємо наступного разу
    // Прибираємо саме відправлені (за порядком); нове, що додалось за цей час, лишається
    const current = read();
    let left = batch.length;
    write(current.filter(e => !(e.deck === deck && left-- > 0)));
  }
}

let flushing: Promise<void> | null = null;
let again = false;

/** Відправити все, що чекає в черзі (одночасно — лише одна відправка; нове, що з'явилось, піде наступним колом). */
export function flushSentencesOutbox(): Promise<void> {
  if (flushing) { again = true; return flushing; }
  flushing = (async () => {
    do { again = false; await flushOnce(); } while (again);
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Покласти відповідь у чергу й відправити. */
export function submitSentenceAnswer(deck: string, answer: SentenceAnswer): Promise<void> {
  write([...read(), { deck, ...answer }]);
  return flushSentencesOutbox();
}

/** Правильні відповіді колоди, що ще не дійшли до сервера: їх треба врахувати в прогресі одразу. */
export function queuedCorrectIds(deck: string): string[] {
  return read().filter(e => e.deck === deck && e.correct).map(e => e.id);
}
