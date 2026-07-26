import type { Flowchart, FlowEdge } from "../model/types.js";
import { center, type Point, type Rect } from "../model/geometry.js";
import type { GEdge, Graph } from "./layered/graph.js";

/**
 * Orthogonal edge routing over the laid-out graph. Edges between auto-laid
 * nodes follow their dummy-node chain (giving clean multi-rank routes); edges
 * touching a pinned node (no chain) are routed directly. All segments are axis
 * aligned and clipped to the node borders.
 */
export function routeEdges(chart: Flowchart, graph: Graph): void {
  const rectOf = new Map(chart.nodes.map((n) => [n.id, n.rect]));
  const byOriginal = new Map<FlowEdge, GEdge>();
  for (const ge of graph.edges) byOriginal.set(ge.original, ge);

  for (const e of chart.edges) {
    if (e.from === e.to) {
      routeSelfLoop(e, rectOf.get(e.from));
      continue;
    }
    const ge = byOriginal.get(e);
    if (ge && ge.chain.length >= 2) {
      routeChain(e, ge, chart, graph);
    } else {
      routeDirect(e, rectOf.get(e.from), rectOf.get(e.to));
    }
  }
}

/** Route along a dummy-node chain (chain is in original from -> to order). */
function routeChain(e: FlowEdge, ge: GEdge, chart: Flowchart, graph: Graph): void {
  const rectOf = new Map(chart.nodes.map((n) => [n.id, n.rect]));
  const centers: Point[] = [];
  for (const id of ge.chain) {
    const r = rectOf.get(id);
    if (r) {
      centers.push(center(r));
    } else {
      const dn = graph.nodes.get(id);
      if (dn) centers.push({ x: dn.x, y: dn.y });
    }
  }
  if (centers.length < 2) return;

  const srcRect = rectOf.get(e.from);
  const dstRect = rectOf.get(e.to);
  if (srcRect) centers[0] = borderPoint(srcRect, centers[0]!, centers[1]!);
  if (dstRect) {
    const last = centers.length - 1;
    centers[last] = borderPoint(dstRect, centers[last]!, centers[last - 1]!);
  }

  const path = simplify(orthogonalThrough(centers));
  e.path = path;
  e.labelPos = pathMidpoint(path);
}

/** Direct orthogonal route between two boxes (used for pinned endpoints). */
function routeDirect(e: FlowEdge, a?: Rect, b?: Rect): void {
  if (!a || !b) return;
  const ca = center(a);
  const cb = center(b);
  const start = borderPoint(a, ca, cb);
  const end = borderPoint(b, cb, ca);
  const path = simplify(orthogonalThrough([start, end]));
  e.path = path;
  e.labelPos = pathMidpoint(path);
}

/** A small loop on the right side of the node. */
function routeSelfLoop(e: FlowEdge, r?: Rect): void {
  if (!r) return;
  const right = r.x + r.width;
  const y1 = r.y + r.height * 0.3;
  const y2 = r.y + r.height * 0.7;
  const out = right + 28;
  e.path = [
    { x: right, y: y1 },
    { x: out, y: y1 },
    { x: out, y: y2 },
    { x: right, y: y2 },
  ];
  e.labelPos = { x: out + 6, y: (y1 + y2) / 2 };
}

/** Build an axis-aligned polyline through the given centers, bending on the
 *  dominant axis of each segment (vertical-major → jog in x at mid-y, etc.). */
function orthogonalThrough(points: Point[]): Point[] {
  const out: Point[] = [points[0]!];
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    if (p.x === q.x || p.y === q.y) {
      out.push(q);
      continue;
    }
    if (Math.abs(q.y - p.y) >= Math.abs(q.x - p.x)) {
      const midY = (p.y + q.y) / 2;
      out.push({ x: p.x, y: midY }, { x: q.x, y: midY }, q);
    } else {
      const midX = (p.x + q.x) / 2;
      out.push({ x: midX, y: p.y }, { x: midX, y: q.y }, q);
    }
  }
  return out;
}

/** Drop duplicate and collinear intermediate points. */
function simplify(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) dedup.push(p);
  }
  const out: Point[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const prev = out[out.length - 1];
    const cur = dedup[i]!;
    const next = dedup[i + 1];
    if (prev && next) {
      const collinearX = prev.x === cur.x && cur.x === next.x;
      const collinearY = prev.y === cur.y && cur.y === next.y;
      if (collinearX || collinearY) continue;
    }
    out.push(cur);
  }
  return out;
}

function pathMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    total += dist(points[i]!, points[i + 1]!);
  }
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
