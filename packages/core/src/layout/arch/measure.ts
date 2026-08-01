import type { Shape, StyleProps } from "../../model/arch.js";
import type { Size } from "../../model/geometry.js";

/** Shared text metrics (no DOM): average glyph advance at the base font size. */
export const FONT_SIZE = 14;
const AVG_CHAR_WIDTH = FONT_SIZE * 0.6;
const PAD_X = 18;
/** Brand mark drawn before a shape's label. Shared with the renderer. */
export const ICON_SIZE = 18;
/** Same, in a container's title band, which is only 28px tall. */
export const HEADER_ICON_SIZE = 14;
/** Space between a mark and the text after it. */
export const ICON_GAP = 8;
/** Half-height of a database's elliptical lid; the renderer draws it. */
export const CAP_RY = 7;
/** Half-width of a queue's elliptical cap. */
export const CAP_RX = 8;
const MIN_WIDTH = 96;
const BASE_HEIGHT = 46;

export function measureLabelWidth(label: string): number {
  const longest = label.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
  return longest * AVG_CHAR_WIDTH;
}

/**
 * Size a leaf shape. Cylinders reserve room for their elliptical caps.
 *
 * `style.width` / `style.height` win outright — an explicit size is exact, caps
 * and all, because a box the author asked for should be the box they get.
 */
export function measureShape(shape: Shape, style: StyleProps = {}): Size {
  const textW = measureLabelWidth(shape.label);
  // An icon on its own is a badge, not a labelled box, so it gets a compact
  // square rather than being stretched out to MIN_WIDTH.
  let width = shape.icon
    ? shape.label === ""
      ? Math.max(ICON_SIZE + PAD_X * 2, BASE_HEIGHT)
      : Math.max(MIN_WIDTH, Math.round(textW + ICON_SIZE + ICON_GAP + PAD_X * 2))
    : Math.max(MIN_WIDTH, Math.round(textW + PAD_X * 2));
  let height = BASE_HEIGHT;

  switch (shape.kind) {
    case "database":
      // Vertical cylinder: top + bottom ellipse caps add height.
      height += CAP_RY * 2;
      break;
    case "queue":
      // Horizontal cylinder: left + right ellipse caps, plus a little slack so
      // the label does not crowd the curve.
      width += CAP_RX * 2 + 8;
      break;
  }
  return { width: style.width ?? width, height: style.height ?? height };
}
