"use client";

import { useEffect, useState } from "react";

export type VisibleViewport = { top: number; height: number };

/**
 * Видима область екрана, поки відкрита клавіатура (iOS Safari).
 *
 * iOS не стискає `position: fixed` під клавіатуру, а зсуває visual viewport, щоб показати поле вводу,
 * і верх оверлея виїжджає за екран. Повертає `null`, поки клавіатури немає (тоді `inset-0` і так правильний);
 * інакше — позицію й висоту, які треба віддати оверлею.
 */
export function useVisibleViewport(): VisibleViewport | null {
  const [box, setBox] = useState<VisibleViewport | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const shifted = vv.offsetTop > 0 || vv.height < window.innerHeight - 1;
      setBox(shifted ? { top: vv.offsetTop, height: vv.height } : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return box;
}
