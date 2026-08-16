import type { Text } from "@codemirror/state";

export type DenjiKind = "app" | "database" | "queue" | "rect" | "service" | "group";

export interface DenjiSymbol {
  id: string;
  kind: DenjiKind;
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

export interface DenjiScan {
  /** Every declaration in the document, in source order, duplicates included. */
  symbols: DenjiSymbol[];
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
  /** Names declared by `style <name> { … }`, in source order. */
  styles: string[];
  /** Names declared by `icon <name> { … }`, in source order. */
  icons: string[];
  /** The kind of declaration block the cursor sits in, if any. */
  block?: "style" | "icon";
  /** True when the cursor sits inside a multi-line style block. */
  inStyleBlock: boolean;
  /** The kind a type-selector block targets, when the cursor is inside one. */
  styleSlot?: string;
}

/** Mirrors BLOCK_OPEN in packages/core/src/dsl/arch-parse.ts. */
const BLOCK_OPEN = /^(style|icon)\s+([A-Za-z][A-Za-z0-9_-]*)\s*\{(.*)$/;
const SLOTS = new Set(["app", "database", "queue", "rect", "service", "group", "edge"]);

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
export function scanDenji(doc: Text, cursorLine = 0): DenjiScan {
  const symbols: DenjiSymbol[] = [];
  const open: string[] = [];
  let scope = "";
  let depth = 0;
  let hasHeader = false;
  let firstContentLine = 0;
  let selfId: string | undefined;
  const styles: string[] = [];
  const icons: string[] = [];
  /** The open declaration block, or null. Its `}` must not pop `open`. */
  let declBlock: { kind: "style" | "icon"; name: string } | null = null;
  let block: "style" | "icon" | undefined;
  let inStyleBlock = false;
  let styleSlot: string | undefined;

  for (let n = 1; n <= doc.lines; n++) {
    const l = doc.line(n);
    const text = l.text;
    const trimmed = text.trim();

    // Snapshot before this line can open or close anything: a container header
    // and its closing brace both belong to the *parent* scope.
    if (n === cursorLine) {
      scope = open[open.length - 1] ?? "";
      depth = open.length;
      block = declBlock?.kind;
      inStyleBlock = declBlock?.kind === "style";
      styleSlot =
        declBlock?.kind === "style" && SLOTS.has(declBlock.name) ? declBlock.name : undefined;
    }

    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("%%")) continue;
    if (firstContentLine === 0) firstContentLine = n;

    // A declaration block owns its lines, and — crucially — its closing brace.
    // Popping `open` here would corrupt the scope of everything after it.
    if (declBlock !== null) {
      if (trimmed === "}") declBlock = null;
      continue;
    }
    const opening = BLOCK_OPEN.exec(trimmed);
    if (opening) {
      const kind = opening[1] as "style" | "icon";
      const name = opening[2]!;
      (kind === "style" ? styles : icons).push(name);
      if (!opening[3]!.trim().endsWith("}")) declBlock = { kind, name };
      continue;
    }
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
    const kind = m[1] as DenjiKind;
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

  return {
    symbols,
    scope,
    depth,
    hasHeader,
    firstContentLine,
    selfId,
    styles,
    icons,
    block,
    inStyleBlock,
    styleSlot,
  };
}

/** First declaration wins, so a duplicated id shows up once in the popup. */
export function uniqueIds(symbols: readonly DenjiSymbol[]): DenjiSymbol[] {
  const seen = new Set<string>();
  const out: DenjiSymbol[] = [];
  for (const s of symbols) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}
