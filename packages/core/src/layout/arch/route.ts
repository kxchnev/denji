import type { ArchDiagram, Connection } from "../../model/arch.js";
import { center, type Point, type Rect } from "../../model/geometry.js";

/**
 * Connector routing: a way around the boxes, and a lane within a bundle.
 *
 * Two things decide how a diagram full of connections reads. One is whether a
 * line crosses a box it has nothing to do with — it always did, because the old
 * router saw only the two rects at the ends and drew a curve between them. The
 * other is what happens where several lines run together: drawn independently
 * they land on top of each other and read as one thick smear, so they are
 * gathered into a bundle and spread across it at a fixed pitch, like a cable
 * loom.
 *
 * The path itself is orthogonal, then rounded. What makes the rounding read as a
 * curve rather than as a circuit diagram is not how wide it is but how *even* it
 * is: one radius on every corner of every connector, which is why
 * {@link CORNER_RADIUS} is derived from the shortest segment this router can
 * produce instead of being picked for looks. The first and last segments are
 * perpendicular to the box they touch by construction — the property an earlier
 * jogging router could not hold, and the reason it was replaced with plain
 * cubics in the first place.
 */

/** Which edge of a box a connector meets. */
export type Side = "top" | "bottom" | "left" | "right";

/** How far a connector stays clear of a box it is not attached to. */
export const CLEARANCE = 12;
/** The nearest a connector may ever come to one, whatever else it is avoiding. */
const TOUCHING = 3;
/**
 * How far a connector runs straight out of a dock before it may turn.
 *
 * Separate from the clearance, and larger, because it answers a different
 * question: not "will this hit a box" but "is there a straight line for the
 * arrowhead to sit on". The head is about ten pixels long, and a bend that
 * starts inside it makes the connector look like it meets the box side-on.
 *
 * Half the default gap, which is also where {@link candidates} puts the midline
 * of a gap that wide — so two boxes facing each other across one turn at the
 * same place instead of overshooting past each other and doubling back.
 */
export const DOCK_RUN = 20;
/** Distance between neighbouring lines inside one bundle. */
export const BUS_PITCH = 8;
/** How far apart two corridors may be and still be read as one bundle. */
const BUS_TOL = 22;
/** How much a segment holding a dock outweighs a free one when a bundle settles. */
const FIXED_WEIGHT = 1e6;
/** A turn costs this much path length, which is what keeps routes from zig-zagging. */
const BEND_COST = 60;
/**
 * Crossing a route already drawn costs this much. Two ways round a corner are
 * usually the same length and the same number of bends, so without a reason to
 * prefer one the search picks whichever it reached first — and half the time
 * that is the one that cuts across a line already there. Priced at two bends, so
 * a route will go around, but not on a long march to avoid a single crossing.
 */
const CROSS_COST = 120;
/**
 * Running *along* a route already drawn costs this much per pixel shared.
 *
 * Crossing one is a moment; travelling on top of one is two connectors drawn as
 * a single line for as long as they agree. A share of the length rather than a
 * flat charge, because that is what the defect is made of — and small enough
 * that a route only steps aside when a neighbouring column is nearly as good,
 * which, the grid being what it is, it almost always is.
 */
const OVERLAP_COST = 0.15;
/** Distance between two connectors sharing one side of a box. */
export const DOCK_PITCH = 14;
/** How close to a corner a dock may sit. */
export const DOCK_INSET = 10;
/** Tightest dock spacing on a short side. */
const MIN_DOCK_PITCH = 6;
/**
 * How wide the corners of a route are rounded.
 *
 * Half of {@link DOCK_RUN}, and written as that rather than as a number, because
 * the two cannot be chosen apart. A corner can never be rounded by more than
 * half of either segment touching it, and the shortest segment this router ever
 * emits is the straight run out of a dock — exactly `DOCK_RUN`, which
 * `never moves a segment that holds a dock` pins. Ask for more and the answer is
 * not a wider curve, it is a different radius at every corner: the bend beside a
 * box comes out small, the one in the middle of a long run comes out large, and
 * the drawing reads as sloppy rather than as generous. A radius that fits
 * everywhere is worth more than a radius that fits somewhere.
 */
export const CORNER_RADIUS = DOCK_RUN / 2;
/** Rects must share more than this on an axis to count as facing each other. */
const MIN_OVERLAP = 2;
/**
 * A reserved corridor is walked at a discount, so a route prefers the space the
 * layout kept for it without being forced through it. The heuristic is scaled by
 * the same factor, which keeps the search admissible.
 */
const LANE_DISCOUNT = 0.7;
/** Ceiling on search, so a pathological diagram cannot hang a render. */
const MAX_EXPAND = 60_000;

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
export function dockPoint(rect: Rect, side: Side, at: number): Point {
  const { min, max } = sideSpan(rect, side);
  const v = clamp(at, min, max);
  switch (side) {
    case "left":
      return { x: rect.x, y: v };
    case "right":
      return { x: rect.x + rect.width, y: v };
    case "top":
      return { x: v, y: rect.y };
    default:
      return { x: v, y: rect.y + rect.height };
  }
}

export interface RouteOptions {
  /** Ids of every container above a node — those can never block its own edges. */
  ancestorsOf: (id: string) => ReadonlySet<string>;
  /** Per connection index, the corridor the layout kept clear for it. */
  lanes?: ReadonlyMap<number, Point[]>;
  /** Corner radius; the default is as wide as every corner can actually be. */
  radius?: number;
}

interface Wire {
  c: Connection;
  index: number;
  a: Rect;
  b: Rect;
  from: Side;
  to: Side;
  atFrom: number;
  atTo: number;
  lane?: Point[];
}

/**
 * Give every connection a path: docks on the two boxes' borders, a way between
 * them that touches nothing else, and a lane of its own wherever it travels
 * alongside others. Mutates the connections; runs once the rects are final.
 */
export function routeConnections(diagram: ArchDiagram, opts: RouteOptions): void {
  const radius = opts.radius ?? CORNER_RADIUS;
  const rectOf = new Map<string, Rect>();
  for (const n of diagram.nodes) if (n.rect) rectOf.set(n.id, n.rect);

  const wires: Wire[] = [];
  diagram.connections.forEach((c, index) => {
    const a = rectOf.get(c.from);
    const b = rectOf.get(c.to);
    if (!a || !b) return;
    const lane = opts.lanes?.get(index);
    const { from, to } = pickSides(a, b, lane);
    wires.push({ c, index, a, b, from, to, atFrom: 0, atTo: 0, lane });
  });
  if (wires.length === 0) return;

  spreadDocks(wires);

  const boxes = [...rectOf.entries()];
  let { paths, blockersOf } = layOut(wires, boxes, opts);
  // Order the docks by where the routes actually set off, then route again.
  // The first pass can only guess from where the partner sits, and that guess is
  // wrong the moment a route has to leave in a different direction than its
  // destination lies in — two of those out of one box side cross each other
  // before they have gone anywhere, for no reason a reader could name.
  if (reorderDocks(wires, paths)) ({ paths, blockersOf } = layOut(wires, boxes, opts));
  // Then untangle whatever still crosses, by measurement rather than by rule.
  ({ paths, blockersOf } = untangleDocks(wires, { paths, blockersOf }, () =>
    layOut(wires, boxes, opts),
  ));

  bundle(paths, blockersOf);

  wires.forEach((w, i) => {
    const pts = simplify(paths[i]!);
    w.c.path = pts;
    w.c.curve = undefined;
    w.c.radius = radius;
    w.c.labelPos = midpointOf(pts);
  });
}

/**
 * Route every wire: build the grid the docks ask for, then walk each one.
 *
 * The grid is built here rather than once per drawing because the docks move
 * between passes, and a route that cannot stand exactly `DOCK_RUN` from its box
 * has no straight run for its arrowhead.
 */
function layOut(
  wires: readonly Wire[],
  boxes: ReadonlyArray<readonly [string, Rect]>,
  opts: RouteOptions,
): { paths: Point[][]; blockersOf: Rect[][]; xs: number[]; ys: number[] } {
  const marks = wires.flatMap((w) => {
    const p = dockPoint(w.a, w.from, w.atFrom);
    const q = dockPoint(w.b, w.to, w.atTo);
    const na = sideNormal(w.from);
    const nb = sideNormal(w.to);
    return [
      p,
      q,
      { x: p.x + na.x * DOCK_RUN, y: p.y + na.y * DOCK_RUN },
      { x: q.x + nb.x * DOCK_RUN, y: q.y + nb.y * DOCK_RUN },
      ...(w.lane ?? []),
    ];
  });
  const xs = candidates(
    boxes.map(([, r]) => [r.x, r.x + r.width] as const),
    marks.map((p) => p.x),
  );
  const ys = candidates(
    boxes.map(([, r]) => [r.y, r.y + r.height] as const),
    marks.map((p) => p.y),
  );

  const paths: Point[][] = [];
  const blockersOf: Rect[][] = [];
  // Where the routes drawn so far run. Orthogonal paths on a shared grid can
  // only cross at a grid point, so "somebody already goes through here, the
  // other way" is all a later route needs to know to prefer going around.
  const busyH = new Uint8Array(xs.length * ys.length);
  const busyV = new Uint8Array(xs.length * ys.length);
  for (const w of wires) {
    const blockers: Rect[] = [];
    for (const [id, r] of boxes) {
      if (id === w.c.from || id === w.c.to) {
        // A connection's own box still blocks: without this the route cuts
        // straight through it and arrives at its dock from the inside. No
        // clearance though — running flush along the box it just left is fine.
        const inner = deflate(r);
        if (inner) blockers.push(inner);
        continue;
      }
      // A container holding one of the ends has to be crossed to reach it, and
      // so does anything nested inside an end.
      if (opts.ancestorsOf(w.c.from).has(id) || opts.ancestorsOf(w.c.to).has(id)) continue;
      if (opts.ancestorsOf(id).has(w.c.from) || opts.ancestorsOf(id).has(w.c.to)) continue;
      if (r.width > 0 && r.height > 0) blockers.push(r);
    }
    blockersOf.push(blockers);
    const path = routeOne(w, xs, ys, blockers, busyH, busyV);
    mark(path, xs, ys, busyH, busyV);
    paths.push(path);
  }
  return { paths, blockersOf, xs, ys };
}

/** How many times two paths cross each other. */
function crossCount(a: readonly Point[], b: readonly Point[]): number {
  let n = 0;
  for (let i = 0; i + 1 < a.length; i++) {
    const av = Math.abs(a[i]!.x - a[i + 1]!.x) < 0.01;
    for (let j = 0; j + 1 < b.length; j++) {
      const bv = Math.abs(b[j]!.x - b[j + 1]!.x) < 0.01;
      if (av === bv) continue;
      const v = av ? [a[i]!, a[i + 1]!] : [b[j]!, b[j + 1]!];
      const h = av ? [b[j]!, b[j + 1]!] : [a[i]!, a[i + 1]!];
      const vlo = Math.min(v[0]!.y, v[1]!.y);
      const vhi = Math.max(v[0]!.y, v[1]!.y);
      const hlo = Math.min(h[0]!.x, h[1]!.x);
      const hhi = Math.max(h[0]!.x, h[1]!.x);
      if (v[0]!.x > hlo && v[0]!.x < hhi && h[0]!.y > vlo && h[0]!.y < vhi) n++;
    }
  }
  return n;
}

/** Crossings between every pair of routes, which is the thing to make smaller. */
function totalCrossings(paths: readonly Point[][]): number {
  let n = 0;
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) n += crossCount(paths[i]!, paths[j]!);
  }
  return n;
}

/**
 * Swap neighbouring docks on a box side while that makes the drawing cleaner.
 *
 * Two connectors that share a side of a box must not cross each other: they meet
 * within a few pixels of the box, where a crossing reads as a mistake rather than
 * as a route. Ordering the docks by where their partners sit gets this right most
 * of the time and wrong exactly when a route has to set off away from its target
 * — and no rule stated up front can know that, because it depends on the path
 * the search finds.
 *
 * So it is measured instead: try the swap, route the two again, count. The same
 * adjacent-swap repair the layout runs over its layer orders, for the same reason
 * — a heuristic order plus a measured fix beats a cleverer heuristic.
 *
 * Only the two wires that moved are re-routed, and the grid is untouched: a swap
 * exchanges two dock coordinates, so the set of coordinates the grid was built
 * from is exactly the same afterwards.
 */
function untangleDocks(
  wires: readonly Wire[],
  start: { paths: Point[][]; blockersOf: Rect[][] },
  route: () => { paths: Point[][]; blockersOf: Rect[][] },
): { paths: Point[][]; blockersOf: Rect[][] } {
  interface End {
    w: Wire;
    end: "a" | "b";
    i: number;
  }
  const groups = new Map<string, End[]>();
  wires.forEach((w, i) => {
    for (const [end, node, side] of [
      ["a", w.c.from, w.from],
      ["b", w.c.to, w.to],
    ] as const) {
      const k = `${node}|${side}`;
      const g = groups.get(k);
      const e: End = { w, end, i };
      if (g) g.push(e);
      else groups.set(k, [e]);
    }
  });

  const atOf = (e: End): number => (e.end === "a" ? e.w.atFrom : e.w.atTo);
  const setAt = (e: End, v: number): void => {
    if (e.end === "a") e.w.atFrom = v;
    else e.w.atTo = v;
  };

  // A crossing between two lines that share a box is the worst kind there is:
  // it happens within a few pixels of the box, where a reader is still working
  // out which line is which, and it reads as a mistake rather than as a route.
  // Trading one of those for a crossing out in the open is a win, so the pair's
  // own crossings weigh more than the drawing's total.
  const NEAR_WEIGHT = 10;
  let out = start;
  const score = (paths: readonly Point[][], a: number, b: number): number =>
    NEAR_WEIGHT * crossCount(paths[a]!, paths[b]!) + totalCrossings(paths);
  for (let pass = 0; pass < 2; pass++) {
    let improved = false;
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const order = [...g].sort((p, q) => atOf(p) - atOf(q));
      for (let k = 0; k + 1 < order.length; k++) {
        const a = order[k]!;
        const b = order[k + 1]!;
        // Only a pair that crosses *now* is worth the price of finding out; two
        // neighbours drawn cleanly have nothing to gain from changing places.
        if (a.i === b.i || crossCount(out.paths[a.i]!, out.paths[b.i]!) === 0) continue;
        const pa = atOf(a);
        const pb = atOf(b);
        const before = score(out.paths, a.i, b.i);
        setAt(a, pb);
        setAt(b, pa);
        const trial = route();
        if (score(trial.paths, a.i, b.i) < before) {
          out = trial;
          improved = true;
        } else {
          setAt(a, pa);
          setAt(b, pb);
        }
      }
    }
    if (!improved) break;
  }
  return out;
}

/**
 * Re-order the docks on each box side by the direction its routes took, and say
 * whether anything moved.
 *
 * What a dock's order should follow is where the line *goes when it leaves* —
 * which is only known once it has been routed. Two lines leaving one side and
 * turning the same way have to keep that order at the border too, or they swap
 * places in the first twenty pixels.
 */
function reorderDocks(wires: readonly Wire[], paths: readonly Point[][]): boolean {
  const before = wires.map((w) => [w.atFrom, w.atTo] as const);
  /** Along its side, where the route has got to by the time it first turns. */
  const heading = (path: readonly Point[], side: Side, atStart: boolean): number => {
    const p = atStart ? path : [...path].reverse();
    const dock = p[0]!;
    const away = p[2] ?? p[1] ?? dock;
    return horizontal(side) ? away.y : away.x;
  };
  spreadDocks(wires, (w, end) => {
    const path = paths[wires.indexOf(w)];
    if (!path || path.length < 2) return null;
    return heading(path, end === "a" ? w.from : w.to, end === "a");
  });
  return wires.some((w, i) => w.atFrom !== before[i]![0] || w.atTo !== before[i]![1]);
}

/**
 * Which sides a connector leaves and arrives on.
 *
 * A reserved corridor decides it when there is one: it says where the layout
 * expects the connection to travel, and leaving by the geometrically obvious
 * side would only send it into a wall. Failing that, boxes that face each other
 * across an axis dock across it, and boxes that overlap on neither dock on the
 * pair of sides pointing most directly at each other — measured against each
 * box's own proportions, so a flat box is left sideways rather than through its
 * long edge.
 */
function pickSides(a: Rect, b: Rect, lane?: Point[]): { from: Side; to: Side } {
  const toward = (from: Point, to: Point, own: Rect): Side => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const nx = Math.abs(dx) / Math.max(1, own.width / 2);
    const ny = Math.abs(dy) / Math.max(1, own.height / 2);
    if (nx >= ny) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "bottom" : "top";
  };
  const ca = center(a);
  const cb = center(b);
  if (lane && lane.length > 0) {
    return { from: toward(ca, lane[0]!, a), to: toward(cb, lane[lane.length - 1]!, b) };
  }
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (ox > MIN_OVERLAP && oy <= MIN_OVERLAP) {
    const from: Side = a.y + a.height <= b.y ? "bottom" : "top";
    return { from, to: flip(from) };
  }
  if (oy > MIN_OVERLAP && ox <= MIN_OVERLAP) {
    const from: Side = a.x + a.width <= b.x ? "right" : "left";
    return { from, to: flip(from) };
  }
  // Each end picks its own side, from its own proportions. Flipping the first
  // answer for the second is what sent everything arriving from the left into the
  // *top* of a squat database: `biba` is wide and flat, so it leaves through its
  // bottom, and the flip made that the target's top — three lines crowding one
  // side and crossing each other to reach it, with two free sides going spare.
  return { from: toward(ca, cb, a), to: toward(cb, ca, b) };
}

/**
 * Docks sharing one side spread at a fixed pitch, ordered by where their
 * partners sit along that side — so the lines leaving a box do not cross each
 * other before they have gone anywhere.
 */
function spreadDocks(
  wires: readonly Wire[],
  keyOf?: (w: Wire, end: "a" | "b") => number | null,
): void {
  interface End {
    w: Wire;
    end: "a" | "b";
    node: string;
    side: Side;
    rect: Rect;
    other: Rect;
  }
  const groups = new Map<string, End[]>();
  const add = (e: End): void => {
    const k = `${e.node}|${e.side}`;
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  };
  for (const w of wires) {
    add({ w, end: "a", node: w.c.from, side: w.from, rect: w.a, other: w.b });
    add({ w, end: "b", node: w.c.to, side: w.to, rect: w.b, other: w.a });
  }

  for (const g of groups.values()) {
    const first = g[0]!;
    const { min, max } = sideSpan(first.rect, first.side);
    const width = max - min;
    const middle = min + width / 2;
    const pitch = Math.min(
      DOCK_PITCH,
      Math.max(MIN_DOCK_PITCH, (width - DOCK_INSET * 2) / Math.max(1, g.length)),
    );
    const key = (e: End): number => {
      const asked = keyOf?.(e.w, e.end);
      if (asked !== null && asked !== undefined) return asked;
      const c = center(e.other);
      return horizontal(e.side) ? c.y : c.x;
    };
    const ordered = [...g].sort((p, q) => key(p) - key(q) || p.w.index - q.w.index);
    const inset = Math.min(DOCK_INSET, width / 2);
    ordered.forEach((e, k) => {
      const raw = middle + (k - (ordered.length - 1) / 2) * pitch;
      const at = clamp(raw, min + inset, max - inset);
      if (e.end === "a") e.w.atFrom = at;
      else e.w.atTo = at;
    });
  }
}

/**
 * The grid lines a route may travel on: each box's borders pushed out by the
 * clearance, every dock and corridor coordinate, and the middle of any gap wide
 * enough to walk down. Without those middles a route squeezing between two boxes
 * has to hug one of them.
 */
function candidates(bounds: ReadonlyArray<readonly [number, number]>, extra: number[]): number[] {
  const set = new Set<number>();
  for (const [lo, hi] of bounds) {
    set.add(lo - CLEARANCE);
    set.add(hi + CLEARANCE);
  }
  for (const e of extra) set.add(e);
  const sorted = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]!);
    const next = sorted[i + 1];
    if (next !== undefined && next - sorted[i]! > CLEARANCE * 3) out.push((sorted[i]! + next) / 2);
  }
  return out;
}

/** A box shrunk by the clearance the search will add back to it. */
function deflate(r: Rect): Rect | null {
  const width = r.width - CLEARANCE * 2;
  const height = r.height - CLEARANCE * 2;
  if (width <= 0 || height <= 0) return null;
  return { x: r.x + CLEARANCE, y: r.y + CLEARANCE, width, height };
}

const nearest = (arr: number[], v: number): number => {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(arr[lo - 1]! - v) <= Math.abs(arr[lo]! - v)) return lo - 1;
  return lo;
};

/**
 * Record which grid points a finished route runs through, and in which
 * direction, so the next one can price a crossing.
 */
function mark(
  path: readonly Point[],
  xs: number[],
  ys: number[],
  busyH: Uint8Array,
  busyV: Uint8Array,
): void {
  const W = xs.length;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k]!;
    const b = path[k + 1]!;
    const vertical = Math.abs(a.x - b.x) < 0.01;
    const busy = vertical ? busyV : busyH;
    if (vertical) {
      const i = nearest(xs, a.x);
      const lo = nearest(ys, Math.min(a.y, b.y));
      const hi = nearest(ys, Math.max(a.y, b.y));
      for (let j = lo; j <= hi; j++) busy[j * W + i] = 1;
    } else {
      const j = nearest(ys, a.y);
      const lo = nearest(xs, Math.min(a.x, b.x));
      const hi = nearest(xs, Math.max(a.x, b.x));
      for (let i = lo; i <= hi; i++) busy[j * W + i] = 1;
    }
  }
}

/** One route: out of the dock along its normal, across the grid, back into the other. */
function routeOne(
  w: Wire,
  xs: number[],
  ys: number[],
  blockers: Rect[],
  busyH: Uint8Array,
  busyV: Uint8Array,
): Point[] {
  const p = dockPoint(w.a, w.from, w.atFrom);
  const q = dockPoint(w.b, w.to, w.atTo);
  const na = sideNormal(w.from);
  const nb = sideNormal(w.to);
  const start = { x: p.x + na.x * DOCK_RUN, y: p.y + na.y * DOCK_RUN };
  const goal = { x: q.x + nb.x * DOCK_RUN, y: q.y + nb.y * DOCK_RUN };

  const si = nearest(xs, start.x);
  const sj = nearest(ys, start.y);
  const gi = nearest(xs, goal.x);
  const gj = nearest(ys, goal.y);

  const found = search(xs, ys, blockers, si, sj, gi, gj, w.lane, busyH, busyV);
  // No way through is still a drawn connection: an L through the start's row
  // beats nothing at all, and says plainly that the space was too tight.
  const body = found ?? [
    { x: xs[si]!, y: ys[sj]! },
    { x: xs[gi]!, y: ys[sj]! },
    { x: xs[gi]!, y: ys[gj]! },
  ];
  return simplify([p, start, ...body, goal, q]);
}

function search(
  xs: number[],
  ys: number[],
  blockers: Rect[],
  si: number,
  sj: number,
  gi: number,
  gj: number,
  lane: Point[] | undefined,
  busyH: Uint8Array,
  busyV: Uint8Array,
): Point[] | null {
  const W = xs.length;
  const H = ys.length;
  if (W === 0 || H === 0) return null;

  // Which grid edges are walkable. An edge is closed when its middle falls
  // inside an inflated box: the lines themselves sit on box borders, so testing
  // the middle keeps a line that runs exactly along a border open.
  const blockedH = new Uint8Array(W * H);
  const blockedV = new Uint8Array(W * H);
  for (const r of blockers) {
    const x0 = r.x - CLEARANCE;
    const x1 = r.x + r.width + CLEARANCE;
    const y0 = r.y - CLEARANCE;
    const y1 = r.y + r.height + CLEARANCE;
    for (let j = 0; j < H; j++) {
      const y = ys[j]!;
      if (y <= y0 || y >= y1) continue;
      for (let i = 0; i + 1 < W; i++) {
        const mx = (xs[i]! + xs[i + 1]!) / 2;
        if (mx > x0 && mx < x1) blockedH[j * W + i] = 1;
      }
    }
    for (let i = 0; i < W; i++) {
      const x = xs[i]!;
      if (x <= x0 || x >= x1) continue;
      for (let j = 0; j + 1 < H; j++) {
        const my = (ys[j]! + ys[j + 1]!) / 2;
        if (my > y0 && my < y1) blockedV[j * W + i] = 1;
      }
    }
  }

  const lanesX = new Set((lane ?? []).map((h) => nearest(xs, h.x)));
  const lanesY = new Set((lane ?? []).map((h) => nearest(ys, h.y)));

  // A state is a cell plus the direction it was entered from, which is what
  // makes a turn cost anything at all.
  const g = new Float64Array(W * H * 4).fill(Infinity);
  const from = new Int32Array(W * H * 4).fill(-1);
  const heap: number[] = [];
  const fs: number[] = [];

  const h = (i: number, j: number): number =>
    LANE_DISCOUNT * (Math.abs(xs[i]! - xs[gi]!) + Math.abs(ys[j]! - ys[gj]!));

  const push = (state: number, f: number): void => {
    heap.push(state);
    fs.push(f);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (fs[p]! <= fs[c]!) break;
      [heap[p], heap[c]] = [heap[c]!, heap[p]!];
      [fs[p], fs[c]] = [fs[c]!, fs[p]!];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    const lastS = heap.pop()!;
    const lastF = fs.pop()!;
    if (heap.length > 0) {
      heap[0] = lastS;
      fs[0] = lastF;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && fs[l]! < fs[m]!) m = l;
        if (r < heap.length && fs[r]! < fs[m]!) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c]!, heap[m]!];
        [fs[m], fs[c]] = [fs[c]!, fs[m]!];
        c = m;
      }
    }
    return top;
  };

  for (let d = 0; d < 4; d++) {
    const s = (sj * W + si) * 4 + d;
    g[s] = 0;
    push(s, h(si, sj));
  }

  let expanded = 0;
  let goalState = -1;
  while (heap.length > 0 && expanded < MAX_EXPAND) {
    const cur = pop();
    const d = cur & 3;
    const cell = cur >> 2;
    const i = cell % W;
    const j = (cell - i) / W;
    if (i === gi && j === gj) {
      goalState = cur;
      break;
    }
    expanded++;
    const base = g[cur]!;

    const step = (ni: number, nj: number, nd: number, blocked: boolean): void => {
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || blocked) return;
      const dx = Math.abs(xs[ni]! - xs[i]!);
      const dy = Math.abs(ys[nj]! - ys[j]!);
      const onLane = nd >= 2 ? lanesX.has(ni) : lanesY.has(nj);
      // Going one way through a point something already goes the other way
      // through is exactly a crossing.
      const cell = nj * W + ni;
      const crossed = (nd >= 2 ? busyH : busyV)[cell] === 1;
      const shared = (nd >= 2 ? busyV : busyH)[cell] === 1;
      const cost =
        base +
        (dx + dy) * ((onLane ? LANE_DISCOUNT : 1) + (shared ? OVERLAP_COST : 0)) +
        (nd === d ? 0 : BEND_COST) +
        (crossed ? CROSS_COST : 0);
      const ns = (nj * W + ni) * 4 + nd;
      if (cost < g[ns]!) {
        g[ns] = cost;
        from[ns] = cur;
        push(ns, cost + h(ni, nj));
      }
    };

    step(i + 1, j, 0, blockedH[j * W + i] === 1);
    step(i - 1, j, 1, i === 0 || blockedH[j * W + i - 1] === 1);
    step(i, j + 1, 2, blockedV[j * W + i] === 1);
    step(i, j - 1, 3, j === 0 || blockedV[(j - 1) * W + i] === 1);
  }

  if (goalState < 0) return null;
  const out: Point[] = [];
  for (let s = goalState; s >= 0; s = from[s]!) {
    const cell = s >> 2;
    const i = cell % W;
    const j = (cell - i) / W;
    out.push({ x: xs[i]!, y: ys[j]! });
    if (from[s] === -1) break;
  }
  return out.reverse();
}

/** Drop repeated points and the ones that sit in the middle of a straight run. */
function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push({ x: p.x, y: p.y });
  }
  for (let i = 1; i + 1 < out.length; ) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const straight =
      (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
      (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
    if (straight) out.splice(i, 1);
    else i++;
  }
  return out;
}

interface Segment {
  path: number;
  i: number;
  vertical: boolean;
  /** The coordinate across the segment: x if vertical, y if horizontal. */
  coord: number;
  lo: number;
  hi: number;
  /** Its own ends along its axis, in the direction the route travels. */
  fromAlong: number;
  toAlong: number;
  /** Where the route came from and goes to, which is what orders a bundle. */
  before: number;
  after: number;
  movable: boolean;
  /** Where it may sit and still keep its clearance from every box. */
  freeLo: number;
  freeHi: number;
  /** Where it may sit and still not be drawn over one. The last word. */
  hardLo: number;
  hardHi: number;
}

/**
 * Spread the segments that travel together into a bus.
 *
 * Segments on one line — within `BUS_TOL` of each other, and overlapping along
 * it — are one bundle. Inside a bundle they are ordered by where their routes
 * arrive from and leave for, so the lines do not cross each other while running
 * side by side, then placed at a fixed pitch about the bundle's middle.
 *
 * Only the interior of a route moves. The first and last segments hold a dock,
 * and sliding one of those would tear the arrow off its box. Nothing may leave
 * its own corridor either: a bundle wider than the gap it runs through would
 * push its outermost line into exactly the box the route was built to avoid.
 */
function bundle(paths: Point[][], blockersOf: Rect[][]): void {
  const segs: Segment[] = [];
  paths.forEach((pts, path) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const vertical = Math.abs(a.x - b.x) < 0.01;
      const prev = pts[i - 1];
      const next = pts[i + 2];
      const s: Segment = {
        path,
        i,
        vertical,
        coord: vertical ? a.x : a.y,
        lo: vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x),
        hi: vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x),
        fromAlong: vertical ? a.y : a.x,
        toAlong: vertical ? b.y : b.x,
        before: vertical ? (prev ? prev.x : a.x) : prev ? prev.y : a.y,
        after: vertical ? (next ? next.x : b.x) : next ? next.y : b.y,
        movable: i > 0 && i + 2 < pts.length,
        freeLo: -Infinity,
        freeHi: Infinity,
        hardLo: -Infinity,
        hardHi: Infinity,
      };
      if (s.movable) {
        const room = corridorOf(s, blockersOf[path] ?? [], CLEARANCE);
        s.freeLo = room.lo;
        s.freeHi = room.hi;
        const hard = corridorOf(s, blockersOf[path] ?? [], TOUCHING);
        s.hardLo = hard.lo;
        s.hardHi = hard.hi;
        // A segment next to a dock's own approach owns how long that approach
        // is: sliding it towards the box shortens the straight run into the
        // arrowhead, and once the head is longer than what is left of it the
        // line reads as meeting the box side-on, at the bend.
        for (const end of [0, pts.length - 2]) {
          if (Math.abs(end - i) !== 1) continue;
          const dock = end === 0 ? pts[0]! : pts[pts.length - 1]!;
          const at = s.vertical ? dock.x : dock.y;
          if (s.coord >= at) s.freeLo = Math.max(s.freeLo, at + DOCK_RUN);
          else s.freeHi = Math.min(s.freeHi, at - DOCK_RUN);
        }
      }
      segs.push(s);
    }
  });

  /** Every bundle found, so the order inside them can be checked by measurement. */
  const found: Segment[][] = [];

  for (const vertical of [true, false]) {
    // Every segment joins its bundle, including the two that hold the docks.
    // They cannot move, but they are still *there*: leaving them out let a free
    // segment settle four pixels from one — crossing it twice on the way — and
    // run the length of another's final approach, straight past its arrowhead.
    const pool = segs.filter((s) => s.vertical === vertical);
    const parent = pool.map((_, i) => i);
    const find = (a: number): number => {
      let r = a;
      while (parent[r] !== r) r = parent[r]!;
      for (let c = a; c !== r; ) {
        const nx = parent[c]!;
        parent[c] = r;
        c = nx;
      }
      return r;
    };
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i]!;
        const b = pool[j]!;
        if (Math.abs(a.coord - b.coord) > BUS_TOL) continue;
        if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) <= 0) continue;
        const ra = find(i);
        const rb = find(j);
        if (ra !== rb) parent[rb] = ra;
      }
    }
    const bundles = new Map<number, number[]>();
    pool.forEach((_, i) => {
      const r = find(i);
      const g = bundles.get(r);
      if (g) g.push(i);
      else bundles.set(r, [i]);
    });

    /**
     * How far a segment may travel.
     *
     * A long one can end up with no corridor at all — every box it passes hems
     * it in from one side or the other — and two of those land on exactly the
     * same line and are drawn as one. Two connectors on top of each other is a
     * worse picture than one sitting closer to a box than it would like, so a
     * segment with nothing left is given the clearance back: it can move up to
     * flush against whatever closed the corridor, and no further.
     */
    const spanOf = (s: Segment): [number, number] =>
      s.freeHi - s.freeLo > 0.5
        ? [s.freeLo, s.freeHi]
        : // Around where it is, not around the corridor: a long segment can end
          // up with bounds that cross over each other, and clamping into those
          // returns the same coordinate for everyone in the bundle — which is
          // precisely the two-lines-drawn-as-one this is here to prevent.
          [s.coord - CLEARANCE, s.coord + CLEARANCE];
    /** What no amount of not-merging may talk a line out of. */
    const wall = (s: Segment): [number, number] =>
      s.hardHi - s.hardLo > 0.5 ? [s.hardLo, s.hardHi] : [s.coord, s.coord];
    const loose = (s: Segment): boolean => s.movable;

    for (const members of bundles.values()) {
      if (members.length < 2 || !members.some((m) => loose(pool[m]!))) continue;
      found.push(members.map((m) => pool[m]!));
      const mid = members.reduce((s, i) => s + pool[i]!.coord, 0) / members.length;
      const ordered = order(members.map((m) => pool[m]!), mid).map((s) =>
        members[members.findIndex((m) => pool[m] === s)]!,
      );
      // Always the full pitch. Shrinking it up front to "fit" the bundle is
      // what made a crowd of docks — which take up no room and cannot move —
      // squeeze the two lines that actually needed separating down to two
      // pixels. Whatever genuinely does not fit is caught by the clamp below,
      // pinned, and solved around.
      const pitch = BUS_PITCH;
      // Where each line would sit if the bundle were free to spread evenly. A
      // line that cannot move asks for exactly where it is instead, and loudly.
      const want = ordered.map((m, k) =>
        loose(pool[m]!) ? mid + (k - (ordered.length - 1) / 2) * pitch : pool[m]!.coord,
      );
      const weight = ordered.map((m) => (loose(pool[m]!) ? 1 : FIXED_WEIGHT));
      // Solve, then pin whatever its corridor would not let reach its slot and
      // solve again. Clamping once at the end instead undoes the spacing that
      // was just paid for: pull the first line back to the wall it was resting
      // against and the second is left half a pitch away, reading as one line.
      let placed = spread(want, weight, pitch);
      for (let round = 0; round < ordered.length; round++) {
        let pinned = false;
        ordered.forEach((m, k) => {
          const s = pool[m]!;
          if (!loose(s) || weight[k] === FIXED_WEIGHT) return;
          const [lo, hi] = spanOf(s);
          const held = clamp(placed[k]!, lo, hi);
          if (Math.abs(held - placed[k]!) < 0.01) return;
          want[k] = held;
          weight[k] = FIXED_WEIGHT;
          pinned = true;
        });
        if (!pinned) break;
        placed = spread(want, weight, pitch);
      }
      // Write the order out, keeping a pitch between neighbours. Where a
      // corridor and that pitch disagree, the pitch wins: a line drawn a few
      // pixels nearer a box is a line someone can still follow, and two lines
      // drawn on top of each other are not two lines. The overshoot is bounded
      // by one pitch past the neighbour, and the corridor already stood a
      // clearance off the box, so nothing ends up inside anything.
      let taken = -Infinity;
      ordered.forEach((m, k) => {
        const s = pool[m]!;
        if (!loose(s)) {
          taken = Math.max(taken, s.coord);
          return;
        }
        const [lo, hi] = spanOf(s);
        const want = Math.max(clamp(Math.max(placed[k]!, taken + pitch), lo, hi), taken + pitch);
        // Borrowing from the clearance to keep two lines apart is fine. Being
        // drawn across a box is not, whatever it costs in separation — so the
        // box has the last word, and a bundle too big for its gap comes out
        // tight rather than on top of something.
        const [floor, ceiling] = wall(s);
        s.coord = clamp(want, floor, ceiling);
        taken = s.coord;
      });
    }
  }

  // Rebuild the routes. A point's x comes from whichever of its two segments is
  // vertical and its y from the horizontal one, so the two axes never argue: a
  // segment that moved just makes its neighbours longer or shorter.
  const byPath = new Map<number, Segment[]>();
  for (const s of segs) {
    const g = byPath.get(s.path);
    if (g) g.push(s);
    else byPath.set(s.path, [s]);
  }
  const apply = (): void => {
    for (const [path, list] of byPath) {
      const pts = paths[path]!;
      for (const s of list) {
        if (s.vertical) {
          pts[s.i]!.x = s.coord;
          pts[s.i + 1]!.x = s.coord;
        } else {
          pts[s.i]!.y = s.coord;
          pts[s.i + 1]!.y = s.coord;
        }
      }
    }
  };
  apply();

  // Which line takes which lane, decided by looking at the result.
  //
  // The order a bundle settles into is a guess about who has to pass whom, and
  // when it guesses wrong the two lines cross twice — a flat S a few pixels wide,
  // right where the eye is trying to tell them apart. On the diagram this work
  // started from, the bus was *making* seven of the sixteen crossings it was
  // supposed to be tidying up. Swapping two lanes cannot introduce an overlap,
  // because it is the same set of lanes either way, so the only thing to check is
  // whether the picture got better — so that is what is checked.
  let best = totalCrossings(paths);
  for (let pass = 0; pass < 3 && best > 0; pass++) {
    let improved = false;
    for (const members of found) {
      const order = [...members].sort((a, b) => a.coord - b.coord);
      for (let k = 0; k + 1 < order.length; k++) {
        const a = order[k]!;
        const b = order[k + 1]!;
        if (!a.movable || !b.movable || a.path === b.path) continue;
        // Neither may take a lane its own corridor does not reach.
        if (b.coord < a.hardLo || b.coord > a.hardHi) continue;
        if (a.coord < b.hardLo || a.coord > b.hardHi) continue;
        const ca = a.coord;
        const cb = b.coord;
        a.coord = cb;
        b.coord = ca;
        apply();
        const now = totalCrossings(paths);
        if (now < best) {
          best = now;
          improved = true;
        } else {
          a.coord = ca;
          b.coord = cb;
          apply();
        }
      }
    }
    if (!improved) break;
  }
}

/**
 * The order lines take across a bundle.
 *
 * Not "where does each one end up", which is what an earlier version compared
 * and which gets this exactly backwards for two lines leaving one box side and
 * both turning the same way: the one going further ends up *nearer*, and the two
 * cross twice for nothing. What decides it is who has to pass whom — a line
 * whose neighbouring leg dives across another's lane, inside the stretch that
 * other one occupies, crosses it. So both orders are priced by counting exactly
 * that, and the cheaper one wins.
 *
 * Insertion sort rather than `Array.sort`: "fewer crossings" is not a total
 * order, and a comparator that is not one may make `sort` do anything at all.
 */
function order(members: readonly Segment[], mid: number): Segment[] {
  const out = [...members];
  for (let i = 1; i < out.length; i++) {
    for (let j = i; j > 0 && worseThan(out[j - 1]!, out[j]!, mid) > 0; j--) {
      const t = out[j - 1]!;
      out[j - 1] = out[j]!;
      out[j] = t;
    }
  }
  return out;
}

/** How much more crossing `a` before `b` costs than the other way round. */
function worseThan(a: Segment, b: Segment, mid: number): number {
  // Feasibility first. A line whose corridor does not reach far enough cannot
  // take the nearer lane however much the crossings would like it to — and an
  // order nothing can satisfy ends with both lines clamped back onto the same
  // coordinate, which reads as one line, not as two.
  const cannotLead = (x: Segment, y: Segment): boolean => x.freeLo > y.freeHi - BUS_PITCH;
  if (cannotLead(a, b) !== cannotLead(b, a)) return cannotLead(a, b) ? 1 : -1;

  const cost = (first: Segment, second: Segment): number =>
    passes(first, second, true, mid) + passes(second, first, false, mid);
  const diff = cost(a, b) - cost(b, a);
  if (diff !== 0) return diff;
  // Nothing to choose between them: keep the reading order of the routes.
  return a.before + a.after - (b.before + b.after) || a.path - b.path || a.i - b.i;
}

/**
 * How many of `s`'s own legs would cut across `t`, given `s` takes the nearer
 * lane. A leg leaves the bundle towards its neighbour's coordinate; if that is
 * on the far side of `t`'s lane and the leg stands within the stretch `t`
 * covers, the two meet.
 */
function passes(s: Segment, t: Segment, nearer: boolean, mid: number): number {
  const lo = Math.min(t.fromAlong, t.toAlong);
  const hi = Math.max(t.fromAlong, t.toAlong);
  let n = 0;
  for (const [along, toward] of [
    [s.fromAlong, s.before],
    [s.toAlong, s.after],
  ] as const) {
    if (along <= lo || along >= hi) continue;
    if (nearer === toward > mid) n++;
  }
  return n;
}

/**
 * Lay out one bundle: as near each line's wish as the order and the pitch allow.
 *
 * The same isotonic problem the layout solves for a layer of boxes, and the same
 * exact answer — pool-adjacent-violators — because it is the same question. The
 * order is what keeps lines in a bundle from crossing each other; the pitch is
 * what keeps them apart; and a segment holding a dock asks for its own place
 * with a weight nothing else can outvote, so the free lines are what move.
 */
function spread(want: readonly number[], weight: readonly number[], pitch: number): number[] {
  const n = want.length;
  const pos: number[] = [];
  const w: number[] = [];
  const size: number[] = [];
  for (let i = 0; i < n; i++) {
    pos.push(want[i]! - i * pitch);
    w.push(weight[i]!);
    size.push(1);
    while (pos.length > 1 && pos[pos.length - 2]! > pos[pos.length - 1]!) {
      const p2 = pos.pop()!;
      const w2 = w.pop()!;
      const s2 = size.pop()!;
      const p1 = pos.pop()!;
      const w1 = w.pop()!;
      const s1 = size.pop()!;
      const total = w1 + w2;
      pos.push(total > 0 ? (p1 * w1 + p2 * w2) / total : (p1 + p2) / 2);
      w.push(total);
      size.push(s1 + s2);
    }
  }
  const out: number[] = [];
  for (let b = 0; b < pos.length; b++) {
    for (let j = 0; j < size[b]!; j++) out.push(pos[b]! + out.length * pitch);
  }
  return out;
}

/** How far a segment can move either way before it reaches a box. */
function corridorOf(
  s: Segment,
  blockers: readonly Rect[],
  pad: number,
): { lo: number; hi: number } {
  let lo = -Infinity;
  let hi = Infinity;
  for (const r of blockers) {
    const alongLo = (s.vertical ? r.y : r.x) - pad;
    const alongHi = (s.vertical ? r.y + r.height : r.x + r.width) + pad;
    if (Math.min(alongHi, s.hi) - Math.max(alongLo, s.lo) <= 0) continue;
    const near = s.vertical ? r.x : r.y;
    const far = s.vertical ? r.x + r.width : r.y + r.height;
    if (far <= s.coord) lo = Math.max(lo, far + pad);
    else if (near >= s.coord) hi = Math.min(hi, near - pad);
  }
  return { lo, hi };
}

/** The middle of a path by length — where its label sits. */
function midpointOf(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) total += dist(pts[i]!, pts[i + 1]!);
  let want = total / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = dist(pts[i]!, pts[i + 1]!);
    if (want <= d) {
      const t = d === 0 ? 0 : want / d;
      return {
        x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t,
        y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t,
      };
    }
    want -= d;
  }
  return pts[pts.length - 1]!;
}

const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
