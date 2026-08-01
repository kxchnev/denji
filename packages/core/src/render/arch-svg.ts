import type {
  ArchDiagram,
  ArchNode,
  Connection,
  Container,
  Shape,
  StyleProps,
  StyleSlot,
  ThemeName,
} from "../model/arch.js";
import { STYLE_SLOTS } from "../model/arch.js";
import { isStyleSlot, mergeStyle, STYLE_PROPS } from "../model/style.js";
import { center, type Point, type Rect } from "../model/geometry.js";
import { FONT_SIZE } from "../layout/arch/measure.js";
import { DEFAULT_HEADER_H } from "../layout/arch/index.js";
import { resolveTheme, type Theme } from "./theme.js";

/**
 * - `fixed` (default) — one palette, baked in. What an export wants: the file
 *   looks the same wherever it is opened, and a rasterizer can reproduce it.
 * - `auto` — both palettes, switched by `@media (prefers-color-scheme: dark)`.
 *   For a standalone `.svg`, where the reader's device is the only signal.
 * - `selector` — both palettes, switched by an ancestor selector (`.dark` by
 *   default). For a host page that resolves the preference itself: a media
 *   query would ignore its theme toggle and fight the class.
 */
export type ThemeMode = "fixed" | "auto" | "selector";

export interface ArchRenderOptions {
  padding?: number;
  fontFamily?: string;
  background?: string;
  headerH?: number;
  /**
   * The palette, and in `auto` mode the light half of it. Defaults to `light`;
   * a `@theme(...)` in the document beats it and pins the diagram to `fixed`.
   */
  theme?: ThemeName | Theme;
  /** The dark half in `auto` / `selector` mode. Defaults to the built-in `dark`. */
  darkTheme?: ThemeName | Theme;
  themeMode?: ThemeMode;
  /** Ancestor selector meaning "dark" in `selector` mode. */
  darkSelector?: string;
  /**
   * Prefix for generated ids and for the per-instance scope class. Defaults to
   * a hash of the drawing, which keeps output deterministic while stopping two
   * inlined diagrams on one page from sharing marker ids or CSS variables.
   */
  idPrefix?: string;
}

const DEFAULTS = {
  padding: 24,
  headerH: DEFAULT_HEADER_H,
};

/** Which sub-element of a node each property paints. */
type Part = "body" | "label" | "header" | "headerText" | "chip";

const CLASS: Record<Part, string> = {
  body: "pwr-b",
  label: "pwr-t",
  header: "pwr-h",
  headerText: "pwr-ht",
  chip: "pwr-c",
};

/** Render a laid-out architecture diagram (every node has a rect) to SVG. */
export function renderArchitecture(diagram: ArchDiagram, opts: ArchRenderOptions = {}): string {
  // The document is authored intent: an explicit @theme names one palette, so
  // there is no second one to switch to.
  const mode: ThemeMode = diagram.theme ? "fixed" : (opts.themeMode ?? "fixed");
  const theme = resolveTheme(diagram.theme ?? opts.theme ?? "light");
  const darkTheme = resolveTheme(opts.darkTheme ?? "dark");

  // The layout pushes the drawing to (margin, margin); this padding is what
  // trails it on the right and bottom. Follow the diagram's own margin so the
  // whitespace stays symmetric, unless the caller asked for something else.
  const padding = opts.padding ?? diagram.margin ?? DEFAULTS.padding;
  const headerH = opts.headerH ?? DEFAULTS.headerH;
  const fontFamily = opts.fontFamily ?? theme.fontFamily;
  const { width, height } = bounds(diagram, padding);

  const sheet = diagram.styles ?? {};
  const styled = new StyleModel(theme, sheet, opts.background);

  const body: string[] = [];
  body.push(`<rect class="pwr-bg" width="${width}" height="${height}"/>`);

  // Containers back-to-front (outer first), then shapes, then connections on top.
  const depth = containerDepths(diagram);
  const containers = diagram.nodes
    .filter((n): n is Container => n.type === "container")
    .sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0));
  for (const c of containers) body.push(renderContainer(c, headerH, styled));

  for (const n of diagram.nodes) {
    if (n.type === "shape" && n.rect) body.push(renderShape(n, styled));
  }
  diagram.connections.forEach((c, i) => body.push(renderConnection(c, i, styled)));

  const markup = body.join("\n");
  // The scope class keys the whole stylesheet, so anything that changes the CSS
  // without changing the markup — the palette, the backdrop — has to be in here.
  // Otherwise two diagrams on one page collide on the same scope and the second
  // one's rules repaint the first.
  const prefix =
    opts.idPrefix ??
    `pwr-${hash(
      markup +
        JSON.stringify([mode, theme, darkTheme, opts.darkSelector ?? null, opts.background ?? null]),
    )}`;

  const css = styled.stylesheet({
    scope: `.${prefix}`,
    mode,
    theme,
    darkTheme,
    darkSelector: opts.darkSelector ?? ".dark",
    background: opts.background,
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="pwr ${prefix}" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="${esc(fontFamily)}">`,
    `<style>${css}</style>`,
    defs(prefix, styled),
    markup.replace(/\{\{ID\}\}/g, prefix),
    "</svg>",
  ].join("\n");
}

/* ------------------------------------------------------------------ styles */

/**
 * Resolves the cascade and collects the CSS.
 *
 * The theme is the only layer emitted as custom properties, so a host page (or
 * the dark branch of the stylesheet) can re-point it without the renderer
 * running again. Everything the document says is emitted as a literal, in
 * source order — theme, then per-kind selectors, then named styles, then
 * per-element inline. Every rule has the same specificity, so order alone
 * decides, which is exactly the cascade we promise.
 */
class StyleModel {
  /** Style name → the slots it is actually attached to, so dead rules are not emitted. */
  private readonly named = new Map<string, { props: StyleProps; slots: Set<StyleSlot> }>();
  private readonly inline = new Map<string, { props: StyleProps; slots: Set<StyleSlot> }>();
  /** Distinct arrowhead colours, in first-use order; the index is the marker id. */
  readonly arrowColors: string[] = [];

  constructor(
    private readonly theme: Theme,
    private readonly sheet: Record<string, StyleProps>,
    private readonly background: string | undefined,
  ) {}

  /** Classes for one element, plus the resolved values the renderer needs in JS. */
  classesFor(slot: StyleSlot, key: string, refs: string[] | undefined, own: StyleProps | undefined) {
    const classes = [`pwr-${slot}`];
    for (const ref of refs ?? []) {
      const props = this.sheet[ref];
      if (props) {
        const entry = this.named.get(ref) ?? { props, slots: new Set<StyleSlot>() };
        entry.slots.add(slot);
        this.named.set(ref, entry);
        classes.push(`pwr-s-${ref}`);
      }
    }
    if (own && Object.keys(own).length > 0) {
      this.inline.set(key, { props: own, slots: new Set([slot]) });
      classes.push(`pwr-i-${key}`);
    }
    return classes.join(" ");
  }

  /** The value that actually wins, for the few things CSS cannot carry. */
  resolved(slot: StyleSlot, refs: string[] | undefined, own: StyleProps | undefined): StyleProps {
    const layers: Array<StyleProps | undefined> = [this.theme.slots[slot], this.sheet[slot]];
    for (const ref of refs ?? []) layers.push(this.sheet[ref]);
    layers.push(own);
    return mergeStyle(...layers);
  }

  /** True when nothing in the document overrides the theme's value. */
  private fromTheme(
    prop: keyof StyleProps,
    slot: StyleSlot,
    refs: string[] | undefined,
    own: StyleProps | undefined,
  ): boolean {
    if (own?.[prop] !== undefined) return false;
    if (this.sheet[slot]?.[prop] !== undefined) return false;
    for (const ref of refs ?? []) if (this.sheet[ref]?.[prop] !== undefined) return false;
    return true;
  }

  /**
   * An arrowhead is drawn by a `<marker>`, which cannot inherit the stroke of
   * the path that references it — so each distinct edge colour needs its own.
   */
  arrowMarker(refs: string[] | undefined, own: StyleProps | undefined): number {
    const color = this.fromTheme("stroke", "edge", refs, own)
      ? cssVar("edge", "stroke", this.theme.slots.edge.stroke)
      : String(this.resolved("edge", refs, own).stroke);
    let i = this.arrowColors.indexOf(color);
    if (i < 0) i = this.arrowColors.push(color) - 1;
    return i;
  }

  stylesheet(o: {
    scope: string;
    mode: ThemeMode;
    theme: Theme;
    darkTheme: Theme;
    darkSelector: string;
    background: string | undefined;
  }): string {
    const rules: string[] = [];

    // The palette lives in custom properties scoped to this one diagram, so
    // `auto` only has to restate the variables — every rule below reads through
    // them and stays as it is.
    rules.push(`${o.scope}{${vars(o.theme, o.background)}}`);
    if (o.mode === "auto") {
      rules.push(
        `@media(prefers-color-scheme:dark){${o.scope}{${vars(o.darkTheme, o.background)}}}`,
      );
    } else if (o.mode === "selector") {
      // No media query alongside it on purpose: a host that owns a selector has
      // already folded the device preference into it, and a query would win
      // back whenever the reader turned the host's toggle against their OS.
      rules.push(`${o.darkSelector} ${o.scope}{${vars(o.darkTheme, o.background)}}`);
    }

    rules.push(`${o.scope} .pwr-bg{fill:var(--pwr-bg,${o.background ?? o.theme.background})}`);

    // 1. Theme, read through the variables declared above.
    for (const slot of STYLE_SLOTS) {
      rules.push(...ruleset(`${o.scope} .pwr-${slot}`, o.theme.slots[slot], slot, true));
    }
    // 2. Per-kind selectors from the document.
    for (const slot of STYLE_SLOTS) {
      const props = this.sheet[slot];
      if (props) rules.push(...ruleset(`${o.scope} .pwr-${slot}`, props, slot, false));
    }
    // 3. Named styles, in declaration order — later declaration wins, as in CSS.
    for (const name of Object.keys(this.sheet)) {
      if (isStyleSlot(name)) continue;
      const used = this.named.get(name);
      if (used) {
        rules.push(...ruleset(`${o.scope} .pwr-s-${name}`, used.props, undefined, false, used.slots));
      }
    }
    // 4. Inline, the strongest layer.
    for (const [key, used] of this.inline) {
      rules.push(...ruleset(`${o.scope} .pwr-i-${key}`, used.props, undefined, false, used.slots));
    }

    // A connection is a stroked line, never a filled one. This has to outrank
    // every layer above — a CSS declaration beats the `fill="none"` attribute,
    // so a named style's fill would otherwise flood the path.
    rules.push(`${o.scope} .pwr-e .pwr-b{fill:none}`);

    return rules.join("");
  }
}

/** `--pwr-<slot>-<suffix>` declarations for one theme. */
function vars(theme: Theme, background: string | undefined): string {
  const out: string[] = [`--pwr-bg:${background ?? theme.background}`];
  for (const slot of STYLE_SLOTS) {
    for (const spec of Object.values(STYLE_PROPS)) {
      // `radius` is geometry (an attribute) and `dash` is emitted literally —
      // see the note in ruleset(). Neither is reachable through a variable.
      if (spec.cssVar === "radius" || spec.cssVar === "dash") continue;
      const v = theme.slots[slot][spec.key];
      if (v !== undefined) out.push(`--pwr-${slot}-${spec.cssVar}:${v}`);
    }
  }
  return out.join(";");
}

function cssVar(slot: StyleSlot, prop: keyof StyleProps, fallback: unknown): string {
  const spec = Object.values(STYLE_PROPS).find((s) => s.key === prop)!;
  // The literal fallback is not optional: librsvg (CLI raster) and a canvas-
  // rasterized <img> both handle var() poorly or not at all.
  return `var(--pwr-${slot}-${spec.cssVar},${String(fallback)})`;
}

/**
 * Turn a style bag into rules, split by the sub-element each property paints.
 * `viaVars` emits the theme layer as `var(…, literal)`; the document layers are
 * plain literals so they override it.
 */
function ruleset(
  sel: string,
  props: StyleProps,
  slot: StyleSlot | undefined,
  viaVars: boolean,
  /** For a slot-agnostic layer: the slots it is actually attached to. */
  targets?: ReadonlySet<StyleSlot>,
): string[] {
  const parts: Record<Part, string[]> = {
    body: [],
    label: [],
    header: [],
    headerText: [],
    chip: [],
  };
  const isEdge = slot === "edge";
  // A `service` has no body label — its only text is the title band, so `text`
  // and `fontWeight` land there instead of on a `.pwr-t` that does not exist.
  const textParts: Part[] =
    slot === "service"
      ? ["headerText"]
      : targets?.has("service")
        ? ["label", "headerText"]
        : ["label"];
  const val = (key: keyof StyleProps): string =>
    viaVars && slot ? cssVar(slot, key, props[key]) : String(props[key]);

  const add = (part: Part, decl: string) => parts[part].push(decl);

  // A slot-agnostic style may be attached to shapes and connections at once.
  // On a connection the body is the line, whose fill must stay `none`, so the
  // fill goes to the label chip there and to the body everywhere else.
  const onEdge = slot ? isEdge : (targets?.has("edge") ?? false);
  const onNode = slot ? !isEdge : [...(targets ?? [])].some((t) => t !== "edge");
  if (props.fill !== undefined) {
    if (onNode) add("body", `fill:${val("fill")}`);
    if (onEdge) add("chip", `fill:${val("fill")}`);
  }
  if (props.stroke !== undefined) add("body", `stroke:${val("stroke")}`);
  if (props.strokeWidth !== undefined) add("body", `stroke-width:${val("strokeWidth")}`);
  if (props.opacity !== undefined) add(isEdge ? "chip" : "body", `opacity:${val("opacity")}`);
  for (const part of textParts) {
    if (props.text !== undefined) add(part, `fill:${val("text")}`);
    if (props.fontWeight !== undefined) add(part, `font-weight:${val("fontWeight")}`);
  }
  if (props.headerFill !== undefined) add("header", `fill:${val("headerFill")}`);
  if (props.headerText !== undefined) add("headerText", `fill:${val("headerText")}`);

  const out: string[] = [];
  for (const [part, decls] of Object.entries(parts) as Array<[Part, string[]]>) {
    if (decls.length > 0) out.push(`${sel} .${CLASS[part]}{${guard(decls.join(";"))}}`);
  }

  if (props.dash !== undefined) {
    // The `edge` theme layer carries the pattern for `-.->` only, so it is gated
    // on the class the operator adds. A dash written by the document is meant
    // literally and applies straight away.
    // Written literally, never through a variable: librsvg (the CLI's raster
    // path) drops a `stroke-dasharray` that contains var(), fallback and all,
    // which would quietly turn every dashed border solid in PNG and JPEG.
    const gate = isEdge ? `${sel}.pwr-dashed` : sel;
    out.push(`${gate} .${CLASS.body}{${guard(`stroke-dasharray:${props.dash}`)}}`);
  }
  return out;
}

/**
 * Last line of defence. Values are allow-listed at parse time, but a caller can
 * hand a theme object straight to the renderer, and CSS text is not covered by
 * XML escaping — `}</style>` would break out of the element.
 */
function guard(css: string): string {
  if (/[<>{}]/.test(css)) throw new Error(`Unsafe style value in "${css}"`);
  return css;
}

/* ------------------------------------------------------------------ shapes */

function defs(prefix: string, styled: StyleModel): string {
  const markers = styled.arrowColors
    .map(
      (color, i) =>
        `<marker id="${prefix}-a${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
        `<path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`,
    )
    .join("");
  return `<defs>${markers}</defs>`;
}

function renderShape(n: Shape, styled: StyleModel): string {
  const r = n.rect!;
  const cls = styled.classesFor(n.kind, n.id, n.styleRefs, n.styleProps);
  const radius = styled.resolved(n.kind, n.styleRefs, n.styleProps).radius ?? 0;
  let body: string;
  switch (n.kind) {
    case "database":
      body = cylinderVertical(r);
      break;
    case "queue":
      body = cylinderHorizontal(r);
      break;
    default:
      body =
        `<rect class="pwr-b" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"` +
        (radius > 0 ? ` rx="${radius}" ry="${radius}"` : "") +
        `/>`;
  }
  return `<g class="pwr-n ${cls}">${body}${label(n.label, center(r), FONT_SIZE)}</g>`;
}

/** Vertical cylinder (database): body path plus a top rim ellipse. */
function cylinderVertical(r: Rect): string {
  const rx = r.width / 2;
  const ry = 7;
  const cx = r.x + rx;
  const body =
    `M ${r.x},${r.y + ry} A ${rx},${ry} 0 0 1 ${r.x + r.width},${r.y + ry} ` +
    `V ${r.y + r.height - ry} A ${rx},${ry} 0 0 1 ${r.x},${r.y + r.height - ry} Z`;
  return (
    `<path class="pwr-b" d="${body}"/>` +
    `<ellipse class="pwr-b" cx="${cx}" cy="${r.y + ry}" rx="${rx}" ry="${ry}"/>`
  );
}

/** Horizontal cylinder (queue): body path plus a left rim ellipse. */
function cylinderHorizontal(r: Rect): string {
  const rx = 8;
  const ry = r.height / 2;
  const cy = r.y + ry;
  const body =
    `M ${r.x + rx},${r.y} H ${r.x + r.width - rx} A ${rx},${ry} 0 0 1 ${r.x + r.width - rx},${r.y + r.height} ` +
    `H ${r.x + rx} A ${rx},${ry} 0 0 1 ${r.x + rx},${r.y} Z`;
  return (
    `<path class="pwr-b" d="${body}"/>` +
    `<ellipse class="pwr-b" cx="${r.x + rx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`
  );
}

function renderContainer(n: Container, headerH: number, styled: StyleModel): string {
  const r = n.rect!;
  const cls = styled.classesFor(n.kind, n.id, n.styleRefs, n.styleProps);
  const resolved = styled.resolved(n.kind, n.styleRefs, n.styleProps);
  const radius = resolved.radius ?? 0;

  if (n.kind === "service") {
    // The header band repeats the body's top corners, so its path is built from
    // the same radius rather than a baked-in 10.
    const k = Math.min(radius, r.width / 2);
    const header =
      `<path class="pwr-h" d="M ${r.x},${r.y + k} q 0,${-k} ${k},${-k} H ${r.x + r.width - k} ` +
      `q ${k},0 ${k},${k} V ${r.y + headerH} H ${r.x} Z"/>`;
    return (
      `<g class="pwr-n ${cls}">` +
      `<rect class="pwr-b" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" ry="${radius}"/>` +
      header +
      `<text class="pwr-ht" x="${r.x + 12}" y="${r.y + headerH / 2}" dominant-baseline="central" font-size="13">${esc(n.label)}</text>` +
      `</g>`
    );
  }
  // group: plain dashed rectangle with a top-left label
  return (
    `<g class="pwr-n ${cls}">` +
    `<rect class="pwr-b" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" ry="${radius}"/>` +
    `<text class="pwr-t" x="${r.x + 12}" y="${r.y + 18}" font-size="13" text-anchor="start">${esc(n.label)}</text>` +
    `</g>`
  );
}

function renderConnection(c: Connection, index: number, styled: StyleModel): string {
  if (!c.path || c.path.length < 2) return "";
  const cls = styled.classesFor("edge", `e${index}`, c.styleRefs, c.styleProps);
  const marker = styled.arrowMarker(c.styleRefs, c.styleProps);
  const d = c.path.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const dashed = c.style === "dashed" ? " pwr-dashed" : "";
  const start = c.fromArrow ? ` marker-start="url(#{{ID}}-a${marker})"` : "";
  const end = c.toArrow ? ` marker-end="url(#{{ID}}-a${marker})"` : "";

  let out = `<g class="pwr-e ${cls}${dashed}">`;
  out += `<path class="pwr-b" d="${d}" fill="none"${start}${end}/>`;
  if (c.label && c.labelPos) {
    const w = c.label.length * 7 + 8;
    out +=
      `<rect class="pwr-c" x="${c.labelPos.x - w / 2}" y="${c.labelPos.y - 9}" width="${w}" height="18" rx="3"/>` +
      `<text class="pwr-t" x="${c.labelPos.x}" y="${c.labelPos.y}" text-anchor="middle" dominant-baseline="central" font-size="12">${esc(c.label)}</text>`;
  }
  return `${out}</g>`;
}

function label(text: string, c: Point, size: number): string {
  return (
    `<text class="pwr-t" x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" ` +
    `font-size="${size}">${esc(text)}</text>`
  );
}

/* ------------------------------------------------------------------- utils */

function containerDepths(diagram: ArchDiagram): Map<string, number> {
  const parent = new Map<string, string>();
  for (const n of diagram.nodes) {
    if (n.type === "container") for (const c of n.children) parent.set(c, n.id);
  }
  const depth = new Map<string, number>();
  for (const n of diagram.nodes) {
    if (n.type !== "container") continue;
    let d = 0;
    let cur = parent.get(n.id);
    while (cur) {
      d++;
      cur = parent.get(cur);
    }
    depth.set(n.id, d);
  }
  return depth;
}

function bounds(diagram: ArchDiagram, padding: number): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const n of diagram.nodes as ArchNode[]) {
    if (!n.rect) continue;
    maxX = Math.max(maxX, n.rect.x + n.rect.width);
    maxY = Math.max(maxY, n.rect.y + n.rect.height);
  }
  return { width: Math.ceil(maxX + padding), height: Math.ceil(maxY + padding) };
}

/** FNV-1a. Only needs to be stable and collision-shy across one page. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
