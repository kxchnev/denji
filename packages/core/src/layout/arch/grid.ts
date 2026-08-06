/**
 * The lattice the layout lands on.
 *
 * Two numbers, because sizes and centring need different granularity. Every box
 * the layout *measures* is rounded up to `GRID`, so the difference of two sizes is
 * a multiple of `GRID` and halving it — which is what centring does — lands on
 * `HALF_GRID`. That is the whole trick: integral coordinates come out of the
 * arithmetic instead of being rounded back in afterwards.
 *
 * Rounding final rects instead would not work. Containers are sized bottom-up
 * from their children's positions, so a child rounded up inside a container
 * rounded down stops fitting; integrality has to be an input.
 *
 * A size the author asked for is never touched, and neither is `@at` — both are
 * exact by promise. So an odd explicit width or gap can still put a sibling on a
 * half pixel, which is why `snapHalf` exists at all rather than being a no-op
 * assertion.
 */

/** Measured sizes land here. The playground's drag snap is the same number. */
export const GRID = 8;
/** Centring lands here: (GRID·a − GRID·b) / 2 is always a multiple of this. */
export const HALF_GRID = 4;

/** Up to the next multiple of {@link GRID} — never down, so a label still fits. */
export const ceilToGrid = (v: number): number => Math.ceil(v / GRID) * GRID;

/** To the nearest multiple of {@link HALF_GRID}. For centring offsets. */
export const snapHalf = (v: number): number => Math.round(v / HALF_GRID) * HALF_GRID;
