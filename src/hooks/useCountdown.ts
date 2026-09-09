"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A 3-2-1 before anything starts, so there is time to pick the guitar up.
 *
 * `run` resolves true when the count reaches zero and false if it was
 * cancelled — a Stop pressed mid-count, or the screen going away — so the
 * caller never starts a transport nobody is waiting for. Wall-clock seconds
 * on purpose: this is a human pause, not a musical one; the musical count-in
 * (the clicks) follows it.
 */
export function useCountdown() {
  const [n, setN] = useState<number | null>(null);
  const tokenRef = useRef(0);

  const cancel = useCallback(() => {
    tokenRef.current += 1;
    setN(null);
  }, []);

  const run = useCallback(
    (seconds: number) =>
      new Promise<boolean>((resolve) => {
        const token = ++tokenRef.current;
        let left = seconds;
        setN(left);
        const id = window.setInterval(() => {
          if (tokenRef.current !== token) {
            window.clearInterval(id);
            resolve(false);
            return;
          }
          left -= 1;
          if (left <= 0) {
            window.clearInterval(id);
            setN(null);
            resolve(true);
          } else {
            setN(left);
          }
        }, 1000);
      }),
    [],
  );

  useEffect(() => () => { tokenRef.current += 1; }, []);

  return { n, run, cancel };
}
