"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Блок, притиснутий до низу екрана над нижнім меню. Під вмістом сторінки лишає
 * місце рівно на свою висоту (міряє себе), щоб останній рядок списку не ховався.
 */
export function PinnedAboveNav({ children }: { children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(112); // приблизна висота до першого заміру

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div aria-hidden style={{ height }} />
      <div className="fixed inset-x-0 z-30" style={{ bottom: "var(--bottom-nav-h)" }}>
        <div ref={bar} className="max-w-lg mx-auto px-4 pt-6 pb-3 bg-gradient-to-t from-background from-70% to-transparent">
          {children}
        </div>
      </div>
    </>
  );
}
