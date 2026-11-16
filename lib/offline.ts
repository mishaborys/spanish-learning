// Що зберігати на телефоні для роботи без інтернету: Словник, Flashcards і Blast усіх груп.
import { allWordsGroup, loadVocabularySets, setHref } from "@/lib/vocabulary";

/** Сторінка «немає інтернету» — показується замість усього, чого немає в офлайн-копії. */
export const OFFLINE_PAGE = "/offline";

/**
 * Адреси сторінок, які service worker зберігає для офлайну. Набори з однією групою
 * не мають власної сторінки (там перенаправлення), тож у списку лише їхня група.
 */
export function offlineUrls(): string[] {
  const urls = ["/dictionary", OFFLINE_PAGE];
  for (const set of loadVocabularySets()) {
    const all = allWordsGroup(set);
    const groups = all ? [...set.groups, all] : set.groups;
    if (setHref(set) === `/dictionary/${set.id}`) urls.push(setHref(set));
    for (const g of groups) {
      const base = `/dictionary/${set.id}/${g.id}`;
      urls.push(base, `${base}/flashcards`, `${base}/blast`);
    }
  }
  return urls;
}
