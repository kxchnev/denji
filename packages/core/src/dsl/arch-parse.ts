import type {
  ArchDiagram,
  ContainerKind,
  PlaceHint,
  ShapeKind,
  Spacing,
  StyleProps,
  StyleSlot,
  ThemeName,
} from "../model/arch.js";
import { architecture, type ArchitectureBuilder, type Dir } from "../model/arch-builder.js";
import { isStyleSlot, lookupProp, setStyleProp, StyleValueError } from "../model/style.js";
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
  spacing?: Spacing;
  padding?: number;
  styleRefs?: string[];
  styleProps?: StyleProps;
}

/** An open `style <name> { … }` block. */
interface StyleFrame {
  name: string;
  props: StyleProps;
  /** The slot a type-selector block targets; undefined for a named style. */
  slot?: StyleSlot;
  lineNo: number;
}

/**
 * Where a directive was written. Placement hints belong to a node; spacing
 * settings belong to the scope a node opens, so the two lists only overlap on
 * containers — which are both at once.
 */
type DirectiveCtx = "shape" | "container" | "diagram" | "connection";

interface Directives {
  hint?: PlaceHint;
  spacing?: Spacing;
  padding?: number;
  margin?: number;
  theme?: ThemeName;
  styleRefs?: string[];
  styleProps?: StyleProps;
}

/**
 * `style hot {` opens a block; `style hot { fill: #fff; stroke: red }` is the
 * whole thing on one line. Neither matches `style -> db`, which is a connection
 * between two nodes that happen to be called `style` and `db`.
 */
const STYLE_OPEN = /^style\s+([A-Za-z][A-Za-z0-9_-]*)\s*\{(.*)$/;
/** One `name: value` declaration; a trailing `;` is tolerated. */
const STYLE_PROP = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.+?)\s*;?$/;

/** Parse `.pwr` architecture DSL source into an ArchDiagram (via the builder). */
export function parseArchitecture(src: string): ArchDiagram {
  const lines = src.split(/\r?\n/);
  const b = architecture();
  const frames: Frame[] = [];
  let style: StyleFrame | null = null;

  const addChildToScope = (id: string) => {
    const top = frames[frames.length - 1];
    if (top) top.children.push(id);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("%%")) continue;

    // A style block owns its lines outright. Without this the generic dispatch
    // below would hand `dash: 6 4` to the connection scanner, which looks for
    // `--` anywhere in a line.
    if (style) {
      if (line === "}") {
        try {
          b.defineStyle(style.name, style.props);
        } catch (e) {
          throw new DiagramParseError((e as Error).message, style.lineNo, 1, lines[style.lineNo - 1] ?? "");
        }
        style = null;
        continue;
      }
      readStyleProps(style, line, lineNo, raw);
      continue;
    }

    const opening = line.match(STYLE_OPEN);
    if (opening) {
      if (frames.length > 0) {
        throw new DiagramParseError(
          "style blocks are top-level only",
          lineNo,
          indentCol(raw),
          raw,
        );
      }
      const name = opening[1]!;
      const frame: StyleFrame = {
        name,
        props: {},
        slot: isStyleSlot(name) ? name : undefined,
        lineNo,
      };
      const inline = (opening[2] ?? "").trim();
      if (inline.endsWith("}")) {
        readStyleProps(frame, inline.slice(0, -1), lineNo, raw);
        try {
          b.defineStyle(frame.name, frame.props);
        } catch (e) {
          throw new DiagramParseError((e as Error).message, lineNo, indentCol(raw), raw);
        }
      } else if (inline !== "") {
        throw new DiagramParseError(
          "a style block opens with `{` at the end of the line, or closes with `}` on it",
          lineNo,
          indentCol(raw),
          raw,
        );
      } else {
        style = frame;
      }
      continue;
    }

    // The header may carry diagram-level settings: `architecture @spacing(60)`.
    const header = line.match(/^architecture\b\s*(.*)$/);
    if (header) {
      const d = parseDirectives(header[1] ?? "", lineNo, raw, "diagram");
      if (d.spacing) b.spacing(d.spacing);
      if (d.margin !== undefined) b.margin(d.margin);
      if (d.theme) b.theme(d.theme);
      continue;
    }

    if (line === "}") {
      const frame = frames.pop();
      if (!frame) throw new DiagramParseError("unexpected '}'", lineNo, indentCol(raw), raw);
      b.container(frame.id, frame.label, {
        kind: frame.kind,
        children: frame.children,
        hint: frame.hint,
        spacing: frame.spacing,
        padding: frame.padding,
        styleRefs: frame.styleRefs,
        styleProps: frame.styleProps,
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

  if (style) {
    throw new DiagramParseError(`unclosed style "${style.name}"`, lines.length, 1, "");
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

/** Read one or more `name: value` declarations, `;`-separated, into a block. */
function readStyleProps(frame: StyleFrame, text: string, lineNo: number, raw: string): void {
  for (const decl of text.split(";")) {
    const d = decl.trim();
    if (d === "") continue;
    const p = d.match(STYLE_PROP);
    if (!p) {
      throw new DiagramParseError(
        "expected `property: value` inside a style block",
        lineNo,
        indentCol(raw),
        raw,
      );
    }
    try {
      setStyleProp(frame.props, p[1]!, p[2]!, frame.slot);
    } catch (e) {
      if (e instanceof StyleValueError) {
        throw new DiagramParseError(e.message, lineNo, indentCol(raw), raw);
      }
      throw e;
    }
  }
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
  const { hint, styleRefs, styleProps } = parseDirectives(m[4] ?? "", lineNo, raw, "shape", kind);

  const opts = { hint, styleRefs, styleProps };
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
  const kind = m[1] as ContainerKind;
  const d = parseDirectives(m[4] ?? "", lineNo, raw, "container", kind);
  return {
    id: m[2]!,
    label: m[3] ?? m[2]!,
    kind,
    children: [],
    hint: d.hint,
    spacing: d.spacing,
    padding: d.padding,
    styleRefs: d.styleRefs,
    styleProps: d.styleProps,
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
  // A label runs to the end of the line, so directives have to sit before the
  // colon: `a -> b @style(hot) : http`.
  const toRest = leftPart.slice(found.index + found.op.length).trim();
  const split = toRest.match(/^([A-Za-z0-9_]*)\s*(.*)$/)!;
  const toId = split[1]!;
  if (!/^[A-Za-z0-9_]+$/.test(fromId) || !/^[A-Za-z0-9_]+$/.test(toId)) {
    throw new DiagramParseError("connection needs a node id on each side", lineNo, indentCol(raw), raw);
  }
  const d = parseDirectives(split[2] ?? "", lineNo, raw, "connection", "edge");
  const spec = ARCH_OPS.find(([op]) => op === found.op)![1];
  b.connect(fromId, toId, {
    label,
    dir: spec.dir,
    style: spec.style,
    styleRefs: d.styleRefs,
    styleProps: d.styleProps,
  });
}

const RELATIONAL: Record<string, keyof PlaceHint> = {
  rightof: "rightOf",
  leftof: "leftOf",
  above: "above",
  below: "below",
};

/** Which directives each position accepts, for the "not allowed here" message. */
const ALLOWED: Record<DirectiveCtx, ReadonlySet<string>> = {
  shape: new Set(["rightof", "leftof", "above", "below", "gap", "align", "style"]),
  container: new Set([
    "rightof",
    "leftof",
    "above",
    "below",
    "gap",
    "align",
    "spacing",
    "spacingx",
    "spacingy",
    "padding",
    "style",
  ]),
  diagram: new Set(["spacing", "spacingx", "spacingy", "margin", "theme"]),
  connection: new Set(["style"]),
};

/** Positions where an inline style property such as `@fill(#fff)` is accepted. */
const STYLABLE: ReadonlySet<DirectiveCtx> = new Set(["shape", "container", "connection"]);

const KNOWN = new Set([...ALLOWED.container, ...ALLOWED.diagram, ...ALLOWED.connection]);

const WHERE: Record<DirectiveCtx, string> = {
  shape: "on a shape",
  container: "on a container",
  diagram: "on the architecture line",
  connection: "on a connection",
};

/** `@name(arg)`, tolerating one level of nesting so `@fill(rgb(1,2,3))` works. */
const DIRECTIVE = /^@([A-Za-z][A-Za-z-]*)\(((?:[^()]|\([^()]*\))*)\)/;

function parseDirectives(
  text: string,
  lineNo: number,
  raw: string,
  ctx: DirectiveCtx,
  slot?: StyleSlot,
): Directives {
  let rest = text.trim();
  const out: Directives = {};
  if (rest === "") return out;

  /** Non-negative and finite — a negative distance would pull nodes together. */
  const size = (name: string, arg: string): number => {
    const n = Number(arg);
    if (!Number.isFinite(n) || n < 0) {
      throw new DiagramParseError(
        `@${name} expects a number >= 0`,
        lineNo,
        indentCol(raw),
        raw,
      );
    }
    return n;
  };
  const hint = (): PlaceHint => (out.hint ??= {});
  const spacing = (): Spacing => (out.spacing ??= {});

  while (rest !== "") {
    const m = rest.match(DIRECTIVE);
    if (!m) throw new DiagramParseError(`unexpected token "${rest}"`, lineNo, indentCol(raw), raw);
    const name = m[1]!.toLowerCase();
    const arg = m[2]!.trim();

    // A style property is a directive too: `@fill(#0f172a)`, `@stroke-width(2)`.
    const prop = lookupProp(name);
    if (prop) {
      if (!STYLABLE.has(ctx)) {
        throw new DiagramParseError(
          `@${m[1]} is not allowed ${WHERE[ctx]}`,
          lineNo,
          indentCol(raw),
          raw,
        );
      }
      try {
        setStyleProp((out.styleProps ??= {}), name, arg, slot);
      } catch (e) {
        if (e instanceof StyleValueError) {
          throw new DiagramParseError(e.message, lineNo, indentCol(raw), raw);
        }
        throw e;
      }
      rest = rest.slice(m[0].length).trim();
      continue;
    }

    if (!KNOWN.has(name)) {
      throw new DiagramParseError(`unknown directive @${m[1]}`, lineNo, indentCol(raw), raw);
    }
    if (!ALLOWED[ctx].has(name)) {
      throw new DiagramParseError(
        `@${m[1]} is not allowed ${WHERE[ctx]}`,
        lineNo,
        indentCol(raw),
        raw,
      );
    }

    if (RELATIONAL[name]) {
      if (!/^[A-Za-z0-9_]+$/.test(arg)) {
        throw new DiagramParseError(`@${m[1]} expects a node id`, lineNo, indentCol(raw), raw);
      }
      (hint()[RELATIONAL[name]] as string) = arg;
    } else if (name === "gap") {
      hint().gap = size(m[1]!, arg);
    } else if (name === "align") {
      if (arg !== "start" && arg !== "center" && arg !== "end") {
        throw new DiagramParseError("@align expects start|center|end", lineNo, indentCol(raw), raw);
      }
      hint().align = arg;
    } else if (name === "spacing") {
      const n = size(m[1]!, arg);
      spacing().x = n;
      spacing().y = n;
    } else if (name === "spacingx") {
      spacing().x = size(m[1]!, arg);
    } else if (name === "spacingy") {
      spacing().y = size(m[1]!, arg);
    } else if (name === "padding") {
      out.padding = size(m[1]!, arg);
    } else if (name === "margin") {
      out.margin = size(m[1]!, arg);
    } else if (name === "theme") {
      if (arg !== "light" && arg !== "dark") {
        throw new DiagramParseError("@theme expects light|dark", lineNo, indentCol(raw), raw);
      }
      out.theme = arg;
    } else if (name === "style") {
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(arg)) {
        throw new DiagramParseError("@style expects a style name", lineNo, indentCol(raw), raw);
      }
      (out.styleRefs ??= []).push(arg);
    } else {
      // Every name in KNOWN must have a branch above; reaching here means a new
      // directive was registered without one.
      throw new DiagramParseError(`unhandled directive @${m[1]}`, lineNo, indentCol(raw), raw);
    }
    rest = rest.slice(m[0].length).trim();
  }
  return out;
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
