import type { Flowchart, FlowEdge, FlowNode } from "../../model/types.js";
import { measureNode } from "../measure.js";

/**
 * Internal node in the layered graph. Real nodes carry a `node` back-reference;
 * dummy nodes (isDummy) are the waypoints inserted on edges that span more than
 * one rank — they reserve horizontal space and give the router bend points.
 *
 * Coordinates are CANONICAL: `y` is the rank axis growing downward, `x` is the
 * cross axis. `position.ts` transforms these into final space per direction.
 */
export interface GNode {
  id: string;
  isDummy: boolean;
  node?: FlowNode;
  width: number;
  height: number;
  rank: number;
  order: number;
  x: number;
  y: number;
}

export interface GEdge {
  /** Current source/target after cycle removal (may be flipped from original). */
  from: string;
  to: string;
  reversed: boolean;
  original: FlowEdge;
  /**
   * Full ordered chain of node ids the edge passes through, in ORIGINAL
   * from -> to order, including both endpoints and any dummy waypoints.
   * Filled once dummies are inserted (order.ts).
   */
  chain: string[];
}

export interface Graph {
  nodes: Map<string, GNode>;
  edges: GEdge[];
  /** ranks[r] = ordered list of node ids at rank r. Filled by order.ts. */
  ranks: string[][];
}

/**
 * Build the layered graph from a flowchart, excluding pinned nodes (escape
 * hatch — they are overlaid later and take no part in the layered stages).
 * Edges with a pinned endpoint are also excluded here and routed separately.
 */
export function buildGraph(chart: Flowchart): {
  graph: Graph;
  pinnedIds: Set<string>;
  pinEdges: FlowEdge[];
} {
  const pinnedIds = new Set<string>();
  for (const n of chart.nodes) {
    if (n.hint?.pin) pinnedIds.add(n.id);
  }

  const nodes = new Map<string, GNode>();
  for (const n of chart.nodes) {
    if (pinnedIds.has(n.id)) continue;
    const size = measureNode(n);
    nodes.set(n.id, {
      id: n.id,
      isDummy: false,
      node: n,
      width: size.width,
      height: size.height,
      rank: 0,
      order: 0,
      x: 0,
      y: 0,
    });
  }

  const edges: GEdge[] = [];
  const pinEdges: FlowEdge[] = [];
  for (const e of chart.edges) {
    if (pinnedIds.has(e.from) || pinnedIds.has(e.to)) {
      pinEdges.push(e);
      continue;
    }
    // Ignore self-loops for layout purposes (routed as a small side loop later).
    if (e.from === e.to) {
      pinEdges.push(e);
      continue;
    }
    edges.push({
      from: e.from,
      to: e.to,
      reversed: false,
      original: e,
      chain: [],
    });
  }

  return { graph: { nodes, edges, ranks: [] }, pinnedIds, pinEdges };
}

let dummyCounter = 0;
/** Deterministic dummy id — counter is reset at the start of each layout run. */
export function resetDummyIds(): void {
  dummyCounter = 0;
}
export function nextDummyId(): string {
  return `__dummy_${dummyCounter++}`;
}

/** Classic union-find for `sameRank` grouping. */
export class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    let root = this.parent.get(x);
    if (root === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (root !== x) {
      root = this.find(root);
      this.parent.set(x, root);
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}
