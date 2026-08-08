/**
 * Dot grid that moves and scales with the viewport, so panning and zooming read
 * as motion over a surface instead of a diagram sliding across static dots.
 *
 * A port of the docs site's `DiagramGrid`, kept identical on purpose — the same
 * canvas should feel the same in the playground and in the editor. The tile is
 * `gap * scale` wide and offset by `x % step`, which is all an infinite grid
 * needs: only one tile of translation is ever observable. On top of that the
 * pitch is kept inside one octave, and the next-finer lattice is crossfaded in
 * across that octave — so zooming past a threshold densifies the grid gradually
 * instead of popping.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Grid pitch in diagram units at scale 1. */
const BASE_GAP = 16;
/**
 * Smallest on-screen pitch of the fully-opaque lattice. Equal to BASE_GAP so
 * that at scale 1 — and at every power of two — the grid is exactly a clean
 * BASE_GAP lattice with the intermediate layer invisible.
 */
const MIN_PITCH = BASE_GAP;
/** Constant, so a dot never drifts relative to the diagram as the zoom changes. */
const DOT_R = 1;

export class DiagramGrid {
  readonly element: SVGSVGElement;
  private readonly coarse: SVGPatternElement;
  private readonly fine: SVGPatternElement;
  private readonly fineFill: SVGRectElement;

  constructor(idPrefix: string) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("grid");

    const defs = document.createElementNS(SVG_NS, "defs");
    this.fine = dotPattern(`${idPrefix}-fine`);
    this.coarse = dotPattern(`${idPrefix}-coarse`);
    defs.append(this.fine, this.coarse);

    this.fineFill = fill(`${idPrefix}-fine`);
    // Coarse on top and opaque, so its dots are unaffected by the fading layer.
    const coarseFill = fill(`${idPrefix}-coarse`);
    svg.append(defs, this.fineFill, coarseFill);
    this.element = svg;
  }

  update(x: number, y: number, scale: number): void {
    let gap = BASE_GAP;
    while (gap * scale < MIN_PITCH) gap *= 2;
    while (gap * scale >= MIN_PITCH * 2) gap /= 2;

    const step = gap * scale;
    // 0 at the start of the octave, approaching 1 at its end — where the fine
    // lattice has fully taken over and becomes the coarse one for the next.
    this.fineFill.setAttribute("opacity", String(step / MIN_PITCH - 1));
    place(this.fine, step / 2, x, y);
    place(this.coarse, step, x, y);
  }
}

function dotPattern(id: string): SVGPatternElement {
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.id = id;
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", String(DOT_R));
  dot.setAttribute("cy", String(DOT_R));
  dot.setAttribute("r", String(DOT_R));
  dot.setAttribute("fill", "currentColor");
  pattern.append(dot);
  return pattern;
}

function place(pattern: SVGPatternElement, step: number, x: number, y: number): void {
  // Shift by -DOT_R so the dot's centre, not its bounding box, lands on the
  // lattice point at `x % step`.
  pattern.setAttribute("x", String((x % step) - DOT_R));
  pattern.setAttribute("y", String((y % step) - DOT_R));
  pattern.setAttribute("width", String(step));
  pattern.setAttribute("height", String(step));
}

function fill(id: string): SVGRectElement {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", `url(#${id})`);
  return rect;
}
