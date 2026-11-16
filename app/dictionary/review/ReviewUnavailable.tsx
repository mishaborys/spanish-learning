import Link from "next/link";

/** База недоступна — без неї добірки на сьогодні немає. */
export function ReviewUnavailable() {
  return (
    <div className="space-y-4">
      <Link href="/dictionary/review" className="text-sm text-muted-foreground hover:text-foreground">← Повторення</Link>
      <div className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
        Не вдалося завантажити повторення. Перевір підключення до бази даних (<code>DATABASE_URL</code>) і онови сторінку.
      </div>
    </div>
  );
}
