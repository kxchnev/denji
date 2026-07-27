import type { ArchDiagram, Connection } from "../../model/arch.js";
import { center, type Point, type Rect } from "../../model/geometry.js";

const MIN_OVERLAP = 2;

type Side = "top" | "bottom" | "left" | "right";
interface Port {
  x: number;
  y: number;
  side: Side;
}
interface Endpoint {
  port: Port;
  /** The node this port sits on (its edge extent for distribution). */
  rect: Rect;
  /** Center coordinate of the OTHER node along the side's free axis — used to
   *  order ports so connections don't cross unnecessarily. */
  sortKey: number;
}

/**
 * Route every connection orthogonally. Endpoints leave/enter perpendicular to a
 * node side; when several connections meet the same side they are distributed
 * along it so their attachment points stay distinct (no merging). Runs after
 * all absolute rects are assigned.
 */
export function routeConnections(diagram: ArchDiagram): void {
  const rectOf = new Map<string, Rect>();
  for (const n of diagram.nodes) if (n.rect) rectOf.set(n.id, n.rect);

  // Pass 1: default ports for every connection.
  interface Wired {
    c: Connection;
    a: Rect;
    b: Rect;
    start: Port;
    end: Port;
  }
  const wired: Wired[] = [];
  // Group endpoints by node+side so we can spread them.
  const groups = new Map<string, Endpoint[]>();
  const groupKey = (rect: Rect, side: Side) =>
    `${rect.x},${rect.y},${rect.width},${rect.height}:${side}`;
  const addToGroup = (rect: Rect, port: Port, other: Rect) => {
    const key = groupKey(rect, port.side);
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    const oc = center(other);
    list.push({ port, rect, sortKey: port.side === "left" || port.side === "right" ? oc.y : oc.x });
  };

  for (const c of diagram.connections) {
    const a = rectOf.get(c.from);
    const b = rectOf.get(c.to);
    if (!a || !b) continue;
    const { start, end } = defaultPorts(a, b);
    wired.push({ c, a, b, start, end });
    addToGroup(a, start, b);
    addToGroup(b, end, a);
  }

  // Pass 2: distribute ports that share a side.
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const side = key.slice(key.lastIndexOf(":") + 1) as Side;
    list.sort((p, q) => p.sortKey - q.sortKey);
    list.forEach((ep, i) => {
      const frac = (i + 1) / (list.length + 1);
      spreadPort(ep.port, ep.rect, side, frac);
    });
  }

  // Pass 3: build paths from the (possibly redistributed) ports.
  for (const w of wired) {
    const path = simplify(buildPath(w.start, w.end));
    w.c.path = path;
    w.c.labelPos = midpoint(path);
  }
}

/** Ports on the two facing sides, at the natural (centered) position. */
function defaultPorts(a: Rect, b: Rect): { start: Port; end: Port } {
  const ox1 = Math.max(a.x, b.x);
  const ox2 = Math.min(a.x + a.width, b.x + b.width);
  const oy1 = Math.max(a.y, b.y);
  const oy2 = Math.min(a.y + a.height, b.y + b.height);

  if (ox2 - ox1 > MIN_OVERLAP) {
    const cx = (ox1 + ox2) / 2;
    const aAbove = a.y + a.height <= b.y;
    return aAbove
      ? { start: { x: cx, y: a.y + a.height, side: "bottom" }, end: { x: cx, y: b.y, side: "top" } }
      : { start: { x: cx, y: a.y, side: "top" }, end: { x: cx, y: b.y + b.height, side: "bottom" } };
  }
  if (oy2 - oy1 > MIN_OVERLAP) {
    const cy = (oy1 + oy2) / 2;
    const aLeft = a.x + a.width <= b.x;
    return aLeft
      ? { start: { x: a.x + a.width, y: cy, side: "right" }, end: { x: b.x, y: cy, side: "left" } }
      : { start: { x: a.x, y: cy, side: "left" }, end: { x: b.x + b.width, y: cy, side: "right" } };
  }

  // Diagonal: pick the dominant axis and exit/enter perpendicular to it.
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      start: { x: dx >= 0 ? a.x + a.width : a.x, y: ca.y, side: dx >= 0 ? "right" : "left" },
      end: { x: dx >= 0 ? b.x : b.x + b.width, y: cb.y, side: dx >= 0 ? "left" : "right" },
    };
  }
  return {
    start: { x: ca.x, y: dy >= 0 ? a.y + a.height : a.y, side: dy >= 0 ? "bottom" : "top" },
    end: { x: cb.x, y: dy >= 0 ? b.y : b.y + b.height, side: dy >= 0 ? "top" : "bottom" },
  };
}

/** Move a port to fraction `frac` along its side's free axis (the fixed
 *  on-edge coordinate is left untouched). */
function spreadPort(port: Port, r: Rect, side: Side, frac: number): void {
  if (side === "left" || side === "right") {
    port.y = r.y + r.height * frac;
  } else {
    port.x = r.x + r.width * frac;
  }
}

/** Orthogonal path between two ports on opposite, same-axis sides. */
function buildPath(start: Port, end: Port): Point[] {
  if (start.side === "left" || start.side === "right") {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function simplify(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) dedup.push({ x: p.x, y: p.y });
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
