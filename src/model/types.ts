import type { Point, Rect } from "./geometry.js";

/** Overall flow direction of a flowchart, matching the mermaid mental model. */
export type Direction = "TB" | "BT" | "LR" | "RL";

export type NodeShape =
  | "rect"
  | "round"
  | "stadium"
  | "diamond"
  | "circle"
  | "hexagon";

export type EdgeStyle = "solid" | "dashed" | "thick";
export type ArrowHead = "arrow" | "open" | "none";

/**
 * The heart of the project: how a user overrides auto-layout for a single node.
 * Every field is optional — provide as much or as little control as you want.
 * The layout engine treats these as constraints, not suggestions.
 */
export interface LayoutHint {
  /** Absolute pin. Position is the node CENTER. Pinned nodes never move. */
  pin?: Point;
  /** Place this node immediately to the right of the referenced node id. */
  rightOf?: string;
  leftOf?: string;
  above?: string;
  below?: string;
  /** Force onto the same layout rank (row/column) as the referenced node id. */
  sameRank?: string;
  /** Extra spacing (px) applied to the relative-placement hints above. */
  gap?: number;
}

export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
  hint?: LayoutHint;
  /** Filled in by the layout engine. Absent until laid out. */
  rect?: Rect;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  style: EdgeStyle;
  head: ArrowHead;
  /** Filled in by the layout engine: the polyline the renderer draws. */
  path?: Point[];
  /** Point on `path` where the label is anchored, if any. */
  labelPos?: Point;
}

export interface Flowchart {
  kind: "flowchart";
  direction: Direction;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type Diagram = Flowchart;
