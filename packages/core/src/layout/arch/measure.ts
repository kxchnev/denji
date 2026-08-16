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
/** Cylinders pay for their caps as well, so their lead-in is tighter. */
const CYLINDER_PAD_X = 12;
/**
 * Brand mark drawn before a label, in a shape and in a container's title band
 * alike. The band is 28px tall, so this leaves 5px of clearance either side.
 */
export const ICON_SIZE = 18;
/** Space between a mark and the text after it. */
export const ICON_GAP = 8;
/** Half-height of a database's elliptical lid; the renderer draws it. */
export const CAP_RY = 12;
/**
 * A barrel is taller than it is wide. Its height comes from its **width**, not
 * from the two lines of text inside it — sizing it to the text is exactly what
 * made it a pancake, because the text needs 56px and the label needs 168.
 */
const DB_ASPECT = 1.15;
/**
 * A queue's height, as a share of the barrel's width, and then its own width as
 * a share of that height.
 *
 * Not the barrel transposed after all: the barrel is only just taller than it is
 * wide, so laying it on its side gave something only just wider than it was
 * tall — it still read as upright. A queue is a pipe; it has to be plainly
 * landscape to say so.
 */
const QUEUE_SHRINK = 0.8;
const QUEUE_ASPECT = 1.6;
/** Half-width of a queue's elliptical cap. */
export const CAP_RX = 10;
/**
 * The lid a box this tall can carry: below three times the cap the two arcs of
 * a cylinder cross each other. Only an author's own `@height` can get there —
 * every measured size clears it — but the renderer and the hit-test must agree
 * about the box they are drawing and pointing at, so both ask here.
 */
export const capRy = (height: number): number => Math.min(CAP_RY, height / 3);
export const capRx = (width: number): number => Math.min(CAP_RX, width / 3);

export const MIN_WIDTH = 96;
/**
 * The widest a diagram's shared box gets on its own.
 *
 * Without a ceiling the longest word in the document sets the width of every
 * box in it, and one `SparkApplicationController` makes thirty boxes half again
 * too wide. Past this a label is hyphenated instead — see {@link wrapLabel}.
 */
const MAX_SHARED_WIDTH = 144;
/** Height of one line of a label. The layout reserves it, the renderer draws on it. */
export const LABEL_LINE_H = 18;
/** Most lines a label may take before it simply widens its box instead. */
export const LABEL_MAX_LINES = 2;
/**
 * Tall enough for {@link LABEL_MAX_LINES} lines with 10px of air above and
 * below, so a one-line and a two-line label give a box of exactly the same
 * size. That is the whole point: a row of boxes should look like a row.
 */
const BASE_HEIGHT = LABEL_MAX_LINES * LABEL_LINE_H + 20;
/** An icon with no label: a square, not a box stretched to hold absent text. */
const BADGE_SIZE = BASE_HEIGHT;
/**
 * How much narrower a database is than everything else. Six grid steps: a barrel
 * should read as one at a glance without leaving a hole in the row.
 */
const DB_NARROW = 48;

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


/* ------------------------------------------------------------------ wrapping */

/** A break: line one ends at `end`, line two starts at `start`. */
interface Cut {
  end: number;
  start: number;
}

const HYPHENS = new Set(["-", "–", "—"]);
/** Shortest piece worth leaving before a hyphen. */
const MIN_HYPHEN_CHUNK = 4;

/**
 * Where a label may be broken.
 *
 * Spaces are eaten by the break; a hyphen stays on the first line, which is how
 * a reader expects a compound to break and keeps the second line from opening
 * with punctuation. Hyphens are not optional: half the names in a real diagram —
 * `data-mesh-auth-server`, `hive-metastore`, `vscode-server` — have no space at
 * all, and without them those labels could never wrap.
 *
 * Never inside brackets: `cdp (SQL Server)` is most *balanced* as
 * `cdp (SQL` / `Server)`, and that is nonsense. `.` and `/` are not breaks
 * either — `v1.2` and a path read as one thing.
 */
function cuts(s: string): Cut[] {
  const out: Cut[] = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth > 0) continue;
    else if (ch === " ") out.push({ end: i, start: i + 1 });
    else if (HYPHENS.has(ch) && i > 0 && i < s.length - 1) out.push({ end: i + 1, start: i + 1 });
  }
  return out;
}

/**
 * The most balanced two-way split of a label, or null when it cannot be broken.
 *
 * Balanced rather than greedy, and deliberately **not a function of the
 * available width**. That is what lets the renderer reproduce the layout's
 * decision from the label alone: a greedy fill would depend on the width it was
 * measured at, which is never the width the box ends up with — the shared width
 * is the diagram-wide maximum, always at least what this one shape needed.
 *
 * It also reads better: `Wide Data` / `Store Cluster` against greedy's
 * `Wide Data Store` / `Cluster`.
 */
function bestSplit(label: string): [string, string] | null {
  let best: [string, string] | null = null;
  let bestWidth = Infinity;
  for (const c of cuts(label)) {
    const first = label.slice(0, c.end).trimEnd();
    const second = label.slice(c.start).trimStart();
    if (first === "" || second === "") continue;
    // Every width here is AVG_CHAR_WIDTH times a whole number of characters, so
    // the comparison is exact; `<` keeps the leftmost cut on a tie.
    const width = Math.max(measureLabelWidth(first), measureLabelWidth(second));
    if (width < bestWidth) {
      bestWidth = width;
      best = [first, second];
    }
  }
  return best;
}

/** The narrowest text width at which a label fits on at most two lines. */
export function labelFitWidth(label: string): number {
  if (label.includes("\n")) return measureLabelWidth(label);
  const split = bestSplit(label);
  return split ? Math.max(measureLabelWidth(split[0]), measureLabelWidth(split[1]))
               : measureLabelWidth(label);
}

/**
 * The lines to draw, given the room there is.
 *
 * Greedy at a width both sides know: the layout sized the box from it and the
 * renderer reads it back off the box, so there is one answer, not two that have
 * to agree.
 *
 * A word too long for the line is **broken with a hyphen** rather than allowed
 * to set the width of every box in the diagram. That is the trade the author
 * asked for: one `SparkApplicationController` should not widen the whole
 * picture. An author's own `\n` is a hard break and is never re-flowed.
 */
export function wrapLabel(
  label: string,
  maxWidth: number,
  maxLines: number = LABEL_MAX_LINES,
): readonly string[] {
  if (label === "") return [];
  if (label.includes("\n")) return label.split("\n");
  if (measureLabelWidth(label) <= maxWidth) return [label];

  const fits = Math.floor(maxWidth / AVG_CHAR_WIDTH);
  const out: string[] = [];
  let line = "";
  const flush = (): void => {
    if (line !== "") out.push(line);
    line = "";
  };

  for (let token of pieces(label)) {
    // Each pass either places the token, moves to a fresh line, or bites a
    // hyphenated chunk off the front of it — so something always shortens and
    // the loop cannot spin.
    for (;;) {
      if (measureLabelWidth((line + token).trimEnd()) <= maxWidth) {
        line += token;
        break;
      }
      if (line !== "") {
        flush();
        continue;
      }
      // Below this there is no room to hyphenate into anything readable, so the
      // word is left whole and allowed to bleed. A line of `Ми-` `кро-` `сер-`
      // helps nobody.
      if (token.length <= fits || fits < MIN_HYPHEN_CHUNK + 1) {
        line = token;
        break;
      }
      out.push(token.slice(0, fits - 1) + "-");
      token = token.slice(fits - 1);
    }
  }
  flush();

  // More lines than the box is tall: the surplus goes back onto the last line
  // rather than being dropped. Joined as it was written — a label that silently
  // loses a word is worse than one that reaches past its border, and inserting
  // a space where a hyphen broke would invent text the author never typed.
  const capped =
    out.length > maxLines
      ? [...out.slice(0, maxLines - 1), out.slice(maxLines - 1).join("")]
      : out;
  return capped.map((l) => l.trimEnd());
}

/**
 * The label in pieces that may not be split apart, each carrying the space or
 * hyphen that followed it. Brackets stay whole: `cdp (SQL Server)` must not
 * break as `cdp (SQL` / `Server)`.
 */
function pieces(label: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of label) {
    cur += ch;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === " " || HYPHENS.has(ch))) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur !== "") out.push(cur);
  return out;
}

export function measureShape(shape: Shape, style: StyleProps = {}, widths?: ShapeWidths): Size {
  const shared = widths?.shared ?? Math.max(MIN_WIDTH, Math.min(MAX_SHARED_WIDTH, requiredShapeWidth(shape)));
  const size = shapeSize(shape.kind, shared);
  return {
    width: style.width ?? (isBadge(shape) ? BADGE_SIZE : ceilToGrid(size.width)),
    height: style.height ?? (isBadge(shape) ? BADGE_SIZE : ceilToGrid(size.height)),
  };
}

/**
 * A kind's box, given the diagram's shared width.
 *
 * A barrel's height comes from its **width**, never from the text inside it:
 * sizing it to two lines is what made it a pancake, three times wider than it
 * was tall. A queue is derived from the barrel in turn, but plainly landscape —
 * the two cylinders are one shape standing up and lying down.
 */
function shapeSize(kind: Shape["kind"], shared: number): Size {
  if (kind === "database") {
    const width = shared - DB_NARROW;
    return { width, height: ceilToGrid(width * DB_ASPECT) };
  }
  if (kind === "queue") {
    const height = ceilToGrid(shapeSize("database", shared).width * QUEUE_SHRINK);
    return { width: ceilToGrid(height * QUEUE_ASPECT), height };
  }
  return { width: shared, height: BASE_HEIGHT };
}

/**
 * How many lines of label a box this tall can hold.
 *
 * The layout sizes the box and the renderer reads the count back off it, so
 * both wrap the same way. A cylinder's lid and bulge are not room for text.
 */
export function labelBoxLines(shape: Shape, height: number): number {
  const caps = shape.kind === "database" ? capRy(height) * 2 : 0;
  const mark = shape.icon && iconAbove(shape.kind) ? ICON_SIZE + ICON_GAP : 0;
  // A barrel needs less padding of its own: the lid and the bulge already hold
  // the text away from the outline.
  const pad = shape.kind === "database" ? 8 : 20;
  return Math.max(1, Math.floor((height - caps - mark - pad) / LABEL_LINE_H));
}

/**
 * A barrel wears its mark **above** the label; everything else wears it before.
 *
 * A database is narrow and tall: 26px of mark across a 96px box is a third of
 * the line, and it lands beside whichever line happens to fall in the middle,
 * reading as if it were part of the text. Vertical room is the one thing a
 * barrel has to spare. A queue is the same barrel on its side, so its spare
 * room is horizontal and its mark stays where every other mark is.
 */
export function iconAbove(kind: Shape["kind"]): boolean {
  return kind === "database";
}

/** An icon with no label is a mark, not a box: it keeps a compact square. */
export function isBadge(shape: Shape): boolean {
  return shape.icon !== undefined && shape.label === "";
}

/** Room a shape needs around its text: padding, a mark, a cylinder's caps. */
export function shapeChrome(shape: Shape): number {
  // A cylinder pays for its caps out of the same budget, so it keeps a tighter
  // lead-in than a plain box — otherwise half a small barrel is padding.
  const pad = shape.kind === "database" || shape.kind === "queue" ? CYLINDER_PAD_X : PAD_X;
  return (
    pad * 2 +
    (shape.icon && !iconAbove(shape.kind) ? ICON_SIZE + ICON_GAP : 0) +
    // A queue is not made wider by its caps any more — they eat into its own
    // padding instead, so it stands in a row with the apps rather than 24px
    // proud of them.
    (shape.kind === "queue" ? CAP_RX * 2 : 0)
  );
}

/** The inverse: the room a label actually has once the box is this wide. */
export function labelBoxWidth(shape: Shape, width: number): number {
  return width - shapeChrome(shape);
}

/** The narrowest box this shape could live in with its label on ≤ 2 lines. */
export function requiredShapeWidth(shape: Shape): number {
  return Math.round(shapeChrome(shape) + labelFitWidth(shape.label));
}

/** The two widths a diagram uses: one for its boxes, a narrower one for barrels. */
export interface ShapeWidths {
  readonly shared: number;
  readonly database: number;
}

/**
 * One width for every leaf in the diagram, so a row of boxes looks like a row.
 *
 * Sizing a box to its own label is what made the picture ragged: the width
 * tracked the label almost a grid step per character, so a diagram showed as
 * many widths as it had names. Here every shape says how narrow it could be
 * with its label on at most two lines, and the widest answer serves everyone.
 *
 * A database is always exactly {@link DB_NARROW} narrower — a barrel should
 * read as a barrel. When the longest name in the document belongs to a
 * database, the *shared* width grows to keep that relation rather than the
 * barrel widening to match its neighbours.
 *
 * A shape the author sized by hand neither gives nor takes: `@width(400)` on
 * one box must not drag the other thirty along with it, which is the opposite
 * of what the author asked for.
 */
export function chooseShapeWidths(
  shapes: Iterable<Shape>,
  styleOf: (shape: Shape) => StyleProps,
): ShapeWidths {
  let plain = MIN_WIDTH;
  let database = 0;
  for (const shape of shapes) {
    if (styleOf(shape).width !== undefined) continue;
    if (isBadge(shape)) continue;
    const needed = requiredShapeWidth(shape);
    if (shape.kind === "database") database = Math.max(database, needed);
    // A queue's width is derived from the barrel's, so what it needs has to be
    // divided back out through that derivation before it can be compared with a
    // box. Without this a queue asks for room it will never be given.
    else if (shape.kind === "queue") {
      database = Math.max(database, needed / (QUEUE_SHRINK * QUEUE_ASPECT));
    }
    else plain = Math.max(plain, needed);
  }
  // The database term only counts when there are databases; otherwise a diagram
  // without a single one would still be widened to make room beside them.
  // Capped: past MAX_SHARED_WIDTH a long word is hyphenated rather than allowed
  // to widen every box in the document.
  const wanted = database > 0 ? Math.max(plain, database + DB_NARROW) : plain;
  const shared = ceilToGrid(Math.min(wanted, Math.max(MIN_WIDTH, MAX_SHARED_WIDTH)));
  return { shared, database: shared - DB_NARROW };
}
