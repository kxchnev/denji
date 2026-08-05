import type { ArchDiagram, Connection } from "../../model/arch.js";
import { center, type Point, type Rect } from "../../model/geometry.js";

/** Which edge of a box a connector meets. */
export type Side = "top" | "bottom" | "left" | "right";

/**
 * Connectors are single cubic curves that leave and enter perpendicular to a box
 * side. The shape follows from three numbers, all tuned against a real diagram
 * (`~/Diagrams/data-platform.pwr`) while three orthogonal routers were being
 * measured and rejected: a jogging router bent the arrowhead or ran along a box
 * border in more than half of the random arrangements a fuzz harness produced,
 * whereas the tangent of a cubic at its endpoint *is* the side normal, so the
 * arrowhead is perpendicular by construction and there is no bend to hide it in.
 */
/** Distance between two connectors sharing one side. */
export const DOCK_PITCH = 16;
/** How close to a corner a dock may sit. */
export const DOCK_INSET = 10;
/** Shortest control-point reach; below this a curve reads as a kinked line. */
export const MIN_PULL = 24;
/** Longest reach, so a long connector does not balloon. */
export const MAX_PULL = 120;
/** Reach as a share of the distance between the two docks. */
export const PULL_RATIO = 0.4;

/** Rects must share more than this on an axis to count as facing each other. */
const MIN_OVERLAP = 2;
/**
 * How far two centres may disagree and still share one coordinate. Merging them
 * is what keeps an aligned pair on a straight line; the dock moves by at most
 * this much, so it stays in the middle of its side.
 */
const STRAIGHT_TOLERANCE = 8;
/** Docks never sit closer together than this, however short the side. */
const MIN_PITCH = 6;

/** A connector end: an edge of a box plus the coordinate along that edge. */
interface Dock {
  side: Side;
  /** y on left/right, x on top/bottom. */
  at: number;
}

interface End {
  dock: Dock;
  rect: Rect;
  /** The box at the other end — decides the dock's order within a crowded side. */
  other: Rect;
  /** Declaration order, so every sort has a tiebreak and stays deterministic. */
  index: number;
}

const horizontal = (s: Side): boolean => s === "left" || s === "right";
const flip = (s: Side): Side =>
  s === "left" ? "right" : s === "right" ? "left" : s === "top" ? "bottom" : "top";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Outward unit normal of a side — the direction a connector leaves in. */
export function sideNormal(side: Side): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

/** The span a dock may occupy on its side: `[min, max]` of the free axis. */
function sideSpan(rect: Rect, side: Side): { min: number; max: number } {
  return horizontal(side)
    ? { min: rect.y, max: rect.y + rect.height }
    : { min: rect.x, max: rect.x + rect.width };
}

/** A dock's absolute position. */
export function dockPoint(rect: Rect, dock: Dock): Point {
  const { min, max } = sideSpan(rect, dock.side);
  const at = clamp(dock.at, min, max);
  switch (dock.side) {
    case "left":
      return { x: rect.x, y: at };
    case "right":
      return { x: rect.x + rect.width, y: at };
    case "top":
      return { x: at, y: rect.y };
    default:
      return { x: at, y: rect.y + rect.height };
  }
}

/** A point on the cubic `a → b` with controls `c1`, `c2`. */
export function cubicAt(a: Point, c1: Point, c2: Point, b: Point, t: number): Point {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
  };
}

/**
 * Which sides a connector leaves and arrives on, and where on them.
 *
 * Boxes that face each other across an axis dock across that axis; boxes that
 * overlap on neither dock on the pair of sides pointing most directly at each
 * other. Both docks aim at their **own** box's centre: aiming at the middle of
 * the overlap band instead — which an earlier router did — attaches a connector
 * nowhere near either centre when the overlap is a thin sliver, and reads as a
 * mistake.
 */
function dockPair(a: Rect, b: Rect): { from: Dock; to: Dock } {
  const ox1 = Math.max(a.x, b.x);
  const ox2 = Math.min(a.x + a.width, b.x + b.width);
  const oy1 = Math.max(a.y, b.y);
  const oy2 = Math.min(a.y + a.height, b.y + b.height);
  const ca = center(a);
  const cb = center(b);

  /** Two docks' free-axis coordinates, merged when they nearly agree. */
  const facing = (sa: number, sb: number, lo: number, hi: number): [number, number] => {
    if (Math.abs(sa - sb) > STRAIGHT_TOLERANCE) return [sa, sb];
    const m = clamp((sa + sb) / 2, lo, hi);
    return [m, m];
  };

  if (ox2 - ox1 > MIN_OVERLAP) {
    const [sx, ex] = facing(ca.x, cb.x, ox1, ox2);
    const from: Side = a.y + a.height <= b.y ? "bottom" : "top";
    return { from: { side: from, at: sx }, to: { side: flip(from), at: ex } };
  }
  if (oy2 - oy1 > MIN_OVERLAP) {
    const [sy, ey] = facing(ca.y, cb.y, oy1, oy2);
    const from: Side = a.x + a.width <= b.x ? "right" : "left";
    return { from: { side: from, at: sy }, to: { side: flip(from), at: ey } };
  }

  // Diagonal: leave along the dominant axis, arrive across the other one.
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const from: Side = dx >= 0 ? "right" : "left";
    return { from: { side: from, at: ca.y }, to: { side: flip(from), at: cb.y } };
  }
  const from: Side = dy >= 0 ? "bottom" : "top";
  return { from: { side: from, at: ca.x }, to: { side: flip(from), at: cb.x } };
}

/** How many docks a side has room for at the pitch. */
function capacityOf(rect: Rect, side: Side): number {
  const { min, max } = sideSpan(rect, side);
  return Math.max(1, Math.floor((max - min - DOCK_INSET * 2) / DOCK_PITCH));
}

/** Where a connector goes when its side is full: the perpendicular side that
 *  also points at the other box. */
function spillTo(side: Side, own: Rect, other: Rect): Side {
  const d = { x: center(other).x - center(own).x, y: center(other).y - center(own).y };
  return horizontal(side) ? (d.y >= 0 ? "bottom" : "top") : d.x >= 0 ? "right" : "left";
}

/**
 * Where on `side` a connector that spilled onto it should sit: the middle.
 *
 * Projecting the other box's centre onto the side instead — which this did at
 * first — puts the dock wherever that box happens to be, and for anything far
 * away that is hard against the corner inset. An arrow leaving a corner reads as a
 * misplaced arrow, not as a hint about direction; the curve's control points
 * already carry the direction. Two connectors that land on the same side are
 * spread, and ordered by where they are going, by the fan-out pass below.
 */
function sideMiddle(own: Rect, side: Side): number {
  const { min, max } = sideSpan(own, side);
  return min + (max - min) / 2;
}

/** Order within a crowded side: by where the other box sits along that side. */
function orderKey(end: End): number {
  const c = center(end.other);
  return horizontal(end.dock.side) ? c.y : c.x;
}

/**
 * Give every connection its curve: two docks on the boxes' borders and the two
 * control points that make the curve leave and enter perpendicular to them.
 * Mutates the connections; runs once the rects are final.
 */
export function curveConnections(diagram: ArchDiagram): void {
  const rectOf = new Map<string, Rect>();
  for (const n of diagram.nodes) if (n.rect) rectOf.set(n.id, n.rect);

  interface Wired {
    c: Connection;
    a: Rect;
    b: Rect;
    from: Dock;
    to: Dock;
  }
  const wired: Wired[] = [];
  const ends: (End & { node: string })[] = [];

  diagram.connections.forEach((c, index) => {
    const a = rectOf.get(c.from);
    const b = rectOf.get(c.to);
    if (!a || !b) return;
    const { from, to } = dockPair(a, b);
    wired.push({ c, a, b, from, to });
    ends.push({ node: c.from, dock: from, rect: a, other: b, index });
    ends.push({ node: c.to, dock: to, rect: b, other: a, index });
  });

  // A side only holds as many docks as fit at the pitch: three connectors on the
  // right edge of a 46px-tall box read as one thick line. The overflow moves to a
  // side that also points at the other box, the most diagonal connector first.
  for (let pass = 0; pass < 3; pass++) {
    const load = new Map<string, (End & { node: string })[]>();
    for (const end of ends) {
      const key = `${end.node}|${end.dock.side}`;
      const list = load.get(key);
      if (list) list.push(end);
      else load.set(key, [end]);
    }
    let moved = false;
    for (const list of load.values()) {
      const first = list[0]!;
      const room = capacityOf(first.rect, first.dock.side);
      if (list.length <= room) continue;
      /** Distance across the side — how little this connector loses by leaving. */
      const across = (end: End): number => {
        const own = center(end.rect);
        const oc = center(end.other);
        return horizontal(end.dock.side) ? Math.abs(oc.y - own.y) : Math.abs(oc.x - own.x);
      };
      const ranked = [...list].sort((p, q) => across(q) - across(p) || p.index - q.index);
      for (const end of ranked.slice(0, list.length - room)) {
        end.dock.side = spillTo(end.dock.side, end.rect, end.other);
        // The new side runs along the other axis, so the old coordinate would be
        // read as a position on it and land in a corner. Start from the middle.
        end.dock.at = sideMiddle(end.rect, end.dock.side);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Docks cluster on the middle of a side rather than spreading over it: a lone
  // connector keeps the coordinate `dockPair` chose (which is what keeps an
  // aligned pair straight), and a crowded side fans out only as far as it must.
  const groups = new Map<string, (End & { node: string })[]>();
  for (const end of ends) {
    const key = `${end.node}|${end.dock.side}`;
    const list = groups.get(key);
    if (list) list.push(end);
    else groups.set(key, [end]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const first = list[0]!;
    const { min, max } = sideSpan(first.rect, first.dock.side);
    const span = max - min;
    const pitch = Math.min(DOCK_PITCH, Math.max(MIN_PITCH, (span - DOCK_INSET * 2) / list.length));
    const middle = min + span / 2;
    const ordered = [...list].sort((p, q) => orderKey(p) - orderKey(q) || p.index - q.index);
    ordered.forEach((end, k) => {
      const at = middle + (k - (ordered.length - 1) / 2) * pitch;
      const inset = Math.min(DOCK_INSET, span / 2);
      end.dock.at = clamp(at, min + inset, max - inset);
    });
  }

  for (const w of wired) {
    const a = dockPoint(w.a, w.from);
    const b = dockPoint(w.b, w.to);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    // Never reach past the midpoint: two docks a few px apart would otherwise get
    // control points beyond each other, and the curve bulges out through both boxes.
    const pull = Math.min(clamp(PULL_RATIO * d, MIN_PULL, MAX_PULL), d / 2);
    const na = sideNormal(w.from.side);
    const nb = sideNormal(w.to.side);
    const c1 = { x: a.x + na.x * pull, y: a.y + na.y * pull };
    const c2 = { x: b.x + nb.x * pull, y: b.y + nb.y * pull };
    w.c.path = [a, b];
    w.c.curve = { c1, c2 };
    w.c.labelPos = cubicAt(a, c1, c2, b, 0.5);
  }
}
