"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { cameFrom, markRefreshAfterBack } from "@/lib/navHistory";

type Props = Omit<ComponentProps<typeof Link>, "href" | "replace"> & { href: string };

/**
 * Посилання «назад/закрити». Якщо ми прийшли саме з екрана `href` — повертаємось по історії
 * (запис режиму зникає, і свайп назад веде на батьківський екран). Інакше замінюємо поточний запис
 * на `href`, щоб свайп назад не повертав у режим, який щойно закрили.
 */
export function ExitLink({ href, onClick, ...rest }: Props) {
  const router = useRouter();

  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const target = new URL(href, window.location.origin).pathname;
    if (cameFrom(target) && window.history.length > 1) {
      markRefreshAfterBack();
      router.back();
    } else {
      router.replace(href);
    }
  };

  return <Link href={href} onClick={handle} {...rest} />;
}
