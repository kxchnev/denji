"use client";

/**
 * Where the playground's vertical divider sits — the share of the split taken by
 * the editor, `0..1`.
 *
 * A plain module rather than an external store like `playground-store.ts`: this
 * is one number, nothing else reads it, and there is nothing useful to do when
 * another tab moves its own divider.
 */

import { useCallback, useEffect, useState } from "react";

const KEY = "power.playground.split.v1";

/** Half and half — the playground opens even-handed. */
export const DEFAULT_RATIO = 0.5;

/** Either pane may be squeezed all the way shut; the divider stays grabbable. */
export const clampRatio = (ratio: number): number => Math.min(1, Math.max(0, ratio));

/** Never throws: an unreadable or corrupt value degrades to the default rather
 *  than taking the playground down with it. */
function read(): number | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function write(ratio: number): void {
  try {
    window.localStorage.setItem(KEY, String(ratio));
  } catch {
    // Quota exhausted, or Safari private mode. The session keeps working, it
    // just will not remember the width after a reload.
  }
}

export function useSplit() {
  // Storage is deliberately not read during render: the docs are a static
  // export, so the prerendered markup and the hydration pass must both come out
  // at the default. Nothing flashes — the page renders `null` until the session
  // exists, which is later than the effect below.
  const [ratio, setRatio] = useState(DEFAULT_RATIO);

  useEffect(() => {
    const saved = read();
    if (saved !== null) setRatio(saved);
  }, []);

  /** Mid-drag: state only, so a pointermove costs no storage write. */
  const drag = useCallback((next: number) => setRatio(next), []);

  /** Settled on a width — remember it. */
  const commit = useCallback((next: number) => {
    setRatio(next);
    write(next);
  }, []);

  const reset = useCallback(() => commit(DEFAULT_RATIO), [commit]);

  return { ratio, drag, commit, reset };
}
