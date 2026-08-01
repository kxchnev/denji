import type { Text } from "@codemirror/state";

export type PwrKind = "app" | "database" | "queue" | "rect" | "service" | "group";

export interface PwrSymbol {
  id: string;
  kind: PwrKind;
  /** The quoted label, when the declaration has one. */
  label?: string;
  /** Id of the enclosing container, or "" for the top level. */
  scope: string;
  /** 1-based declaration line. */
  line: number;
  /** Document offsets of the id token — used by the optional linter. */
  idFrom: number;
  idTo: number;
}

export interface PwrScan {
  /** Every declaration in the document, in source order, duplicates included. */
  symbols: PwrSymbol[];
  /** Enclosing container id at the cursor line, "" at the top level. */
  scope: string;
  /** Unclosed `{` count at the cursor line — `}` is only offered when > 0. */
  depth: number;
  /** True when a bare `architecture` line exists anywhere. */
  hasHeader: boolean;
  /** 1-based first non-blank, non-comment line; 0 when the document has none. */
  firstContentLine: number;
  /** Id declared on the cursor line, if any — a node cannot anchor itself. */
  selfId?: string;
}

/**
 * The parser's shape/container regexes truncated after the optional label: the
 * parts it drops are the ones that only hold once a line is finished, so this
 * still reads the half-written lines that are normal while typing.
 */
const DECL = /^(app|database|queue|rect|service|group)\s+([A-Za-z0-9_]+)\s*(?:"([^"]*)")?/;

/**
 * One regex per line over the whole document. Declarations are collected
 * globally (connections and hints may both reference nodes declared later),
 * while `scope`/`depth` are snapshotted at `cursorLine`.
 */
export function scanPwr(doc: Text, cursorLine = 0): PwrScan {
  const symbols: PwrSymbol[] = [];
  const open: string[] = [];
  let scope = "";
  let depth = 0;
  let hasHeader = false;
  let firstContentLine = 0;
  let selfId: string | undefined;

  for (let n = 1; n <= doc.lines; n++) {
    const l = doc.line(n);
    const text = l.text;
    const trimmed = text.trim();

    // Snapshot before this line can open or close anything: a container header
    // and its closing brace both belong to the *parent* scope.
    if (n === cursorLine) {
      scope = open[open.length - 1] ?? "";
      depth = open.length;
    }

    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("%%")) continue;
    if (firstContentLine === 0) firstContentLine = n;
    // The header may carry diagram-level directives after the keyword.
    if (/^architecture\b/.test(trimmed)) {
      hasHeader = true;
      continue;
    }
    if (trimmed === "}") {
      open.pop();
      continue;
    }

    const m = DECL.exec(trimmed);
    if (!m) continue; // a connection, or a line too broken to read
    const kind = m[1] as PwrKind;
    const id = m[2]!;
    const idFrom = l.from + text.indexOf(id, text.indexOf(kind) + kind.length);
    symbols.push({
      id,
      kind,
      label: m[3],
      scope: open[open.length - 1] ?? "",
      line: n,
      idFrom,
      idTo: idFrom + id.length,
    });
    if (n === cursorLine) selfId = id;
    // A container owns the rest of the block, and `{` must close its line.
    if ((kind === "service" || kind === "group") && /\{\s*$/.test(trimmed)) open.push(id);
  }

  return { symbols, scope, depth, hasHeader, firstContentLine, selfId };
}

/** First declaration wins, so a duplicated id shows up once in the popup. */
export function uniqueIds(symbols: readonly PwrSymbol[]): PwrSymbol[] {
  const seen = new Set<string>();
  const out: PwrSymbol[] = [];
  for (const s of symbols) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}
