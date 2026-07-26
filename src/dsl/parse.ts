import type {
  Direction,
  EdgeStyle,
  Flowchart,
  ArrowHead,
  LayoutHint,
  NodeShape,
} from "../model/types.js";
import { flowchart } from "../model/builder.js";

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

interface NodeSpec {
  id: string;
  label?: string;
  shape?: NodeShape;
  hint?: LayoutHint;
}

interface EdgeSpec {
  from: string;
  to: string;
  label?: string;
  style: EdgeStyle;
  head: ArrowHead;
}

interface NodeRef {
  id: string;
  label?: string;
  shape?: NodeShape;
  /** Text remaining after the node reference (directives on a node line). */
  rest: string;
}

// Edge operators, longest-first so the scanner matches greedily.
const EDGE_OPS = ["-.->", "-->", "---", "==>", "->"] as const;

// Shape wrappers, most specific first (e.g. `([` before `[`).
const SHAPES: Array<[RegExp, NodeShape]> = [
  [/^\(\[([^\]]*)\]\)/, "stadium"],
  [/^\(\(([^)]*)\)\)/, "circle"],
  [/^\{\{([^}]*)\}\}/, "hexagon"],
  [/^\[([^\]]*)\]/, "rect"],
  [/^\(([^)]*)\)/, "round"],
  [/^\{([^}]*)\}/, "diamond"],
];

/** Parse a `.pwr` source string into a Flowchart model (via the builder). */
export function parseFlowchart(src: string): Flowchart {
  const lines = src.split(/\r?\n/);
  let direction: Direction = "TB";
  const nodes = new Map<string, NodeSpec>();
  const edges: EdgeSpec[] = [];

  const ensureNode = (id: string): NodeSpec => {
    let n = nodes.get(id);
    if (!n) {
      n = { id };
      nodes.set(id, n);
    }
    return n;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("%%")) continue;

    const header = trimmed.match(/^flowchart(?:\s+(TB|BT|LR|RL))?$/i);
    if (header) {
      if (header[1]) direction = header[1].toUpperCase() as Direction;
      continue;
    }

    if (findEdgeOp(trimmed)) {
      parseEdgeLine(trimmed, lineNo, raw, ensureNode, edges);
    } else {
      parseNodeLine(trimmed, lineNo, raw, ensureNode);
    }
  }

  const b = flowchart(direction);
  for (const spec of nodes.values()) {
    b.node(spec.id, spec.label, { shape: spec.shape, hint: spec.hint });
  }
  for (const e of edges) {
    b.edge(e.from, e.to, { label: e.label, style: e.style, head: e.head });
  }
  return b.build();
}

function parseNodeLine(
  line: string,
  lineNo: number,
  raw: string,
  ensureNode: (id: string) => NodeSpec,
): void {
  const ref = parseNodeRef(line, lineNo, raw, indent(raw));
  const spec = ensureNode(ref.id);
  applyRef(spec, ref);
  parseDirectives(ref.rest, lineNo, raw, spec);
}

function parseEdgeLine(
  line: string,
  lineNo: number,
  raw: string,
  ensureNode: (id: string) => NodeSpec,
  edges: EdgeSpec[],
): void {
  const found = findEdgeOp(line)!;
  const base = indent(raw);
  const leftText = line.slice(0, found.index).trim();
  let restText = line.slice(found.index + found.op.length).trim();

  // Label may be a `|pipe|` segment on either side of the target, or a
  // trailing `: label`.
  let label: string | undefined;
  const open = topLevelIndex(restText, "|");
  if (open !== -1) {
    const close = topLevelIndex(restText.slice(open + 1), "|");
    if (close === -1) {
      throw new DiagramParseError("unterminated |label|", lineNo, base + found.index, raw);
    }
    const closeAbs = open + 1 + close;
    label = restText.slice(open + 1, closeAbs).trim();
    restText = (restText.slice(0, open) + " " + restText.slice(closeAbs + 1)).trim();
  } else {
    const colon = topLevelIndex(restText, ":");
    if (colon !== -1) {
      label = restText.slice(colon + 1).trim();
      restText = restText.slice(0, colon).trim();
    }
  }

  const src = parseNodeRef(leftText, lineNo, raw, base);
  if (src.rest.trim() !== "") {
    throw new DiagramParseError(`unexpected "${src.rest.trim()}" in edge source`, lineNo, base, raw);
  }
  const dst = parseNodeRef(restText, lineNo, raw, base + found.index + found.op.length);
  if (dst.rest.trim() !== "") {
    throw new DiagramParseError(`unexpected "${dst.rest.trim()}" in edge target`, lineNo, base, raw);
  }

  applyRef(ensureNode(src.id), src);
  applyRef(ensureNode(dst.id), dst);

  const { style, head } = opToStyle(found.op);
  edges.push({ from: src.id, to: dst.id, label, style, head });
}

function applyRef(spec: NodeSpec, ref: NodeRef): void {
  if (ref.label !== undefined) spec.label = ref.label;
  if (ref.shape !== undefined) spec.shape = ref.shape;
}

/** Parse `id` plus an optional shape wrapper; returns the leftover text. */
function parseNodeRef(text: string, lineNo: number, raw: string, col: number): NodeRef {
  const t = text.trimStart();
  const m = t.match(/^([A-Za-z0-9_]+)/);
  if (!m) {
    throw new DiagramParseError("expected a node id", lineNo, col, raw);
  }
  const id = m[1]!;
  let rest = t.slice(m[0].length);

  for (const [re, shape] of SHAPES) {
    const sm = rest.match(re);
    if (sm) {
      return { id, label: sm[1]!.trim(), shape, rest: rest.slice(sm[0].length) };
    }
  }
  // Guard against a bare unmatched bracket like `A[oops`.
  const stray = rest.trimStart();
  if (/^[[({]/.test(stray)) {
    throw new DiagramParseError("unterminated node shape bracket", lineNo, col, raw);
  }
  return { id, rest };
}

/** Parse trailing `@name(args)` directives on a node line into the hint. */
function parseDirectives(text: string, lineNo: number, raw: string, spec: NodeSpec): void {
  let rest = text.trim();
  const base = indent(raw);
  while (rest !== "") {
    const m = rest.match(/^@([A-Za-z]+)\(([^)]*)\)/);
    if (!m) {
      throw new DiagramParseError(`unexpected token "${rest}"`, lineNo, base, raw);
    }
    applyDirective(spec, m[1]!, m[2]!.trim(), lineNo, raw);
    rest = rest.slice(m[0].length).trim();
  }
}

function applyDirective(
  spec: NodeSpec,
  nameRaw: string,
  args: string,
  lineNo: number,
  raw: string,
): void {
  const hint: LayoutHint = spec.hint ?? (spec.hint = {});
  const name = nameRaw.toLowerCase();
  const relational: Record<string, keyof LayoutHint> = {
    above: "above",
    below: "below",
    rightof: "rightOf",
    leftof: "leftOf",
    samerank: "sameRank",
  };

  if (name === "pin") {
    const parts = args.split(",").map((p) => Number(p.trim()));
    if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
      throw new DiagramParseError("@pin expects (x,y) numbers", lineNo, indent(raw), raw);
    }
    hint.pin = { x: parts[0]!, y: parts[1]! };
  } else if (name === "gap") {
    const g = Number(args);
    if (!Number.isFinite(g)) {
      throw new DiagramParseError("@gap expects a number", lineNo, indent(raw), raw);
    }
    hint.gap = g;
  } else if (relational[name]) {
    if (!/^[A-Za-z0-9_]+$/.test(args)) {
      throw new DiagramParseError(`@${nameRaw} expects a node id`, lineNo, indent(raw), raw);
    }
    (hint[relational[name]] as string) = args;
  } else {
    throw new DiagramParseError(`unknown directive @${nameRaw}`, lineNo, indent(raw), raw);
  }
}

function opToStyle(op: string): { style: EdgeStyle; head: ArrowHead } {
  switch (op) {
    case "-.->":
      return { style: "dashed", head: "arrow" };
    case "==>":
      return { style: "thick", head: "arrow" };
    case "---":
      return { style: "solid", head: "none" };
    default: // "->", "-->"
      return { style: "solid", head: "arrow" };
  }
}

/** Find the first edge operator that sits outside any bracketed label. */
function findEdgeOp(line: string): { op: string; index: number } | null {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === "[" || c === "(" || c === "{") depth++;
    else if (c === "]" || c === ")" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      for (const op of EDGE_OPS) {
        if (line.startsWith(op, i)) return { op, index: i };
      }
    }
  }
  return null;
}

/** Index of `ch` at bracket depth 0, or -1. */
function topLevelIndex(line: string, ch: string): number {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === "[" || c === "(" || c === "{") depth++;
    else if (c === "]" || c === ")" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === ch) return i;
  }
  return -1;
}

/** Leading-whitespace width of the raw line (1-based column of first content). */
function indent(raw: string): number {
  return raw.length - raw.trimStart().length + 1;
}
