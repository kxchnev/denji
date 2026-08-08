/**
 * What an interactive viewer needs to know about a laid-out diagram to let a
 * pointer pick things up: which node is under it, and what has to be nailed down
 * before anything is allowed to move.
 *
 * Pure functions over the model — no DOM, no rendering. They live here rather
 * than in each viewer because there are two of them now (the docs playground and
 * the VS Code preview) and the rules below are the kind that look arbitrary
 * until the day the diagram falls apart without them.
 */

import { GRID } from "./layout/arch/grid.js";
import { DEFAULT_HEADER_H } from "./layout/arch/index.js";
import type { Point } from "./model/geometry.js";
import type { ArchDiagram, ArchNode } from "./model/arch.js";

/**
 * A drop lands on the same lattice the layout sizes boxes on, so a dragged node
 * stays aligned with the ones still placed by hints, and the coordinate written
 * into the document stays a round number.
 */
export const snapToGrid = (v: number): number => Math.round(v / GRID) * GRID;

/**
 * Every node that has no coordinates yet, at the coordinates it currently sits on.
 *
 * A drag writes all of these before it writes the move itself, which turns the
 * whole document into one placed by coordinates. Anything less does not hold still:
 * take one node out of a relative scope and everything left in it re-arranges, and
 * a child that grows its container re-arranges that container's scope in turn — so
 * the one thing that visibly would not move is the node under the pointer.
 */
export function pinsFor(
  diagram: ArchDiagram,
  movingId: string,
): Array<{ id: string; at: Point }> {
  return diagram.nodes
    .filter((n) => n.id !== movingId && !n.hint?.at && n.local)
    .map((n) => ({ id: n.id, at: n.local! }));
}

/**
 * How deep each node sits in the container tree. A pointer over a child is also
 * over its parents, so the deepest hit is the one that meant it.
 */
export function nodeDepths(diagram: ArchDiagram | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!diagram) return out;
  const kids = new Map<string, readonly string[]>();
  for (const n of diagram.nodes) if (n.type === "container") kids.set(n.id, n.children);
  const child = new Set<string>();
  for (const list of kids.values()) for (const id of list) child.add(id);
  const walk = (id: string, depth: number): void => {
    out.set(id, depth);
    for (const c of kids.get(id) ?? []) walk(c, depth + 1);
  };
  for (const n of diagram.nodes) if (!child.has(n.id)) walk(n.id, 0);
  return out;
}

/**
 * The node a pointer at `p` — in the same absolute space as `node.rect` — would
 * pick up, or null for empty canvas.
 *
 * A shape is grabbable anywhere; a container only by its title band, so that its
 * body stays free for panning and for the children sitting in it. Pass `depths`
 * to reuse one {@link nodeDepths} pass across a whole gesture.
 */
export function nodeAt(
  diagram: ArchDiagram | null,
  p: Point,
  depths: Map<string, number> = nodeDepths(diagram),
  headerH: number = DEFAULT_HEADER_H,
): ArchNode | null {
  let best: ArchNode | null = null;
  for (const n of diagram?.nodes ?? []) {
    const r = n.rect;
    if (!r || !n.local) continue;
    const bottom = n.type === "container" ? r.y + headerH : r.y + r.height;
    if (p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > bottom) continue;
    if (!best || (depths.get(n.id) ?? 0) >= (depths.get(best.id) ?? 0)) best = n;
  }
  return best;
}

/** True when `id` sits inside a container, whose inner corner it may not cross. */
export function isBoxed(diagram: ArchDiagram, id: string): boolean {
  return diagram.nodes.some((n) => n.type === "container" && n.children.includes(id));
}
