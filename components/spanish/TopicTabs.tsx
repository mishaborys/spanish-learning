"use client";

import { useState, useMemo } from "react";
import { Word, QuizSentence } from "@/lib/db";
import { FlashCards } from "./FlashCards";
import { Quiz } from "./Quiz";
import { FillInBlank } from "./FillInBlank";
import { Conjugation } from "./Conjugation";
import { SentencePractice } from "./SentencePractice";
import type { ConjVerb } from "@/lib/conjugation/core";
import type { SentenceDeck } from "@/lib/sentences/core";

type Tab = "grammar" | "cards" | "quiz" | "fill" | "conj" | "sentences";

const BASE_TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "grammar", label: "Граматика", emoji: "📖" },
  { id: "cards",   label: "Картки",    emoji: "🃏" },
  { id: "quiz",    label: "Тест",      emoji: "✏️" },
];

const FILL_TAB: { id: Tab; label: string; emoji: string } =
  { id: "fill", label: "Вписати", emoji: "⌨️" };

const CONJ_TAB: { id: Tab; label: string; emoji: string } =
  { id: "conj", label: "Відмінювання", emoji: "🔄" };

const SENTENCES_TAB: { id: Tab; label: string; emoji: string } =
  { id: "sentences", label: "Речення", emoji: "🧩" };

const VERB_RE = /^.+(ar|er|ir)$/i;

type Props = {
  grammarText: string;
  words: Word[];
  fillWords?: string[];
  quizSentences?: QuizSentence[];
  /** Є лише в темі про відмінювання: вправа «форма → речення». */
  conjugation?: ConjVerb[];
  /** Ключі правильних відповідей вправи «Відмінювання» (прогрес із сервера). */
  conjugationDone?: string[];
  /** Є лише в темах із вправою «Речення»: колода речень і id тих, що вже складено правильно. */
  sentenceDeck?: SentenceDeck;
  sentenceDone?: string[];
};

export function TopicTabs({ grammarText, words, fillWords, quizSentences, conjugation, conjugationDone, sentenceDeck, sentenceDone }: Props) {
  const isVerbTopic = useMemo(() => {
    const n = words.filter(w => VERB_RE.test(w.spanish)).length;
    return n > words.length * 0.7;
  }, [words]);

  // Тема про відмінювання: лише граматика й вправа. Слова вчимо в Словнику, тож без карток і тесту
  // Тема без слів (лише урок із граматикою): жодних порожніх карток і тесту
  const tabs = conjugation
    ? [BASE_TABS[0], CONJ_TAB]
    : sentenceDeck ? [BASE_TABS[0], SENTENCES_TAB]
    : words.length === 0 ? [BASE_TABS[0]]
    : isVerbTopic ? [...BASE_TABS, FILL_TAB] : BASE_TABS;

  const [tab, setTab] = useState<Tab>("grammar");

  return (
    <div className="space-y-5">
      {/* Tab bar (одна вкладка — нічого перемикати) */}
      {tabs.length > 1 && <div className="flex rounded-2xl bg-muted p-1 gap-1">
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
      </div>}

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
          [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:px-3 [&_td]:px-3 [&_table]:rounded-xl [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto
        `}>
          {grammarText ? (
            <div dangerouslySetInnerHTML={{ __html: grammarText }} />
          ) : (
            <p className="text-muted-foreground">Пояснення ще немає.</p>
          )}
        </div>
      )}

      {tab === "sentences" && sentenceDeck && <SentencePractice deck={sentenceDeck} initialDone={sentenceDone ?? []} />}
      {tab === "conj" && conjugation && <Conjugation verbs={conjugation} initialDone={conjugationDone ?? []} />}
      {tab === "cards" && <FlashCards words={words} />}
      {tab === "quiz"  && <Quiz words={words} quizSentences={quizSentences} />}
      {tab === "fill"  && <FillInBlank words={fillWords ? words.filter(w => fillWords.includes(w.spanish)) : words} />}
    </div>
  );
}
