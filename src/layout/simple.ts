import type { Flowchart } from "../model/types.js";
import { rectFromCenter, type Point } from "../model/geometry.js";
import { measureNode } from "./measure.js";
import { routeEdges } from "./route.js";

/**
 * M1 placeholder layout. It proves the pipeline end-to-end and already honors
 * absolute pins, so `hint.pin` works today. Non-pinned nodes are stacked along
 * the flow direction in declaration order.
 *
 * M2 replaces the "stack" fallback with a real layered (dagre-style) engine
 * that also resolves rightOf/below/sameRank hints — but pins will keep working
 * exactly as they do here.
 */
export interface LayoutOptions {
  nodeGap?: number;
  rankGap?: number;
  margin?: number;
}

export function layoutFlowchart(chart: Flowchart, opts: LayoutOptions = {}): Flowchart {
  const nodeGap = opts.nodeGap ?? 40;
  const rankGap = opts.rankGap ?? 70;

  const horizontal = chart.direction === "LR" || chart.direction === "RL";
  const forward =
    chart.direction === "TB" || chart.direction === "LR" ? 1 : -1;

  // Cursor advances along the flow axis for un-pinned nodes.
  let cursorMain = 0;
  const crossCenter = 0;

  for (const node of chart.nodes) {
    const size = measureNode(node);
    let c: Point;

    if (node.hint?.pin) {
      c = node.hint.pin;
    } else {
      const half = (horizontal ? size.width : size.height) / 2;
      cursorMain += forward * half;
      const main = cursorMain;
      cursorMain += forward * (half + (horizontal ? rankGap : rankGap));
      c = horizontal
        ? { x: main, y: crossCenter }
        : { x: crossCenter, y: main };
      void nodeGap;
    }
    node.rect = rectFromCenter(c, size);
  }

  normalizeToOrigin(chart, opts.margin ?? 24);
  routeEdges(chart);
  return chart;
}

/** Shift every node so the whole drawing sits in the positive quadrant. */
function normalizeToOrigin(chart: Flowchart, margin: number): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const n of chart.nodes) {
    if (!n.rect) continue;
    minX = Math.min(minX, n.rect.x);
    minY = Math.min(minY, n.rect.y);
  }
  if (!isFinite(minX)) return;
  const dx = margin - minX;
  const dy = margin - minY;
  for (const n of chart.nodes) {
    if (!n.rect) continue;
    n.rect.x += dx;
    n.rect.y += dy;
  }
}
