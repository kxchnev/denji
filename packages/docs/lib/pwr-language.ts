import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";
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
const DIRECTIVE = /^@[A-Za-z]+/;
const ARG = /^[^)\s]+/;

type Mode = "start" | "id" | "decl" | "arg" | "conn" | "label" | "rest";

interface PwrState {
  /** Position inside the current line — reset on every line. */
  mode: Mode;
  /** Lower-cased name of the `@directive` whose argument comes next. */
  directive: string;
  /** Open `{` count. Survives across lines; used only by `indent`. */
  depth: number;
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
  if (stream.match("}")) {
    state.depth = Math.max(0, state.depth - 1);
    state.mode = "rest";
    return "punctuation";
  }
  const first = (stream.match(FIRST_TOKEN, false) as RegExpMatchArray | null)?.[0] ?? "";
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
  if (state.directive === "align") return "atom";
  if (RELATIONAL.has(state.directive)) return "variableName";
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
  startState: () => ({ mode: "start", directive: "", depth: 0 }),
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
