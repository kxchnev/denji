import type { PlaceHint } from "../../model/arch.js";
import { intersects, type Rect } from "../../model/geometry.js";
import { snapHalf } from "./grid.js";
import type { ScopeEdge } from "./graph.js";
import { autoPlace } from "./auto.js";

export interface Placeable {
  id: string;
  width: number;
  height: number;
  hint?: PlaceHint;
}

export interface ScopeResult {
  pos: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  /**
   * What placing the scope subtracted from its raw coordinates. Adding it back to a
   * position in `pos` recovers the space `hint.at` is written in, which is the only
   * space an editor can write a dragged node's position in. Zero for a scope with
   * coordinates in it, which is the whole point of them.
   */
  offset: { x: number; y: number };
  /**
   * Per {@link ScopeEdge} key, the corridor the layout kept clear for it: a point
   * in every layer the edge crosses, in the same space as `pos`. No box stands
   * there, which is the whole reason the router is told about it.
   */
  lanes?: Map<string, Array<{ x: number; y: number }>>;
}

/** Resolved spacing for one scope: horizontal and vertical gaps between siblings. */
export interface AxisGaps {
  x: number;
  y: number;
}

/** Something the layout could not honour literally, reported rather than thrown. */
export interface LayoutWarning {
  code: "hint-cycle";
  message: string;
  /** The nodes the cycle left unordered. */
  nodes: string[];
}

/**
 * The anchors of `hint` that actually resolve to a sibling in this scope.
 *
 * Exported because placement and diagnostics must agree on what counts as a
 * resolvable hint: a self-reference, or one pointing into another container, is
 * silently ignored here, and a checker that did not know that would report the
 * node as anchored when the layout treats it as unconstrained.
 *
 * `rightOf` beats `leftOf` and `below` beats `above` when both are written —
 * one relation per axis. A node placed by `at` has no anchors at all: exact
 * coordinates leave nothing for a relation to decide.
 */
export function resolvedAnchors(
  id: string,
  hint: PlaceHint | undefined,
  siblings: ReadonlyMap<string, unknown> | ReadonlySet<string>,
): string[] {
  if (hint?.at) return [];
  const out: string[] = [];
  const hx = hint?.rightOf ?? hint?.leftOf;
  const vy = hint?.below ?? hint?.above;
  if (hx && hx !== id && siblings.has(hx)) out.push(hx);
  if (vy && vy !== id && siblings.has(vy)) out.push(vy);
  return out;
}

/**
 * Resolve one scope of siblings into local coordinates.
 *
 * The connections decide the arrangement; the author's hints narrow it. A
 * relation like `rightOf` no longer *places* anything — it says the two nodes
 * belong on one rank in that order, and `below` says one rank must come after
 * another. That is the whole difference from what this used to be: a hint is a
 * constraint the engine satisfies, not a coordinate it copies, so adding a node
 * rearranges the picture instead of leaving a hole where the author's
 * arithmetic used to fit.
 *
 * `hint.at` is still exact and still wins outright. Pinned nodes are placed
 * first and never moved, and everything the engine arranges steps clear of
 * them — which is what keeps a half-dragged diagram from landing on itself.
 *
 * The result is normalized, and `offset` says by how much. A scope with
 * coordinates in it keeps its origin instead: it is measured from (0, 0), the
 * container's inner corner, and that point has to stay put or moving one child
 * would slide all the others.
 */
export function layoutScope(
  items: Placeable[],
  edges: readonly ScopeEdge[],
  gaps: AxisGaps,
  onWarn?: (warning: LayoutWarning) => void,
): ScopeResult {
  const anchored = items.some((it) => it.hint?.at);
  const pos = new Map<string, { x: number; y: number }>();
  const island = placeIsland(items, gaps, pos);
  const free = items.filter((it) => !island.has(it.id));
  if (free.length === 0) return settle(items, pos, anchored);

  const keep = new Set(free.map((it) => it.id));
  const solved = autoPlace(
    free,
    edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    gaps,
    onWarn,
  );

  // The arranged part moves as one piece, so a pin can push it aside without
  // disturbing anything the engine decided inside it.
  const blocked = items
    .filter((it) => island.has(it.id))
    .map((it) => ({ ...pos.get(it.id)!, width: it.width, height: it.height }));
  const box = slideClear(
    { x: 0, y: 0, width: solved.width, height: solved.height },
    blocked,
    gaps.x,
  );
  for (const it of free) {
    const p = solved.pos.get(it.id)!;
    pos.set(it.id, { x: p.x + box.x, y: p.y + box.y });
  }
  const lanes = new Map<string, Array<{ x: number; y: number }>>();
  for (const [k, pts] of solved.lanes) {
    lanes.set(
      k,
      pts.map((p) => ({ x: p.x + box.x, y: p.y + box.y })),
    );
  }

  const out = settle(items, pos, anchored);
  for (const [k, pts] of lanes) {
    lanes.set(
      k,
      pts.map((p) => ({ x: p.x - out.offset.x, y: p.y - out.offset.y })),
    );
  }
  out.lanes = lanes;
  return out;
}

/**
 * The nodes that coordinates reach: the pinned ones, and everything that hangs
 * off them through hints. Fills their positions and reports who they are.
 *
 * A relation pointing at a pinned node still *places* the node that wrote it.
 * That is the whole reason both mechanisms exist side by side — one part of a
 * diagram drawn by hand, the rest arranging itself around it — and the engine
 * could not express it anyway: it never sees the pinned node, so it has nothing
 * to put the follower next to.
 */
function placeIsland(
  items: Placeable[],
  gaps: AxisGaps,
  pos: Map<string, { x: number; y: number }>,
): Set<string> {
  const island = new Set<string>();
  for (const it of items) {
    if (!it.hint?.at) continue;
    island.add(it.id);
    pos.set(it.id, { x: it.hint.at.x, y: it.hint.at.y });
  }
  if (island.size === 0) return island;

  const byId = new Map(items.map((it) => [it.id, it]));
  // Each round adds the followers of whatever landed in the previous one, so a
  // chain of relations off one pin resolves in order however it was declared.
  for (let round = 0; round < items.length; round++) {
    let grew = false;
    for (const it of items) {
      if (island.has(it.id)) continue;
      const anchors = resolvedAnchors(it.id, it.hint, byId);
      if (anchors.length === 0 || !anchors.every((a) => island.has(a))) continue;
      pos.set(it.id, follow(it, byId, pos, gaps));
      island.add(it.id);
      grew = true;
    }
    if (!grew) break;
  }
  return island;
}

/** Where one relation puts a node next to an anchor that already has a place. */
function follow(
  it: Placeable,
  byId: ReadonlyMap<string, Placeable>,
  pos: ReadonlyMap<string, { x: number; y: number }>,
  gaps: AxisGaps,
): { x: number; y: number } {
  const h = it.hint!;
  const gx = h.gap ?? gaps.x;
  const gy = h.gap ?? gaps.y;
  const align = h.align ?? "center";
  const box = (id: string): { at: { x: number; y: number }; it: Placeable } => ({
    at: pos.get(id)!,
    it: byId.get(id)!,
  });

  let x: number | undefined;
  let y: number | undefined;
  const hx = h.rightOf ?? h.leftOf;
  const vy = h.below ?? h.above;
  if (hx && pos.has(hx)) {
    const a = box(hx);
    x = h.rightOf ? a.at.x + a.it.width + gx : a.at.x - it.width - gx;
  }
  if (vy && pos.has(vy)) {
    const a = box(vy);
    y = h.below ? a.at.y + a.it.height + gy : a.at.y - it.height - gy;
  }
  // The one relation given also settles the other axis, which is what keeps a
  // connector between an anchored pair on a straight line.
  if (y === undefined && hx && pos.has(hx)) {
    const a = box(hx);
    y = alignCoord(a.at.y, a.it.height, it.height, align);
  }
  if (x === undefined && vy && pos.has(vy)) {
    const a = box(vy);
    x = alignCoord(a.at.x, a.it.width, it.width, align);
  }
  return { x: x ?? 0, y: y ?? 0 };
}

/**
 * The cross-axis coordinate one relation implies. The centring offset is snapped
 * rather than the result, so a node following an author's fractional `@at` keeps
 * that fraction instead of being dragged onto the lattice behind their back.
 */
function alignCoord(
  anchorPos: number,
  anchorSize: number,
  size: number,
  align: "start" | "center" | "end",
): number {
  if (align === "center") return anchorPos + snapHalf((anchorSize - size) / 2);
  if (align === "end") return anchorPos + anchorSize - size;
  return anchorPos;
}

/**
 * Move a rect right until it clears everything already placed. Each step jumps
 * past the far edge of the obstacle it hit, so a given obstacle can only be hit
 * once and the loop is bounded by `placed.length`.
 */
function slideClear(r: Rect, placed: Rect[], gap: number): Rect {
  let out = r;
  for (let guard = 0; guard <= placed.length; guard++) {
    const hit = placed.find((p) => intersects(out, p));
    if (!hit) break;
    out = { ...out, x: hit.x + hit.width + gap };
  }
  return out;
}

/** Where `items` at `pos` begin and end, measured without moving anything. */
export function bounds(
  items: readonly Placeable[],
  pos: ReadonlyMap<string, { x: number; y: number }>,
): { min: { x: number; y: number }; max: { x: number; y: number } } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const p = pos.get(it.id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + it.width);
    maxY = Math.max(maxY, p.y + it.height);
  }
  if (!isFinite(minX)) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * Finish a scope: move it flush against its origin and measure it from there.
 *
 * Which origin depends on whether coordinates are involved. A scope the engine
 * arranged has no opinion about where it starts, so it is packed against its own
 * content. A scope with an `@at` in it does have one — the coordinates are
 * counted from its (0, 0), the container's inner corner — and that point has to
 * stay put, or moving one child would slide all the others. Only content that
 * reaches *before* the origin still shifts, because nothing may be drawn outside
 * the box that holds it.
 */
function settle(
  items: Placeable[],
  pos: Map<string, { x: number; y: number }>,
  pinned: boolean,
): ScopeResult {
  const { min, max } = bounds(items, pos);
  const shift = pinned ? { x: Math.min(0, min.x), y: Math.min(0, min.y) } : min;
  for (const it of items) {
    const p = pos.get(it.id)!;
    pos.set(it.id, { x: p.x - shift.x, y: p.y - shift.y });
  }
  return { pos, width: max.x - shift.x, height: max.y - shift.y, offset: shift };
}
