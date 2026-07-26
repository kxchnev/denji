import type { ArchDiagram } from "../../model/arch.js";
import type { Size } from "../../model/geometry.js";
import { measureLabelWidth, measureShape } from "./measure.js";
import { layoutScope, type Placeable } from "./relative.js";
import { routeConnections } from "./route.js";

export interface ArchLayoutOptions {
  /** Spacing between siblings. */
  gap?: number;
  /** Inner padding between a container border and its content. */
  padding?: number;
  /** Height of a container's title header. */
  headerH?: number;
  /** Outer margin around the whole drawing. */
  margin?: number;
}

interface Local {
  x: number;
  y: number;
}

/**
 * Lay out an architecture diagram. Relative hints place siblings within each
 * scope; containers are sized bottom-up to wrap their children, then positioned
 * in their parent scope. Mutates and returns the diagram.
 */
export function layoutArchitecture(diagram: ArchDiagram, opts: ArchLayoutOptions = {}): ArchDiagram {
  const gap = opts.gap ?? 40;
  const padding = opts.padding ?? 24;
  const headerH = opts.headerH ?? 28;
  const margin = opts.margin ?? 24;

  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));

  const childIds = new Set<string>();
  for (const n of diagram.nodes) {
    if (n.type === "container") for (const c of n.children) childIds.add(c);
  }
  const topLevel = diagram.nodes.filter((n) => !childIds.has(n.id)).map((n) => n.id);

  const sizeMap = new Map<string, Size>();
  const childLocal = new Map<string, Map<string, Local>>();
  const innerOffset = new Map<string, Local>();

  // Bottom-up sizing: a container's size depends on its laid-out children.
  const sizeNode = (id: string): Size => {
    const n = nodes.get(id)!;
    if (n.type === "shape") {
      const s = measureShape(n);
      sizeMap.set(id, s);
      return s;
    }
    const items: Placeable[] = n.children.map((cid) => {
      const s = sizeNode(cid);
      return { id: cid, width: s.width, height: s.height, hint: nodes.get(cid)!.hint };
    });
    let contentW = 0;
    let contentH = 0;
    if (items.length > 0) {
      const scope = layoutScope(items, gap);
      childLocal.set(id, scope.pos);
      contentW = scope.width;
      contentH = scope.height;
    } else {
      childLocal.set(id, new Map());
    }
    const labelW = measureLabelWidth(n.label) + 24;
    const width = Math.max(contentW + padding * 2, labelW);
    const height = contentH + padding * 2 + headerH;
    innerOffset.set(id, { x: padding, y: headerH + padding });
    const size = { width, height };
    sizeMap.set(id, size);
    return size;
  };

  const topItems: Placeable[] = topLevel.map((id) => {
    const s = sizeNode(id);
    return { id, width: s.width, height: s.height, hint: nodes.get(id)!.hint };
  });
  const topScope = layoutScope(topItems, gap);

  // Top-down absolute placement.
  const place = (id: string, absX: number, absY: number): void => {
    const n = nodes.get(id)!;
    const s = sizeMap.get(id)!;
    n.rect = { x: absX, y: absY, width: s.width, height: s.height };
    if (n.type === "container") {
      const off = innerOffset.get(id)!;
      const locs = childLocal.get(id)!;
      for (const cid of n.children) {
        const lp = locs.get(cid);
        if (lp) place(cid, absX + off.x + lp.x, absY + off.y + lp.y);
      }
    }
  };
  for (const id of topLevel) {
    const p = topScope.pos.get(id)!;
    place(id, p.x, p.y);
  }

  normalizeToOrigin(diagram, margin);
  routeConnections(diagram);
  return diagram;
}

function normalizeToOrigin(diagram: ArchDiagram, margin: number): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const n of diagram.nodes) {
    if (!n.rect) continue;
    minX = Math.min(minX, n.rect.x);
    minY = Math.min(minY, n.rect.y);
  }
  if (!isFinite(minX)) return;
  const dx = margin - minX;
  const dy = margin - minY;
  for (const n of diagram.nodes) {
    if (!n.rect) continue;
    n.rect.x += dx;
    n.rect.y += dy;
  }
}
