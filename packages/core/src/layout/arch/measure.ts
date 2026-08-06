import type { ContainerText, Corner, Shape, StyleProps } from "../../model/arch.js";
import type { Size } from "../../model/geometry.js";
import { ceilToGrid } from "./grid.js";

/**
 * Shared text metrics (no DOM): average glyph advance at the base font size.
 * One size for every label — a shape's and a container's title alike — which is
 * what lets `measureLabelWidth` be right about both. They used to differ by a
 * point, so container widths were measured at one size and drawn at another.
 */
export const FONT_SIZE = 14;
const AVG_CHAR_WIDTH = FONT_SIZE * 0.6;
const PAD_X = 18;
/**
 * Brand mark drawn before a label, in a shape and in a container's title band
 * alike. The band is 28px tall, so this leaves 5px of clearance either side.
 */
export const ICON_SIZE = 18;
/** Space between a mark and the text after it. */
export const ICON_GAP = 8;
/** Half-height of a database's elliptical lid; the renderer draws it. */
export const CAP_RY = 7;
/** Half-width of a queue's elliptical cap. */
export const CAP_RX = 8;
const MIN_WIDTH = 96;
const BASE_HEIGHT = 46;

/**
 * A free text inside a container is secondary to its title, so it is set a
 * couple of points smaller — the same size the connection labels use.
 */
export const NOTE_FONT_SIZE = 12;
/** Height of one line of corner text; a band is as tall as its longest stack. */
export const NOTE_LINE_H = 20;
/** Inset from the container's edge; matches the lead-in of its title. */
export const NOTE_INSET = 12;
/** Breathing room between a left and a right text sharing one band. */
export const NOTE_GAP = 16;

export function measureLabelWidth(label: string): number {
  const longest = label.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
  return longest * AVG_CHAR_WIDTH;
}

/** Same estimate as {@link measureLabelWidth}, at the smaller note size. */
export function measureNoteWidth(text: string): number {
  return text.length * NOTE_FONT_SIZE * 0.6;
}

/**
 * The lines pinned to one corner, in the order they were written — which is the
 * order they are stacked, top line first, whichever corner it is. The layout
 * counts them and the renderer draws them, so both read the stack the same way.
 */
export function noteLines(
  texts: ContainerText[] | undefined,
  corner: Corner,
): readonly ContainerText[] {
  return texts?.filter((t) => t.corner === corner) ?? [];
}

/** Width of the widest line in a stack. */
export function measureNoteStack(lines: readonly ContainerText[]): number {
  return lines.reduce((m, t) => Math.max(m, measureNoteWidth(t.text)), 0);
}

/**
 * Size a leaf shape. Cylinders reserve room for their elliptical caps.
 *
 * A measured size is rounded up onto {@link GRID}, so a row of boxes differs in
 * width by whole grid steps and centring one against another cannot land on a
 * half pixel. `style.width` / `style.height` win outright and are *not* rounded —
 * an explicit size is exact, caps and all, because a box the author asked for
 * should be the box they get.
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
  return {
    width: style.width ?? ceilToGrid(width),
    height: style.height ?? ceilToGrid(height),
  };
}
