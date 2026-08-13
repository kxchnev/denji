/**
 * Small, surgical edits to `.pwr` source — what an interactive editor writes back
 * after the reader has dragged something.
 *
 * Deliberately a line rewriter rather than a printer over the model. Printing the
 * model back out would reformat the whole document on every drag, taking the
 * author's blank lines, declaration order and comments with it — unacceptable
 * next to a live text editor with a cursor and an undo history in it.
 *
 * ⚠️ This leans on the shape of the language as `arch-parse.ts` reads it: a node is
 * declared on exactly one line, its directives sit in that line's tail, and `#` /
 * `%%` comments own a whole line rather than trailing one. If a declaration ever
 * grows across lines, this module needs a real parse with source spans instead.
 */

import type { Point } from "../model/geometry.js";

/** A line that declares a node — everything that can carry `@at`. */
const DECLARATION = /^(\s*)(app|database|queue|rect|service|group)(\s+)([A-Za-z0-9_]+)(.*)$/;

/** Where something is declared, 1-based, with `col`..`endCol` over the id itself. */
export interface Declaration {
  line: number;
  col: number;
  /** Exclusive, so `text.slice(col - 1, endCol - 1)` is the id. */
  endCol: number;
  /** The whole source line, for a caret or a squiggle to sit under. */
  text: string;
}

/** The head of any line that declares something with an id. `style` and `icon`
 *  are in the list too: a finding naming one has to point somewhere. */
const DECLARED = "app|database|queue|rect|service|group|style|icon";

/**
 * Where `id` is declared, or null.
 *
 * The **last** declaration, because for a duplicate id that is the offending
 * one; for everything else there is only one, and a diagram with a duplicate
 * never reaches the checks that ask about anything else — it fails to build.
 *
 * Lives here rather than in `check.ts` because it is the same "a declaration is
 * one line, and this is what its head looks like" assumption as {@link
 * setNodePosition}: when one has to change, so does the other. Callers wanting
 * to put a cursor or a squiggle on the id get the columns from here for the
 * same reason — the id's offset is a fact about the declaration's shape.
 */
export function findDeclaration(source: string, id: string): Declaration | null {
  const decl = new RegExp(`^(\\s*(?:${DECLARED})\\s+)(${id})\\b`);
  const lines = source.split(/\r?\n/);
  let found: Declaration | null = null;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!;
    const m = decl.exec(text);
    if (!m) continue;
    const col = m[1]!.length + 1;
    found = { line: i + 1, col, endCol: col + id.length, text };
  }
  return found;
}

/** The `architecture` line — where a finding about the drawing as a whole
 *  belongs, since that is where the diagram-wide directives are written. */
export function findHeaderLine(source: string): Declaration | null {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(architecture)\b/.exec(lines[i]!);
    if (!m) continue;
    const col = m[1]!.length + 1;
    return { line: i + 1, col, endCol: col + m[2]!.length, text: lines[i]! };
  }
  return null;
}

/** A leading `"label"` in a declaration's tail. */
const LABEL = /^\s*("[^"]*")/;

/** A trailing `{`, i.e. this declaration opens a container. */
const OPEN_BRACE = /\{\s*$/;

/** One directive, tolerating the nesting `@fill(rgb(1,2,3))` needs. */
const directive = (names: string): RegExp =>
  new RegExp(`@(?:${names})\\((?:[^()]|\\([^()]*\\))*\\)`, "gi");

/**
 * The node's *own* placement, which a new one replaces. Other nodes pointing
 * *at* this one are untouched — that is how a moved node keeps taking its
 * followers along.
 */
const PLACEMENT = (): RegExp => directive("at|rightOf|leftOf|above|below");
/**
 * How the placement is refined. Exact coordinates make both meaningless, so
 * pinning drops them; a relation does not, so re-aiming one keeps them.
 */
const REFINEMENTS = (): RegExp => directive("align|gap");

/**
 * Several nodes at once. `null` when not one of them could be found.
 */
export function setNodePositions(
  src: string,
  entries: ReadonlyArray<{ id: string; at: Point }>,
): string | null {
  let out = src;
  let touched = false;
  for (const e of entries) {
    const next = setNodePosition(out, e.id, e.at);
    if (next !== null) {
      out = next;
      touched = true;
    }
  }
  return touched ? out : null;
}

/**
 * Pin `id` to `at`, returning the new source — or `null` if the document has no
 * such declaration, which is all a caller racing against an edit can do about it.
 *
 * Any coordinates already on the node are replaced, its own relative hints are
 * dropped, and everything else on the line (label, `@style`, `@icon`, inline
 * properties) is kept in place.
 */
export function setNodePosition(src: string, id: string, at: Point): string | null {
  return rewrite(src, id, `@at(${Math.round(at.x)}, ${Math.round(at.y)})`, true);
}

/**
 * Say where `id` sits relative to a sibling — what a drag writes now that the
 * layout arranges everything else.
 *
 * The same directives a person would have typed, so the file stays a file
 * someone can read and keep editing, and the node keeps being arranged rather
 * than being nailed to the spot the pointer happened to leave it. Any
 * coordinates on the node go: it asked to be placed by relation instead.
 */
export function setNodeRelation(
  src: string,
  id: string,
  side: "rightOf" | "leftOf" | "above" | "below",
  anchor: string,
): string | null {
  return rewrite(src, id, `@${side}(${anchor})`, false);
}

/**
 * Replace a node's own placement directives with `placement`, keeping the rest
 * of its declaration — label, `@style`, `@icon`, inline properties, the opening
 * brace — exactly where it was.
 *
 * Never adds or removes a line, which is what lets an editor turn the result
 * into a minimal diff and leave the cursor, the selection and any folded blocks
 * alone.
 */
function rewrite(src: string, id: string, placement: string, exact: boolean): string | null {
  // Split on "\n" and keep any "\r" as part of the line, so a CRLF document does
  // not silently come back with every line ending rewritten.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const eol = line.endsWith("\r") ? "\r" : "";
    const text = eol === "" ? line : line.slice(0, -1);
    const m = text.match(DECLARATION);
    if (!m || m[4] !== id) continue;

    let tail = m[5]!;
    let suffix = "";
    const brace = tail.match(OPEN_BRACE);
    if (brace) {
      suffix = " {";
      tail = tail.slice(0, brace.index);
    }

    const label = tail.match(LABEL);
    const labelPart = label ? ` ${label[1]}` : "";
    let rest = (label ? tail.slice(label[0].length) : tail).replace(PLACEMENT(), " ");
    if (exact) rest = rest.replace(REFINEMENTS(), " ");
    rest = rest.replace(/\s+/g, " ").trim();

    const directives = rest === "" ? placement : `${placement} ${rest}`;
    lines[i] = `${m[1]}${m[2]}${m[3]}${id}${labelPart} ${directives}${suffix}${eol}`;
    return lines.join("\n");
  }
  return null;
}
