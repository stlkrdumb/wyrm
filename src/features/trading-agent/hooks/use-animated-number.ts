"use client";

import { useEffect, useRef, useState } from "react";

/** Lerps between numeric values with requestAnimationFrame for smooth UI transitions.
 *  Returns the animated display value that smoothly approaches `value` over `duration` ms. */
export function useAnimatedNumber(value: number, duration: number = 300): number {
  const [display, setDisplay] = useState<number>(value);
  const fromRef = useRef<number>(value);
  const toRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // If the value is already at the target, no animation needed
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
      // easeOutCubic for a snappy settle
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

  // Cleanup on unmount
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return display;
}
