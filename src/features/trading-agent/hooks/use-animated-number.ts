"use client";

import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(value: number, duration: number = 300): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const toRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === toRef.current) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    fromRef.current = display;
    toRef.current = value;
    const startTime = performance.now();

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = fromRef.current + (toRef.current - fromRef.current) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setDisplay(toRef.current);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return display;
}