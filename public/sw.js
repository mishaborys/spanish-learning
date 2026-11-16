// Service worker: офлайн-копія Словника (Flashcards і Blast) для застосунку на головному екрані.
//
// - Сторінки Словника: спершу мережа (повільна — до 4 с, якщо є копія), без мережі — збережена копія.
//   Решта сторінок — лише мережа; без неї — перехід на «немає інтернету».
// - Файли збірки (/_next/static/…): незмінні (у назві хеш), тож спершу кеш.
// - Іконки й маніфест: віддаємо збережене й тихо оновлюємо.
// - Офлайн-копію всіх сторінок Словника завантажує сама сторінка (lib/offlineCache.ts) у ті самі кеші:
//   довга фонова робота всередині service worker ненадійна — браузер (особливо iOS) його присипляє.

const PAGES = "pages-v1";
const STATIC = "static-v1";
const OFFLINE_PAGE = "/offline";
/** Скільки чекати мережу, коли є збережена копія сторінки (повільний зв'язок). */
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

const isBuildFile = url => url.pathname.startsWith("/_next/static/");
const isAppFile = url => /^\/(icon-\d+\.png|apple-icon\.png|icon\.svg|manifest\.json)$/.test(url.pathname);
/** Сторінки, які мають офлайн-копію (Словник) — тільки їх і зберігаємо. */
const isOfflinePage = url => url.pathname === OFFLINE_PAGE || url.pathname === "/dictionary" || url.pathname.startsWith("/dictionary/");

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (isBuildFile(url)) event.respondWith(cacheFirst(event));
  else if (isAppFile(url)) event.respondWith(staleWhileRevalidate(event));
  else if (req.mode === "navigate") event.respondWith(page(event, url));
  // Решта (дані навігації Next.js тощо) — як є: без мережі запит падає,
  // і Next.js відкриває сторінку звичайним переходом, який уже обробляє page().
});

async function cacheFirst(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok) event.waitUntil(cache.put(event.request, res.clone()));
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request);
  const update = fetch(event.request).then(res => {
    if (res.ok) return cache.put(event.request, res.clone()).then(() => res);
    return res;
  });
  event.waitUntil(update.catch(() => {}));
  return hit ?? update;
}

async function page(event, url) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  const cached = isOfflinePage(url) ? await cache.match(req.url, { ignoreVary: true, ignoreSearch: true }) : undefined;
  const network = fetch(req);
  try {
    // Таймаут лише коли є що віддати замість мережі; інакше чекаємо повільну мережу до кінця
    const res = cached ? await withTimeout(network, NETWORK_TIMEOUT_MS) : await network;
    // Перенаправлені відповіді Safari не віддає з кешу для навігації — такі не зберігаємо
    if (res.ok && !res.redirected && isOfflinePage(url)) event.waitUntil(cache.put(req.url, res.clone()));
    return res;
  } catch {
    if (cached) return cached;
    // Сторінки немає в копії — переходимо на «немає інтернету» (саме перехід, а не підміна вмісту:
    // інакше адреса й сторінка не збіглися б і React перемальовував би сторінку)
    const offline = await cache.match(OFFLINE_PAGE, { ignoreVary: true });
    if (offline && url.pathname !== OFFLINE_PAGE) return Response.redirect(new URL(OFFLINE_PAGE, req.url).href, 302);
    return offline ?? new Response("Немає інтернету", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
