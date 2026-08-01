import { STYLE_SLOTS, type StyleProps, type StyleSheet, type StyleSlot } from "./arch.js";

/** How a property's value is validated, and what the renderer does with it. */
export type StyleValueKind = "color" | "size" | "unit" | "dash" | "weight";

/**
 * How the renderer gets a property into the output.
 *
 * - `var` — a CSS declaration reading `--pwr-<slot>-<cssVar>`, so the theme can
 *   switch it.
 * - `literal` — a CSS declaration written out in full. For `stroke-dasharray`,
 *   which librsvg drops entirely if it contains `var()`.
 * - `geometry` — never CSS. Resolved in JS and written as an attribute, or, for
 *   `width`/`height`, consumed by the layout before rendering starts.
 */
export type StyleEmit = "var" | "literal" | "geometry";

export interface StylePropSpec {
  /** Canonical camelCase key on {@link StyleProps}. */
  key: keyof StyleProps;
  kind: StyleValueKind;
  /** Slots the property means anything on. */
  slots: readonly StyleSlot[];
  emit: StyleEmit;
  /** CSS custom-property suffix: `--pwr-<slot>-<suffix>`. Only for `emit: "var"`. */
  cssVar: string;
  /** Shown by the docs autocomplete. */
  detail: string;
}

/** Slots that have a box: everything but a connection. */
const BOXES: readonly StyleSlot[] = ["app", "database", "queue", "rect", "service", "group"];

const SHAPES: readonly StyleSlot[] = ["app", "database", "queue", "rect"];
const LABELLED: readonly StyleSlot[] = [...SHAPES, "group", "edge"];

/**
 * The whole property vocabulary. Exported so the docs' tokenizer and
 * autocomplete can read it instead of re-declaring the grammar — the one
 * duplication CLAUDE.md warns about.
 */
export const STYLE_PROPS: Readonly<Record<string, StylePropSpec>> = {
  fill: {
    emit: "var",
    key: "fill",
    kind: "color",
    slots: STYLE_SLOTS,
    cssVar: "fill",
    detail: "Заливка тела; у связи — фон плашки с меткой",
  },
  stroke: { key: "stroke", kind: "color", slots: STYLE_SLOTS, emit: "var", cssVar: "stroke", detail: "Цвет обводки" },
  strokewidth: {
    emit: "var",
    key: "strokeWidth",
    kind: "size",
    slots: STYLE_SLOTS,
    cssVar: "sw",
    detail: "Толщина обводки",
  },
  text: { key: "text", kind: "color", slots: LABELLED, emit: "var", cssVar: "text", detail: "Цвет подписи" },
  width: {
    key: "width",
    kind: "size",
    slots: BOXES,
    emit: "geometry",
    cssVar: "",
    detail: "Ширина: у фигуры точная, у контейнера минимальная",
  },
  height: {
    key: "height",
    kind: "size",
    slots: BOXES,
    emit: "geometry",
    cssVar: "",
    detail: "Высота: у фигуры точная, у контейнера минимальная",
  },
  radius: {
    emit: "geometry",
    key: "radius",
    kind: "size",
    slots: ["app", "rect", "service", "group"],
    cssVar: "radius",
    detail: "Радиус скругления (цилиндры игнорируют)",
  },
  dash: {
    emit: "literal",
    key: "dash",
    kind: "dash",
    slots: STYLE_SLOTS,
    cssVar: "dash",
    detail: "Пунктир, например 6 4",
  },
  opacity: { key: "opacity", kind: "unit", slots: STYLE_SLOTS, emit: "var", cssVar: "opacity", detail: "Прозрачность 0..1" },
  fontweight: {
    emit: "var",
    key: "fontWeight",
    kind: "weight",
    slots: LABELLED,
    cssVar: "fw",
    detail: "Насыщенность подписи",
  },
  headerfill: {
    emit: "var",
    key: "headerFill",
    kind: "color",
    slots: ["service"],
    cssVar: "header-fill",
    detail: "service: заливка полосы заголовка",
  },
  iconcolor: {
    emit: "var",
    key: "iconColor",
    kind: "color",
    slots: [...SHAPES, "service", "group"],
    cssVar: "ic",
    detail: "Перекрасить иконку в один цвет вместо фирменного",
  },
  headertext: {
    emit: "var",
    key: "headerText",
    kind: "color",
    slots: ["service"],
    cssVar: "header-text",
    detail: "service: цвет текста заголовка",
  },
};

/**
 * `stroke-width`, `strokeWidth` and `strokewidth` are the same property: block
 * syntax reads best in kebab-case, directives match the existing camelCase
 * `@spacingX`, and the core already lower-cases directive names.
 */
export function normalizePropName(raw: string): string {
  return raw.toLowerCase().replace(/[-_]/g, "");
}

export function lookupProp(raw: string): StylePropSpec | undefined {
  return STYLE_PROPS[normalizePropName(raw)];
}

export function isStyleSlot(name: string): name is StyleSlot {
  return (STYLE_SLOTS as readonly string[]).includes(name);
}

/**
 * Values are written verbatim into the SVG's `<style>` element, where XML
 * escaping does nothing — `fill: red}</style><script>` would break out. So the
 * grammar is an allowlist of shapes we understand, never an escape pass.
 */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NAMED = /^[a-z]+$/i;
const FUNCTIONAL = /^(?:rgb|rgba|hsl|hsla)\([0-9a-z.,%/ +-]*\)$/i;
const DASH = /^[0-9]+(?:\.[0-9]+)?(?:[ ,]+[0-9]+(?:\.[0-9]+)?)*$/;
const WEIGHT = /^(?:normal|bold|lighter|bolder|[1-9]00)$/;

/** Thrown by the validators; the parser turns it into a DiagramParseError. */
export class StyleValueError extends Error {}

export function validateStyleValue(spec: StylePropSpec, raw: string): string | number {
  const v = raw.trim();
  if (v === "") throw new StyleValueError(`${spec.key} expects a value`);

  switch (spec.kind) {
    case "color":
      if (!HEX.test(v) && !NAMED.test(v) && !FUNCTIONAL.test(v)) {
        throw new StyleValueError(
          `${spec.key} expects a colour (#rgb, #rrggbb, a CSS colour name, or rgb()/hsl())`,
        );
      }
      return v;
    case "size": {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new StyleValueError(`${spec.key} expects a number >= 0`);
      return n;
    }
    case "unit": {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new StyleValueError(`${spec.key} expects a number between 0 and 1`);
      }
      return n;
    }
    case "dash":
      if (!DASH.test(v)) throw new StyleValueError(`${spec.key} expects numbers, e.g. "6 4"`);
      return v;
    case "weight":
      if (!WEIGHT.test(v)) throw new StyleValueError(`${spec.key} expects normal, bold or 100..900`);
      return v;
  }
}

/** Parse and type-check one `name: value` pair onto a style bag. */
export function setStyleProp(
  target: StyleProps,
  rawName: string,
  rawValue: string,
  slot?: StyleSlot,
): void {
  const spec = lookupProp(rawName);
  if (!spec) throw new StyleValueError(`unknown style property "${rawName}"`);
  // Only checked where the element kind is known: a type selector, or an inline
  // directive. A named style may carry properties that some of its users ignore
  // — that is how CSS classes behave.
  if (slot && !spec.slots.includes(slot)) {
    throw new StyleValueError(`${spec.key} does not apply to ${slot}`);
  }
  (target as Record<string, unknown>)[spec.key] = validateStyleValue(spec, rawValue);
}

/**
 * Resolve the cascade for one element: kind selector, then each named style in
 * declaration order, then what is written on the element.
 *
 * Shared by the layout and the renderer. The layout needs it because `width`
 * and `height` decide a box's size, and sizing happens long before any paint —
 * so this has to be a plain function of the document, with no renderer state.
 */
export function resolveStyle(
  sheet: StyleSheet | undefined,
  slot: StyleSlot,
  refs: readonly string[] | undefined,
  own: StyleProps | undefined,
): StyleProps {
  if (!sheet && !own && !refs?.length) return {};
  const layers: Array<StyleProps | undefined> = [sheet?.[slot]];
  for (const ref of refs ?? []) layers.push(sheet?.[ref]);
  layers.push(own);
  return mergeStyle(...layers);
}

/** Later arguments win, per-property. */
export function mergeStyle(...layers: Array<StyleProps | undefined>): StyleProps {
  const out: StyleProps = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}
