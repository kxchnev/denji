import type { GEdge, Graph } from "./graph.js";
import { nextDummyId } from "./graph.js";

const DUMMY_WIDTH = 12;
const SWEEPS = 8;

/**
 * Stage 3: insert dummy waypoints on long edges, then order nodes within each
 * rank to reduce crossings (barycenter sweeps), finally enforce rightOf/leftOf
 * as hard within-rank ordering constraints.
 */
export function orderNodes(graph: Graph): void {
  insertDummies(graph);
  buildRanks(graph);
  const adj = buildAdjacency(graph);

  for (let i = 0; i < SWEEPS; i++) {
    const down = i % 2 === 0;
    sweep(graph, adj, down);
  }

  enforceRelativeOrder(graph);
  syncOrders(graph);
}

/** Replace each multi-rank edge with a chain of dummy nodes, one per crossed rank. */
function insertDummies(graph: Graph): void {
  for (const e of graph.edges) {
    const a = graph.nodes.get(e.from);
    const b = graph.nodes.get(e.to);
    if (!a || !b) continue;

    const ra = a.rank;
    const rb = b.rank;
    const chainDag: string[] = [a.id];

    if (ra !== rb) {
      const step = rb > ra ? 1 : -1;
      for (let r = ra + step; r !== rb; r += step) {
        const id = nextDummyId();
        graph.nodes.set(id, {
          id,
          isDummy: true,
          width: DUMMY_WIDTH,
          height: 0,
          rank: r,
          order: 0,
          x: 0,
          y: 0,
        });
        chainDag.push(id);
      }
    }
    chainDag.push(b.id);

    // Store the chain in original from -> to order for the router.
    e.chain = e.reversed ? [...chainDag].reverse() : chainDag;
  }
}

/** Group node ids by rank in current insertion order; seed node.order. */
function buildRanks(graph: Graph): void {
  let maxRank = 0;
  for (const n of graph.nodes.values()) maxRank = Math.max(maxRank, n.rank);

  const ranks: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of graph.nodes.values()) {
    ranks[n.rank]!.push(n.id);
  }
  graph.ranks = ranks;
  syncOrders(graph);
}

/** Undirected adjacency between consecutive chain links (includes dummies). */
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
      const u = e.chain[i]!;
      const v = e.chain[i + 1]!;
      link(u, v);
      link(v, u);
    }
  }
  return adj;
}

/** One barycenter sweep: reorder each rank by the mean order of its neighbors
 *  in the adjacent rank (previous rank when going down, next when going up). */
function sweep(graph: Graph, adj: Map<string, string[]>, down: boolean): void {
  const ranks = graph.ranks;
  const from = down ? 1 : ranks.length - 2;
  const to = down ? ranks.length : -1;
  const step = down ? 1 : -1;

  for (let r = from; r !== to; r += step) {
    const rank = ranks[r];
    if (!rank) continue;
    const adjacentRank = r - step;
    const bary = new Map<string, number>();
    for (const id of rank) {
      const neighbors = (adj.get(id) ?? []).filter((n) => {
        const nn = graph.nodes.get(n);
        return nn !== undefined && nn.rank === adjacentRank;
      });
      if (neighbors.length === 0) {
        bary.set(id, graph.nodes.get(id)!.order);
      } else {
        const sum = neighbors.reduce((s, n) => s + graph.nodes.get(n)!.order, 0);
        bary.set(id, sum / neighbors.length);
      }
    }
    // Stable sort keeps nodes without neighbors near their current slot.
    const sorted = rank
      .map((id, idx) => ({ id, idx, b: bary.get(id)! }))
      .sort((p, q) => (p.b === q.b ? p.idx - q.idx : p.b - q.b))
      .map((e) => e.id);
    ranks[r] = sorted;
    sorted.forEach((id, idx) => (graph.nodes.get(id)!.order = idx));
  }
}

/**
 * Enforce rightOf/leftOf within a rank as a hard constraint via a stable
 * topological sort that uses the current barycenter order as tie-break priority.
 */
function enforceRelativeOrder(graph: Graph): void {
  const rankOf = (id: string) => graph.nodes.get(id)?.rank;

  for (let r = 0; r < graph.ranks.length; r++) {
    const rank = graph.ranks[r]!;
    const inRank = new Set(rank);
    const before = new Map<string, Set<string>>(); // u -> nodes that must come after u
    const addEdge = (u: string, v: string) => {
      if (!inRank.has(u) || !inRank.has(v)) return;
      let s = before.get(u);
      if (!s) {
        s = new Set();
        before.set(u, s);
      }
      s.add(v);
    };

    for (const id of rank) {
      const h = graph.nodes.get(id)?.node?.hint;
      if (!h) continue;
      // A rightOf B → B before A (only meaningful when both share this rank).
      if (h.rightOf && rankOf(h.rightOf) === r) addEdge(h.rightOf, id);
      if (h.leftOf && rankOf(h.leftOf) === r) addEdge(id, h.leftOf);
    }

    if (before.size === 0) continue;

    const indeg = new Map<string, number>();
    for (const id of rank) indeg.set(id, 0);
    for (const [, outs] of before) {
      for (const v of outs) indeg.set(v, (indeg.get(v) ?? 0) + 1);
    }

    const priority = new Map(rank.map((id, idx) => [id, idx]));
    const available = rank.filter((id) => (indeg.get(id) ?? 0) === 0);
    const result: string[] = [];
    const picked = new Set<string>();

    while (available.length > 0) {
      available.sort((a, b) => priority.get(a)! - priority.get(b)!);
      const next = available.shift()!;
      if (picked.has(next)) continue;
      picked.add(next);
      result.push(next);
      for (const v of before.get(next) ?? []) {
        const d = (indeg.get(v) ?? 0) - 1;
        indeg.set(v, d);
        if (d === 0) available.push(v);
      }
    }
    // Any leftover (constraint cycle) appended in current order.
    for (const id of rank) if (!picked.has(id)) result.push(id);

    graph.ranks[r] = result;
  }
}

/** Re-sync node.order from the ranks arrays. */
function syncOrders(graph: Graph): void {
  for (const rank of graph.ranks) {
    rank.forEach((id, idx) => {
      const n = graph.nodes.get(id);
      if (n) n.order = idx;
    });
  }
}
