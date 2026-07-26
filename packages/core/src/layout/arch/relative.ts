import type { PlaceHint } from "../../model/arch.js";

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

/**
 * Resolve a single scope of siblings into local coordinates using relative
 * hints only. X comes from rightOf/leftOf, Y from above/below; the single given
 * relation also aligns the cross axis. A node with no relation defaults to
 * `rightOf` the previous sibling. The result is normalized to origin (0,0).
 */
export function layoutScope(items: Placeable[], gap: number): ScopeResult {
  const byId = new Map(items.map((it) => [it.id, it]));
  const prevOf = new Map<string, string>();
  for (let i = 1; i < items.length; i++) prevOf.set(items[i]!.id, items[i - 1]!.id);

  const anchorsOf = (it: Placeable): string[] => {
    const h = it.hint;
    const out: string[] = [];
    const hx = h?.rightOf ?? h?.leftOf;
    const vy = h?.below ?? h?.above;
    if (hx && byId.has(hx)) out.push(hx);
    if (vy && byId.has(vy)) out.push(vy);
    if (out.length === 0) {
      const p = prevOf.get(it.id);
      if (p) out.push(p);
    }
    return out;
  };

  const order = topoOrder(items, anchorsOf);
  const pos = new Map<string, { x: number; y: number }>();

  for (const id of order) {
    const it = byId.get(id)!;
    const h = it.hint;
    // Center on the cross axis by default so connected nodes share an axis and
    // their connectors stay straight. Override per node with @align(start|end).
    const align = h?.align ?? "center";
    const g = h?.gap ?? gap;

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
        x = pa.x + pit.width + g;
        y = pa.y + (pit.height - it.height) / 2; // center on the previous sibling
      }
    } else {
      if (hx) {
        const a = pos.get(hx.anchor);
        const ai = byId.get(hx.anchor);
        if (a && ai) {
          x = hx.side === "right" ? a.x + ai.width + g : a.x - it.width - g;
          if (!vy) y = alignCoord(a.y, ai.height, it.height, align);
        }
      }
      if (vy) {
        const a = pos.get(vy.anchor);
        const ai = byId.get(vy.anchor);
        if (a && ai) {
          y = vy.side === "below" ? a.y + ai.height + g : a.y - it.height - g;
          if (!hx) x = alignCoord(a.x, ai.width, it.width, align);
        }
      }
    }

    pos.set(id, { x, y });
  }

  return normalize(items, pos);
}

function alignCoord(anchorPos: number, anchorSize: number, size: number, align: string): number {
  if (align === "center") return anchorPos + (anchorSize - size) / 2;
  if (align === "end") return anchorPos + anchorSize - size;
  return anchorPos; // start
}

/** Kahn topological sort by anchor dependency; cycles fall back to input order. */
function topoOrder(items: Placeable[], anchorsOf: (it: Placeable) => string[]): string[] {
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
    console.warn("power: relative hints form a cycle; affected nodes fall back to declaration order.");
    for (const it of items) if (!placed.has(it.id)) order.push(it.id);
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
