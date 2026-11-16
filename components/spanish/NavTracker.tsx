"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { trackPath } from "@/lib/navHistory";

/** Запам'ятовує, з якого екрана прийшли (для ExitLink), і оновлює сторінку після повернення назад. */
export function NavTracker() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (trackPath(pathname)) router.refresh();
  }, [pathname, router]);
  return null;
}
