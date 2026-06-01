"use client";

import { useState, useMemo } from "react";
import { Word } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Props = {
  words: Word[];
};

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildQuestion(
  target: Word,
  allWords: Word[]
): { question: string; correct: string; options: string[] } {
  const distractors = shuffle(allWords.filter((w) => w.id !== target.id))
    .slice(0, 3)
    .map((w) => w.ukrainian);
  const options = shuffle([target.ukrainian, ...distractors]);
  return {
    question: target.spanish,
    correct: target.ukrainian,
    options,
  };
}

export function Quiz({ words }: Props) {
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState<Word[]>([]);

  const questions = useMemo(() => shuffle(words).slice(0, 10), [words]);
  const current = questions[qIndex];
  const q = useMemo(
    () => (current ? buildQuestion(current, words) : null),
    [current, words]
  );

  if (words.length < 4) {
    return (
      <p className="text-muted-foreground text-sm">
        Потрібно мінімум 4 слова для тесту.
      </p>
    );
  }

  if (finished) {
    return (
      <div className="space-y-6 py-4">
        <div className="text-center space-y-2">
          <p className="text-3xl font-bold">
            {score} / {questions.length}
          </p>
          <p className="text-muted-foreground">
            {score === questions.length
              ? "Ідеально!"
              : score >= questions.length * 0.7
              ? "Добре!"
              : "Продовжуй вчити!"}
          </p>
        </div>

        {wrongAnswers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Повтори ці слова:</p>
            <div className="grid gap-2">
              {wrongAnswers.map((w) => (
                <div
                  key={w.id}
                  className="flex justify-between text-sm border rounded-lg px-3 py-2"
                >
                  <span className="font-medium">{w.spanish}</span>
                  <span className="text-muted-foreground">{w.ukrainian}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          className="w-full"
          onClick={() => {
            setQIndex(0);
            setSelected(null);
            setScore(0);
            setFinished(false);
            setWrongAnswers([]);
          }}
        >
          Ще раз
        </Button>
      </div>
    );
  }

  if (!q) return null;

  const handleSelect = async (option: string) => {
    if (selected !== null) return;
    setSelected(option);
    const correct = option === q.correct;

    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: current.id, correct }),
    });

    if (correct) {
      setScore((s) => s + 1);
    } else {
      setWrongAnswers((prev) => [...prev, current]);
    }
  };

  const handleNext = () => {
    if (qIndex + 1 >= questions.length) {
      setFinished(true);
    } else {
      setQIndex((i) => i + 1);
      setSelected(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {qIndex + 1} / {questions.length}
        </span>
        <span>Правильно: {score}</span>
      </div>

      <div className="text-center py-4">
        <p className="text-2xl font-semibold">{q.question}</p>
        <p className="text-sm text-muted-foreground mt-1">Обери переклад</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {q.options.map((opt) => {
          let variant: "outline" | "default" | "destructive" = "outline";
          if (selected !== null) {
            if (opt === q.correct) variant = "default";
            else if (opt === selected && opt !== q.correct)
              variant = "destructive";
          }
          return (
            <Button
              key={opt}
              variant={variant}
              className="h-auto py-3 text-sm whitespace-normal"
              onClick={() => handleSelect(opt)}
              disabled={selected !== null && opt !== q.correct && opt !== selected}
            >
              {opt}
            </Button>
          );
        })}
      </div>

      {selected !== null && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={selected === q.correct ? "default" : "destructive"}>
              {selected === q.correct ? "Правильно!" : "Помилка"}
            </Badge>
            {selected !== q.correct && (
              <span className="text-sm text-muted-foreground">
                Правильна відповідь: <strong>{q.correct}</strong>
              </span>
            )}
          </div>
          <Button className="w-full" onClick={handleNext}>
            {qIndex + 1 >= questions.length ? "Результат" : "Далі"}
          </Button>
        </div>
      )}
    </div>
  );
}
