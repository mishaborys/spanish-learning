import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSession, checkForm, checkOrder, chipsOf, itemsToRetry, newSession, normalizeForm, PERSONS, restoreSession, shuffledChips,
  type Item, type ItemResult,
} from "./core";
import { loadConjugation } from "./data";

const verbs = loadConjugation();
const byInf = Object.fromEntries(verbs.map(v => [v.infinitive, v]));
const tokensOf = (s: string) => s.split(/[^\p{L}]+/u).filter(Boolean);

// ─── Вписана форма ────────────────────────────────────────────────────────────

test("наголоси, ñ і регістр не важливі", () => {
  assert.ok(checkForm("salis", "salís"));
  assert.ok(checkForm("  Sueno ", "sueño"));
  assert.ok(checkForm("DUERMES", "duermes"));
});

test("літери важливі: сусідня форма — помилка, одруківка теж", () => {
  assert.ok(!checkForm("hablo", "habla"));
  assert.ok(!checkForm("duermo", "dormo"));
  assert.ok(!checkForm("habla", "hablaa"));
  assert.ok(!checkForm("", "habla"));
  assert.equal(normalizeForm("  Ü  ñ"), "u n");
});

// ─── Речення ──────────────────────────────────────────────────────────────────

test("слова речення — без розділових знаків і великої літери на початку", () => {
  assert.deepEqual(chipsOf("¿Qué hace usted por la noche?"), ["qué", "hace", "usted", "por", "la", "noche"]);
  assert.deepEqual(chipsOf("Nosotros vivimos en Kiev."), ["nosotros", "vivimos", "en", "Kiev"]);
});

test("зараховується основний порядок слів і кожен із запасних", () => {
  const s = byInf.trabajar.sentences.el; // Él trabaja por la mañana. | Por la mañana él trabaja.
  assert.ok(checkOrder(["él", "trabaja", "por", "la", "mañana"], s));
  assert.ok(checkOrder(["por", "la", "mañana", "él", "trabaja"], s));
  assert.ok(!checkOrder(["trabaja", "él", "por", "la", "mañana"], s));
  assert.ok(!checkOrder(["él", "trabaja", "por", "la"], s));
});

test("слова для складання перемішані й не лежать у правильному порядку", () => {
  for (const v of verbs) for (const p of PERSONS) {
    const s = v.sentences[p];
    const chips = shuffledChips(s);
    assert.deepEqual([...chips].sort(), [...chipsOf(s.es)].sort(), `${v.infinitive} ${p}`);
    assert.ok(!checkOrder(chips, s), `${v.infinitive} ${p}: слова вже в порядку`);
  }
});

// ─── Сесія ────────────────────────────────────────────────────────────────────

test("сесія — 10 різних дієслів, особа з шести; фільтр обмежує вибір", () => {
  const items = buildSession(verbs, "all");
  assert.equal(items.length, 10);
  assert.equal(new Set(items.map(i => i.verb)).size, 10);
  assert.ok(items.every(i => PERSONS.includes(i.person)));
  const irregular = buildSession(verbs, "irregular");
  assert.ok(irregular.every(i => byInf[i.verb].group === "irregular"));
  const regular = buildSession(verbs, "regular");
  assert.ok(regular.every(i => byInf[i.verb].group === "regular"));
});

test("щойно пройдені дієслова не повторюються, поки є інші", () => {
  const first = buildSession(verbs, "all").map(i => i.verb);
  const next = buildSession(verbs, "all", { avoid: new Set(first) });
  assert.ok(next.every(i => !first.includes(i.verb)));
  // але якщо інших не вистачає — беруться й вони
  const few = verbs.filter(v => v.group === "irregular").map(v => v.infinitive);
  assert.equal(buildSession(verbs, "irregular", { avoid: new Set(few) }).length, 10);
});

test("з помилкою в формі чи реченні пара йде на повтор", () => {
  const items: Item[] = [
    { verb: "hablar", person: "yo" }, { verb: "comer", person: "tu" },
    { verb: "vivir", person: "el" }, { verb: "hacer", person: "ellos" },
  ];
  const results: ItemResult[] = [
    { form: true, order: true }, { form: false, order: true }, { form: true, order: false }, { form: false, order: false },
  ];
  assert.deepEqual(itemsToRetry(items, results).map(i => i.verb), ["comer", "vivir", "hacer"]);
});

// ─── Дані ─────────────────────────────────────────────────────────────────────

test("40 дієслів: 22 правильних і 18 неправильних, без повторів", () => {
  assert.equal(verbs.length, 40);
  assert.equal(new Set(verbs.map(v => v.infinitive)).size, 40);
  assert.equal(verbs.filter(v => v.group === "regular").length, 22);
  assert.equal(verbs.filter(v => v.group === "irregular").length, 18);
});

test("правильні дієслова відмінюються за таблицею закінчень", () => {
  const END = { ar: ["o", "as", "a", "amos", "áis", "an"], er: ["o", "es", "e", "emos", "éis", "en"], ir: ["o", "es", "e", "imos", "ís", "en"] };
  for (const v of verbs.filter(v => v.group === "regular")) {
    const ending = END[v.infinitive.slice(-2) as keyof typeof END];
    assert.equal(v.kind, v.infinitive.slice(-2), v.infinitive);
    PERSONS.forEach((p, i) => assert.equal(v.forms[p], v.infinitive.slice(0, -2) + ending[i], `${v.infinitive} ${p}`));
  }
});

test("неправильні форми — як у підручнику", () => {
  const expect: Record<string, string> = {
    hacer: "hago haces hace hacemos hacéis hacen", salir: "salgo sales sale salimos salís salen",
    ver: "veo ves ve vemos veis ven", saber: "sé sabes sabe sabemos sabéis saben",
    conocer: "conozco conoces conoce conocemos conocéis conocen", jugar: "juego juegas juega jugamos jugáis juegan",
    dormir: "duermo duermes duerme dormimos dormís duermen", volver: "vuelvo vuelves vuelve volvemos volvéis vuelven",
    querer: "quiero quieres quiere queremos queréis quieren", pedir: "pido pides pide pedimos pedís piden",
    perder: "pierdo pierdes pierde perdemos perdéis pierden", probar: "pruebo pruebas prueba probamos probáis prueban",
    soñar: "sueño sueñas sueña soñamos soñáis sueñan", decir: "digo dices dice decimos decís dicen",
    ir: "voy vas va vamos vais van", ser: "soy eres es somos sois son",
    estar: "estoy estás está estamos estáis están", tener: "tengo tienes tiene tenemos tenéis tienen",
  };
  for (const [inf, forms] of Object.entries(expect)) assert.equal(PERSONS.map(p => byInf[inf].forms[p]).join(" "), forms, inf);
  assert.equal(verbs.filter(v => v.group === "irregular").length, Object.keys(expect).length);
});

test("у кожного з 240 речень є своя форма дієслова, переклад, а запасні порядки — з тих самих слів", () => {
  for (const v of verbs) for (const p of PERSONS) {
    const s = v.sentences[p];
    assert.ok(s.uk.trim(), `${v.infinitive} ${p}: немає перекладу`);
    for (const variant of [s.es, ...(s.alt ?? [])]) {
      assert.ok(tokensOf(variant).includes(v.forms[p]), `${v.infinitive} ${p}: у «${variant}» немає ${v.forms[p]}`);
      assert.deepEqual(chipsOf(variant).map(c => c.toLowerCase()).sort(), chipsOf(s.es).map(c => c.toLowerCase()).sort());
    }
  }
});

// ─── Збережена сесія ──────────────────────────────────────────────────────────

test("збережена сесія відновлюється, якщо відповідає даним", () => {
  const s = newSession(verbs, "all");
  assert.deepEqual(restoreSession(JSON.parse(JSON.stringify(s)), verbs), s);
  const mid = { ...s, index: 2, results: [{ form: true, order: false }, { form: false, order: false }] };
  assert.deepEqual(restoreSession(mid, verbs), mid);
});

test("зіпсована чи застаріла сесія не відновлюється", () => {
  const s = newSession(verbs, "regular");
  assert.equal(restoreSession(null, verbs), null);
  assert.equal(restoreSession({ ...s, filter: "other" }, verbs), null);
  assert.equal(restoreSession({ ...s, items: [{ verb: "volar", person: "yo" }] }, verbs), null);
  assert.equal(restoreSession({ ...s, items: [{ verb: "hablar", person: "usted" }] }, verbs), null);
  assert.equal(restoreSession({ ...s, index: 99 }, verbs), null);
  assert.equal(restoreSession({ ...s, index: 1, results: [] }, verbs), null); // результатів менше, ніж пройдено
  assert.equal(restoreSession({ ...s, round: 0 }, verbs), null);
});
