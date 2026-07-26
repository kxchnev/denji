import type { ArchDiagram, ContainerKind, PlaceHint, ShapeKind } from "../model/arch.js";
import { architecture, type ArchitectureBuilder, type Dir } from "../model/arch-builder.js";
import { DiagramParseError, indentCol } from "./error.js";

const SHAPE_KINDS = new Set<ShapeKind>(["app", "database", "queue", "rect"]);
const CONTAINER_KINDS = new Set<ContainerKind>(["service", "group"]);

// Connection operators, longest-first for the scanner.
const ARCH_OPS: Array<[string, { dir: Dir; style: "solid" | "dashed" }]> = [
  ["<->", { dir: "both", style: "solid" }],
  ["-.->", { dir: "to", style: "dashed" }],
  ["-.-", { dir: "none", style: "dashed" }],
  ["->", { dir: "to", style: "solid" }],
  ["<-", { dir: "from", style: "solid" }],
  ["--", { dir: "none", style: "solid" }],
];

interface Frame {
  id: string;
  label: string;
  kind: ContainerKind;
  children: string[];
  hint?: PlaceHint;
}

/** Parse `.pwr` architecture DSL source into an ArchDiagram (via the builder). */
export function parseArchitecture(src: string): ArchDiagram {
  const lines = src.split(/\r?\n/);
  const b = architecture();
  const frames: Frame[] = [];

  const addChildToScope = (id: string) => {
    const top = frames[frames.length - 1];
    if (top) top.children.push(id);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("%%")) continue;
    if (line === "architecture") continue;

    if (line === "}") {
      const frame = frames.pop();
      if (!frame) throw new DiagramParseError("unexpected '}'", lineNo, indentCol(raw), raw);
      b.container(frame.id, frame.label, {
        kind: frame.kind,
        children: frame.children,
        hint: frame.hint,
      });
      addChildToScope(frame.id);
      continue;
    }

    const first = line.match(/^(\S+)/)?.[1] ?? "";

    if (SHAPE_KINDS.has(first as ShapeKind)) {
      parseShapeLine(line, lineNo, raw, b, addChildToScope);
    } else if (CONTAINER_KINDS.has(first as ContainerKind)) {
      frames.push(parseContainerOpen(line, lineNo, raw));
    } else if (findArchOp(line)) {
      parseConnectionLine(line, lineNo, raw, b);
    } else {
      throw new DiagramParseError(`unrecognized line`, lineNo, indentCol(raw), raw);
    }
  }

  if (frames.length > 0) {
    throw new DiagramParseError(
      `unclosed container "${frames[frames.length - 1]!.id}"`,
      lines.length,
      1,
      "",
    );
  }

  return b.build();
}

function parseShapeLine(
  line: string,
  lineNo: number,
  raw: string,
  b: ArchitectureBuilder,
  addChild: (id: string) => void,
): void {
  const m = line.match(/^(app|database|queue|rect)\s+([A-Za-z0-9_]+)\s*(?:"([^"]*)")?\s*(.*)$/);
  if (!m) throw new DiagramParseError("malformed shape declaration", lineNo, indentCol(raw), raw);
  const kind = m[1] as ShapeKind;
  const id = m[2]!;
  const label = m[3];
  const hint = parseDirectives(m[4] ?? "", lineNo, raw);

  const opts = { hint };
  if (kind === "app") b.app(id, label, opts);
  else if (kind === "database") b.database(id, label, opts);
  else if (kind === "queue") b.queue(id, label, opts);
  else b.rect(id, label, opts);
  addChild(id);
}

function parseContainerOpen(line: string, lineNo: number, raw: string): Frame {
  const m = line.match(/^(service|group)\s+([A-Za-z0-9_]+)\s*(?:"([^"]*)")?\s*(.*)\{\s*$/);
  if (!m) {
    throw new DiagramParseError(
      "malformed container header (expected `service|group id \"label\" {`)",
      lineNo,
      indentCol(raw),
      raw,
    );
  }
  return {
    id: m[2]!,
    label: m[3] ?? m[2]!,
    kind: m[1] as ContainerKind,
    children: [],
    hint: parseDirectives(m[4] ?? "", lineNo, raw),
  };
}

function parseConnectionLine(
  line: string,
  lineNo: number,
  raw: string,
  b: ArchitectureBuilder,
): void {
  const colon = line.indexOf(":");
  const leftPart = colon >= 0 ? line.slice(0, colon) : line;
  const label = colon >= 0 ? line.slice(colon + 1).trim() : undefined;

  const found = findArchOp(leftPart)!;
  const fromId = leftPart.slice(0, found.index).trim();
  const toId = leftPart.slice(found.index + found.op.length).trim();
  if (!/^[A-Za-z0-9_]+$/.test(fromId) || !/^[A-Za-z0-9_]+$/.test(toId)) {
    throw new DiagramParseError("connection needs a node id on each side", lineNo, indentCol(raw), raw);
  }
  const spec = ARCH_OPS.find(([op]) => op === found.op)![1];
  b.connect(fromId, toId, { label, dir: spec.dir, style: spec.style });
}

function parseDirectives(text: string, lineNo: number, raw: string): PlaceHint | undefined {
  let rest = text.trim();
  if (rest === "") return undefined;
  const hint: PlaceHint = {};
  const relational: Record<string, keyof PlaceHint> = {
    rightof: "rightOf",
    leftof: "leftOf",
    above: "above",
    below: "below",
  };

  while (rest !== "") {
    const m = rest.match(/^@([A-Za-z]+)\(([^)]*)\)/);
    if (!m) throw new DiagramParseError(`unexpected token "${rest}"`, lineNo, indentCol(raw), raw);
    const name = m[1]!.toLowerCase();
    const arg = m[2]!.trim();

    if (relational[name]) {
      if (!/^[A-Za-z0-9_]+$/.test(arg)) {
        throw new DiagramParseError(`@${m[1]} expects a node id`, lineNo, indentCol(raw), raw);
      }
      (hint[relational[name]] as string) = arg;
    } else if (name === "gap") {
      const g = Number(arg);
      if (!Number.isFinite(g)) {
        throw new DiagramParseError("@gap expects a number", lineNo, indentCol(raw), raw);
      }
      hint.gap = g;
    } else if (name === "align") {
      if (arg !== "start" && arg !== "center" && arg !== "end") {
        throw new DiagramParseError("@align expects start|center|end", lineNo, indentCol(raw), raw);
      }
      hint.align = arg;
    } else {
      throw new DiagramParseError(`unknown directive @${m[1]}`, lineNo, indentCol(raw), raw);
    }
    rest = rest.slice(m[0].length).trim();
  }
  return hint;
}

/** Find the first connection operator in a line (left-to-right, longest-first). */
function findArchOp(line: string): { op: string; index: number } | null {
  for (let i = 0; i < line.length; i++) {
    for (const [op] of ARCH_OPS) {
      if (line.startsWith(op, i)) return { op, index: i };
    }
  }
  return null;
}
