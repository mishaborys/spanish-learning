// Правила довгого повторення. Чистий модуль: без БД, без файлів, без React —
// тому працює і на сервері, і в браузері, і тестується напряму.

export type Grade = "known" | "hesitant" | "unknown";
export type Mode = "cards-es-ua" | "cards-ua-es" | "type";

export const MODES: Mode[] = ["cards-es-ua", "cards-ua-es", "type"];
export const GRADES: Grade[] = ["known", "hesitant", "unknown"];

/** Інтервали (у днях) для оцінки «знаю». Після останнього — не росте. */
export const INTERVALS = [14, 30, 60, 120] as const;
export const HESITANT_DAYS = 2;
export const UNKNOWN_DAYS = 1;
export const REPEAT_SLOTS = 5;
export const FRESH_SLOTS = 5;

/** Стан слова в розкладі. `level` — скільки сходинок драбини пройдено (0..INTERVALS.length). */
export type Card = { key: string; level: number; dueOn: string; lastGrade: Grade };

export type Rng = () => number;

// ─── Дні ──────────────────────────────────────────────────────────────────────

/** Календарний день за Києвом у форматі YYYY-MM-DD. */
export function kyivDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Розклад ──────────────────────────────────────────────────────────────────

/** Ключ слова: іспанське написання без зайвих пробілів і без регістру. */
export function wordKey(spanish: string): string {
  return spanish.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Новий стан слова після оцінки. */
export function nextCard(prev: Card | null, key: string, grade: Grade, today: string): Card {
  // level = скільки сходинок пройдено (0..INTERVALS.length); на верхній сходинці інтервал не росте.
  const level = prev?.level ?? 0;
  const last = INTERVALS.length - 1;
  switch (grade) {
    case "known":
      return { key, level: Math.min(level + 1, INTERVALS.length), dueOn: addDays(today, INTERVALS[Math.min(level, last)]), lastGrade: grade };
    case "hesitant":
      // Наступне «знаю» дасть той самий інтервал, що й попереднє.
      return { key, level: Math.max(level - 1, 0), dueOn: addDays(today, HESITANT_DAYS), lastGrade: grade };
    case "unknown":
      return { key, level: 0, dueOn: addDays(today, UNKNOWN_DAYS), lastGrade: grade };
  }
}

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Добірка з 10 слів: 5 на повторення (спочатку борг — «не знаю»/«вагався»,
 * потім планові «знаю» з найбільшим простроченням) + 5 нових випадкових.
 * Якщо в одній групі не вистачає — добираємо з іншої.
 */
export function pickBatch(opts: {
  cards: Card[];
  allKeys: string[];
  exclude?: Set<string>;
  today: string;
  rng?: Rng;
}): string[] {
  const { cards, allKeys, today, rng = Math.random } = opts;
  const exclude = opts.exclude ?? new Set<string>();
  const known = new Set(allKeys);

  const due = cards
    .filter(c => c.dueOn <= today && known.has(c.key) && !exclude.has(c.key))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const repeatPool = [
    ...due.filter(c => c.lastGrade !== "known"),
    ...due.filter(c => c.lastGrade === "known"),
  ].map(c => c.key);

  const seen = new Set(cards.map(c => c.key));
  const freshPool = shuffle(allKeys.filter(k => !seen.has(k) && !exclude.has(k)), rng);

  const total = REPEAT_SLOTS + FRESH_SLOTS;
  let nRepeat = Math.min(REPEAT_SLOTS, repeatPool.length);
  const nFresh = Math.min(total - nRepeat, freshPool.length);
  nRepeat = Math.min(total - nFresh, repeatPool.length);

  return shuffle([...repeatPool.slice(0, nRepeat), ...freshPool.slice(0, nFresh)], rng);
}

/** Скільки слів буде в пулі повторення на певний день. */
export function countDue(cards: Card[], day: string, allKeys: Set<string>): number {
  return cards.filter(c => c.dueOn <= day && allKeys.has(c.key)).length;
}

/** Режим дня: випадковий, але не такий, як попередній. */
export function pickMode(previous: Mode | null, rng: Rng = Math.random): Mode {
  const options = MODES.filter(m => m !== previous);
  return options[Math.floor(rng() * options.length)];
}

// ─── Перевірка вписаного слова ────────────────────────────────────────────────

const ARTICLE_GENDER: Record<string, "m" | "f"> = {
  el: "m", los: "m", un: "m", unos: "m",
  la: "f", las: "f", una: "f", unas: "f",
};
const ARTICLE_RE = /^(el|la|los|las|un|una|unos|unas)(?:\/(el|la|los|las|un|una))?\s+(.+)$/;

/** Без наголосів, ñ→n, без розділових знаків і регістру. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[¿¡?!.,;:"'«»…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Alternative = { genders: Set<"m" | "f">; forms: string[] };

/** «el ordenador / la computadora», «contento/a», «el/la cantante», «el piso (Ісп.)». */
export function parseTarget(spanish: string): Alternative[] {
  const withoutNotes = spanish.replace(/\([^)]*\)/g, " ");
  // «la sala (de estar)» — іспанський текст у дужках є необов'язковою частиною слова
  const withOptional = spanish.replace(/\(([^)]*)\)/g, (_, inner: string) =>
    /^[a-záéíóúüñ\s]+$/i.test(inner) ? inner : " ");
  const sources = withOptional === withoutNotes ? [withoutNotes] : [withoutNotes, withOptional];
  return sources.flatMap(parseAlternatives);
}

function parseAlternatives(spanish: string): Alternative[] {
  return spanish
    .split(/\s+\/\s+/)
    .map(alt => normalizeAnswer(alt))
    .filter(Boolean)
    .map(alt => {
      const genders = new Set<"m" | "f">();
      let rest = alt;
      const m = alt.match(ARTICLE_RE);
      if (m) {
        genders.add(ARTICLE_GENDER[m[1]]);
        if (m[2]) genders.add(ARTICLE_GENDER[m[2]]);
        rest = m[3];
      }
      const g = rest.match(/^(.*?)(\S+)\/(as?)$/);
      let forms = [rest];
      if (g) {
        const [, prefix, word, suffix] = g;
        const fem = /os?$/.test(word) ? word.replace(/os?$/, suffix) : word + suffix;
        forms = [prefix + word, prefix + fem];
      }
      return { genders, forms };
    });
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const TYPO_MIN_LENGTH = 5;

function matchTarget(input: string, spanish: string): Grade | null {
  const inp = normalizeAnswer(input);
  if (!inp) return null;
  if (inp === normalizeAnswer(spanish.replace(/\([^)]*\)/g, " "))) return "known";
  const m = inp.match(/^(el|la|los|las|un|una|unos|unas)\s+(.+)$/);
  const inGender = m ? ARTICLE_GENDER[m[1]] : null;
  const inCore = m ? m[2] : inp;

  let best: Grade | null = null;
  for (const alt of parseTarget(spanish)) {
    for (const form of alt.forms) {
      if (inp === form) return "known";
      if (inCore === form) {
        if (inGender && alt.genders.size > 0 && !alt.genders.has(inGender)) best = "hesitant";
        else return "known";
      } else if (form.length >= TYPO_MIN_LENGTH && editDistanceAtMost1(inCore, form)) {
        best = "hesitant";
      }
    }
  }
  return best;
}

/**
 * Оцінка вписаної відповіді:
 * - знаю: правильне слово (артикль можна не писати);
 * - вагався: неправильний артикль, одна опечатка, або інше слово з тим самим перекладом;
 * - не знаю: все інше.
 */
export function gradeTyped(input: string, spanish: string, sameTranslation: string[] = []): Grade {
  const direct = matchTarget(input, spanish);
  if (direct) return direct;
  if (sameTranslation.some(other => matchTarget(input, other) === "known")) return "hesitant";
  return "unknown";
}

/** Підказка для UA→ES, коли той самий переклад має кілька слів: перша літера без артикля. */
export function firstLetterHint(spanish: string): string {
  const alt = parseTarget(spanish)[0];
  const form = alt?.forms[0] ?? spanish;
  return `${form.charAt(0)}…`;
}
