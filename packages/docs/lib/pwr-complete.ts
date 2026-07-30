import {
  autocompletion,
  acceptCompletion,
  closeBrackets,
  closeBracketsKeymap,
  snippetCompletion,
  type Completion,
  type CompletionResult,
  type CompletionSection,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { scanPwr, uniqueIds, type PwrKind, type PwrScan, type PwrSymbol } from "./pwr-symbols";

/* ------------------------------------------------------------------ sections */

const DECLARE: CompletionSection = { name: "declare", rank: 1 };
const CONNECT: CompletionSection = { name: "connect from", rank: 2 };
const STRUCTURE: CompletionSection = { name: "structure", rank: 3 };
const IN_SCOPE: CompletionSection = { name: "siblings", rank: 1 };
const OUT_OF_SCOPE: CompletionSection = { name: "other scopes — hint is ignored", rank: 2 };

/* ------------------------------------------------------------ static options */

const KIND_INFO: Record<PwrKind, string> = {
  app: "Application box. `app id \"Label\"`",
  database: "Datastore, drawn as a cylinder.",
  queue: "Message queue or topic.",
  rect: "Plain rectangle — the neutral shape.",
  service: "Container drawn as a service boundary. `{` must end the line.",
  group: "Container drawn as a plain group. `{` must end the line.",
};

function kindCompletion(kind: PwrKind, boost: number): Completion {
  const container = kind === "service" || kind === "group";
  return snippetCompletion(
    container ? `${kind} \${id} "\${Label}" {\n\t\${}\n}` : `${kind} \${id} "\${Label}"`,
    {
      label: kind,
      type: "keyword",
      detail: container ? "container" : "shape",
      info: KIND_INFO[kind],
      section: DECLARE,
      boost,
    },
  );
}

// Ordered by how often each appears in the docs' own examples.
const KIND_COMPLETIONS: Completion[] = [
  kindCompletion("app", 70),
  kindCompletion("service", 68),
  kindCompletion("database", 66),
  kindCompletion("queue", 64),
  kindCompletion("group", 62),
  kindCompletion("rect", 60),
];

const DIRECTIVES = [
  {
    name: "rightOf",
    detail: "(id)",
    info: "Place this node to the right of a sibling — a node in the same container.",
  },
  { name: "leftOf", detail: "(id)", info: "Place this node to the left of a sibling." },
  { name: "below", detail: "(id)", info: "Place this node under a sibling." },
  { name: "above", detail: "(id)", info: "Place this node over a sibling." },
  { name: "gap", detail: "(px)", info: "Spacing in px between this node and its anchor. Defaults to 40." },
  {
    name: "align",
    detail: "(start|center|end)",
    info: "Cross-axis alignment against the anchor. Defaults to center.",
  },
];

/**
 * `type: "namespace"` is not decorative — `activateOnCompletion` re-opens the
 * popup after any namespace option is picked, so choosing `@rightOf` lands the
 * cursor inside the parens with the sibling list already showing.
 */
const DIRECTIVE_COMPLETIONS: Completion[] = DIRECTIVES.map((d, i) =>
  snippetCompletion(`@${d.name}(\${})`, {
    label: `@${d.name}`,
    type: "namespace",
    detail: d.detail,
    info: d.info,
    boost: 50 - i,
  }),
);

/** Operators carry their trailing space so the endpoint popup can chain. */
const OPERATORS: Completion[] = (
  [
    { label: "->", detail: "arrow to", info: "Solid line, arrowhead on the right-hand node.", boost: 70 },
    { label: "<-", detail: "arrow from", info: "Solid line, arrowhead on the left-hand node.", boost: 60 },
    { label: "<->", detail: "both ways", info: "Solid line, arrowheads on both ends.", boost: 50 },
    { label: "--", detail: "plain line", info: "Solid line, no arrowheads.", boost: 40 },
    { label: "-.->", detail: "dashed arrow", info: "Dashed line, arrowhead on the right-hand node.", boost: 30 },
    { label: "-.-", detail: "dashed line", info: "Dashed line, no arrowheads.", boost: 20 },
  ] as const
).map((o) => ({ ...o, type: "operator", apply: `${o.label} ` }));

const ALIGN: Completion[] = ["start", "center", "end"].map((v, i) => ({
  label: v,
  type: "enum",
  detail: "align",
  boost: 30 - i,
}));

const GAP: Completion[] = ["20", "40", "80", "120"].map((v, i) => ({
  label: v,
  type: "constant",
  detail: v === "40" ? "px — default" : "px",
  boost: 30 - i,
}));

const LABEL_SNIPPET = snippetCompletion('"${Label}"', {
  label: '"label"',
  type: "text",
  detail: "display label",
  info: "Optional quoted label. Defaults to the id. Double quotes only, no escapes.",
  boost: 80,
});

const BRACE_SNIPPET = snippetCompletion("{\n\t${}\n}", {
  label: "{",
  type: "keyword",
  detail: "container body",
  info: "The `{` must end the line and `}` must sit alone on its own line.",
  boost: 90,
});

const EDGE_LABEL = snippetCompletion(": ${label}", {
  label: ":",
  type: "property",
  detail: "edge label",
  info: "Everything after the colon is the label — unquoted, to end of line.",
});

const HEADER: Completion = {
  label: "architecture",
  type: "keyword",
  detail: "header",
  info: "Optional first line. Any other content on that line is a parse error.",
  section: STRUCTURE,
  boost: 99,
};

/* --------------------------------------------------------------- id options */

function idCompletion(s: PwrSymbol, boost: number, suffix = ""): Completion {
  return {
    label: s.id,
    // `class` (○) for containers, `variable` (𝑥) for shapes — distinguishable icons.
    type: s.kind === "service" || s.kind === "group" ? "class" : "variable",
    detail: (s.label ? `${s.kind} "${s.label}"` : s.kind) + suffix,
    boost,
  };
}

/** Connections are validated globally by the builder: any node may be an endpoint. */
function endpointOptions(scan: PwrScan, exclude: string): Completion[] {
  return uniqueIds(scan.symbols)
    .filter((s) => s.id !== exclude)
    .map((s) => idCompletion(s, 50));
}

/**
 * Relative hints only resolve between siblings of one scope, and a self-anchor
 * is dropped — both silently, with no error from the parser, the builder or the
 * layout. Siblings therefore come first; the rest stay visible but flagged and
 * heavily de-boosted, because a half-written document can throw the brace scan
 * off and silently hiding the id the user wants would be worse.
 */
function anchorOptions(scan: PwrScan): Completion[] {
  return uniqueIds(scan.symbols)
    .filter((s) => s.id !== scan.selfId)
    .map((s) =>
      s.scope === scan.scope
        ? { ...idCompletion(s, 50), section: IN_SCOPE }
        : { ...idCompletion(s, -50, " — not a sibling"), section: OUT_OF_SCOPE },
    );
}

function lineStartOptions(scan: PwrScan, lineNo: number): Completion[] {
  const out: Completion[] = [...KIND_COMPLETIONS];
  if (!scan.hasHeader && (scan.firstContentLine === 0 || lineNo <= scan.firstContentLine)) {
    out.push(HEADER);
  }
  if (scan.depth > 0) {
    out.push({
      label: "}",
      type: "keyword",
      detail: "close container",
      info: `Closes "${scan.scope}". Must be alone on its line.`,
      section: STRUCTURE,
      boost: 15,
    });
  }
  // A connection line begins with a node id, so ids belong here too.
  for (const s of uniqueIds(scan.symbols)) {
    out.push({ ...idCompletion(s, s.scope === scan.scope ? 35 : 25), section: CONNECT });
  }
  return out;
}

/* ------------------------------------------------------------------- context */

/**
 * Blank out the contents of finished `"…"` spans so a label's `:`/`@`/`#` is
 * never read as syntax, and report a cursor sitting inside an open one.
 */
function maskStrings(text: string): { masked: string; inString: boolean } {
  let masked = "";
  let inString = false;
  for (const ch of text) {
    if (ch === '"') {
      inString = !inString;
      masked += '"';
    } else {
      masked += inString ? " " : ch;
    }
  }
  return { masked, inString };
}

const IDENT = /^[A-Za-z0-9_]*$/;

/** Word-shaped ranges can be refiltered in place; anything else re-queries. */
function result(options: readonly Completion[], from: number): CompletionResult {
  return { from, options, validFor: IDENT };
}

const IN_ARGS = /@([A-Za-z]+)\(([^)]*)$/;
const AT_SIGN = /@([A-Za-z]*)$/;
const DECL_HEAD = /^\s*(app|database|queue|rect|service|group)\s+([A-Za-z0-9_]+)(.*)$/;
const CONNECTION = /^\s*([A-Za-z0-9_]+)\s*(<->|-\.->|-\.-|->|<-|--)\s*([A-Za-z0-9_]*)(\s*)$/;
const OP_POSITION = /^\s*([A-Za-z0-9_]+)\s*([<>.-]*)$/;
const RESERVED = new Set(["architecture", "app", "database", "queue", "rect", "service", "group"]);

export const pwrCompletions: CompletionSource = (ctx) => {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);

  // Comments are whole-line only, so one test on the whole line covers them.
  if (/^\s*(#|%%)/.test(line.text)) return null;

  const { masked, inString } = maskStrings(before);
  if (inString) return null; // inside a "label"
  if (masked.includes(":")) return null; // inside a connection label
  if (/\}\s*$/.test(masked)) return null; // `}` stands alone and is already complete

  const scan = scanPwr(ctx.state.doc, line.number);
  const word = /[A-Za-z0-9_]*$/.exec(before)![0];
  const wordFrom = ctx.pos - word.length;

  // 1. Inside a directive's parentheses.
  const args = IN_ARGS.exec(masked);
  if (args) {
    const name = args[1]!.toLowerCase(); // the parser lowercases too — @RightOf is legal
    const arg = args[2]!;
    if (name === "align") return result(ALIGN, wordFrom);
    if (name === "gap") {
      return arg.trim() === "" || ctx.explicit
        ? { from: ctx.pos - arg.length, options: GAP, validFor: /^\d*$/ }
        : null;
    }
    if (name === "rightof" || name === "leftof" || name === "above" || name === "below") {
      return result(anchorOptions(scan), wordFrom);
    }
    return null; // unknown directive: nothing useful to say
  }

  // 2. Just after an `@`.
  const at = AT_SIGN.exec(masked);
  if (at) return result(DIRECTIVE_COMPLETIONS, ctx.pos - at[0]!.length);

  // 3. First token of the line.
  if (/^\s*[A-Za-z0-9_]*$/.test(masked)) {
    return result(lineStartOptions(scan, line.number), wordFrom);
  }

  // 4. Tail of a declaration: `<kind> <id> …`
  const decl = DECL_HEAD.exec(masked);
  if (decl) {
    const kind = decl[1]!;
    const tail = decl[3]!;
    // Mid-token, e.g. still typing the id or a label: stay quiet unless asked.
    if (!/\s$/.test(tail) && !ctx.explicit) return null;
    const out: Completion[] = [];
    if (!tail.includes('"')) out.push(LABEL_SNIPPET);
    if ((kind === "service" || kind === "group") && !tail.includes("{")) out.push(BRACE_SNIPPET);
    out.push(...DIRECTIVE_COMPLETIONS);
    return result(out, wordFrom);
  }

  // 5. Connection line.
  const conn = CONNECTION.exec(masked);
  if (conn) {
    const src = conn[1]!;
    const target = conn[3]!;
    const trailing = conn[4]!;
    if (target !== "" && trailing !== "") return result([EDGE_LABEL], ctx.pos);
    const options = endpointOptions(scan, src);
    if (target === "" && trailing === "") {
      // Cursor glued to a hand-typed operator: bring the separating space along.
      return result(
        options.map((o) => ({ ...o, apply: ` ${o.label}` })),
        ctx.pos,
      );
    }
    return result(options, ctx.pos - target.length);
  }

  // 6. Operator position: after an id, or part-way through an operator.
  const op = OP_POSITION.exec(masked);
  if (op && !RESERVED.has(op[1]!)) {
    const partial = op[2]!;
    if (partial === "" && !/\s$/.test(before)) return null; // still typing the id
    return result(OPERATORS, ctx.pos - partial.length);
  }

  return null;
};

/* --------------------------------------------------------------------- theme */

/**
 * `EditorView.baseTheme` (the autocomplete package's own styling) is wrapped in
 * `Prec.lowest`, so a plain `EditorView.theme()` here reliably wins at equal
 * specificity — a global `globals.css` rule would lose to the base theme's
 * generated, more specific selectors.
 */
export const pwrCompletionTheme = EditorView.theme({
  ".cm-tooltip.cm-tooltip-autocomplete": {
    background: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "var(--radius)",
    boxShadow: "0 8px 24px -6px rgb(0 0 0 / 0.25), 0 2px 6px -2px rgb(0 0 0 / 0.12)",
    padding: "4px",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete ul": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "13px",
    lineHeight: "1.5",
    minWidth: "20em",
    maxHeight: "17em",
  },
  ".cm-tooltip.cm-tooltip-autocomplete ul > li": {
    display: "flex",
    alignItems: "baseline",
    gap: "0.25em",
    padding: "3px 8px",
    borderRadius: "calc(var(--radius) - 4px)",
  },
  // `[aria-selected]` is the real hook — there is no `.cm-selectedCompletion`.
  ".cm-tooltip.cm-tooltip-autocomplete ul > li[aria-selected]": {
    background: "hsl(var(--accent))",
    color: "hsl(var(--accent-foreground))",
  },
  ".cm-tooltip.cm-tooltip-autocomplete ul > completion-section": {
    display: "list-item",
    padding: "6px 8px 2px",
    borderBottom: "none",
    opacity: "1",
    fontFamily: "inherit",
    fontSize: "10px",
    fontWeight: "600",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-completionLabel": { flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis" },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    fontWeight: "700",
    color: "hsl(var(--primary))",
  },
  "li[aria-selected] .cm-completionMatchedText": { color: "inherit" },
  ".cm-completionDetail": {
    marginLeft: "auto",
    paddingLeft: "1.5em",
    fontStyle: "normal",
    fontSize: "0.85em",
    whiteSpace: "nowrap",
    color: "hsl(var(--muted-foreground))",
  },
  "li[aria-selected] .cm-completionDetail": { color: "hsl(var(--accent-foreground) / 0.75)" },
  ".cm-completionIcon": {
    width: "1.15em",
    paddingRight: "0.5em",
    opacity: "1",
    fontSize: "100%",
    color: "hsl(var(--muted-foreground))",
  },
  "li[aria-selected] .cm-completionIcon": { color: "inherit" },
  // The base "🔑" reads as an emoji next to shadcn type; and `operator` is ours.
  ".cm-completionIcon-keyword::after": { content: '"◆"' },
  ".cm-completionIcon-operator::after": { content: '"→"' },
  // The info panel is a separate tooltip element, so it needs its own rules.
  ".cm-tooltip.cm-completionInfo": {
    maxWidth: "22rem",
    margin: "0 6px",
    padding: "8px 10px",
    background: "hsl(var(--popover))",
    color: "hsl(var(--muted-foreground))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "var(--radius)",
    boxShadow: "0 8px 24px -6px rgb(0 0 0 / 0.25)",
    fontFamily: "inherit",
    fontSize: "12px",
    lineHeight: "1.5",
  },
  ".cm-tooltip.cm-tooltip-autocomplete .cm-completionListIncompleteTop:before, .cm-tooltip.cm-tooltip-autocomplete .cm-completionListIncompleteBottom:after":
    { color: "hsl(var(--muted-foreground))" },
});

/* ----------------------------------------------------------------- extension */

export const pwrAutocomplete: Extension = [
  autocompletion({
    // Picking a directive or an operator immediately re-opens the popup for the
    // argument or the endpoint. `namespace` and `operator` are only used by
    // completions that want that chaining.
    activateOnCompletion: (c) => c.type === "namespace" || c.type === "operator",
    icons: true,
  }),
  closeBrackets(), // scoped by languageData.closeBrackets to `"` alone
  keymap.of(closeBracketsKeymap),
  // Tab accepts a selected completion and otherwise returns false, so Tab still
  // moves focus out of the editor (and still walks snippet fields).
  keymap.of([{ key: "Tab", run: acceptCompletion }]),
  pwrCompletionTheme,
];
