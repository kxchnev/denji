import type {
  ArchDiagram,
  ContainerKind,
  ContainerText,
  Corner,
  PlaceHint,
  ShapeKind,
  Spacing,
  StyleProps,
  StyleSlot,
  ThemeName,
} from "../model/arch.js";
import { architecture, type ArchitectureBuilder, type Dir } from "../model/arch-builder.js";
import { isStyleSlot, lookupProp, setStyleProp, StyleValueError } from "../model/style.js";
import { IconError, type Icon } from "../model/icon.js";
import { LinkError, validateLink } from "../model/link.js";
import { DiagramParseError, indentCol } from "./error.js";

/**
 * The keywords that open a declaration. Exported as ordered lists — not just as
 * the lookup sets below — because everything downstream that has to *spell* the
 * grammar rather than parse it wants a stable order: a generated syntax
 * highlighter, an autocomplete list, a message that enumerates the options.
 */
export const SHAPE_KIND_NAMES: readonly ShapeKind[] = ["app", "database", "queue", "rect"];
export const CONTAINER_KIND_NAMES: readonly ContainerKind[] = ["service", "group"];

const SHAPE_KINDS = new Set<ShapeKind>(SHAPE_KIND_NAMES);
const CONTAINER_KINDS = new Set<ContainerKind>(CONTAINER_KIND_NAMES);

// Connection operators, longest-first for the scanner.
const ARCH_OPS: Array<[string, { dir: Dir; style: "solid" | "dashed" }]> = [
  ["<->", { dir: "both", style: "solid" }],
  ["-.->", { dir: "to", style: "dashed" }],
  ["-.-", { dir: "none", style: "dashed" }],
  ["->", { dir: "to", style: "solid" }],
  ["<-", { dir: "from", style: "solid" }],
  ["--", { dir: "none", style: "solid" }],
];

/**
 * Just the operator spellings, still longest-first — a regex alternation needs
 * that ordering for exactly the reason the scanner does, or `->` swallows the
 * arrow out of `-.->`.
 */
export const ARCH_OPERATORS: readonly string[] = ARCH_OPS.map(([op]) => op);

interface Frame {
  id: string;
  label: string;
  kind: ContainerKind;
  children: string[];
  texts: ContainerText[];
  hint?: PlaceHint;
  spacing?: Spacing;
  padding?: number;
  styleRefs?: string[];
  styleProps?: StyleProps;
  icon?: string;
  link?: string;
}

/** An open `style <name> { … }` or `icon <name> { … }` block. */
interface BlockFrame {
  kind: "style" | "icon";
  name: string;
  props: StyleProps;
  icon: Partial<Icon>;
  /** The slot a type-selector block targets; undefined for a named style. */
  slot?: StyleSlot;
  lineNo: number;
}

/**
 * Where a directive was written. Placement hints belong to a node; spacing
 * settings belong to the scope a node opens, so the two lists only overlap on
 * containers — which are both at once.
 */
type DirectiveCtx = "shape" | "container" | "diagram" | "connection" | "text";

interface Directives {
  hint?: PlaceHint;
  spacing?: Spacing;
  padding?: number;
  margin?: number;
  theme?: ThemeName;
  styleRefs?: string[];
  styleProps?: StyleProps;
  icon?: string;
  link?: string;
  corner?: Corner;
}

/**
 * `style hot {` opens a block; `style hot { fill: #fff; stroke: red }` is the
 * whole thing on one line. `icon acme { … }` declares a mark the same way.
 * Neither matches `style -> db`, which is a connection between two nodes that
 * happen to be called `style` and `db`.
 */
const BLOCK_OPEN = /^(style|icon)\s+([A-Za-z][A-Za-z0-9_-]*)\s*\{(.*)$/;
/** One `name: value` declaration; a trailing `;` is tolerated. */
const STYLE_PROP = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.+?)\s*;?$/;

/** Parse `.pwr` architecture DSL source into an ArchDiagram (via the builder). */
export function parseArchitecture(src: string): ArchDiagram {
  const lines = src.split(/\r?\n/);
  const b = architecture();
  const frames: Frame[] = [];
  let block: BlockFrame | null = null;

  const addChildToScope = (id: string) => {
    const top = frames[frames.length - 1];
    if (top) top.children.push(id);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("%%")) continue;

    // A declaration block owns its lines outright. Without this the generic
    // dispatch below would hand `dash: 6 4` — or a path full of `-` and `,` —
    // to the connection scanner, which looks for `--` anywhere in a line.
    if (block) {
      if (line === "}") {
        closeBlock(b, block, block.lineNo, lines[block.lineNo - 1] ?? "");
        block = null;
        continue;
      }
      readBlockProps(block, line, lineNo, raw);
      continue;
    }

    const opening = line.match(BLOCK_OPEN);
    if (opening) {
      const kind = opening[1] as "style" | "icon";
      if (frames.length > 0) {
        throw new DiagramParseError(`${kind} blocks are top-level only`, lineNo, indentCol(raw), raw);
      }
      const name = opening[2]!;
      const frame: BlockFrame = {
        kind,
        name,
        props: {},
        icon: {},
        slot: kind === "style" && isStyleSlot(name) ? name : undefined,
        lineNo,
      };
      const inline = (opening[3] ?? "").trim();
      if (inline.endsWith("}")) {
        readBlockProps(frame, inline.slice(0, -1), lineNo, raw);
        closeBlock(b, frame, lineNo, raw);
      } else if (inline !== "") {
        throw new DiagramParseError(
          `a ${kind} block opens with \`{\` at the end of the line, or closes with \`}\` on it`,
          lineNo,
          indentCol(raw),
          raw,
        );
      } else {
        block = frame;
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
        icon: frame.icon,
        link: frame.link,
        texts: frame.texts,
      });
      addChildToScope(frame.id);
      continue;
    }

    const first = line.match(/^(\S+)/)?.[1] ?? "";

    if (first === "text") {
      const frame = frames[frames.length - 1];
      if (!frame) {
        throw new DiagramParseError(
          "`text` is only allowed inside a container",
          lineNo,
          indentCol(raw),
          raw,
        );
      }
      // The builder guards this too, for the programmatic API; repeating it
      // here is what buys the author a line number instead of the closing `}`.
      if (frame.kind !== "group") {
        throw new DiagramParseError(
          "`text` is only allowed inside a `group`",
          lineNo,
          indentCol(raw),
          raw,
        );
      }
      frame.texts.push(parseTextLine(line, lineNo, raw));
    } else if (SHAPE_KINDS.has(first as ShapeKind)) {
      parseShapeLine(line, lineNo, raw, b, addChildToScope);
    } else if (CONTAINER_KINDS.has(first as ContainerKind)) {
      frames.push(parseContainerOpen(line, lineNo, raw));
    } else if (findArchOp(line)) {
      parseConnectionLine(line, lineNo, raw, b);
    } else {
      throw new DiagramParseError(`unrecognized line`, lineNo, indentCol(raw), raw);
    }
  }

  if (block) {
    throw new DiagramParseError(
      `unclosed ${block.kind} "${block.name}"`,
      lines.length,
      1,
      "",
    );
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

/** Icon blocks take their own small set of properties, not style properties. */
export const ICON_PROP_NAMES: readonly string[] = ["path", "color", "darkcolor", "viewbox", "title"];
const ICON_PROPS = new Set(ICON_PROP_NAMES);

/** Read one or more `name: value` declarations, `;`-separated, into a block. */
function readBlockProps(frame: BlockFrame, text: string, lineNo: number, raw: string): void {
  for (const decl of text.split(";")) {
    const d = decl.trim();
    if (d === "") continue;
    const p = d.match(STYLE_PROP);
    if (!p) {
      throw new DiagramParseError(
        `expected \`property: value\` inside a ${frame.kind} block`,
        lineNo,
        indentCol(raw),
        raw,
      );
    }
    const name = p[1]!;
    const value = p[2]!;
    try {
      if (frame.kind === "style") {
        setStyleProp(frame.props, name, value, frame.slot);
      } else {
        setIconProp(frame.icon, name, value);
      }
    } catch (e) {
      if (e instanceof StyleValueError || e instanceof IconError) {
        throw new DiagramParseError(e.message, lineNo, indentCol(raw), raw);
      }
      throw e;
    }
  }
}

function setIconProp(target: Partial<Icon>, rawName: string, value: string): void {
  const name = rawName.toLowerCase().replace(/[-_]/g, "");
  if (!ICON_PROPS.has(name)) {
    throw new IconError(
      `unknown icon property "${rawName}" (expected path, color, dark-color, view-box or title)`,
    );
  }
  if (name === "path") target.path = value;
  else if (name === "color") target.color = value;
  else if (name === "darkcolor") target.darkColor = value;
  else if (name === "viewbox") target.viewBox = value;
  else target.title = value;
}

/** Hand a finished block to the builder, reporting failures at its own line. */
function closeBlock(b: ArchitectureBuilder, frame: BlockFrame, lineNo: number, raw: string): void {
  try {
    if (frame.kind === "style") {
      b.defineStyle(frame.name, frame.props);
      return;
    }
    if (frame.icon.path === undefined) throw new IconError("an icon block needs a `path`");
    b.defineIcon(frame.name, {
      path: frame.icon.path,
      color: frame.icon.color ?? "currentColor",
      darkColor: frame.icon.darkColor,
      viewBox: frame.icon.viewBox,
      title: frame.icon.title,
    });
  } catch (e) {
    throw new DiagramParseError((e as Error).message, lineNo, indentCol(raw), raw);
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
  const { hint, styleRefs, styleProps, icon, link } = parseDirectives(
    m[4] ?? "",
    lineNo,
    raw,
    "shape",
    kind,
  );

  const opts = { hint, styleRefs, styleProps, icon, link };
  if (kind === "app") b.app(id, label, opts);
  else if (kind === "database") b.database(id, label, opts);
  else if (kind === "queue") b.queue(id, label, opts);
  else b.rect(id, label, opts);
  addChild(id);
}

/** `text "Only in prod" @corner(bottomRight)` — a free line inside a group. */
function parseTextLine(line: string, lineNo: number, raw: string): ContainerText {
  const m = line.match(/^text\s+"([^"]*)"\s*(.*)$/);
  if (!m) {
    throw new DiagramParseError(
      'malformed text (expected `text "some text"`)',
      lineNo,
      indentCol(raw),
      raw,
    );
  }
  const d = parseDirectives(m[2] ?? "", lineNo, raw, "text");
  return { text: m[1]!, corner: d.corner ?? "topLeft" };
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
    texts: [],
    hint: d.hint,
    spacing: d.spacing,
    padding: d.padding,
    styleRefs: d.styleRefs,
    styleProps: d.styleProps,
    icon: d.icon,
    link: d.link,
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

/** Corner spellings, normalized to lower case with `-`/`_` stripped. */
const CORNER_NAMES: Record<string, Corner | undefined> = {
  topleft: "topLeft",
  topright: "topRight",
  bottomleft: "bottomLeft",
  bottomright: "bottomRight",
};

/** Which directives each position accepts, for the "not allowed here" message. */
const ALLOWED: Record<DirectiveCtx, ReadonlySet<string>> = {
  shape: new Set([
    "at",
    "rightof",
    "leftof",
    "above",
    "below",
    "gap",
    "align",
    "nudge",
    "style",
    "icon",
    "link",
  ]),
  container: new Set([
    "at",
    "rightof",
    "leftof",
    "above",
    "below",
    "gap",
    "align",
    "nudge",
    "spacing",
    "spacingx",
    "spacingy",
    "padding",
    "style",
    "icon",
    "link",
  ]),
  diagram: new Set(["spacing", "spacingx", "spacingy", "margin", "theme"]),
  connection: new Set(["style"]),
  text: new Set(["corner"]),
};

/** Positions where an inline style property such as `@fill(#fff)` is accepted. */
const STYLABLE: ReadonlySet<DirectiveCtx> = new Set(["shape", "container", "connection"]);

// ⚠️ Must include every context. Leaving `shape` out worked only while its set
// was a subset of `container`'s; a shape-only directive would have fallen
// through to "unknown directive".
const KNOWN = new Set([
  ...ALLOWED.shape,
  ...ALLOWED.container,
  ...ALLOWED.diagram,
  ...ALLOWED.connection,
  ...ALLOWED.text,
]);

/**
 * Every directive name the parser recognizes anywhere, lower-cased as it
 * normalizes them, sorted so a generated file does not churn.
 *
 * This is *not* the whole `@…` vocabulary: an inline style property is also
 * written as a directive, and those names live in `STYLE_PROPS`. Anything
 * spelling the language out has to read both.
 */
export const DIRECTIVE_NAMES: readonly string[] = [...KNOWN].sort();

const WHERE: Record<DirectiveCtx, string> = {
  shape: "on a shape",
  container: "on a container",
  diagram: "on the architecture line",
  connection: "on a connection",
  text: "on a text",
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

    if (name === "at") {
      // Coordinates may be negative — a node can sit left of or above whatever
      // the scope treats as its origin — so `size()` is the wrong guard here.
      const parts = arg.split(",").map((p) => p.trim());
      const nums = parts.map(Number);
      // The empty check is not redundant: `Number("")` is 0, so `@at(1, )` would
      // otherwise parse as a coordinate the author never wrote.
      if (parts.length !== 2 || parts.some((p) => p === "") || nums.some((n) => !Number.isFinite(n))) {
        throw new DiagramParseError(
          "@at expects two numbers, e.g. @at(120, 40)",
          lineNo,
          indentCol(raw),
          raw,
        );
      }
      hint().at = { x: nums[0]!, y: nums[1]! };
    } else if (name === "nudge") {
      // A nudge is a signed offset — pushing left or up is half the point — so
      // it parses exactly as @at does, not through `size()`.
      const parts = arg.split(",").map((p) => p.trim());
      const nums = parts.map(Number);
      if (parts.length !== 2 || parts.some((p) => p === "") || nums.some((n) => !Number.isFinite(n))) {
        throw new DiagramParseError(
          "@nudge expects two numbers, e.g. @nudge(-40, 0)",
          lineNo,
          indentCol(raw),
          raw,
        );
      }
      hint().nudge = { x: nums[0]!, y: nums[1]! };
    } else if (RELATIONAL[name]) {
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
    } else if (name === "icon") {
      // A leading digit is legal: the set has `1password`, `7zip`, `42` and
      // fourteen more, and the name only ever reaches CSS as a *suffix* of
      // `pwr-icon-`, where a digit is fine.
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(arg)) {
        throw new DiagramParseError("@icon expects an icon name", lineNo, indentCol(raw), raw);
      }
      // Only the shape of the name is checked here. Whether it resolves is
      // settled by build(), which sees `icon` blocks declared further down —
      // exactly how @style already behaves.
      out.icon = arg;
    } else if (name === "link") {
      // Checked here rather than in build() so a bad scheme lands on the line
      // that wrote it, with a caret under the declaration.
      try {
        out.link = validateLink(arg);
      } catch (e) {
        if (!(e instanceof LinkError)) throw e;
        throw new DiagramParseError(e.message, lineNo, indentCol(raw), raw);
      }
    } else if (name === "corner") {
      // `topLeft`, `top-left` and `topleft` are the same corner; the model keeps
      // the camelCase spelling.
      const corner = CORNER_NAMES[arg.toLowerCase().replace(/[-_]/g, "")];
      if (!corner) {
        throw new DiagramParseError(
          "@corner expects topLeft|topRight|bottomLeft|bottomRight",
          lineNo,
          indentCol(raw),
          raw,
        );
      }
      out.corner = corner;
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
