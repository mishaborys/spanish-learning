import * as fs from "fs";
import * as path from "path";
import Link from "next/link";

type HWMeta = { id: string; title: string; due_date: string };

function loadHomework(): HWMeta[] {
  const dir = path.join(process.cwd(), "data/homework");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      return { id: data.id, title: data.title, due_date: data.due_date };
    })
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
}

export default function HomeworkListPage() {
  const list = loadHomework();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Домашні завдання</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{list.length} завдань</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border bg-muted/30 p-6 text-center">
          <p className="text-muted-foreground text-sm">Завдань поки немає.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(hw => {
            const due = new Date(hw.due_date);
            due.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86400000);
            const isPast = daysLeft < 0;
            const isToday = daysLeft === 0;
            const isSoon = daysLeft > 0 && daysLeft <= 2;

            return (
              <Link key={hw.id} href={`/homework/${hw.id}`}>
                <div className="rounded-2xl border bg-card p-4 hover:bg-accent/40 active:scale-[0.99] transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[15px] leading-snug">{hw.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {due.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" })}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                      isPast  ? "bg-muted text-muted-foreground" :
                      isToday ? "bg-destructive/15 text-destructive" :
                      isSoon  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" :
                                "bg-primary/10 text-primary"
                    }`}>
                      {isPast  ? "Минуло" :
                       isToday ? "Сьогодні!" :
                       daysLeft === 1 ? "Завтра" :
                       `${daysLeft} дн.`}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
