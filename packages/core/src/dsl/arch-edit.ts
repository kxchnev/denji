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

/** A line that declares a node — everything that can carry a placement hint. */
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
 * setNodeRelation}: when one has to change, so does the other. Callers wanting
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
 * *at* this one are untouched — that is how a moved node keeps taking whatever
 * was anchored to it along.
 */
const PLACEMENT = (): RegExp => directive("rightOf|leftOf|above|below");

/**
 * Say where `id` sits relative to a sibling — what a drag writes.
 *
 * The same directives a person would have typed, so the file stays a file
 * someone can read and keep editing, and the node keeps being arranged rather
 * than being nailed to the spot the pointer happened to leave it. `@gap` on the
 * line stays: re-aiming a relation does not answer how far away it should sit.
 *
 * `null` when the document has no such declaration, which is all a caller racing
 * against an edit can do about it.
 */
export function setNodeRelation(
  src: string,
  id: string,
  side: "rightOf" | "leftOf" | "above" | "below",
  anchor: string,
): string | null {
  return rewrite(src, id, `@${side}(${anchor})`);
}

/**
 * Replace a node's own placement directives with `placement`, keeping the rest
 * of its declaration — label, `@gap`, `@style`, `@icon`, inline properties, the
 * opening brace — exactly where it was.
 *
 * Never adds or removes a line, which is what lets an editor turn the result
 * into a minimal diff and leave the cursor, the selection and any folded blocks
 * alone.
 */
function rewrite(src: string, id: string, placement: string): string | null {
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
    const rest = (label ? tail.slice(label[0].length) : tail)
      .replace(PLACEMENT(), " ")
      .replace(/\s+/g, " ")
      .trim();

    const directives = rest === "" ? placement : `${placement} ${rest}`;
    lines[i] = `${m[1]}${m[2]}${m[3]}${id}${labelPart} ${directives}${suffix}${eol}`;
    return lines.join("\n");
  }
  return null;
}
