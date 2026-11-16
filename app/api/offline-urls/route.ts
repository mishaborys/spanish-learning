import { NextResponse } from "next/server";
import { offlineUrls } from "@/lib/offline";

/** Список сторінок для офлайн-копії (його бере service worker). */
export function GET() {
  return NextResponse.json({ urls: offlineUrls() });
}
