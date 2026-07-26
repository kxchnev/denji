import type { Shape } from "../../model/arch.js";
import type { Size } from "../../model/geometry.js";

/** Shared text metrics (no DOM): average glyph advance at the base font size. */
export const FONT_SIZE = 14;
const AVG_CHAR_WIDTH = FONT_SIZE * 0.6;
const PAD_X = 18;
const MIN_WIDTH = 96;
const BASE_HEIGHT = 46;

export function measureLabelWidth(label: string): number {
  const longest = label.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
  return longest * AVG_CHAR_WIDTH;
}

/** Size a leaf shape. Cylinders reserve room for their elliptical caps. */
export function measureShape(shape: Shape): Size {
  const textW = measureLabelWidth(shape.label);
  let width = Math.max(MIN_WIDTH, Math.round(textW + PAD_X * 2));
  let height = BASE_HEIGHT;

  switch (shape.kind) {
    case "database":
      // Vertical cylinder: top + bottom ellipse caps add height.
      height += 14;
      break;
    case "queue":
      // Horizontal cylinder: left + right ellipse caps add width.
      width += 24;
      break;
  }
  return { width, height };
}
