import type { ArchDiagram } from "../../model/arch.js";
import { center, type Point, type Rect } from "../../model/geometry.js";

/**
 * Route every connection as an orthogonal L between the two nodes' borders.
 * Endpoints may be shapes or containers (any node with a rect). Runs after all
 * absolute rects are assigned.
 */
export function routeConnections(diagram: ArchDiagram): void {
  const rectOf = new Map<string, Rect>();
  for (const n of diagram.nodes) if (n.rect) rectOf.set(n.id, n.rect);

  for (const c of diagram.connections) {
    const a = rectOf.get(c.from);
    const b = rectOf.get(c.to);
    if (!a || !b) continue;
    const ca = center(a);
    const cb = center(b);
    const start = borderPoint(a, ca, cb);
    const end = borderPoint(b, cb, ca);
    const path = simplify(orthogonal(start, end));
    c.path = path;
    c.labelPos = midpoint(path);
  }
}

/** Axis-aligned connector between two points, bending on the dominant axis. */
function orthogonal(p: Point, q: Point): Point[] {
  if (p.x === q.x || p.y === q.y) return [p, q];
  if (Math.abs(q.y - p.y) >= Math.abs(q.x - p.x)) {
    const midY = (p.y + q.y) / 2;
    return [p, { x: p.x, y: midY }, { x: q.x, y: midY }, q];
  }
  const midX = (p.x + q.x) / 2;
  return [p, { x: midX, y: p.y }, { x: midX, y: q.y }, q];
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

function midpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) total += dist(points[i]!, points[i + 1]!);
  let target = total / 2;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const d = dist(a, b);
    if (target <= d) {
      const t = d === 0 ? 0 : target / d;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= d;
  }
  return points[points.length - 1]!;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Point where the segment from `from` toward `to` crosses `rect`'s border. */
export function borderPoint(rect: Rect, from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}
