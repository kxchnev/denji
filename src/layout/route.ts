import type { Flowchart } from "../model/types.js";
import { center, type Point, type Rect } from "../model/geometry.js";

/**
 * M1 routing: straight center-to-center segments, clipped to each node's
 * rectangular border so the arrow touches the box edge rather than its middle.
 * M2 will add orthogonal routing and obstacle avoidance.
 */
export function routeEdges(chart: Flowchart): void {
  const byId = new Map(chart.nodes.map((n) => [n.id, n]));
  for (const e of chart.edges) {
    const a = byId.get(e.from)?.rect;
    const b = byId.get(e.to)?.rect;
    if (!a || !b) continue;
    const ca = center(a);
    const cb = center(b);
    const start = borderPoint(a, ca, cb);
    const end = borderPoint(b, cb, ca);
    e.path = [start, end];
    e.labelPos = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }
}

/** Point where the segment from `from` toward `to` crosses `rect`'s border. */
function borderPoint(rect: Rect, from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return from;

  const hw = rect.width / 2;
  const hh = rect.height / 2;
  // Scale factor to hit a vertical vs horizontal edge; take the nearer one.
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}
