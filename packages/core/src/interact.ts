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
import { CAP_RX, CAP_RY, ICON_SIZE, NOTE_INSET } from "./layout/arch/measure.js";
import type { Point, Rect } from "./model/geometry.js";
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

/**
 * The link button: the same 18px as a brand mark, so a badge and an icon read as
 * the same size of thing, and 6px clear of the silhouette — the largest inset
 * that still leaves it unmistakably *on* the element.
 */
export const LINK_BADGE = { size: ICON_SIZE, inset: 6 } as const;

/**
 * Where a node's link button sits, or null when it has no `@link`.
 *
 * Top-right of the **silhouette**, not of the bounding box: a database's box
 * corner is above its elliptical lid and a queue's is beyond its right cap, so
 * both would hang the button in empty space. A container gets it in the title
 * band instead, mirroring the title on the other side — which is also the only
 * band a group's corner texts cannot reach, since those start at `y + headerH`.
 *
 * The renderer draws this rect and the viewers hit-test it, from here, so that
 * "the button you see is the button you can press" is structural rather than a
 * comment on two functions that have to agree.
 */
export function linkBadgeRect(n: ArchNode, headerH: number = DEFAULT_HEADER_H): Rect | null {
  if (!n.link || !n.rect) return null;
  const r = n.rect;
  const { size, inset } = LINK_BADGE;
  if (n.type === "container") {
    return {
      x: r.x + r.width - NOTE_INSET - size,
      y: r.y + (headerH - size) / 2,
      width: size,
      height: size,
    };
  }
  // The queue is inset by its whole cap rather than by an exact ellipse solve:
  // where that boundary falls depends on the height, and an author may set one.
  const dx = n.kind === "queue" ? inset + CAP_RX : inset;
  const dy = n.kind === "database" ? inset + CAP_RY : inset;
  return { x: r.x + r.width - dx - size, y: r.y + dy, width: size, height: size };
}

export interface LinkHit {
  node: ArchNode;
  /** The URL as the author wrote it, already known to be http, https or mailto. */
  url: string;
  /** The button's box, for a viewer that wants to draw a hover state on it. */
  rect: Rect;
}

/**
 * The link button under `p` — same absolute space as `node.rect` — or null.
 *
 * Ties go to the deepest node, exactly as {@link nodeAt} resolves them. Unlike
 * `nodeAt` this does not need `local`: that is a prerequisite for dragging, and
 * opening a URL is not a drag.
 */
export function linkAt(
  diagram: ArchDiagram | null,
  p: Point,
  depths: Map<string, number> = nodeDepths(diagram),
  headerH: number = DEFAULT_HEADER_H,
): LinkHit | null {
  let best: LinkHit | null = null;
  for (const n of diagram?.nodes ?? []) {
    const r = linkBadgeRect(n, headerH);
    if (!r) continue;
    if (p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > r.y + r.height) continue;
    if (!best || (depths.get(n.id) ?? 0) >= (depths.get(best.node.id) ?? 0)) {
      best = { node: n, url: n.link!, rect: r };
    }
  }
  return best;
}

/**
 * What a pointer at `p` picks up: a button beats a node, always.
 *
 * The two answers overlap on purpose, and the order is not a preference. A
 * container is grabbable only over its title band ({@link nodeAt}) and its
 * button hangs *in* that band, so without one fixed precedence the same 18px
 * would open a URL in one viewer and start a drag in the other. The cost is
 * real and accepted: that patch of the band no longer drags the container.
 */
export function pickAt(
  diagram: ArchDiagram | null,
  p: Point,
  depths: Map<string, number> = nodeDepths(diagram),
  headerH: number = DEFAULT_HEADER_H,
): { kind: "link"; hit: LinkHit } | { kind: "node"; node: ArchNode } | null {
  const link = linkAt(diagram, p, depths, headerH);
  if (link) return { kind: "link", hit: link };
  const node = nodeAt(diagram, p, depths, headerH);
  return node ? { kind: "node", node } : null;
}

/** True when `id` sits inside a container, whose inner corner it may not cross. */
export function isBoxed(diagram: ArchDiagram, id: string): boolean {
  return diagram.nodes.some((n) => n.type === "container" && n.children.includes(id));
}
