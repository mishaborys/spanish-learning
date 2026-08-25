"use client";

import { useState, useMemo } from "react";
import { Word, QuizSentence } from "@/lib/db";
import { FlashCards } from "./FlashCards";
import { Quiz } from "./Quiz";
import { FillInBlank } from "./FillInBlank";

type Tab = "grammar" | "cards" | "quiz" | "fill";

const BASE_TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "grammar", label: "Граматика", emoji: "📖" },
  { id: "cards",   label: "Картки",    emoji: "🃏" },
  { id: "quiz",    label: "Тест",      emoji: "✏️" },
];

const FILL_TAB: { id: Tab; label: string; emoji: string } =
  { id: "fill", label: "Вписати", emoji: "⌨️" };

const VERB_RE = /^.+(ar|er|ir)$/i;

type Props = { grammarText: string; words: Word[]; fillWords?: string[]; quizSentences?: QuizSentence[] };

export function TopicTabs({ grammarText, words, fillWords, quizSentences }: Props) {
  const isVerbTopic = useMemo(() => {
    const n = words.filter(w => VERB_RE.test(w.spanish)).length;
    return n > words.length * 0.7;
  }, [words]);

  const tabs = isVerbTopic ? [...BASE_TABS, FILL_TAB] : BASE_TABS;

  const [tab, setTab] = useState<Tab>("grammar");

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex rounded-2xl bg-muted p-1 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-all
              ${tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }
            `}
          >
            <span className="text-base leading-none">{t.emoji}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "grammar" && (
        <div className={`
          prose prose-sm dark:prose-invert max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2
          prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1.5
          prose-p:text-sm prose-p:leading-relaxed
          prose-li:text-sm
          prose-table:text-sm prose-table:w-full
          prose-th:text-xs prose-th:font-semibold prose-th:text-muted-foreground
          prose-td:py-1.5
          prose-strong:font-semibold
          prose-code:text-xs prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-normal
          [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:px-3 [&_td]:px-3 [&_table]:rounded-xl [&_table]:overflow-hidden
        `}>
          {grammarText ? (
            <div dangerouslySetInnerHTML={{ __html: grammarText }} />
          ) : (
            <p className="text-muted-foreground">Пояснення ще немає.</p>
          )}
        </div>
      )}

      {tab === "cards" && <FlashCards words={words} />}
      {tab === "quiz"  && <Quiz words={words} quizSentences={quizSentences} />}
      {tab === "fill"  && <FillInBlank words={fillWords ? words.filter(w => fillWords.includes(w.spanish)) : words} />}
    </div>
  );
}
