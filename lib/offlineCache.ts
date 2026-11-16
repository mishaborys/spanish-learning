// Офлайн-копія Словника (Flashcards і Blast): завантажується зі сторінки, поки застосунок відкритий,
// у кеші, з яких service worker (public/sw.js) віддає сторінки без мережі. Назви кешів — як у sw.js.
//
// Нова копія спершу качається в окремий кеш і лише повністю (сторінки + усі їхні файли) замінює стару:
// інакше обрив посередині лишив би сторінки нової збірки без її файлів, і офлайн вони б не працювали.

const PAGES = "pages-v1";
const STAGING = "pages-next";
const STATIC = "static-v1";
const META = "meta-v1";
const VERSION_KEY = "/__offline-version";
const ATTEMPT_KEY = "/__offline-attempt";
/**
 * Після невдалої спроби (сервер чи мережа відповіли помилкою) не повторюємо частіше, ніж раз на годину,
 * щоб не качати все при кожному відкритті. Перервана спроба (закрили застосунок) — не невдача: докачаємо одразу.
 */
const RETRY_AFTER_MS = 60 * 60 * 1000;
const PARALLEL = 3;

let running: Promise<void> | null = null;

/** Оновити офлайн-копію для поточної збірки (один раз на деплой; повторні виклики — без дії). */
export function refreshOfflineCopy(version: string): Promise<void> {
  if (typeof caches === "undefined" || !navigator.onLine) return Promise.resolve();
  running ??= run(version).catch(() => { /* спробуємо пізніше */ }).finally(() => { running = null; });
  return running;
}

async function run(version: string) {
  const meta = await caches.open(META);
  const done = await meta.match(VERSION_KEY);
  if (done && (await done.text()) === version) return;
  const attempt = await meta.match(ATTEMPT_KEY);
  if (attempt) {
    const [v, at] = (await attempt.text()).split("|");
    if (v === version && Date.now() - Number(at) < RETRY_AFTER_MS) return;
  }

  const res = await fetch("/api/offline-urls", { cache: "no-store" });
  if (!res.ok) return;
  const { urls } = (await res.json()) as { urls: string[] };

  await caches.delete(STAGING);
  const staging = await caches.open(STAGING);
  const statics = await caches.open(STATIC);
  const assets = new Set<string>();
  let failed = false;

  // 1. Сторінки — у тимчасовий кеш, по кілька одночасно
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url && !failed; url = queue.shift()) {
      try {
        const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        // Перенаправлені відповіді Safari не віддає з кешу для навігації
        if (!r.ok || r.redirected) { failed = true; break; }
        const html = await r.clone().text();
        await staging.put(url, r);
        for (const a of html.match(/\/_next\/static\/[^"'\\\s)]+/g) ?? []) assets.add(a);
      } catch { failed = true; }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  // 2. Файли збірки, на які посилаються сторінки, і шрифти зі стилів (старі поки не чіпаємо)
  if (!failed) {
    for (const a of [...assets]) {
      try {
        let r = await statics.match(a);
        if (!r) {
          r = await fetch(a);
          if (!r.ok) { failed = true; break; }
          await statics.put(a, r.clone());
        }
        if (a.endsWith(".css")) {
          for (const f of (await r.text()).match(/\/_next\/static\/media\/[^"')\s]+/g) ?? []) {
            assets.add(f);
            if (await statics.match(f)) continue;
            const fr = await fetch(f);
            if (!fr.ok) { failed = true; break; }
            await statics.put(f, fr);
          }
        }
      } catch { failed = true; break; }
    }
  }
  if (failed) {
    await caches.delete(STAGING); // стара копія лишається робочою
    await meta.put(ATTEMPT_KEY, new Response(`${version}|${Date.now()}`));
    return;
  }

  // 3. Усе на місці — нова копія замінює стару, файли попередніх збірок прибираємо
  const pages = await caches.open(PAGES);
  for (const req of await staging.keys()) {
    const r = await staging.match(req);
    if (r) await pages.put(req, r);
  }
  const keep = new Set(urls);
  for (const req of await pages.keys()) {
    if (!keep.has(new URL(req.url).pathname)) await pages.delete(req);
  }
  for (const req of await statics.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/_next/static/") && !assets.has(path)) await statics.delete(req);
  }
  await caches.delete(STAGING);
  await meta.put(VERSION_KEY, new Response(version));
  await meta.delete(ATTEMPT_KEY);
}
