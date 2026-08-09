import type {
  ArchDiagram,
  ArchNode,
  Connection,
  Container,
  ContainerText,
  Corner,
  Shape,
  StyleProps,
  StyleSlot,
  ThemeName,
} from "../model/arch.js";
import { CORNERS, STYLE_SLOTS } from "../model/arch.js";
import { isStyleSlot, mergeStyle, STYLE_PROPS } from "../model/style.js";
import { canonicalIconName, resolveIcon, type Icon } from "../model/icon.js";
import { center, type Point, type Rect } from "../model/geometry.js";
import {
  capRx,
  capRy,
  FONT_SIZE,
  ICON_GAP,
  ICON_SIZE,
  iconAbove,
  LABEL_LINE_H,
  labelBoxLines,
  labelBoxWidth,
  measureLabelWidth,
  noteLines,
  NOTE_FONT_SIZE,
  NOTE_INSET,
  NOTE_LINE_H,
  wrapLabel,
} from "../layout/arch/measure.js";
import { DEFAULT_HEADER_H } from "../layout/arch/index.js";
import { linkBadgeRect } from "../interact.js";
import { linkChrome, resolveTheme, type Theme } from "./theme.js";

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
  /**
   * Wrap each `@link` button in an SVG `<a>`.
   *
   * Off by default, and the two interactive viewers must leave it off: an
   * anchor works in a page's DOM, is inert in the VS Code webview (which has to
   * ask its host to open anything) and is dropped by librsvg on the way to a
   * PNG. Relying on it would mean one mechanism that works in one of the three
   * places — so a viewer hit-tests {@link linkBadgeRect} and decides for itself
   * what a press means. A standalone `.svg` has no viewer to do that, which is
   * the one case worth the second code path; the CLI turns it on for `.svg`.
   */
  linkAnchors?: boolean;
}

const DEFAULTS = {
  padding: 24,
  headerH: DEFAULT_HEADER_H,
};

/** Which sub-element of a node each property paints. */
type Part = "body" | "label" | "header" | "headerText" | "chip" | "icon";

const CLASS: Record<Part, string> = {
  body: "pwr-b",
  label: "pwr-t",
  header: "pwr-h",
  headerText: "pwr-ht",
  chip: "pwr-c",
  icon: "pwr-ic",
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
  const styled = new StyleModel(theme, sheet, opts.background, diagram.icons);

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

  // Link buttons last of all, over the connections. A connector docks within
  // DOCK_INSET of a corner, so an arrow really does cross this exact patch —
  // and a button with a line drawn through it stops reading as a button.
  const badges = diagram.nodes
    .map((n) => ({ n, box: linkBadgeRect(n, headerH) }))
    .filter((x) => x.box !== null)
    .map(({ n, box }) => linkBadge(n.link!, box!, opts.linkAnchors ?? false));
  if (badges.length > 0) {
    styled.usedLinks = true;
    body.push(`<g class="pwr-lks">${badges.join("")}</g>`);
  }

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
  /** Marks actually drawn, so only their colour variables get declared. */
  readonly usedIcons = new Map<string, Icon>();
  /** Set when a link button was drawn, so a link-free diagram's CSS is unchanged. */
  usedLinks = false;

  constructor(
    private readonly theme: Theme,
    private readonly sheet: Record<string, StyleProps>,
    private readonly background: string | undefined,
    private readonly icons: Record<string, Icon> | undefined,
  ) {}

  /** Resolve a name against the document's icons, then the bundled ones. */
  useIcon(name: string | undefined): { key: string; icon: Icon } | undefined {
    if (!name) return undefined;
    const key = canonicalIconName(name, this.icons);
    const icon = resolveIcon(name, this.icons);
    if (!key || !icon) return undefined;
    this.usedIcons.set(key, icon);
    return { key, icon };
  }

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
    rules.push(`${o.scope}{${vars(o.theme, o.background, this.usedIcons, this.usedLinks)}}`);
    if (o.mode === "auto") {
      rules.push(
        `@media(prefers-color-scheme:dark){${o.scope}{${vars(o.darkTheme, o.background, this.usedIcons, this.usedLinks)}}}`,
      );
    } else if (o.mode === "selector") {
      // No media query alongside it on purpose: a host that owns a selector has
      // already folded the device preference into it, and a query would win
      // back whenever the reader turned the host's toggle against their OS.
      rules.push(
        `${o.darkSelector} ${o.scope}{${vars(o.darkTheme, o.background, this.usedIcons, this.usedLinks)}}`,
      );
    }

    rules.push(`${o.scope} .pwr-bg{fill:var(--pwr-bg,${o.background ?? o.theme.background})}`);

    // The button's chrome is fixed, not styleable — see LinkChrome. Literal
    // fallbacks for the same reason as everywhere else: librsvg ignores custom
    // properties and renders the fallback, which therefore has to be the
    // *active* palette's value or a dark PNG gets a light chip.
    if (this.usedLinks) {
      const c = linkChrome(o.theme);
      rules.push(
        `${o.scope} .pwr-lk{cursor:pointer}`,
        `${o.scope} .pwr-lk-p{${guard(
          `fill:var(--pwr-link-fill,${c.fill});stroke:var(--pwr-link-stroke,${c.stroke});stroke-width:1`,
        )}}`,
        `${o.scope} .pwr-lk-i{${guard(
          `fill:none;stroke:var(--pwr-link-glyph,${c.glyph});stroke-width:2;stroke-linecap:round;stroke-linejoin:round`,
        )}}`,
      );
    }

    // One rule per mark. Deliberately a single class — lower specificity than
    // the `.pwr-<slot> .pwr-ic` rule an `iconColor` produces, so overriding a
    // brand colour works from any layer of the cascade.
    for (const [name, icon] of this.usedIcons) {
      // The fallback has to be the *active* palette's colour, not always the
      // light one: librsvg ignores custom properties entirely and renders the
      // fallback, so a hardcoded light hex would leave dark PNGs unreadable.
      const literal = (o.theme.dark && icon.darkColor) || icon.color;
      rules.push(
        `${o.scope} .pwr-icon-${name}{${guard(`fill:var(--pwr-icon-${name},${literal})`)}}`,
      );
    }

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
function vars(
  theme: Theme,
  background: string | undefined,
  icons: ReadonlyMap<string, Icon>,
  links: boolean,
): string {
  const out: string[] = [`--pwr-bg:${background ?? theme.background}`];
  if (links) {
    const c = linkChrome(theme);
    out.push(`--pwr-link-fill:${c.fill}`, `--pwr-link-stroke:${c.stroke}`, `--pwr-link-glyph:${c.glyph}`);
  }
  for (const [name, icon] of icons) {
    out.push(`--pwr-icon-${name}:${(theme.dark && icon.darkColor) || icon.color}`);
  }
  for (const slot of STYLE_SLOTS) {
    for (const spec of Object.values(STYLE_PROPS)) {
      // Only `emit: "var"` properties are reachable through a variable; the
      // rest are geometry, or literals that librsvg would otherwise drop.
      if (spec.emit !== "var") continue;
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
    icon: [],
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
  // `width`/`height` are consumed by the layout and `radius` is written as an
  // attribute; none of them belongs in the stylesheet.

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
  if (props.iconColor !== undefined) add("icon", `fill:${val("iconColor")}`);
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
  const mark = styled.useIcon(n.icon);
  const c = labelCenter(n.kind, r);
  // Wrapped from the label alone, exactly as the layout did it: the split is a
  // function of the string, not of the room, so the two cannot disagree.
  const lines = wrapLabel(n.label, labelBoxWidth(n, r.width), labelBoxLines(n, r.height));
  let content: string;
  if (mark && lines.length === 0) {
    // Icon on its own: centred, no text to align against.
    content = iconMarkup(mark, c.x - ICON_SIZE / 2, c.y - ICON_SIZE / 2, ICON_SIZE);
  } else if (mark && iconAbove(n.kind)) {
    // A cylinder wears its mark above the label: it is narrow and tall, so the
    // room it has to give is vertical. The pair is centred as one block.
    const block = ICON_SIZE + ICON_GAP + lines.length * LABEL_LINE_H;
    const top = c.y - block / 2;
    content =
      iconMarkup(mark, c.x - ICON_SIZE / 2, top, ICON_SIZE) +
      labelStack(lines, c.x, top + ICON_SIZE + ICON_GAP + (lines.length * LABEL_LINE_H) / 2, "middle");
  } else if (mark) {
    // Centre the mark and the whole block of lines as one row, then anchor every
    // line at the block's own left edge instead of the shape's centre. The mark
    // stays on `c.y`, which is the block's centre whether it holds one line or
    // two, so nothing about it has to know how the label broke.
    const textW = lines.reduce((m, l) => Math.max(m, measureLabelWidth(l)), 0);
    const startX = c.x - (ICON_SIZE + ICON_GAP + textW) / 2;
    content =
      iconMarkup(mark, startX, c.y - ICON_SIZE / 2, ICON_SIZE) +
      labelStack(lines, startX + ICON_SIZE + ICON_GAP, c.y, "start");
  } else {
    content = labelStack(lines, c.x, c.y, "middle");
  }
  return `<g class="pwr-n ${cls}">${body}${content}</g>`;
}

/**
 * Where a shape's label sits.
 *
 * A database is drawn with an elliptical lid and an elliptical bottom, so the
 * face a label lives on runs from the underside of the lid (`y + 2·capRy`) to
 * the bottom of the bulge (`y + height`) — a band exactly `BASE_HEIGHT` tall
 * whatever the lid is, because that is how the height was built. Its centre is
 * one lid below the box's, and that is where two lines land with equal air above
 * and below. On the geometric centre the first line's box crosses the lid.
 */
function labelCenter(kind: Shape["kind"], r: Rect): Point {
  const c = center(r);
  return { x: c.x, y: kind === "database" ? c.y + capRy(r.height) : c.y };
}

/**
 * A brand mark as an inline `<path>`. Not a `<symbol>` + `<use>`: librsvg (the
 * CLI rasterizer) is unreliable about colour inheriting into a use-shadow tree,
 * and an `<image>` cannot load at all inside a canvas-rasterized `<img>`.
 * Repeating the path costs a few hundred bytes and works everywhere.
 */
function iconMarkup(mark: { key: string; icon: Icon }, x: number, y: number, size: number): string {
  const [vx = 0, vy = 0, vw = 24, vh = 24] = (mark.icon.viewBox ?? "0 0 24 24")
    .trim()
    .split(/\s+/)
    .map(Number);
  // Fit the long side, then centre what is left over. Without the centring a
  // non-square `view-box` sticks to the top-left of the square the layout
  // reserved: a wide, short mark floats above the label it should sit beside.
  const scale = size / Math.max(vw, vh);
  const dx = (size - vw * scale) / 2;
  const dy = (size - vh * scale) / 2;
  return (
    `<path class="pwr-ic pwr-icon-${mark.key}" ` +
    `transform="translate(${round(x + dx - vx * scale)} ${round(y + dy - vy * scale)}) scale(${round(scale)})" ` +
    `d="${mark.icon.path}"/>`
  );
}

/** The glyph's own box, and how much of the 18px plate it takes. */
const LINK_GLYPH_BOX = 24;
const LINK_GLYPH_SIZE = 12;
/** An arrow leaving a box: the one mark a reader already knows means "opens". */
const LINK_GLYPH = "M14 4h6v6M20 4l-8 8M17 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4";

/**
 * The button. An inline `<path>` for the same reason {@link iconMarkup} uses
 * one — no `<symbol>`, no `<use>`, no `<image>`: librsvg and a canvas-rasterized
 * `<img>` each break on all three.
 */
function linkBadge(url: string, b: Rect, anchor: boolean): string {
  const scale = LINK_GLYPH_SIZE / LINK_GLYPH_BOX;
  const gx = round(b.x + (b.width - LINK_GLYPH_SIZE) / 2);
  const gy = round(b.y + (b.height - LINK_GLYPH_SIZE) / 2);
  const inner =
    // The URL as a tooltip wherever a DOM renders this, and as the accessible
    // name. Inert in librsvg, and free.
    `<title>${esc(url)}</title>` +
    `<rect class="pwr-lk-p" x="${round(b.x)}" y="${round(b.y)}" ` +
    `width="${b.width}" height="${b.height}" rx="5" ry="5"/>` +
    `<path class="pwr-lk-i" transform="translate(${gx} ${gy}) scale(${round(scale)})" d="${LINK_GLYPH}"/>`;
  return anchor
    ? `<a class="pwr-lk" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    : `<g class="pwr-lk">${inner}</g>`;
}

/** Keep generated coordinates short and byte-stable across runs. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Vertical cylinder (database): body path plus a top rim ellipse. */
function cylinderVertical(r: Rect): string {
  const rx = r.width / 2;
  const ry = round(capRy(r.height));
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
  const rx = round(capRx(r.width));
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

  const mark = styled.useIcon(n.icon);
  const titleX = r.x + 12 + (mark ? ICON_SIZE + ICON_GAP : 0);
  // Both kinds hang their title on the middle of the same band, so a mark and
  // its text line up the same way whichever one you used.
  const titleY = r.y + headerH / 2;
  const headerIcon = mark
    ? iconMarkup(mark, r.x + 12, r.y + (headerH - ICON_SIZE) / 2, ICON_SIZE)
    : "";

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
      headerIcon +
      `<text class="pwr-ht" x="${titleX}" y="${titleY}" dominant-baseline="central" font-size="${FONT_SIZE}">${esc(n.label)}</text>` +
      `</g>`
    );
  }
  // group: plain dashed rectangle with a top-left label
  return (
    `<g class="pwr-n ${cls}">` +
    `<rect class="pwr-b" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${radius}" ry="${radius}"/>` +
    headerIcon +
    `<text class="pwr-t" x="${titleX}" y="${titleY}" dominant-baseline="central" font-size="${FONT_SIZE}" text-anchor="start">${esc(n.label)}</text>` +
    CORNERS.map((c) => cornerStack(noteLines(n.texts, c), c, r, headerH)).join("") +
    `</g>`
  );
}

/**
 * The lines pinned to one corner, drawn on the band the layout reserved for
 * them. A top stack hangs from under the title; a bottom one is flush with the
 * bottom edge, so the corner keeps its meaning however many lines it holds.
 *
 * They wear `pwr-t` so the group's own text colour — theme, named style or
 * `@text(…)` alike — reaches them with no extra plumbing; the opacity is an
 * attribute so the stylesheet stays out of it.
 */
function cornerStack(
  lines: readonly ContainerText[],
  corner: Corner,
  r: Rect,
  headerH: number,
): string {
  if (lines.length === 0) return "";
  const right = corner === "topRight" || corner === "bottomRight";
  const top = corner === "topLeft" || corner === "topRight";
  const x = right ? r.x + r.width - NOTE_INSET : r.x + NOTE_INSET;
  const first = top ? r.y + headerH : r.y + r.height - lines.length * NOTE_LINE_H;
  return lines
    .map((t, i) => {
      const y = first + i * NOTE_LINE_H + NOTE_LINE_H / 2;
      return (
        `<text class="pwr-t" x="${round(x)}" y="${round(y)}" dominant-baseline="central" ` +
        `font-size="${NOTE_FONT_SIZE}" text-anchor="${right ? "end" : "start"}" opacity="0.72">` +
        `${esc(t.text)}</text>`
      );
    })
    .join("");
}

/**
 * A path through its own corners, rounded by `radius`.
 *
 * Each corner is cut back by the same amount on both sides and replaced with a
 * quadratic through the corner point, so the curve stays inside the turn the
 * router walked. The cut never exceeds half of either adjacent segment: a corner
 * that ate its whole segment would pull the line off the next corner too, and a
 * tight zig-zag would come apart into a wave that goes nowhere near its route.
 *
 * A two-point path has no corners, so this is exactly the old polyline for
 * everything that came before routers with corners existed.
 */
const HEAD_ROOM = 14;

function polyline(path: readonly Point[], radius: number): string {
  const move = (p: Point): string => `M ${round(p.x)} ${round(p.y)}`;
  const line = (p: Point): string => `L ${round(p.x)} ${round(p.y)}`;
  if (radius <= 0 || path.length < 3) {
    return path.map((p, i) => (i === 0 ? move(p) : line(p))).join(" ");
  }
  const at = (from: Point, to: Point, d: number): Point => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) * d) / len, y: from.y + ((to.y - from.y) * d) / len };
  };
  const out = [move(path[0]!)];
  for (let i = 1; i + 1 < path.length; i++) {
    const prev = path[i - 1]!;
    const cur = path[i]!;
    const next = path[i + 1]!;
    const into = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outOf = Math.hypot(next.x - cur.x, next.y - cur.y);
    // The two segments touching a box keep a straight stretch for the arrowhead
    // to sit on. Rounding into it is what makes a connector look like it arrives
    // sideways: the head ends up drawn along the bend rather than along the line.
    const r = Math.min(
      radius,
      into / 2,
      outOf / 2,
      i === 1 ? into - HEAD_ROOM : Infinity,
      i === path.length - 2 ? outOf - HEAD_ROOM : Infinity,
    );
    if (r < 0.5) {
      out.push(line(cur));
      continue;
    }
    const enter = at(cur, prev, r);
    const leave = at(cur, next, r);
    out.push(line(enter));
    out.push(`Q ${round(cur.x)} ${round(cur.y)} ${round(leave.x)} ${round(leave.y)}`);
  }
  out.push(line(path[path.length - 1]!));
  return out.join(" ");
}

function renderConnection(c: Connection, index: number, styled: StyleModel): string {
  if (!c.path || c.path.length < 2) return "";
  const cls = styled.classesFor("edge", `e${index}`, c.styleRefs, c.styleProps);
  const marker = styled.arrowMarker(c.styleRefs, c.styleProps);
  // Rounded here rather than in the model: the layout compares exact values, but
  // the file does not need `217.66666666666666`.
  //
  // A laid-out connection is one cubic whose controls sit on the docks' normals,
  // so the arrowhead — oriented by the tangent at the endpoint — meets the box
  // square on. The polyline form is kept for a model built through the builder
  // API and never laid out.
  const a = c.path[0]!;
  const b = c.path[c.path.length - 1]!;
  const d = c.curve
    ? `M ${round(a.x)} ${round(a.y)} C ${round(c.curve.c1.x)} ${round(c.curve.c1.y)} ` +
      `${round(c.curve.c2.x)} ${round(c.curve.c2.y)} ${round(b.x)} ${round(b.y)}`
    : polyline(c.path, c.radius ?? 0);
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

/**
 * A label as one or more lines, centred as a block on `cy`.
 *
 * Separate `<text>` elements rather than one `<text>` with `<tspan dy>`: every y
 * is solved here, so nothing depends on how a rasterizer resolves a relative
 * shift against an inherited baseline. The same bet as an inline `<path>`
 * instead of `<use>`, and a literal behind every `var()` — librsvg and a
 * canvas-rasterized `<img>` are handed finished geometry, never arithmetic to
 * agree on.
 *
 * Not `cornerStack`'s arithmetic: that stack hangs from the edge of a reserved
 * band, this one is centred on a point, so a single line lands exactly where the
 * old one-line label did.
 */
function labelStack(
  lines: readonly string[],
  x: number,
  cy: number,
  anchor: "middle" | "start",
  size: number = FONT_SIZE,
): string {
  const top = cy - ((lines.length - 1) * LABEL_LINE_H) / 2;
  return lines
    .map(
      (line, i) =>
        `<text class="pwr-t" x="${round(x)}" y="${round(top + i * LABEL_LINE_H)}" ` +
        `text-anchor="${anchor}" dominant-baseline="central" ` +
        `font-size="${size}">${esc(line)}</text>`,
    )
    .join("");
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
  // Connectors too: a router that walks around the boxes can reach past the
  // rightmost one, and the frame is decided here, after the layout has already
  // fixed every rect. Measuring only the boxes clips exactly the route that had
  // to go furthest — the one most worth seeing.
  for (const c of diagram.connections) {
    for (const p of c.path ?? []) {
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
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
