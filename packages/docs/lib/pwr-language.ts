import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";
import { LINK_SCHEMES, STYLE_PROPS, normalizePropName, type StylePropSpec } from "power";
import { pwrCompletions } from "./pwr-complete";

/** Mirrors SHAPE_KINDS / CONTAINER_KINDS in packages/core/src/dsl/arch-parse.ts — case-sensitive. */
const KINDS = new Set(["app", "database", "queue", "rect", "service", "group"]);
/** Longest-first, exactly like ARCH_OPS in the core scanner. */
const OPS = ["<->", "-.->", "-.-", "->", "<-", "--"];
/** Directive names are lower-cased by the core, so matching is case-insensitive. */
const RELATIONAL = new Set(["rightof", "leftof", "above", "below"]);
/** Directives whose argument is a distance in px. */
const NUMERIC = new Set(["gap", "spacing", "spacingx", "spacingy", "padding", "margin"]);

const FIRST_TOKEN = /^\S+/;
const ID = /^[A-Za-z0-9_]+/;
/** Trailing `"?` so a half-typed label still reads as a string in the editor. */
const QUOTED = /^"[^"]*"?/;
/** Style properties are spellable with dashes: `@stroke-width(2)`. */
const DIRECTIVE = /^@[A-Za-z][A-Za-z-]*/;
/** A whole argument, spaces and all — `@dash(6 4)` is one value. */
const ARG = /^[^)]+/;
/** Mirrors BLOCK_OPEN in packages/core/src/dsl/arch-parse.ts. */
const BLOCK_OPEN = /^(?:style|icon)\s+[A-Za-z][A-Za-z0-9_-]*\s*\{/;
const PROP_NAME = /^[A-Za-z][A-Za-z-]*/;
const PROP_VALUE = /^[^;}]+/;

type Mode =
  | "start"
  | "id"
  | "decl"
  | "arg"
  | "conn"
  | "label"
  | "rest"
  | "styleHead"
  | "prop"
  | "propValue";

interface PwrState {
  /** Position inside the current line — reset on every line. */
  mode: Mode;
  /** Lower-cased name of the `@directive` whose argument comes next. */
  directive: string;
  /** Open `{` count. Survives across lines; used only by `indent`. */
  depth: number;
  /** Inside a multi-line `style { … }` / `icon { … }`. Survives lines. */
  inStyle: boolean;
  /** Which kind of block that is, so property names are checked against it. */
  block: "style" | "icon";
  /** Property whose value comes next, inside a block. */
  prop: string;
}

/** Mirrors ICON_PROPS in packages/core/src/dsl/arch-parse.ts. */
const ICON_PROPS = new Set(["path", "color", "darkcolor", "viewbox", "title"]);

/** Paint a style value by what the core will accept there. */
function valueRole(spec: StylePropSpec | undefined, raw: string): string | null {
  if (!spec) return null; // unknown property — the core will error, don't guess
  const v = raw.trim();
  switch (spec.kind) {
    case "color":
      return "string";
    case "size":
    case "unit": {
      const n = Number(v);
      const ok = Number.isFinite(n) && n >= 0 && (spec.kind === "size" || n <= 1);
      return ok ? "number" : "invalid";
    }
    case "dash":
      return /^[0-9.\s,]+$/.test(v) ? "number" : "invalid";
    case "weight":
      return "atom";
  }
}

/** The core dispatches connections by scanning the whole line for an operator,
 *  so `a->b` is a connection even though its first token is `a->b`. */
function hasOp(rest: string): boolean {
  for (let i = 0; i < rest.length; i++) {
    for (const op of OPS) if (rest.startsWith(op, i)) return true;
  }
  return false;
}

function startOfLine(stream: StringStream, state: PwrState): string | null {
  // Comments are whole-line only — there is no trailing-comment syntax.
  if (stream.match("%%") || stream.match("#")) {
    stream.skipToEnd();
    return "comment";
  }
  // A style block owns every line up to its own `}` — including one that would
  // otherwise read as a container close or as a connection (`dash: 6 4`).
  if (state.inStyle) {
    state.mode = "prop";
    return property(stream, state);
  }
  if (stream.match("}")) {
    state.depth = Math.max(0, state.depth - 1);
    state.mode = "rest";
    return "punctuation";
  }
  const first = (stream.match(FIRST_TOKEN, false) as RegExpMatchArray | null)?.[0] ?? "";
  // `style x {` / `icon x {` open a block; `style -> db` is a connection
  // between two nodes that happen to be named `style` and `db`.
  if ((first === "style" || first === "icon") && BLOCK_OPEN.test(stream.string.slice(stream.pos))) {
    stream.match(first);
    state.block = first;
    state.mode = "styleHead";
    return "keyword";
  }
  if (first === "architecture") {
    stream.match(first);
    // The header can carry diagram-level directives, so keep reading the line.
    state.mode = "decl";
    return "keyword";
  }
  if (KINDS.has(first)) {
    stream.match(first);
    state.mode = "id";
    return "typeName";
  }
  // `text "…" @corner(…)` — a free line inside a group. It has no id, so the
  // quoted string comes straight after the keyword. Checked before the operator
  // scan, exactly as the core dispatches it.
  if (first === "text") {
    stream.match(first);
    state.mode = "decl";
    return "keyword";
  }
  if (hasOp(stream.string.slice(stream.pos))) {
    state.mode = "conn";
    return connection(stream, state);
  }
  // Unrecognized line. The parse-error panel already says so; painting it red
  // would make the editor flash on every half-typed keyword.
  state.mode = "rest";
  stream.skipToEnd();
  return null;
}

function connection(stream: StringStream, state: PwrState): string | null {
  for (const op of OPS) if (stream.match(op)) return "operator";
  if (stream.match(":")) {
    state.mode = "label";
    return "punctuation";
  }
  if (stream.match(ID)) return "variableName";
  stream.next();
  return null;
}

/** `style <name> {` — the name, then the brace that decides one line or many. */
function styleHead(stream: StringStream, state: PwrState): string | null {
  if (stream.match("{")) {
    stream.eatSpace();
    // Nothing after the brace means the block continues on the next line.
    state.inStyle = stream.eol();
    // Counted in `depth` so the properties inside indent like a container body.
    if (state.inStyle) state.depth++;
    state.mode = state.inStyle ? "rest" : "prop";
    return "punctuation";
  }
  const name = stream.match(/^[A-Za-z][A-Za-z0-9_-]*/) as RegExpMatchArray | null;
  // In a style block a name that is a kind is a selector over all of them, so
  // paint it as a type. An icon name is always just a name.
  if (name) {
    const selector = state.block === "style" && (KINDS.has(name[0]) || name[0] === "edge");
    return selector ? "typeName" : "variableName";
  }
  stream.next();
  return null;
}

/** A `name: value` declaration inside a style block. */
function property(stream: StringStream, state: PwrState): string | null {
  if (stream.match("}")) {
    if (state.inStyle) state.depth = Math.max(0, state.depth - 1);
    state.inStyle = false;
    state.mode = "rest";
    return "punctuation";
  }
  if (stream.match(";")) return "punctuation";
  if (stream.match(":")) {
    state.mode = "propValue";
    return "punctuation";
  }
  const name = stream.match(PROP_NAME) as RegExpMatchArray | null;
  if (name) {
    state.prop = name[0];
    const known =
      state.block === "icon"
        ? ICON_PROPS.has(normalizePropName(name[0]))
        : Boolean(STYLE_PROPS[normalizePropName(name[0])]);
    return known ? "propertyName" : "invalid";
  }
  stream.next();
  return null;
}

function propertyValue(stream: StringStream, state: PwrState): string | null {
  state.mode = "prop";
  const v = stream.match(PROP_VALUE) as RegExpMatchArray | null;
  if (!v) return null;
  if (state.block === "icon") {
    const prop = normalizePropName(state.prop);
    if (prop === "color" || prop === "darkcolor") return "string";
    // Path data and a viewBox are just numbers and letters; painting them as a
    // string would drown the line in colour.
    return prop === "path" || prop === "viewbox" ? "number" : null;
  }
  return valueRole(STYLE_PROPS[normalizePropName(state.prop)], v[0]);
}

function declaration(stream: StringStream, state: PwrState): string | null {
  if (stream.match(QUOTED)) return "string";
  const d = stream.match(DIRECTIVE) as RegExpMatchArray | null;
  if (d) {
    state.directive = d[0].slice(1).toLowerCase();
    return "meta";
  }
  if (stream.match("(")) {
    state.mode = "arg";
    return "punctuation";
  }
  if (stream.match(")")) return "punctuation";
  if (stream.match("{")) {
    state.depth++;
    return "punctuation";
  }
  if (stream.match(ID)) return "variableName";
  stream.next();
  return null;
}

/** The argument of `@name(...)`, tokenized by what the directive expects. */
function argument(stream: StringStream, state: PwrState): string | null {
  state.mode = "decl";
  const arg = stream.match(ARG) as RegExpMatchArray | null;
  if (!arg) return null; // `@gap()` — let `decl` consume the `)` on the next call
  if (NUMERIC.has(state.directive)) {
    const n = Number(arg[0]);
    // The core rejects negatives too, so flag them rather than paint them valid.
    return Number.isFinite(n) && n >= 0 ? "number" : "invalid";
  }
  // `@at(120, -40)` / `@nudge(-40, 0)`: a pair, and unlike the distances above
  // a negative is fine.
  if (state.directive === "at" || state.directive === "nudge") {
    const parts = arg[0].split(",").map((p) => p.trim());
    const ok = parts.length === 2 && parts.every((p) => p !== "" && Number.isFinite(Number(p)));
    return ok ? "number" : "invalid";
  }
  if (state.directive === "align" || state.directive === "theme") return "atom";
  if (state.directive === "corner") return "atom";
  if (state.directive === "icon") return "atom";
  if (state.directive === "link") {
    const v = arg[0].trim().toLowerCase();
    const colon = v.indexOf(":");
    // Still typing the scheme: flashing red on `h`, `ht`, `htt` is noise.
    if (colon < 0) return "string";
    return LINK_SCHEMES.includes(v.slice(0, colon + 1)) ? "url" : "invalid";
  }
  if (state.directive === "style") return "variableName";
  if (RELATIONAL.has(state.directive)) return "variableName";
  // An inline style property: `@fill(#0f172a)`, `@stroke-width(2)`.
  const spec = STYLE_PROPS[normalizePropName(state.directive)];
  if (spec) return valueRole(spec, arg[0]);
  return null; // unknown directive — the core will error, don't guess a colour
}

export const pwrStreamParser: StreamParser<PwrState> = {
  name: "pwr",
  languageData: {
    commentTokens: { line: "#" }, // powers Mod-/ (toggleComment) in the editor
    indentOnInput: /^\s*\}$/,
    autocomplete: pwrCompletions,
    // Never auto-close `(` (the directive snippets already insert it) or `{`
    // (the parser requires `{` to end the line, so `{}` is always wrong).
    closeBrackets: { brackets: ['"'] },
  },
  startState: () => ({
    mode: "start",
    directive: "",
    depth: 0,
    inStyle: false,
    block: "style" as const,
    prop: "",
  }),
  copyState: (s) => ({ ...s }),

  token(stream, state) {
    // Every line gets a fresh StringStream, so pos 0 means "new line" — and this
    // DSL is entirely positional, so a new line resets where we think we are.
    if (stream.sol()) {
      state.mode = "start";
      state.directive = "";
    }
    if (stream.eatSpace()) return null;

    switch (state.mode) {
      case "start":
        return startOfLine(stream, state);
      case "id":
        state.mode = "decl";
        return stream.match(ID) ? "variableName" : null;
      case "decl":
        return declaration(stream, state);
      case "styleHead":
        return styleHead(stream, state);
      case "prop":
        return property(stream, state);
      case "propValue":
        return propertyValue(stream, state);
      case "arg":
        return argument(stream, state);
      case "conn":
        return connection(stream, state);
      case "label":
        // Connection labels are raw text to end of line: `a -> b : some text`.
        stream.skipToEnd();
        return "string";
      default:
        stream.skipToEnd();
        return null;
    }
  },

  indent(state, textAfter, cx) {
    return Math.max(0, state.depth - (/^\s*\}/.test(textAfter) ? 1 : 0)) * cx.unit;
  },
};

export const pwrLanguage = StreamLanguage.define(pwrStreamParser);
