import type { Point, Rect } from "./geometry.js";

/** Leaf shapes available in an architecture diagram. */
export type ShapeKind = "app" | "database" | "queue" | "rect";

/** A container groups shapes; the kind only changes how it is drawn. */
export type ContainerKind = "service" | "group";

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

export interface Shape {
  type: "shape";
  id: string;
  label: string;
  kind: ShapeKind;
  hint?: PlaceHint;
  /** Filled in by the layout engine. Absent until laid out. */
  rect?: Rect;
}

export interface Container {
  type: "container";
  id: string;
  label: string;
  kind: ContainerKind;
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

export interface Connection {
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
}
