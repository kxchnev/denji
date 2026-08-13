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
import {
  CORNERS,
  ICONS,
  ICON_NAMES,
  POPULAR_ICONS,
  STYLE_PROPS,
  lightTheme,
  normalizePropName,
  type StylePropSpec,
} from "power";
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

/**
 * Where each directive is legal, mirroring ALLOWED in
 * packages/core/src/dsl/arch-parse.ts. Placement hints belong to a node;
 * spacing settings belong to the scope a line opens — containers are both.
 */
type DirectiveCtx = "shape" | "container" | "diagram" | "connection" | "text";

/** `strokeWidth` → `stroke-width`: how a property reads inside a style block. */
function displayProp(spec: StylePropSpec): string {
  return spec.key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Property names a block accepts; a type selector only offers what applies. */
function stylePropOptions(slot: string | undefined): Completion[] {
  return Object.values(STYLE_PROPS)
    .filter((spec) => !slot || (spec.slots as readonly string[]).includes(slot))
    .map((spec, i) => ({
      label: displayProp(spec),
      type: "property",
      detail: spec.kind,
      info: spec.detail,
      apply: `${displayProp(spec)}: `,
      boost: 50 - i,
    }));
}

/**
 * Values worth suggesting for one property. Colours come from the light theme
 * so the palette on offer is the one the diagram already uses.
 */
function styleValueOptions(spec: StylePropSpec | undefined): Completion[] {
  if (!spec) return [];
  switch (spec.kind) {
    case "color": {
      const seen = new Map<string, string>();
      for (const [slot, props] of Object.entries(lightTheme.slots)) {
        for (const [key, v] of Object.entries(props)) {
          if (typeof v === "string" && v.startsWith("#") && !seen.has(v)) {
            seen.set(v, `${slot} ${key}`);
          }
        }
      }
      return [
        ...[...seen].map(([v, where], i) => ({
          label: v,
          type: "constant",
          detail: where,
          boost: 40 - i,
        })),
        { label: "none", type: "keyword", detail: "no paint", boost: -10 },
        { label: "transparent", type: "keyword", detail: "see-through", boost: -20 },
      ];
    }
    case "size":
      return ["0", "1", "1.5", "2", "3"].map((v, i) => ({ label: v, type: "constant", boost: 30 - i }));
    case "unit":
      return ["0.25", "0.5", "0.75", "1"].map((v, i) => ({ label: v, type: "constant", boost: 30 - i }));
    case "dash":
      return ["2 2", "6 4", "1 4"].map((v, i) => ({ label: v, type: "constant", boost: 30 - i }));
    case "weight":
      return ["normal", "500", "600", "bold"].map((v, i) => ({ label: v, type: "enum", boost: 30 - i }));
  }
}

/**
 * Three and a half thousand options, built on the first `@icon(` and not before.
 * Eagerly it is a few thousand objects and a few thousand property reads on
 * every page that loads the editor — including the ones that never open it.
 * CodeMirror filters the list itself, so handing it the whole set is fine.
 */
let popular: Completion[] | null = null;
const popularIconOptions = (): Completion[] =>
  (popular ??= POPULAR_ICONS.map((name, i) => ({
    label: name,
    type: "constant",
    detail: ICONS[name]?.color,
    info: ICONS[name]?.title,
    boost: 50 - i,
  })));

let iconOptions: Completion[] | null = null;
const allIconOptions = (): Completion[] =>
  (iconOptions ??= ICON_NAMES.map((name) => ({
    label: name,
    type: "constant",
    detail: ICONS[name]?.color,
    info: ICONS[name]?.title,
  })));

/** Icon block properties — a different, much shorter list than the style ones. */
const ICON_PROP_OPTIONS: Completion[] = [
  { label: "path", detail: "path data", info: "Contents of the SVG `d` attribute." },
  { label: "color", detail: "colour", info: "The brand colour." },
  { label: "dark-color", detail: "colour", info: "Used instead on a dark palette." },
  { label: "view-box", detail: "4 numbers", info: "Defaults to `0 0 24 24`." },
  { label: "title", detail: "text", info: "Human-readable name." },
].map((o, i) => ({ ...o, type: "property", apply: `${o.label}: `, boost: 50 - i }));

const THEME_NAMES: Completion[] = ["light", "dark"].map((v, i) => ({
  label: v,
  type: "enum",
  detail: "theme",
  boost: 30 - i,
}));

/**
 * Typing shortcuts, not the allow-list — that lives in the core and the parser
 * enforces it. Spelled out rather than derived from `LINK_SCHEMES`, because
 * `mailto:` takes no slashes and a derivation would have to lie about one of
 * the three.
 */
const LINK_SCHEME_OPTIONS: Completion[] = ["https://", "http://", "mailto:"].map((v, i) => ({
  label: v,
  type: "text",
  detail: "scheme",
  boost: 30 - i,
}));

const DIRECTIVES: Array<{ name: string; detail: string; info: string; in: DirectiveCtx[] }> = [
  {
    name: "rightOf",
    detail: "(id)",
    info: "Place this node to the right of a sibling — a node in the same container.",
    in: ["shape", "container"],
  },
  {
    name: "leftOf",
    detail: "(id)",
    info: "Place this node to the left of a sibling.",
    in: ["shape", "container"],
  },
  {
    name: "below",
    detail: "(id)",
    info: "Place this node under a sibling.",
    in: ["shape", "container"],
  },
  {
    name: "above",
    detail: "(id)",
    info: "Place this node over a sibling.",
    in: ["shape", "container"],
  },
  {
    name: "gap",
    detail: "(px)",
    info: "Distance to this node's own anchor, replacing the scope's spacing on that axis.",
    in: ["shape", "container"],
  },
  {
    name: "spacing",
    detail: "(px)",
    info: "Default gap between this scope's children, both axes. Inherited by nested scopes. Defaults to 40.",
    in: ["container", "diagram"],
  },
  {
    name: "spacingX",
    detail: "(px)",
    info: "Horizontal gap between this scope's children. Refines @spacing.",
    in: ["container", "diagram"],
  },
  {
    name: "spacingY",
    detail: "(px)",
    info: "Vertical gap between this scope's children. Refines @spacing.",
    in: ["container", "diagram"],
  },
  {
    name: "padding",
    detail: "(px)",
    info: "Space between this container's border and its children. Defaults to 24.",
    in: ["container"],
  },
  {
    name: "margin",
    detail: "(px)",
    info: "Whitespace around the whole drawing. Defaults to 24.",
    in: ["diagram"],
  },
  {
    name: "theme",
    detail: "(light|dark)",
    info: "Pin the diagram to one palette. Without it, the diagram follows the page.",
    in: ["diagram"],
  },
  {
    name: "icon",
    detail: "(name)",
    info: "Draw a brand mark before the label. Leave the label empty for the mark on its own.",
    in: ["shape", "container"],
  },
  {
    name: "link",
    detail: "(url)",
    info:
      "Put a link button in this element's top-right corner. `http`, `https` or " +
      "`mailto` only, and the URL is unquoted — it ends at the first `)`.",
    in: ["shape", "container"],
  },
  {
    name: "style",
    detail: "(name)",
    info: "Attach a style declared by a `style` block. Repeat it to stack several.",
    in: ["shape", "container", "connection"],
  },
  {
    name: "corner",
    detail: "(topLeft|topRight|bottomLeft|bottomRight)",
    info: "Which corner of the group this text is pinned to. Defaults to topLeft; repeat `text` to stack lines in one corner.",
    in: ["text"],
  },
  // One directive per style property, offered only where the core will accept
  // it — `@radius` is meaningless on a connection, `@header-fill` on a shape.
  ...Object.values(STYLE_PROPS).map((spec) => {
    const applies = (slots: string[]) => slots.some((s) => (spec.slots as readonly string[]).includes(s));
    const where: DirectiveCtx[] = [];
    if (applies(["app", "database", "queue", "rect"])) where.push("shape");
    if (applies(["service", "group"])) where.push("container");
    if (applies(["edge"])) where.push("connection");
    return {
      name: displayProp(spec),
      detail: `(${spec.kind})`,
      info: `${spec.detail}. Beats any named style on this element.`,
      in: where,
    };
  }),
];

/**
 * `type: "namespace"` is not decorative — `activateOnCompletion` re-opens the
 * popup after any namespace option is picked, so choosing `@rightOf` lands the
 * cursor inside the parens with the sibling list already showing.
 */
const DIRECTIVE_COMPLETIONS: Record<DirectiveCtx, Completion[]> = {
  shape: [],
  container: [],
  diagram: [],
  connection: [],
  text: [],
};
for (const [i, d] of DIRECTIVES.entries()) {
  const completion = snippetCompletion(`@${d.name}(\${})`, {
    label: `@${d.name}`,
    type: "namespace",
    detail: d.detail,
    info: d.info,
    boost: 50 - i,
  });
  for (const where of d.in) DIRECTIVE_COMPLETIONS[where].push(completion);
}

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

/** Straight from the core, so the four spellings cannot drift apart. */
const CORNER_OPTIONS: Completion[] = CORNERS.map((v, i) => ({
  label: v,
  type: "enum",
  detail: "corner",
  boost: 30 - i,
}));

/** Suggested distances, with the engine's own default called out. */
function pxValues(values: string[], fallback: string): Completion[] {
  return values.map((v, i) => ({
    label: v,
    type: "constant",
    detail: v === fallback ? "px — default" : "px",
    boost: 30 - i,
  }));
}

const PX: Record<string, Completion[]> = {
  gap: pxValues(["20", "40", "80", "120"], "40"),
  spacing: pxValues(["16", "24", "40", "80"], "40"),
  spacingx: pxValues(["16", "24", "40", "80"], "40"),
  spacingy: pxValues(["16", "24", "40", "80"], "40"),
  padding: pxValues(["8", "16", "24", "48"], "24"),
  margin: pxValues(["0", "24", "48", "80"], "24"),
};

const LABEL_SNIPPET = snippetCompletion('"${Label}"', {
  label: '"label"',
  type: "text",
  detail: "display label",
  info: "Optional quoted label. Defaults to the id. Double quotes only, no escapes.",
  boost: 80,
});

const TEXT_SNIPPET = snippetCompletion('"${some text}"', {
  label: '"text"',
  type: "text",
  detail: "the line to draw",
  info: "One quoted line. Double quotes only, no escapes.",
  boost: 80,
});

/** Offered only inside a `group` — a `service` has no place to put free text. */
const TEXT_KEYWORD = snippetCompletion('text "${some text}"', {
  label: "text",
  type: "keyword",
  detail: "corner text",
  info: "A free line pinned to a corner of this group. `@corner(…)` moves it, repeating it stacks lines in one corner; it reserves a band of its own so it never lands on the children.",
  section: DECLARE,
  boost: 58,
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

const STYLE_SNIPPET = snippetCompletion("style ${name} {\n\t${}\n}", {
  label: "style",
  type: "keyword",
  detail: "reusable style",
  info: "Declares a style. Name it after a kind (`app`, `edge`, …) to restyle all of them, or give it your own name and attach it with `@style(name)`.",
  section: DECLARE,
  boost: 58,
});

const ICON_SNIPPET = snippetCompletion("icon ${name} {\n\tpath: ${}\n\tcolor: #000000\n}", {
  label: "icon",
  type: "keyword",
  detail: "custom icon",
  info: "Declares a brand mark from SVG path data — for a brand Simple Icons does not carry.",
  section: DECLARE,
  boost: 56,
});

function lineStartOptions(scan: PwrScan, lineNo: number): Completion[] {
  const out: Completion[] = [...KIND_COMPLETIONS, STYLE_SNIPPET, ICON_SNIPPET];
  if (!scan.hasHeader && (scan.firstContentLine === 0 || lineNo <= scan.firstContentLine)) {
    out.push(HEADER);
  }
  if (scan.symbols.find((s) => s.id === scan.scope)?.kind === "group") out.push(TEXT_KEYWORD);
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

/**
 * Blank out `@name(…)` arguments, unclosed ones included, so a `:` inside a URL
 * is not read as the start of a connection label. Same idea as
 * {@link maskStrings}: what sits inside an argument is data at this position,
 * not syntax — and without this one `@link(https:` kills completion for the
 * rest of the line, including the directives after it.
 */
const maskArgs = (text: string): string =>
  text.replace(/@[A-Za-z][A-Za-z-]*\([^)]*\)?/g, "");

const IDENT = /^[A-Za-z0-9_]*$/;

/** Word-shaped ranges can be refiltered in place; anything else re-queries. */
function result(options: readonly Completion[], from: number): CompletionResult {
  return { from, options, validFor: IDENT };
}

const IN_ARGS = /@([A-Za-z][A-Za-z-]*)\(([^)]*)$/;
const AT_SIGN = /@([A-Za-z-]*)$/;
const DECL_HEAD = /^\s*(app|database|queue|rect|service|group)\s+([A-Za-z0-9_]+)(.*)$/;
const CONNECTION = /^\s*([A-Za-z0-9_]+)\s*(<->|-\.->|-\.-|->|<-|--)\s*([A-Za-z0-9_]*)(\s*)$/;
const OP_POSITION = /^\s*([A-Za-z0-9_]+)\s*([<>.-]*)$/;
const HEADER_LINE = /^\s*architecture\b/;
/** `text "…"` — a free line in a group; it has no id, so the label comes first. */
const TEXT_LINE = /^\s*text\s+("[^"]*")?(.*)$/;
const RESERVED = new Set([
  "architecture",
  "app",
  "database",
  "queue",
  "rect",
  "service",
  "group",
  "text",
]);
const STYLE_SLOTS = ["app", "database", "queue", "rect", "service", "group", "edge"];

/** Which set of directives the line being typed accepts. */
function directiveCtx(masked: string): DirectiveCtx | null {
  if (HEADER_LINE.test(masked)) return "diagram";
  if (TEXT_LINE.test(masked)) return "text";
  const kind = DECL_HEAD.exec(masked)?.[1];
  if (kind) return kind === "service" || kind === "group" ? "container" : "shape";
  // `a -> b @…` — directives sit before the colon, so the label never gets here.
  if (/^\s*[A-Za-z0-9_]+\s*(<->|-\.->|-\.-|->|<-|--)\s*[A-Za-z0-9_]+/.test(masked)) {
    return "connection";
  }
  return null;
}

export const pwrCompletions: CompletionSource = (ctx) => {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);

  // Comments are whole-line only, so one test on the whole line covers them.
  if (/^\s*(#|%%)/.test(line.text)) return null;

  const { masked, inString } = maskStrings(before);
  if (inString) return null; // inside a "label"

  const scan = scanPwr(ctx.state.doc, line.number);

  // 0. Inside a `style { … }` block: property names, then values. Checked first
  // because every line here is `name: value`, which the connection-label guard
  // below would otherwise swallow.
  if (scan.block) {
    const decl = /([A-Za-z][A-Za-z-]*)\s*:\s*([^;]*)$/.exec(masked);
    if (decl) {
      // An icon block's values are path data and free-form colours — nothing
      // useful to enumerate.
      if (scan.block === "icon") return null;
      const spec = STYLE_PROPS[normalizePropName(decl[1]!)];
      const typed = decl[2]!;
      return typed.trim() === "" || ctx.explicit
        ? { from: ctx.pos - typed.length, options: styleValueOptions(spec), validFor: /^[^;}]*$/ }
        : null;
    }
    const partial = /[A-Za-z-]*$/.exec(before)![0];
    const options = scan.block === "icon" ? ICON_PROP_OPTIONS : stylePropOptions(scan.styleSlot);
    return { from: ctx.pos - partial.length, options };
  }

  if (maskArgs(masked).includes(":")) return null; // inside a connection label
  if (/\}\s*$/.test(masked)) return null; // `}` stands alone and is already complete

  const word = /[A-Za-z0-9_]*$/.exec(before)![0];
  const wordFrom = ctx.pos - word.length;

  // 1. Inside a directive's parentheses.
  const args = IN_ARGS.exec(masked);
  if (args) {
    const name = args[1]!.toLowerCase(); // the parser lowercases too — @RightOf is legal
    const arg = args[2]!;
    if (name === "corner") return result(CORNER_OPTIONS, wordFrom);
    const px = PX[name];
    if (px) {
      return arg.trim() === "" || ctx.explicit
        ? { from: ctx.pos - arg.length, options: px, validFor: /^\d*$/ }
        : null;
    }
    if (name === "rightof" || name === "leftof" || name === "above" || name === "below") {
      return result(anchorOptions(scan), wordFrom);
    }
    if (name === "theme") return result(THEME_NAMES, wordFrom);
    if (name === "link") {
      // Only worth offering while the argument is empty: past `https://` there
      // is nothing this can know. And not `validFor: IDENT` — a URL is made of
      // characters that would close the popup on the first one typed.
      return arg.trim() === "" || ctx.explicit
        ? { from: ctx.pos - arg.length, options: LINK_SCHEME_OPTIONS, validFor: /^[^)]*$/ }
        : null;
    }
    if (name === "icon") {
      const declared = scan.icons.map((n, i) => ({
        label: n,
        type: "variable",
        detail: "declared here",
        boost: 60 - i,
      }));
      // Nothing typed yet: three and a half thousand names sorted alphabetically
      // opens on `1001tracklists`. A short, hand-picked list is the only useful
      // answer to "which icon?" — and the first character brings back the rest,
      // because `result` re-runs this source on anything but a word character.
      if (arg.trim() === "" && !ctx.explicit) {
        return { from: wordFrom, options: [...declared, ...popularIconOptions()] };
      }
      return result([...declared, ...allIconOptions()], wordFrom);
    }
    if (name === "style") {
      const options = scan.styles.map((n, i) => ({
        label: n,
        type: STYLE_SLOTS.includes(n) ? "class" : "variable",
        detail: STYLE_SLOTS.includes(n) ? `${n} selector` : "style",
        boost: 40 - i,
      }));
      return result(options, wordFrom);
    }
    const spec = STYLE_PROPS[normalizePropName(name)];
    if (spec) {
      return arg.trim() === "" || ctx.explicit
        ? { from: ctx.pos - arg.length, options: styleValueOptions(spec), validFor: /^[^)]*$/ }
        : null;
    }
    return null; // unknown directive: nothing useful to say
  }

  // 2. Just after an `@` — only what this position actually accepts.
  const at = AT_SIGN.exec(masked);
  if (at) {
    const where = directiveCtx(masked);
    return where ? result(DIRECTIVE_COMPLETIONS[where], ctx.pos - at[0]!.length) : null;
  }

  // 3. First token of the line.
  if (/^\s*[A-Za-z0-9_]*$/.test(masked)) {
    return result(lineStartOptions(scan, line.number), wordFrom);
  }

  // 4. Tail of the `architecture` header, which carries diagram-level settings.
  if (HEADER_LINE.test(masked)) {
    if (!/\s$/.test(masked) && !ctx.explicit) return null; // still typing the keyword
    return result(DIRECTIVE_COMPLETIONS.diagram, wordFrom);
  }

  // 5. Tail of a `text "…"` line — a quoted string first, then only @corner.
  const text = TEXT_LINE.exec(masked);
  if (text) {
    if (!/\s$/.test(masked) && !ctx.explicit) return null;
    const out: Completion[] = [];
    if (!text[1]) out.push(TEXT_SNIPPET);
    else out.push(...DIRECTIVE_COMPLETIONS.text);
    return result(out, wordFrom);
  }

  // 6. Tail of a declaration: `<kind> <id> …`
  const decl = DECL_HEAD.exec(masked);
  if (decl) {
    const kind = decl[1]!;
    const tail = decl[3]!;
    // Mid-token, e.g. still typing the id or a label: stay quiet unless asked.
    if (!/\s$/.test(tail) && !ctx.explicit) return null;
    const out: Completion[] = [];
    const container = kind === "service" || kind === "group";
    if (!tail.includes('"')) out.push(LABEL_SNIPPET);
    if (container && !tail.includes("{")) out.push(BRACE_SNIPPET);
    out.push(...DIRECTIVE_COMPLETIONS[container ? "container" : "shape"]);
    return result(out, wordFrom);
  }

  // 7. Connection line.
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

  // 8. Operator position: after an id, or part-way through an operator.
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
