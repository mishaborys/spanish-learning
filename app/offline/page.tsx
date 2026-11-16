import Link from "next/link";

export const metadata = { title: "Немає інтернету" };

/** Показується без мережі замість сторінок, яких немає в офлайн-копії (Learn, Повторення, ДЗ…). */
export default function OfflinePage() {
  return (
    <div className="space-y-5 py-10 text-center">
      <p className="text-5xl">📡</p>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Немає інтернету</h1>
        <p className="text-sm text-muted-foreground">
          Без мережі працюють Flashcards і Blast у Словнику. Learn, Повторення та інше — коли з&apos;явиться зв&apos;язок.
        </p>
      </div>
      <Link href="/dictionary"
        className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary px-6 text-sm font-medium text-primary-foreground">
        До Словника
      </Link>
    </div>
  );
}
