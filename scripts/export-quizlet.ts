import * as fs from "fs";
import * as path from "path";

const topicsDir = path.resolve("data/topics");
const exportsDir = path.resolve("exports");

if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir);

const files = fs.readdirSync(topicsDir).filter(f => f.endsWith(".json"));

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(topicsDir, file), "utf-8"));
  const lines: string[] = data.words.map((w: { spanish: string; ukrainian: string }) =>
    `${w.spanish}\t${w.ukrainian}`
  );
  const outFile = path.join(exportsDir, `${data.slug}.txt`);
  fs.writeFileSync(outFile, lines.join("\n"), "utf-8");
  console.log(`✓ ${data.title} → exports/${data.slug}.txt (${lines.length} слів)`);
}

console.log("\nГотово! Імпортуй у Quizlet: вибери 'Tab' між словом і визначенням, 'New line' між картками.");
