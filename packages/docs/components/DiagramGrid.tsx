"use client";

import { useId } from "react";

/** Grid pitch in diagram units at scale 1. */
const BASE_GAP = 16;
/**
 * Smallest on-screen pitch of the fully-opaque lattice. Equal to BASE_GAP so that
 * at scale 1 — and at every power of two — the grid is exactly a clean BASE_GAP
 * lattice with the intermediate layer invisible.
 */
const MIN_PITCH = BASE_GAP;
/** Constant, so a dot never drifts relative to the diagram as the zoom changes. */
const DOT_R = 1;

/**
 * Dot grid that moves and scales with the viewport, so panning and zooming read as
 * motion over a surface instead of a diagram sliding across static dots.
 *
 * The tile is `gap * scale` wide and offset by `x % step`, which is all an infinite
 * grid needs: only one tile of translation is ever observable. On top of that the
 * pitch is kept inside one octave, and the next-finer lattice is crossfaded in
 * across that octave — so zooming past a threshold densifies the grid gradually
 * instead of popping. (React Flow's Background scales `gap * scale` linearly, which
 * turns to mush zoomed out and goes sparse zoomed in.)
 */
export function DiagramGrid({ x, y, scale }: { x: number; y: number; scale: number }) {
  // Two diagrams on one page must not share pattern ids.
  const coarseId = useId();
  const fineId = useId();

  let gap = BASE_GAP;
  while (gap * scale < MIN_PITCH) gap *= 2;
  while (gap * scale >= MIN_PITCH * 2) gap /= 2;

  const step = gap * scale;
  // 0 at the start of the octave, approaching 1 at its end — where the fine lattice
  // has fully taken over and becomes the coarse one for the next octave.
  const fineOpacity = step / MIN_PITCH - 1;

  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full text-border">
      <DotPattern id={fineId} step={step / 2} x={x} y={y} />
      <DotPattern id={coarseId} step={step} x={x} y={y} />
      <rect width="100%" height="100%" fill={`url(#${fineId})`} opacity={fineOpacity} />
      {/* Coarse on top and opaque, so its dots are unaffected by the fading layer. */}
      <rect width="100%" height="100%" fill={`url(#${coarseId})`} />
    </svg>
  );
}

function DotPattern({ id, step, x, y }: { id: string; step: number; x: number; y: number }) {
  return (
    <pattern
      id={id}
      // Shift by -DOT_R so the dot's centre, not its bounding box, lands on the
      // lattice point at `x % step`.
      x={(x % step) - DOT_R}
      y={(y % step) - DOT_R}
      width={step}
      height={step}
      patternUnits="userSpaceOnUse"
    >
      <circle cx={DOT_R} cy={DOT_R} r={DOT_R} fill="currentColor" />
    </pattern>
  );
}
