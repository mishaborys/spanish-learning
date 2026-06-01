"use client";

import { useState, useCallback } from "react";
import { WordWithProgress } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Props = {
  words: WordWithProgress[];
};

export function ReviewSession({ words: initialWords }: Props) {
  const [words] = useState(initialWords);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState<Record<number, boolean>>({});

  const word = words[index];

  const speak = useCallback(() => {
    if (!word) return;
    const u = new SpeechSynthesisUtterance(word.spanish);
    u.lang = "es-ES";
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [word]);

  const handleAnswer = async (correct: boolean) => {
    setDone((prev) => ({ ...prev, [word.id]: correct }));
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: word.id, correct }),
    });
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  if (words.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-2xl font-semibold">Все повторено!</p>
        <p className="text-muted-foreground text-sm">
          Нових слів на сьогодні немає. Повернись завтра.
        </p>
      </div>
    );
  }

  if (index >= words.length) {
    const correct = Object.values(done).filter(Boolean).length;
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-2xl font-semibold">Сесія завершена!</p>
        <p className="text-muted-foreground">
          Правильно: {correct} / {words.length}
        </p>
        <Button onClick={() => window.location.reload()}>Ще раз</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {index + 1} / {words.length}
        </span>
        <Badge variant="secondary" className="text-xs">
          {word.status === "new"
            ? "Нове"
            : word.status === "learning"
            ? "Вивчаю"
            : "Знаю"}
        </Badge>
      </div>

      <div
        className="border rounded-xl p-8 min-h-[200px] flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors hover:bg-accent/30"
        onClick={() => !flipped && setFlipped(true)}
      >
        {!flipped ? (
          <>
            <span className="text-3xl font-semibold tracking-wide">
              {word.spanish}
            </span>
            {word.gender && (
              <Badge variant="secondary" className="text-xs">
                {word.gender}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground mt-2">
              натисни щоб побачити переклад
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-semibold">{word.spanish}</span>
            <span className="text-xl text-muted-foreground">
              {word.ukrainian}
            </span>
            {word.example_es && (
              <div className="text-sm text-center space-y-1 mt-2 border-t pt-4 w-full">
                <p className="italic">{word.example_es}</p>
                {word.example_uk && (
                  <p className="text-muted-foreground">{word.example_uk}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={speak} title="Прослухати">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        </Button>

        {flipped ? (
          <>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => handleAnswer(false)}
            >
              Не знаю
            </Button>
            <Button className="flex-1" onClick={() => handleAnswer(true)}>
              Знаю
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setFlipped(true)}
          >
            Показати переклад
          </Button>
        )}
      </div>
    </div>
  );
}
