import type { Direction } from "../../model/types.js";
import type { Graph, GNode } from "./graph.js";

export interface PositionOptions {
  nodeGap: number;
  rankGap: number;
}

/**
 * Stage 4: assign canonical coordinates (x = cross axis, y = rank axis growing
 * down), then flip/swap them into final space for the requested direction.
 * `index.ts` normalizes the result to the origin afterward.
 */
export function assignPositions(
  graph: Graph,
  direction: Direction,
  opts: PositionOptions,
): void {
  assignY(graph, opts.rankGap);
  assignX(graph, opts.nodeGap);
  transform(graph, direction);
}

/** Rank axis: stack ranks by their tallest node plus the rank gap. */
function assignY(graph: Graph, rankGap: number): void {
  const heights = graph.ranks.map((rank) =>
    rank.reduce((h, id) => Math.max(h, graph.nodes.get(id)?.height ?? 0), 0),
  );
  let y = 0;
  const centers: number[] = [];
  for (let r = 0; r < heights.length; r++) {
    const h = heights[r]!;
    y += h / 2;
    centers[r] = y;
    y += h / 2 + rankGap;
  }
  for (const n of graph.nodes.values()) {
    n.y = centers[n.rank] ?? 0;
  }
}

/** Cross axis: initial packing, then barycenter alignment sweeps with overlap
 *  removal that preserves order and re-centers each rank to limit drift. */
function assignX(graph: Graph, nodeGap: number): void {
  const gapOf = (n: GNode) => n.node?.hint?.gap ?? 0;
  const minSep = (left: GNode, right: GNode) =>
    left.width / 2 + right.width / 2 + nodeGap + gapOf(left) + gapOf(right);

  // Initial packing: each rank laid out left-to-right, centered on 0.
  for (const rank of graph.ranks) {
    const nodes = rank.map((id) => graph.nodes.get(id)!).filter(Boolean);
    let x = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (i > 0) x += minSep(nodes[i - 1]!, n);
      n.x = x;
    }
    recenter(nodes);
  }

  const adj = buildAdjacency(graph);
  const SWEEPS = 6;
  for (let s = 0; s < SWEEPS; s++) {
    const down = s % 2 === 0;
    const order = down
      ? range(1, graph.ranks.length)
      : range(graph.ranks.length - 2, -1);
    for (const r of order) {
      alignRank(graph, adj, r, r - (down ? 1 : -1), minSep);
    }
  }
}

/** Pull each node toward the mean x of its neighbors in the adjacent rank,
 *  then remove overlaps left-to-right and recenter the rank. */
function alignRank(
  graph: Graph,
  adj: Map<string, string[]>,
  r: number,
  adjacentRank: number,
  minSep: (a: GNode, b: GNode) => number,
): void {
  const rank = graph.ranks[r];
  if (!rank) return;
  const nodes = rank.map((id) => graph.nodes.get(id)!).filter(Boolean);
  if (nodes.length === 0) return;

  const desired = nodes.map((n) => {
    const neighbors = (adj.get(n.id) ?? [])
      .map((id) => graph.nodes.get(id))
      .filter((nn): nn is GNode => nn !== undefined && nn.rank === adjacentRank);
    if (neighbors.length === 0) return n.x;
    return neighbors.reduce((s, nn) => s + nn.x, 0) / neighbors.length;
  });

  // Left-to-right: honor desired but never violate separation.
  let x = desired[0]!;
  nodes[0]!.x = x;
  for (let i = 1; i < nodes.length; i++) {
    x = Math.max(desired[i]!, x + minSep(nodes[i - 1]!, nodes[i]!));
    nodes[i]!.x = x;
  }
  // Recenter to the mean of desired so the rank doesn't drift right each sweep.
  const meanDesired = desired.reduce((s, d) => s + d, 0) / desired.length;
  const meanActual = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const shift = meanDesired - meanActual;
  for (const n of nodes) n.x += shift;
}

function recenter(nodes: GNode[]): void {
  if (nodes.length === 0) return;
  const mean = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  for (const n of nodes) n.x -= mean;
}

function buildAdjacency(graph: Graph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const link = (u: string, v: string) => {
    let a = adj.get(u);
    if (!a) {
      a = [];
      adj.set(u, a);
    }
    a.push(v);
  };
  for (const e of graph.edges) {
    for (let i = 0; i + 1 < e.chain.length; i++) {
      link(e.chain[i]!, e.chain[i + 1]!);
      link(e.chain[i + 1]!, e.chain[i]!);
    }
  }
  return adj;
}

/** Flip/swap canonical (x, y) into final space for the requested direction.
 *  Sign flips are fine here — index.ts normalizes to a positive origin after. */
function transform(graph: Graph, direction: Direction): void {
  for (const n of graph.nodes.values()) {
    const cx = n.x;
    const cy = n.y;
    switch (direction) {
      case "TB":
        n.x = cx;
        n.y = cy;
        break;
      case "BT":
        n.x = cx;
        n.y = -cy;
        break;
      case "LR":
        n.x = cy;
        n.y = cx;
        break;
      case "RL":
        n.x = -cy;
        n.y = cx;
        break;
    }
  }
}

function range(start: number, end: number): number[] {
  const step = end > start ? 1 : -1;
  const out: number[] = [];
  for (let i = start; i !== end; i += step) out.push(i);
  return out;
}
