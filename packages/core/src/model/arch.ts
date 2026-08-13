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
 * Where a node goes. Normally relative: positioned against a sibling, with one
 * horizontal relation (rightOf/leftOf) setting X, one vertical relation
 * (above/below) setting Y, and the single given relation also deciding
 * cross-axis alignment to the anchor (`align`, default "center").
 *
 * `at` opts out of all that for this one node — see its own comment. Siblings may
 * still anchor *to* a node placed by `at`, which is what lets a diagram be part
 * dragged-into-place and part relative.
 */
export interface PlaceHint {
  /**
   * Exact position, in the coordinate space of the node's own scope: the parent
   * container's inner area, or the diagram's content box at the top level. Beats
   * every relation on the same node, and the node drops out of the sibling flow
   * entirely — the flow then treats it as an obstacle to route around.
   */
  at?: Point;
  rightOf?: string;
  leftOf?: string;
  above?: string;
  below?: string;
  /** Distance (px) to the anchor, replacing the scope's spacing on that axis. */
  gap?: number;
  /** Cross-axis alignment to the anchor when only one axis is constrained. */
  align?: "start" | "center" | "end";
  /**
   * Soft offset (px, document axes) from wherever the layout puts the node. A
   * preference, not a promise: sibling order, minimum gaps and the node's own
   * layer always win, so a nudge can never create an overlap — unlike `at`, it
   * keeps the node in the automatic arrangement. Dead under `at`, like every
   * other hint.
   */
  nudge?: Point;
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
  /**
   * URL behind the button drawn in this shape's top-right corner. A model field
   * for the same reason `icon` is one, and a stronger one besides: the two
   * interactive viewers read it off the laid-out diagram, and nothing they read
   * comes from the stylesheet. Unlike an icon it costs no space — the button
   * overlays the box rather than widening it.
   */
  link?: string;
  hint?: PlaceHint;
  /** Filled in by the layout engine. Absent until laid out. */
  rect?: Rect;
  /** Filled in by the layout engine. See {@link Container.local}. */
  local?: Point;
}

/** Which corner of a container's inner area a free text is pinned to. */
export type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export const CORNERS: readonly Corner[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];

/**
 * A free line of text pinned to a corner inside a container. It reserves a band
 * of its own — under the title for a top corner, along the bottom edge for a
 * bottom one — so it can never land on top of the children.
 */
export interface ContainerText {
  text: string;
  corner: Corner;
}

export interface Container extends Styled {
  type: "container";
  id: string;
  label: string;
  kind: ContainerKind;
  /** Icon drawn before the container's title. */
  icon?: string;
  /** URL behind the button drawn in the title band. See {@link Shape.link}. */
  link?: string;
  /**
   * Free corner texts. A model field rather than anything style-ish because
   * each one reserves layout space, and layout runs before styles are resolved.
   */
  texts?: ContainerText[];
  /** Ids of child nodes (shapes or nested containers). */
  children: string[];
  hint?: PlaceHint;
  /** Spacing between this container's children; inherited by nested scopes. */
  spacing?: Spacing;
  /** Inner padding between this container's border and its children. */
  padding?: number;
  rect?: Rect;
  /**
   * Filled in by the layout engine: this node's position in the coordinate space
   * its own `hint.at` is written in. For a node that has one it *is* that
   * position; for a node the flow placed it is the `at` that would pin it exactly
   * where it already sits.
   *
   * `rect` cannot answer that question — it is absolute, and every scope is
   * normalized to its own origin — so an editor that turns a drag into source
   * text needs this to have anything to add its delta to.
   */
  local?: Point;
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
  /**
   * Filled in by the layout engine: where the connector meets its boxes, and
   * every corner in between. Two points for a router that draws one curve, more
   * for one that walks a corridor around the boxes.
   */
  path?: Point[];
  /**
   * Cubic control points for `path[0] → path[1]`, filled in by the layout. Each
   * one sits on the outward normal of its dock's side, which is what makes the
   * arrowhead meet the box square on. Absent on a path with corners of its own.
   */
  curve?: { c1: Point; c2: Point };
  /**
   * How wide the corners of a multi-point `path` are rounded. The router owns
   * this rather than the theme: how far a turn may be cut is a fact about the
   * space the route was given, and a corner rounded past its own segment stops
   * touching the points it was routed through.
   */
  radius?: number;
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
  /**
   * Filled in by the layout engine: what it added to every `rect` to get the
   * drawing into the top-left corner of its own box, margin included.
   *
   * Subtract it from a `rect` and you are back in the coordinates the document
   * speaks (`hint.at`, {@link Shape.local}). An interactive viewer needs that: it
   * pans in document coordinates, so that growing the drawing — dragging a node
   * past what used to be its left edge — moves that node instead of sliding
   * everything else out from under the reader.
   */
  originShift?: Point;
}
