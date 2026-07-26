import type { FlowNode } from "../model/types.js";
import type { Size } from "../model/geometry.js";

/**
 * Rough text metrics without a DOM. We approximate an average glyph advance at
 * the default font size; good enough for box sizing. The renderer uses the same
 * font, so boxes stay comfortably larger than their text.
 */
export const FONT_SIZE = 14;
const AVG_CHAR_WIDTH = FONT_SIZE * 0.6;
const PAD_X = 16;
const PAD_Y = 10;
const MIN_WIDTH = 48;
const LINE_HEIGHT = FONT_SIZE + 6;

export function measureLabel(label: string): Size {
  const lines = label.split("\n");
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const textW = longest * AVG_CHAR_WIDTH;
  const textH = lines.length * LINE_HEIGHT;
  return { width: textW, height: textH };
}

export function measureNode(node: FlowNode): Size {
  const { width: tw, height: th } = measureLabel(node.label);
  let width = Math.max(MIN_WIDTH, tw + PAD_X * 2);
  let height = th + PAD_Y * 2;

  switch (node.shape) {
    case "diamond":
      // Text sits in the middle of a rhombus; needs extra room on all sides.
      width += tw * 0.6 + 16;
      height += th + 8;
      break;
    case "circle":
    case "stadium":
      width += 12;
      break;
    case "hexagon":
      width += 20;
      break;
  }
  return { width: Math.round(width), height: Math.round(height) };
}
