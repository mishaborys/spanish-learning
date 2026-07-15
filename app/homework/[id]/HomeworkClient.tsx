"use client";

import { useState, useRef } from "react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

type AudioEntry = { label: string; src: string };

type FormField  = { id: string; label: string; answer: string; given?: boolean };
type PersonData = { nombre: string | null; apellido: string; correo: string | null; edad?: string; fields: FormField[] };
type ExerciseA  = { id: string; label: string; instruction: string; instruction_uk?: string; type: "fill-form"; word_bank: string[]; people: PersonData[]; free_choice?: boolean };

type Category   = { id: number; text: string };
type MatchQ     = { id: string; text: string; answer: number };
type ExerciseB  = { id: string; label: string; instruction: string; instruction_uk?: string; type: "match-category"; image?: string; categories: Category[]; questions: MatchQ[] };

type TextField  = { id: string; label: string };
type ExerciseC  = { id: string; label: string; instruction: string; instruction_uk?: string; type: "fill-text"; fields: TextField[] };

type Homework = {
  id: string;
  title: string;
  due_date: string;
  audio: AudioEntry[];
  exercises: (ExerciseA | ExerciseB | ExerciseC)[];
};

// ─── Audio Player ────────────────────────────────────────────────────────────

function AudioPlayer({ entries }: { entries: AudioEntry[] }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = (idx: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = entries[idx].src;
      audioRef.current.play().catch(() => {});
      setActiveIdx(idx);
      setPlaying(true);
    }
  };

  const togglePause = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
      <audio ref={audioRef} onEnded={() => setPlaying(false)} />
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Аудіо</p>
      <div className="flex flex-wrap gap-2">
        {entries.map((e, i) => (
          <button key={i} onClick={() => activeIdx === i ? togglePause() : play(i)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              activeIdx === i
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-accent/40"
            }`}>
            <span>{activeIdx === i && playing ? "⏸" : "▶"}</span>
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Exercise A: Fill Form ────────────────────────────────────────────────────

function ExerciseAComponent({ ex, storageKey }: { ex: ExerciseA; storageKey: string }) {
  const initAnswers = (): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { return {}; }
  };

  const [answers, setAnswers] = useState<Record<string, string>>(initAnswers);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const free = !!ex.free_choice;
  const usedWords = free ? new Set<string>() : new Set(Object.values(answers));

  const fill = (fieldId: string) => {
    if (!selected) return;
    const next = { ...answers, [fieldId]: selected };
    setAnswers(next);
    setSelected(null);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const clear = (fieldId: string) => {
    const next = { ...answers };
    delete next[fieldId];
    setAnswers(next);
    setSelected(null);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const allFilled = ex.people.every(p =>
    p.fields.filter(f => !f.given).every(f => !!answers[f.id])
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed p-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Банк слів — натисни слово, потім порожнє поле:</p>
        <div className="flex flex-wrap gap-2">
          {ex.word_bank.map(w => {
            const isUsed = usedWords.has(w);
            const isSel  = selected === w;
            return (
              <button key={w}
                onClick={() => isUsed ? undefined : setSelected(isSel ? null : w)}
                disabled={isUsed}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                  isUsed ? "opacity-30 line-through border-border" :
                  isSel  ? "bg-primary text-primary-foreground border-primary shadow-md scale-105" :
                           "bg-background border-border hover:bg-accent/40"
                }`}>
                {w}
              </button>
            );
          })}
        </div>
        {selected && (
          <p className="text-xs text-primary animate-pulse">
            «{selected}» обрано — натисни порожнє поле ↓
          </p>
        )}
      </div>

      {ex.people.map((person, pi) => (
        <div key={pi} className="rounded-2xl border bg-card overflow-hidden">
          <div className="bg-muted/50 px-4 py-3 flex items-center gap-2">
            <span className="text-sm font-semibold">
              {person.nombre ?? "___"}{person.apellido ? ` ${person.apellido}` : ""}
            </span>
            {person.correo && (
              <span className="text-xs text-muted-foreground ml-auto">{person.correo}</span>
            )}
          </div>
          <div className="p-3 space-y-2">
            {person.fields.map(field => {
              const val = field.given ? field.answer : (answers[field.id] ?? "");
              const isCorrect = !free && checked && val === field.answer;
              const isWrong   = !free && checked && val && val !== field.answer;
              return (
                <div key={field.id} className={free ? "flex items-center gap-2" : "space-y-0.5"}>
                  <p className={`text-sm ${free ? "text-foreground min-w-0 flex-1" : "text-[10px] font-medium text-muted-foreground"}`}>{field.label}</p>
                  {field.given ? (
                    <div className="rounded-lg bg-muted/40 px-3 py-1.5 text-sm">{val}</div>
                  ) : (
                    <button
                      onClick={() => val ? clear(field.id) : fill(field.id)}
                      className={`${free ? "shrink-0 min-w-[110px]" : "w-full"} rounded-lg px-3 py-1.5 text-sm text-left border-2 transition-all min-h-[36px] ${
                        isCorrect ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" :
                        isWrong   ? "border-destructive bg-destructive/8 text-destructive" :
                        val       ? "border-primary/40 bg-primary/5 font-medium" :
                        selected  ? "border-primary border-dashed animate-pulse" :
                                    "border-dashed border-border text-muted-foreground/40"
                      }`}>
                      {val || (selected ? "← вставити" : "___")}
                      {val && !field.given && (
                        <span className="float-right text-muted-foreground/50 text-xs">✕</span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        {free ? (
          <>
            <button onClick={() => { setChecked(true); localStorage.setItem(storageKey, JSON.stringify(answers)); }}
              disabled={!allFilled || checked}
              className={`flex-1 min-h-[48px] rounded-2xl text-sm font-medium transition-all ${
                allFilled && !checked
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}>
              {checked ? "Збережено ✓" : "Зберегти"}
            </button>
            {checked && (
              <button onClick={() => { setAnswers({}); setChecked(false); localStorage.removeItem(storageKey); }}
                className="px-4 min-h-[48px] rounded-2xl border text-sm text-muted-foreground hover:text-foreground transition-all">
                Скинути
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => setChecked(true)} disabled={!allFilled || checked}
              className={`flex-1 min-h-[48px] rounded-2xl text-sm font-medium transition-all ${
                allFilled && !checked
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}>
              {checked ? "Перевірено ✓" : "Перевірити"}
            </button>
            {checked && (
              <button onClick={() => { setAnswers({}); setChecked(false); localStorage.removeItem(storageKey); }}
                className="px-4 min-h-[48px] rounded-2xl border text-sm text-muted-foreground hover:text-foreground transition-all">
                Скинути
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Exercise B: Match Category ───────────────────────────────────────────────

function ExerciseBComponent({ ex, storageKey }: { ex: ExerciseB; storageKey: string }) {
  const initAnswers = (): Record<string, number | null> => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { return {}; }
  };

  const [answers, setAnswers] = useState<Record<string, number | null>>(initAnswers);
  const [checked, setChecked] = useState(false);

  const select = (qId: string, catId: number) => {
    if (checked) return;
    const next = { ...answers, [qId]: answers[qId] === catId ? null : catId };
    setAnswers(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const allAnswered = ex.questions.every(q => answers[q.id] != null);

  return (
    <div className="space-y-4">
      {ex.image && (
        <img src={ex.image} alt="" className="w-full rounded-2xl object-cover" />
      )}
      <div className="rounded-2xl border bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Para preguntar...</p>
        <div className="grid grid-cols-1 gap-1">
          {ex.categories.map(c => (
            <div key={c.id} className="flex items-start gap-2 text-sm">
              <span className="font-bold text-primary shrink-0 w-4">{c.id}.</span>
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {ex.questions.map(q => {
          const chosen = answers[q.id];
          const isCorrect = checked && chosen === q.answer;
          const isWrong   = checked && chosen != null && chosen !== q.answer;
          return (
            <div key={q.id} className={`rounded-2xl border p-3 transition-colors ${
              isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950" :
              isWrong   ? "border-destructive/50 bg-destructive/5" : "bg-card"
            }`}>
              <p className="text-sm font-medium mb-2">{q.text}</p>
              <div className="flex flex-wrap gap-1.5">
                {ex.categories.map(c => (
                  <button key={c.id} onClick={() => select(q.id, c.id)}
                    disabled={checked}
                    className={`w-9 h-9 rounded-xl text-sm font-bold border-2 transition-all ${
                      chosen === c.id
                        ? checked
                          ? isCorrect ? "bg-green-500 text-white border-green-500"
                                      : "bg-destructive text-white border-destructive"
                          : "bg-primary text-primary-foreground border-primary"
                        : checked && c.id === q.answer && isWrong
                          ? "bg-green-100 text-green-700 border-green-500 dark:bg-green-950 dark:text-green-300"
                          : "border-border hover:bg-accent/40"
                    }`}>
                    {c.id}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={() => setChecked(true)} disabled={!allAnswered || checked}
          className={`flex-1 min-h-[48px] rounded-2xl text-sm font-medium transition-all ${
            allAnswered && !checked
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}>
          {checked ? "Перевірено ✓" : "Перевірити"}
        </button>
        {checked && (
          <button onClick={() => { setAnswers({}); setChecked(false); localStorage.removeItem(storageKey); }}
            className="px-4 min-h-[48px] rounded-2xl border text-sm text-muted-foreground hover:text-foreground transition-all">
            Скинути
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Exercise C: Fill Text ────────────────────────────────────────────────────

function ExerciseCComponent({ ex, storageKey }: { ex: ExerciseC; storageKey: string }) {
  const initAnswers = (): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { return {}; }
  };

  const [answers, setAnswers] = useState<Record<string, string>>(initAnswers);
  const [saved, setSaved] = useState(false);

  const update = (id: string, value: string) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    setSaved(false);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const handleSave = () => {
    localStorage.setItem(storageKey, JSON.stringify(answers));
    setSaved(true);
  };

  const handleReset = () => {
    setAnswers({});
    setSaved(false);
    localStorage.removeItem(storageKey);
  };

  const allFilled = ex.fields.every(f => !!answers[f.id]?.trim());

  return (
    <div className="space-y-3">
      {ex.fields.map(f => (
        <div key={f.id} className="space-y-1.5">
          <p className="text-sm font-medium">{f.label}</p>
          <textarea
            value={answers[f.id] ?? ""}
            onChange={e => update(f.id, e.target.value)}
            rows={3}
            className="w-full rounded-xl border-2 border-border focus:border-primary px-3 py-2 text-sm bg-background outline-none resize-none transition-colors"
          />
        </div>
      ))}
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={!allFilled || saved}
          className={`flex-1 min-h-[48px] rounded-2xl text-sm font-medium transition-all ${
            allFilled && !saved
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}>
          {saved ? "Збережено ✓" : "Зберегти"}
        </button>
        {saved && (
          <button onClick={handleReset}
            className="px-4 min-h-[48px] rounded-2xl border text-sm text-muted-foreground hover:text-foreground transition-all">
            Скинути
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Exercise Wrapper (instruction + translation toggle) ─────────────────────

function ExerciseWrapper({ ex, hwId }: { ex: ExerciseA | ExerciseB; hwId: string }) {
  const [showTranslation, setShowTranslation] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
          {ex.label}
        </span>
        <div className="pt-0.5 space-y-1">
          <p className="text-sm text-muted-foreground leading-relaxed">{ex.instruction}</p>
          {ex.instruction_uk && (
            <div>
              {showTranslation && (
                <p className="text-sm text-foreground leading-relaxed">{ex.instruction_uk}</p>
              )}
              <button
                onClick={() => setShowTranslation(v => !v)}
                className="text-xs text-primary/70 hover:text-primary transition-colors underline-offset-2 hover:underline">
                {showTranslation ? "Сховати переклад" : "Показати переклад"}
              </button>
            </div>
          )}
        </div>
      </div>
      {ex.type === "fill-form" && (
        <ExerciseAComponent ex={ex as ExerciseA} storageKey={`hw-${hwId}-${ex.id}`} />
      )}
      {ex.type === "match-category" && (
        <ExerciseBComponent ex={ex as ExerciseB} storageKey={`hw-${hwId}-${ex.id}`} />
      )}
      {ex.type === "fill-text" && (
        <ExerciseCComponent ex={ex as ExerciseC} storageKey={`hw-${hwId}-${ex.id}`} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function HomeworkClient({ hw }: { hw: Homework }) {
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/homework" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Домашні завдання
        </Link>
        <h1 className="text-xl font-bold mt-2">{hw.title}</h1>
        <p className="text-sm text-muted-foreground">
          Здати до: <span className="font-medium text-foreground">{formatDate(hw.due_date)}</span>
        </p>
      </div>

      <AudioPlayer entries={hw.audio} />

      {hw.exercises.map(ex => (
        <ExerciseWrapper key={ex.id} ex={ex} hwId={hw.id} />
      ))}
    </div>
  );
}
