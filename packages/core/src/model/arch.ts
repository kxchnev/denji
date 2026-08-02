import type { Point, Rect } from "./geometry.js";
import type { Icon } from "./icon.js";

/** Leaf shapes available in an architecture diagram. */
export type ShapeKind = "app" | "database" | "queue" | "rect";

/** A container groups shapes; the kind only changes how it is drawn. */
export type ContainerKind = "service" | "group";

/**
 * Everything a theme can paint, and everything a `style <slot> { … }` block can
 * select. Shapes and containers are addressed by their own kind; every
 * connection shares the single `edge` slot.
 */
export type StyleSlot = ShapeKind | ContainerKind | "edge";

export const STYLE_SLOTS: readonly StyleSlot[] = [
  "app",
  "database",
  "queue",
  "rect",
  "service",
  "group",
  "edge",
];

/**
 * "CSS на минималках": the small, fixed set of visual properties a theme, a
 * named style or an inline directive can set. Deliberately not extensible —
 * every property here has a defined meaning on at least one slot, and the
 * renderer knows how to paint all of them.
 *
 * `fontSize` is absent on purpose: `measure.ts` sizes shapes from a fixed
 * `FONT_SIZE`, so text size is an input to *layout*, not to rendering.
 */
export interface StyleProps {
  /** Body fill. On `edge`, the background of the label chip. */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Label colour. On `service`, the body has no label — use `headerText`. */
  text?: string;
  /**
   * Box size. Exact on a shape; a minimum on a container, which still grows to
   * hold its children. Unlike every other property here these two are read by
   * the *layout*, not the renderer.
   */
  width?: number;
  height?: number;
  /** Corner radius. Ignored by the cylinder shapes (`database`, `queue`). */
  radius?: number;
  /** `stroke-dasharray` pattern, e.g. `"6 4"`. */
  dash?: string;
  opacity?: number;
  fontWeight?: string;
  /** Flattens a brand mark to one colour, overriding its own. */
  iconColor?: string;
  /** `service` only: the title band. */
  headerFill?: string;
  /** `service` only: the title text. */
  headerText?: string;
}

/**
 * Named styles declared in one place and referenced by many elements. A key
 * that happens to be a {@link StyleSlot} acts as a selector over every element
 * of that kind instead of as a name.
 *
 * Declaration order here does **not** decide the cascade: when two styles set
 * the same property, the one referenced later *on the element* wins. See
 * {@link Styled.styleRefs}.
 */
export type StyleSheet = Record<string, StyleProps>;

/** The two built-in themes. */
export type ThemeName = "light" | "dark";

/** Style attachments shared by shapes, containers and connections. */
export interface Styled {
  /**
   * Names of styles from the diagram's stylesheet, applied in the order they
   * are listed here — that is, the order they were written on the element, not
   * the order they were declared in the sheet. The last one wins a conflict.
   */
  styleRefs?: string[];
  /** Properties written directly on this element; they beat every named style. */
  styleProps?: StyleProps;
}

/**
 * Relative-only placement. There are no absolute coordinates — a node is
 * positioned against a sibling. One horizontal relation (rightOf/leftOf) sets
 * X, one vertical relation (above/below) sets Y; the single given relation also
 * decides cross-axis alignment to the anchor (`align`, default "center").
 */
export interface PlaceHint {
  rightOf?: string;
  leftOf?: string;
  above?: string;
  below?: string;
  /** Distance (px) to the anchor, replacing the scope's spacing on that axis. */
  gap?: number;
  /** Cross-axis alignment to the anchor when only one axis is constrained. */
  align?: "start" | "center" | "end";
}

/**
 * Default gap between the children of one scope, per axis. Set on the diagram
 * (every scope) or on a container (its own subtree). A node's `hint.gap`
 * overrides it for that node's own relation.
 */
export interface Spacing {
  x?: number;
  y?: number;
}

export interface Shape extends Styled {
  type: "shape";
  id: string;
  label: string;
  kind: ShapeKind;
  /**
   * Name of a bundled or document-declared icon, drawn before the label. A
   * model field rather than a style property because it widens the shape, and
   * layout runs long before styles are resolved.
   */
  icon?: string;
  hint?: PlaceHint;
  /** Filled in by the layout engine. Absent until laid out. */
  rect?: Rect;
}

export interface Container extends Styled {
  type: "container";
  id: string;
  label: string;
  kind: ContainerKind;
  /** Icon drawn before the container's title. */
  icon?: string;
  /** Ids of child nodes (shapes or nested containers). */
  children: string[];
  hint?: PlaceHint;
  /** Spacing between this container's children; inherited by nested scopes. */
  spacing?: Spacing;
  /** Inner padding between this container's border and its children. */
  padding?: number;
  rect?: Rect;
}

export type ArchNode = Shape | Container;

export interface Connection extends Styled {
  from: string;
  to: string;
  label?: string;
  /** Arrowheads are independent per end: directed, undirected, or bidirectional. */
  fromArrow: boolean;
  toArrow: boolean;
  style: "solid" | "dashed";
  /** Filled in by the layout engine. */
  path?: Point[];
  labelPos?: Point;
}

export interface ArchDiagram {
  kind: "architecture";
  nodes: ArchNode[];
  connections: Connection[];
  /** Spacing default for every scope, unless a container overrides it. */
  spacing?: Spacing;
  /** Outer margin around the whole drawing. */
  margin?: number;
  /** Built-in theme the document asks for; beats the renderer's option. */
  theme?: ThemeName;
  /** Named styles and per-kind selectors, in declaration order. */
  styles?: StyleSheet;
  /** Icons declared by the document; they shadow the bundled ones. */
  icons?: Record<string, Icon>;
}
