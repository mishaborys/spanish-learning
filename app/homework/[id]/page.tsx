import { notFound } from "next/navigation";
import * as fs from "fs";
import * as path from "path";
import { HomeworkClient } from "./HomeworkClient";

type Props = { params: Promise<{ id: string }> };

export default async function HomeworkPage({ params }: Props) {
  const { id } = await params;
  const filePath = path.join(process.cwd(), "data/homework", `${id}.json`);
  if (!fs.existsSync(filePath)) notFound();
  const hw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return <HomeworkClient hw={hw} />;
}
