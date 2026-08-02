import type { PlaceHint } from "../../model/arch.js";
import { intersects, type Rect } from "../../model/geometry.js";

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
 * one relation per axis.
 */
export function resolvedAnchors(
  id: string,
  hint: PlaceHint | undefined,
  siblings: ReadonlyMap<string, unknown> | ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const hx = hint?.rightOf ?? hint?.leftOf;
  const vy = hint?.below ?? hint?.above;
  if (hx && hx !== id && siblings.has(hx)) out.push(hx);
  if (vy && vy !== id && siblings.has(vy)) out.push(vy);
  return out;
}

/**
 * Resolve a single scope of siblings into local coordinates using relative
 * hints only. X comes from rightOf/leftOf, Y from above/below; the single given
 * relation also aligns the cross axis.
 *
 * Siblings tied together by hints form one block, solved on its own. A node
 * with no resolvable hint is its own block, parked `rightOf` the previous one
 * and centered on it — so it can never land on top of a hinted structure.
 * Within a block, a node whose slot is already taken slides clear along the
 * cross axis of the relation that placed it. The result is normalized to
 * origin (0,0).
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

  const pos = new Map<string, { x: number; y: number }>();
  let prev: Rect | undefined;
  for (const members of buildBlocks(items, anchorIds)) {
    const local = placeBlock(members, gaps, anchorIds, onWarn);
    // Blocks are laid out left to right, so this is a horizontal gap.
    const g = members[0]!.hint?.gap ?? gaps.x;
    // Blocks occupy strictly increasing, disjoint x-intervals, so nothing from
    // one block can ever overlap another.
    const dx = prev ? prev.x + prev.width + g : 0;
    const dy = prev ? prev.y + (prev.height - local.height) / 2 : 0;
    for (const it of members) {
      const p = local.pos.get(it.id)!;
      pos.set(it.id, { x: p.x + dx, y: p.y + dy });
    }
    prev = { x: dx, y: dy, width: local.width, height: local.height };
  }

  return normalize(items, pos);
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

/** Solve one block of hint-connected siblings into local coordinates. */
function placeBlock(
  members: Placeable[],
  gaps: AxisGaps,
  anchorIds: (it: Placeable) => string[],
  onWarn?: (warning: LayoutWarning) => void,
): ScopeResult {
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
  const placed: Rect[] = [];

  for (const id of order) {
    const it = byId.get(id)!;
    const h = it.hint;
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
        y = pa.y + (pit.height - it.height) / 2; // center on the previous sibling
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

  return normalize(members, pos);
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

function alignCoord(anchorPos: number, anchorSize: number, size: number, align: string): number {
  if (align === "center") return anchorPos + (anchorSize - size) / 2;
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

function normalize(items: Placeable[], pos: Map<string, { x: number; y: number }>): ScopeResult {
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
  if (!isFinite(minX)) return { pos, width: 0, height: 0 };
  for (const it of items) {
    const p = pos.get(it.id)!;
    pos.set(it.id, { x: p.x - minX, y: p.y - minY });
  }
  return { pos, width: maxX - minX, height: maxY - minY };
}
