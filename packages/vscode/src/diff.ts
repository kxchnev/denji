/**
 * Turning "here is the whole document, rewritten" into the few lines that
 * actually changed. Kept apart from `edit.ts` so it can be tested without a
 * running editor.
 */

/**
 * The lines that differ, as `[0-based line, new text]` — or null when the two
 * documents cannot be matched up line by line.
 *
 * `setNodePosition` rewrites declaration lines where they stand and never adds
 * or removes one, so matching by index is exact — and replacing three lines
 * instead of the whole file leaves the cursor, the selection and the folded
 * regions where the author left them. Should that ever stop being true, the line
 * counts diverge and the caller replaces everything: worse to use, never wrong.
 */
export function changedLines(before: string, after: string): Array<[number, string]> | null {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length !== b.length) return null;
  const out: Array<[number, string]> = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    // A `TextLine`'s range stops before the line break, but the split above kept
    // the "\r" of a CRLF document on the end of the line. Handing that back
    // would plant a stray carriage return in the middle of the line.
    out.push([i, b[i]!.replace(/\r$/, "")]);
  }
  return out;
}
