import type { VocabWord } from "@/lib/vocabulary";

/** Звукова асоціація та приклад слова зі Словника. */
export function WordNotes({ word, className = "" }: { word: VocabWord; className?: string }) {
  if (!word.sound_association && !word.example_es) return null;
  return (
    <div className={`space-y-2 text-left ${className}`}>
      {word.sound_association && (
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Звукова асоціація</p>
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed mt-0.5">{word.sound_association}</p>
        </div>
      )}
      {word.example_es && (
        <div className="bg-sky-50 dark:bg-sky-950/30 rounded-2xl p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-1">Приклад</p>
          <p className="text-sm font-medium text-sky-900 dark:text-sky-100 italic">{word.example_es}</p>
          <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">{word.example_uk}</p>
        </div>
      )}
    </div>
  );
}

export function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
