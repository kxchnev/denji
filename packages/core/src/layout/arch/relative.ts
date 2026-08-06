import type { PlaceHint } from "../../model/arch.js";
import { intersects, type Rect } from "../../model/geometry.js";
import { snapHalf } from "./grid.js";

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
 * node as anchored when the layout treats it as loose.
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
 * Resolve a single scope of siblings into local coordinates. X comes from
 * rightOf/leftOf, Y from above/below; the single given relation also aligns the
 * cross axis. A node carrying `hint.at` skips all of that and sits exactly where
 * it says.
 *
 * Siblings tied together by hints form one block, solved on its own. A node
 * with no resolvable hint is its own block, parked `rightOf` the previous one
 * and centered on it — so it can never land on top of a hinted structure.
 * Within a block, a node whose slot is already taken slides clear along the
 * cross axis of the relation that placed it. The result is normalized to
 * origin (0,0), and `offset` says by how much.
 *
 * Blocks come in two flavours once coordinates are in play. One holding a pinned
 * node is *anchored*: its positions are already in the scope's own coordinates,
 * so it is placed first and never moved. The rest flow left to right as they
 * always have, routing around everything anchored — which is what keeps a
 * half-dragged diagram from landing on top of itself.
 *
 * A scope with coordinates in it also keeps its origin: it is measured from (0, 0)
 * rather than packed against its leftmost node. Re-anchoring would mean that moving
 * one child slides every other one — the whole reason coordinates exist is that
 * they do not do that.
 *
 * Every distance comes from `gaps`, picked by the axis it acts on; a node's
 * own `hint.gap` replaces it for that node's relation.
 */
export function layoutScope(
  items: Placeable[],
  gaps: AxisGaps,
  onWarn?: (warning: LayoutWarning) => void,
): ScopeResult {
  const byId = new Map(items.map((it) => [it.id, it]));
  const anchorIds = (it: Placeable): string[] => resolvedAnchors(it.id, it.hint, byId);
  const rectOf = (it: Placeable, p: { x: number; y: number }): Rect => ({
    x: p.x,
    y: p.y,
    width: it.width,
    height: it.height,
  });

  const blocks = buildBlocks(items, anchorIds);
  const anchored = (members: Placeable[]): boolean => members.some((it) => it.hint?.at);
  // Every pinned rect is known before anything is placed, so an anchored block's
  // own followers can route around pins belonging to other blocks too.
  const pinned: Rect[] = items
    .filter((it) => it.hint?.at)
    .map((it) => rectOf(it, it.hint!.at!));

  const pos = new Map<string, { x: number; y: number }>();
  const obstacles: Rect[] = [...pinned];

  for (const members of blocks.filter(anchored)) {
    const solved = placeBlock(members, gaps, anchorIds, onWarn, pinned);
    for (const it of members) {
      const p = solved.pos.get(it.id)!;
      pos.set(it.id, p);
      // A follower of a pinned node is as immovable as the pin itself, so the
      // flow has to route around it as well.
      obstacles.push(rectOf(it, p));
    }
  }

  let prev: Rect | undefined;
  for (const members of blocks.filter((m) => !anchored(m))) {
    const local = placeBlock(members, gaps, anchorIds, onWarn, obstacles);
    // Blocks are laid out left to right, so this is a horizontal gap.
    const g = members[0]!.hint?.gap ?? gaps.x;
    // Blocks occupy strictly increasing, disjoint x-intervals, so nothing from
    // one block can ever overlap another…
    const dx = prev ? prev.x + prev.width + g : 0;
    const dy = prev ? prev.y + snapHalf((prev.height - local.height) / 2) : 0;
    // …but an anchored block sits wherever its coordinates say, so the flow steps
    // past it. With nothing pinned `obstacles` is empty and this is a no-op.
    const box = slideClear({ x: dx, y: dy, width: local.width, height: local.height }, obstacles, "right", gaps.x);
    for (const it of members) {
      const p = local.pos.get(it.id)!;
      pos.set(it.id, { x: p.x - local.min.x + box.x, y: p.y - local.min.y + box.y });
    }
    prev = box;
  }

  return settle(items, pos, pinned.length > 0);
}

/**
 * Siblings tied together by resolvable hints, as connected components of the
 * hint graph. Components come in order of first declaration, members in
 * declaration order. Note an unhinted node that others anchor to still belongs
 * to their block — only a node nothing references stands alone.
 */
function buildBlocks(items: Placeable[], anchorIds: (it: Placeable) => string[]): Placeable[][] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const rank = new Map(items.map((it, i) => [it.id, i]));
  const adj = new Map<string, string[]>(items.map((it) => [it.id, []]));
  for (const it of items) {
    for (const a of anchorIds(it)) {
      adj.get(it.id)!.push(a);
      adj.get(a)!.push(it.id);
    }
  }

  const seen = new Set<string>();
  const out: Placeable[][] = [];
  for (const start of items) {
    if (seen.has(start.id)) continue;
    seen.add(start.id);
    const stack = [start.id];
    const members: Placeable[] = [];
    while (stack.length > 0) {
      const id = stack.pop()!;
      members.push(byId.get(id)!);
      for (const n of adj.get(id)!) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    members.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    out.push(members);
  }
  return out;
}

interface BlockResult {
  pos: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  /** Top-left of the block's bounding box, in the space the block was solved in. */
  min: { x: number; y: number };
}

/**
 * Solve one block of hint-connected siblings. Positions come back in the space
 * the block happened to be solved in — around a pinned node that is the scope's
 * own space, otherwise it is arbitrary — so the caller decides whether to move
 * the block, using `min`.
 *
 * `obstacles` are rects already claimed elsewhere in the scope; a node that would
 * land on one slides clear of it exactly as it does of its own block's members.
 */
function placeBlock(
  members: Placeable[],
  gaps: AxisGaps,
  anchorIds: (it: Placeable) => string[],
  onWarn?: (warning: LayoutWarning) => void,
  obstacles: readonly Rect[] = [],
): BlockResult {
  const byId = new Map(members.map((it) => [it.id, it]));
  const prevOf = new Map<string, string>();
  for (let i = 1; i < members.length; i++) prevOf.set(members[i]!.id, members[i - 1]!.id);

  // Inside a block an unhinted node still follows its predecessor — that is how
  // the node others anchor to gets a position of its own.
  const anchorsOf = (it: Placeable): string[] => {
    const explicit = anchorIds(it);
    if (explicit.length > 0) return explicit;
    const p = prevOf.get(it.id);
    return p ? [p] : [];
  };

  const order = topoOrder(members, anchorsOf, onWarn);
  const pos = new Map<string, { x: number; y: number }>();
  const placed: Rect[] = [...obstacles];

  for (const id of order) {
    const it = byId.get(id)!;
    const h = it.hint;

    // Exact coordinates are the author's own decision — nothing is aligned,
    // nothing slides. The rect still joins `placed`, so siblings route around it.
    if (h?.at) {
      pos.set(id, { x: h.at.x, y: h.at.y });
      placed.push({ x: h.at.x, y: h.at.y, width: it.width, height: it.height });
      continue;
    }

    // Center on the cross axis by default so connected nodes share an axis and
    // their connectors stay straight. Override per node with @align(start|end).
    const align = h?.align ?? "center";
    // A node's own gap replaces the scope default on whichever axis it acts.
    const gx = h?.gap ?? gaps.x;
    const gy = h?.gap ?? gaps.y;

    const hx = h?.rightOf
      ? { anchor: h.rightOf, side: "right" as const }
      : h?.leftOf
        ? { anchor: h.leftOf, side: "left" as const }
        : undefined;
    const vy = h?.below
      ? { anchor: h.below, side: "below" as const }
      : h?.above
        ? { anchor: h.above, side: "above" as const }
        : undefined;

    let x = 0;
    let y = 0;

    if (!hx && !vy) {
      const p = prevOf.get(id);
      const pa = p ? pos.get(p) : undefined;
      const pit = p ? byId.get(p) : undefined;
      if (pa && pit) {
        x = pa.x + pit.width + gx; // the implicit flow is horizontal
        y = pa.y + snapHalf((pit.height - it.height) / 2); // center on the previous sibling
      }
    } else {
      if (hx) {
        const a = pos.get(hx.anchor);
        const ai = byId.get(hx.anchor);
        if (a && ai) {
          x = hx.side === "right" ? a.x + ai.width + gx : a.x - it.width - gx;
          if (!vy) y = alignCoord(a.y, ai.height, it.height, align);
        }
      }
      if (vy) {
        const a = pos.get(vy.anchor);
        const ai = byId.get(vy.anchor);
        if (a && ai) {
          y = vy.side === "below" ? a.y + ai.height + gy : a.y - it.height - gy;
          if (!hx) x = alignCoord(a.x, ai.width, it.width, align);
        }
      }
    }

    // A horizontal relation owns its column, so it keeps x and slides down; a
    // vertical one owns its row and slides right. The flow keeps flowing right.
    const rect = slideClear(
      { x, y, width: it.width, height: it.height },
      placed,
      hx ? "down" : "right",
      hx ? gy : gx,
    );
    pos.set(id, { x: rect.x, y: rect.y });
    placed.push(rect);
  }

  return bbox(members, pos);
}

/**
 * Move a rect along one axis until it clears everything already placed. Each
 * step jumps past the far edge of the obstacle it hit, so a given obstacle can
 * only be hit once and the loop is bounded by `placed.length`.
 */
function slideClear(r: Rect, placed: Rect[], dir: "down" | "right", gap: number): Rect {
  let out = r;
  for (let guard = 0; guard <= placed.length; guard++) {
    const hit = placed.find((p) => intersects(out, p));
    if (!hit) break;
    out =
      dir === "down"
        ? { ...out, y: hit.y + hit.height + gap }
        : { ...out, x: hit.x + hit.width + gap };
  }
  return out;
}

/**
 * The cross-axis coordinate one relation implies. The centring offset is snapped
 * rather than the result, so a node following an author's fractional `@at` keeps
 * that fraction instead of being dragged onto the lattice behind their back.
 */
function alignCoord(anchorPos: number, anchorSize: number, size: number, align: string): number {
  if (align === "center") return anchorPos + snapHalf((anchorSize - size) / 2);
  if (align === "end") return anchorPos + anchorSize - size;
  return anchorPos; // start
}

/** Kahn topological sort by anchor dependency; cycles fall back to input order. */
function topoOrder(
  items: Placeable[],
  anchorsOf: (it: Placeable) => string[],
  onWarn?: (warning: LayoutWarning) => void,
): string[] {
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const it of items) {
    indeg.set(it.id, 0);
    dependents.set(it.id, []);
  }
  for (const it of items) {
    for (const a of anchorsOf(it)) {
      indeg.set(it.id, (indeg.get(it.id) ?? 0) + 1);
      dependents.get(a)!.push(it.id);
    }
  }

  const queue = items.filter((it) => (indeg.get(it.id) ?? 0) === 0).map((it) => it.id);
  const order: string[] = [];
  const placed = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (placed.has(id)) continue;
    placed.add(id);
    order.push(id);
    for (const d of dependents.get(id) ?? []) {
      indeg.set(d, (indeg.get(d) ?? 0) - 1);
      if ((indeg.get(d) ?? 0) === 0) queue.push(d);
    }
  }

  if (order.length < items.length) {
    const stuck = items.filter((it) => !placed.has(it.id)).map((it) => it.id);
    onWarn?.({
      code: "hint-cycle",
      message: `relative hints form a cycle (${stuck.join(" → ")}); these nodes fall back to declaration order`,
      nodes: stuck,
    });
    for (const id of stuck) order.push(id);
  }
  return order;
}

/** Where `items` at `pos` begin and end, measured without moving anything. */
function bounds(
  items: Placeable[],
  pos: Map<string, { x: number; y: number }>,
): { min: { x: number; y: number }; max: { x: number; y: number } } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const p = pos.get(it.id)!;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + it.width);
    maxY = Math.max(maxY, p.y + it.height);
  }
  if (!isFinite(minX)) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** The extent of one block, for packing it against its neighbours. */
function bbox(items: Placeable[], pos: Map<string, { x: number; y: number }>): BlockResult {
  const { min, max } = bounds(items, pos);
  return { pos, width: max.x - min.x, height: max.y - min.y, min };
}

/**
 * Finish a scope: move it flush against its origin and measure it from there.
 *
 * Which origin depends on whether coordinates are involved. A relative-only scope
 * has no opinion about where it starts, so it is packed against its own content, as
 * it always has been. A scope with an `@at` in it does have one — the coordinates
 * are counted from its (0, 0), the container's inner corner — and that point has to
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
