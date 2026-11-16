import { redirect } from "next/navigation";

/** Повторення переїхало в Словник; стара адреса лишається для закладок. */
export default function OldReviewPage() {
  redirect("/dictionary/review");
}
