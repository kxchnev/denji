import type { Flowchart } from "../../model/types.js";
import { rectFromCenter } from "../../model/geometry.js";
import { measureNode } from "../measure.js";
import { routeEdges } from "../route.js";
import { buildGraph, resetDummyIds, type Graph } from "./graph.js";
import { assignRanks } from "./rank.js";
import { orderNodes } from "./order.js";
import { assignPositions } from "./position.js";

export interface LayoutOptions {
  /** Horizontal spacing between neighbors in a rank. */
  nodeGap?: number;
  /** Spacing between ranks (layers). */
  rankGap?: number;
  /** Outer margin around the whole drawing. */
  margin?: number;
}

/**
 * Layered (Sugiyama/dagre-style) layout for a flowchart. Ranks nodes into
 * layers, minimizes crossings, assigns coordinates, and routes edges. Layout
 * hints act as constraints; pins are an escape hatch (placed absolutely and
 * excluded from the auto-flow). Mutates and returns the chart.
 */
export function layoutFlowchart(chart: Flowchart, opts: LayoutOptions = {}): Flowchart {
  resetDummyIds();
  const nodeGap = opts.nodeGap ?? 40;
  const rankGap = opts.rankGap ?? 70;
  const margin = opts.margin ?? 24;

  const { graph } = buildGraph(chart);

  if (graph.nodes.size > 0) {
    assignRanks(chart, graph);
    orderNodes(graph);
    assignPositions(graph, chart.direction, { nodeGap, rankGap });
  }

  // Write rects onto auto-laid real nodes.
  for (const gn of graph.nodes.values()) {
    if (gn.isDummy || !gn.node) continue;
    gn.node.rect = rectFromCenter({ x: gn.x, y: gn.y }, { width: gn.width, height: gn.height });
  }

  // Overlay pinned nodes at their absolute center (escape hatch).
  for (const n of chart.nodes) {
    if (n.hint?.pin) {
      n.rect = rectFromCenter(n.hint.pin, measureNode(n));
    }
  }

  normalizeToOrigin(chart, graph, margin);
  routeEdges(chart, graph);
  return chart;
}

/**
 * Bring the auto-laid cluster (real un-pinned nodes + dummy waypoints) to the
 * `margin` origin, keeping nodes and dummies in lock step so the router's chain
 * points stay consistent. Pinned nodes are absolute and are left where the user
 * put them — only a pathological negative coordinate triggers a uniform shift
 * of everything so nothing renders off-canvas.
 */
function normalizeToOrigin(chart: Flowchart, graph: Graph, margin: number): void {
  const shiftAuto = (dx: number, dy: number) => {
    for (const n of chart.nodes) {
      if (n.hint?.pin || !n.rect) continue;
      n.rect.x += dx;
      n.rect.y += dy;
    }
    for (const gn of graph.nodes.values()) {
      gn.x += dx;
      gn.y += dy;
    }
  };
  const shiftAll = (dx: number, dy: number) => {
    for (const n of chart.nodes) {
      if (n.rect) {
        n.rect.x += dx;
        n.rect.y += dy;
      }
    }
    for (const gn of graph.nodes.values()) {
      gn.x += dx;
      gn.y += dy;
    }
  };

  // Phase A: align the auto cluster to the margin.
  let minX = Infinity;
  let minY = Infinity;
  for (const n of chart.nodes) {
    if (n.hint?.pin || !n.rect) continue;
    minX = Math.min(minX, n.rect.x);
    minY = Math.min(minY, n.rect.y);
  }
  for (const gn of graph.nodes.values()) {
    if (!gn.isDummy) continue;
    minX = Math.min(minX, gn.x);
    minY = Math.min(minY, gn.y);
  }
  if (isFinite(minX) && isFinite(minY)) shiftAuto(margin - minX, margin - minY);

  // Phase B: if a pin (or anything) still sits before the margin, nudge all.
  let gMinX = Infinity;
  let gMinY = Infinity;
  for (const n of chart.nodes) {
    if (!n.rect) continue;
    gMinX = Math.min(gMinX, n.rect.x);
    gMinY = Math.min(gMinY, n.rect.y);
  }
  if (isFinite(gMinX) && isFinite(gMinY)) {
    const dx = gMinX < margin ? margin - gMinX : 0;
    const dy = gMinY < margin ? margin - gMinY : 0;
    if (dx !== 0 || dy !== 0) shiftAll(dx, dy);
  }
}
