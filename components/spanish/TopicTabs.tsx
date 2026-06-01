"use client";

import { useState } from "react";
import { Word } from "@/lib/db";
import { FlashCards } from "./FlashCards";
import { Quiz } from "./Quiz";
import { Button } from "@/components/ui/button";

type Tab = "grammar" | "cards" | "quiz";

type Props = {
  grammarText: string;
  words: Word[];
};

export function TopicTabs({ grammarText, words }: Props) {
  const [tab, setTab] = useState<Tab>("grammar");

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b pb-0">
        {(["grammar", "cards", "quiz"] as Tab[]).map((t) => (
          <Button
            key={t}
            variant="ghost"
            className={`rounded-none border-b-2 pb-2 px-4 ${
              tab === t
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "grammar" ? "Граматика" : t === "cards" ? "Картки" : "Тест"}
          </Button>
        ))}
      </div>

      {tab === "grammar" && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {grammarText ? (
            <div
              dangerouslySetInnerHTML={{ __html: grammarText }}
            />
          ) : (
            <p className="text-muted-foreground">Пояснення ще немає.</p>
          )}
        </div>
      )}

      {tab === "cards" && <FlashCards words={words} />}
      {tab === "quiz" && <Quiz words={words} />}
    </div>
  );
}
