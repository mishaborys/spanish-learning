// Відповіді «Відмінювання»: спершу в чергу на телефоні, звідти — на сервер. Без мережі чекають і не губляться.
import { answerKey, type Answer } from "@/lib/conjugation/core";

const KEY = "conjugation-outbox";
const BATCH = 100;

function read(): Answer[] {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function write(list: Answer[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* немає сховища — відповіді не збережуться */ }
}

/** Сервер відхилив пачку як некоректну (4xx) — повторювати немає сенсу. */
class RejectedError extends Error {}

async function post(answers: Answer[]) {
  const res = await fetch("/api/conjugation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (res.status >= 400 && res.status < 500) throw new RejectedError();
  // 5xx (напр. база на мить недоступна) — як відсутність мережі: відповіді чекатимуть у черзі
  if (!res.ok) throw new Error("Сервер тимчасово недоступний");
}

async function flushOnce() {
  for (;;) {
    const batch = read().slice(0, BATCH);
    if (batch.length === 0) return;
    try { await post(batch); }
    catch (e) { if (!(e instanceof RejectedError)) return; } // немає зв'язку — спробуємо наступного разу
    // Прибираємо саме відправлене; нове, що додалось за цей час, лишається
    write(read().slice(batch.length));
  }
}

let flushing: Promise<void> | null = null;
let again = false;

/** Відправити все, що чекає в черзі (одночасно — лише одна відправка; нове, що з'явилось, піде наступним колом). */
export function flushConjugationOutbox(): Promise<void> {
  if (flushing) { again = true; return flushing; }
  flushing = (async () => {
    do { again = false; await flushOnce(); } while (again);
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Покласти відповіді в чергу й відправити. */
export function submitAnswers(answers: Answer[]): Promise<void> {
  write([...read(), ...answers]);
  return flushConjugationOutbox();
}

/** Правильні відповіді, що ще не дійшли до сервера: їх треба врахувати в прогресі одразу. */
export function queuedCorrectKeys(): string[] {
  return read().filter(a => a.correct).map(a => answerKey(a.verb, a.person, a.step));
}
