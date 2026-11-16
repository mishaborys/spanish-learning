// Навігація «як у застосунку»: кнопка «назад/закрити» має повертати по історії (щоб свайп назад
// вів на батьківський екран), а не додавати ще один запис, на який потім вернеться свайп.
//
// Зберігаємо в sessionStorage, з якого шляху прийшли на поточний. Пишемо з NavTracker (у layout),
// читаємо з ExitLink. sessionStorage може бути недоступний — тоді просто працюємо як звичайне посилання.

const PREV = "nav:prev";
const CUR = "nav:cur";
const REFRESH = "nav:refresh";

function get(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function set(key: string, value: string | null) {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* приватний режим тощо */ }
}

/** Викликається при кожній зміні шляху. Повертає true, якщо після повернення назад треба оновити дані сторінки. */
export function trackPath(pathname: string): boolean {
  if (get(CUR) !== pathname) {
    set(PREV, get(CUR));
    set(CUR, pathname);
  }
  const refresh = get(REFRESH) === "1";
  if (refresh) set(REFRESH, null);
  return refresh;
}

/** Чи попередній екран — саме `pathname` (тоді «назад» по історії дасть те, що треба). */
export function cameFrom(pathname: string): boolean {
  return get(PREV) === pathname;
}

/** Після повернення назад Next бере сторінку з кешу — просимо оновити її (прогрес міг змінитися). */
export function markRefreshAfterBack() {
  set(REFRESH, "1");
}
