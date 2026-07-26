/** Thrown on malformed DSL. Carries the 1-based line/column and renders a
 *  caret-annotated message pointing at the offending source line. */
export class DiagramParseError extends Error {
  constructor(
    public readonly reason: string,
    public readonly line: number,
    public readonly col: number,
    public readonly srcLine: string,
  ) {
    super(formatMessage(reason, line, col, srcLine));
    this.name = "DiagramParseError";
  }
}

function formatMessage(reason: string, line: number, col: number, src: string): string {
  const caret = " ".repeat(Math.max(0, col - 1)) + "^";
  return `Parse error (line ${line}:${col}): ${reason}\n  ${src}\n  ${caret}`;
}

/** 1-based column of the first non-whitespace character of a raw line. */
export function indentCol(raw: string): number {
  return raw.length - raw.trimStart().length + 1;
}
