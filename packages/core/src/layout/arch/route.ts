import type { ArchDiagram, Connection } from "../../model/arch.js";
import { center, type Point, type Rect } from "../../model/geometry.js";

const MIN_OVERLAP = 2;

/** Grid the connector jogs snap to, so parallel segments of unrelated edges
 *  line up on shared lanes instead of scattering. */
export const ROUTE_GRID = 16;
const snap = (v: number) => Math.round(v / ROUTE_GRID) * ROUTE_GRID;

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
    const path = simplify(buildPath(w.start, w.end, w.c.fromArrow, w.c.toArrow));
    w.c.path = path;
    w.c.labelPos = midpoint(path);
  }
}

/**
 * How far two centres may disagree and still share one coordinate. Below half a
 * grid step the jog they would otherwise produce is a sub-grid wobble, and a
 * straight line reads better than a barely-visible dogleg.
 */
const STRAIGHT_TOLERANCE = ROUTE_GRID / 2;

/**
 * Where an edge leaves each node when the two face each other.
 *
 * Both ports aim at their **own** node's centre. Aiming instead at the middle of
 * the band where the two rects overlap — which is what this used to do — gives a
 * straight line, but when the overlap is a thin sliver that line attaches
 * nowhere near either centre and reads as a mistake. Two nodes offset by 34px
 * with only 12px of overlap ended up wired 17px off-centre at *both* ends.
 *
 * So: centre on each node, and collapse to a shared coordinate only when the
 * centres nearly agree, which is what keeps aligned nodes on a straight line.
 */
function defaultPorts(a: Rect, b: Rect): { start: Port; end: Port } {
  const ox1 = Math.max(a.x, b.x);
  const ox2 = Math.min(a.x + a.width, b.x + b.width);
  const oy1 = Math.max(a.y, b.y);
  const oy2 = Math.min(a.y + a.height, b.y + b.height);
  const ca = center(a);
  const cb = center(b);

  /** The two ports' free-axis coordinates, merged when they nearly agree. The
   *  clamp keeps the merged value on both sides, however small either node is. */
  const facing = (sa: number, sb: number, lo: number, hi: number): [number, number] => {
    if (Math.abs(sa - sb) > STRAIGHT_TOLERANCE) return [sa, sb];
    const m = Math.min(Math.max((sa + sb) / 2, lo), hi);
    return [m, m];
  };

  if (ox2 - ox1 > MIN_OVERLAP) {
    const [sx, ex] = facing(ca.x, cb.x, ox1, ox2);
    const aAbove = a.y + a.height <= b.y;
    return aAbove
      ? { start: { x: sx, y: a.y + a.height, side: "bottom" }, end: { x: ex, y: b.y, side: "top" } }
      : { start: { x: sx, y: a.y, side: "top" }, end: { x: ex, y: b.y + b.height, side: "bottom" } };
  }
  if (oy2 - oy1 > MIN_OVERLAP) {
    const [sy, ey] = facing(ca.y, cb.y, oy1, oy2);
    const aLeft = a.x + a.width <= b.x;
    return aLeft
      ? { start: { x: a.x + a.width, y: sy, side: "right" }, end: { x: b.x, y: ey, side: "left" } }
      : { start: { x: a.x, y: sy, side: "left" }, end: { x: b.x + b.width, y: ey, side: "right" } };
  }

  // Diagonal: pick the dominant axis and exit/enter perpendicular to it.
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

/**
 * Straight run an arrowhead needs before the path is allowed to turn.
 *
 * The head is drawn as a marker `markerWidth="7"` in `strokeWidth` units, so at
 * the theme's edge width of 1.5 it measures 10.5 user units, and `refX="9"` of a
 * 10-unit viewBox puts 9.45 of that *behind* the endpoint. A shorter final
 * segment than that puts the bend inside the head, and the line visibly meets
 * the arrow from the side instead of running into its tail.
 */
const ARROW_CLEARANCE = 12;
/** Ends without an arrowhead still want to leave the border before turning. */
const PLAIN_CLEARANCE = 4;

/**
 * Where the jog between two ports sits on the axis they are separated along.
 *
 * Snapping to the grid lines parallel edges up, but the corridor between two
 * nodes is often narrower than one grid step — 15px is enough for `snap` to
 * round the lane straight past the far port and into the node. On top of that
 * each end needs room for its arrowhead, so the lane is confined to the stretch
 * that leaves both approaches long enough, and only snapped inside it.
 */
function jogLane(from: number, to: number, fromNeed: number, toNeed: number): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (hi - lo < 1e-6) return lo; // ports already aligned; the path is straight

  const forward = from < to;
  let min = forward ? from + fromNeed : to + toNeed;
  let max = forward ? to - toNeed : from - fromNeed;
  if (min > max) {
    // The corridor cannot satisfy both ends. Split it in proportion to what
    // each asked for, so the end with an arrowhead keeps most of the room.
    // Below roughly 13px of corridor even that is not enough for the head — no
    // orthogonal jog can be, and the answer there is more room between the
    // nodes rather than a cleverer lane.
    const total = fromNeed + toNeed;
    const share = total > 0 ? (forward ? fromNeed : toNeed) / total : 0.5;
    min = max = lo + (hi - lo) * share;
  }
  const snapped = snap((from + to) / 2);
  return Math.min(Math.max(snapped, min), max);
}

/** Orthogonal path between two ports on opposite, same-axis sides. */
function buildPath(start: Port, end: Port, fromArrow: boolean, toArrow: boolean): Point[] {
  const fromNeed = fromArrow ? ARROW_CLEARANCE : PLAIN_CLEARANCE;
  const toNeed = toArrow ? ARROW_CLEARANCE : PLAIN_CLEARANCE;
  if (start.side === "left" || start.side === "right") {
    const midX = jogLane(start.x, end.x, fromNeed, toNeed);
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const midY = jogLane(start.y, end.y, fromNeed, toNeed);
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

/**
 * Coordinates are compared with a tolerance rather than exactly: `spreadPort`
 * divides a side into fractions, so two points that are collinear by
 * construction can differ in the last bits and survive as a sub-pixel zigzag.
 */
const EPSILON = 1e-6;
const same = (a: number, b: number) => Math.abs(a - b) < EPSILON;

function simplify(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || !same(last.x, p.x) || !same(last.y, p.y)) dedup.push({ x: p.x, y: p.y });
  }
  const out: Point[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const prev = out[out.length - 1];
    const cur = dedup[i]!;
    const next = dedup[i + 1];
    if (prev && next) {
      const collinearX = same(prev.x, cur.x) && same(cur.x, next.x);
      const collinearY = same(prev.y, cur.y) && same(cur.y, next.y);
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
