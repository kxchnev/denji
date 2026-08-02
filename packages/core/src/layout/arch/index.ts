import type { ArchDiagram, StyleProps } from "../../model/arch.js";
import { resolveStyle } from "../../model/style.js";
import type { Size } from "../../model/geometry.js";
import { ICON_GAP, ICON_SIZE, measureLabelWidth, measureShape } from "./measure.js";
import { layoutScope, type AxisGaps, type LayoutWarning, type Placeable } from "./relative.js";
import { routeConnections } from "./route.js";

/**
 * Caller-side defaults. Anything the diagram itself declares (`@spacing`,
 * `@padding`, `@margin` in the DSL) wins over these — the document is authored
 * intent, options are just the environment's fallback.
 */
export interface ArchLayoutOptions {
  /** Spacing between siblings, both axes. Overridden by gapX/gapY. */
  gap?: number;
  /** Horizontal spacing between siblings. */
  gapX?: number;
  /** Vertical spacing between siblings. */
  gapY?: number;
  /** Inner padding between a container border and its content. */
  padding?: number;
  /** Height of a container's title header. */
  headerH?: number;
  /** Outer margin around the whole drawing. */
  margin?: number;
  /**
   * Called for anything the layout could not honour literally — today only a
   * cycle in relative hints. Defaults to a `console.warn`, which is right for a
   * person watching a build but useless to `power check`, which needs to collect
   * them. Pass a sink (even an empty one) to take over.
   */
  onWarn?: (warning: LayoutWarning) => void;
}

const warnToConsole = (w: LayoutWarning): void => {
  console.warn(`power: ${w.message}.`);
};

const DEFAULT_GAP = 40;
const DEFAULT_PADDING = 24;
/** The renderer draws this band; exported so the two cannot drift apart. */
export const DEFAULT_HEADER_H = 28;
const DEFAULT_MARGIN = 24;

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
  // Document over options over built-in, per axis.
  const rootGaps: AxisGaps = {
    x: diagram.spacing?.x ?? opts.gapX ?? opts.gap ?? DEFAULT_GAP,
    y: diagram.spacing?.y ?? opts.gapY ?? opts.gap ?? DEFAULT_GAP,
  };
  const padding = opts.padding ?? DEFAULT_PADDING;
  const headerH = opts.headerH ?? DEFAULT_HEADER_H;
  const margin = diagram.margin ?? opts.margin ?? DEFAULT_MARGIN;
  const onWarn = opts.onWarn ?? warnToConsole;

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
  // `inherited` flows down the container tree so a diagram-level spacing reaches
  // every scope, and a container's own spacing governs its whole subtree.
  const styleOf = (id: string): StyleProps => {
    const n = nodes.get(id)!;
    return resolveStyle(diagram.styles, n.kind, n.styleRefs, n.styleProps);
  };

  const sizeNode = (id: string, inherited: AxisGaps): Size => {
    const n = nodes.get(id)!;
    if (n.type === "shape") {
      const s = measureShape(n, styleOf(id));
      sizeMap.set(id, s);
      return s;
    }
    const gaps: AxisGaps = {
      x: n.spacing?.x ?? inherited.x,
      y: n.spacing?.y ?? inherited.y,
    };
    const pad = n.padding ?? padding;
    const items: Placeable[] = n.children.map((cid) => {
      const s = sizeNode(cid, gaps);
      return { id: cid, width: s.width, height: s.height, hint: nodes.get(cid)!.hint };
    });
    let contentW = 0;
    let contentH = 0;
    if (items.length > 0) {
      const scope = layoutScope(items, gaps, onWarn);
      childLocal.set(id, scope.pos);
      contentW = scope.width;
      contentH = scope.height;
    } else {
      childLocal.set(id, new Map());
    }
    const iconW = n.icon ? ICON_SIZE + ICON_GAP : 0;
    const labelW = measureLabelWidth(n.label) + iconW + 24;
    // A container hugs its content, so an explicit size can only be a floor —
    // honouring it exactly would crop the children it is meant to hold.
    const own = styleOf(id);
    const width = Math.max(contentW + pad * 2, labelW, own.width ?? 0);
    const height = Math.max(contentH + pad * 2 + headerH, own.height ?? 0);
    innerOffset.set(id, { x: pad, y: headerH + pad });
    const size = { width, height };
    sizeMap.set(id, size);
    return size;
  };

  const topItems: Placeable[] = topLevel.map((id) => {
    const s = sizeNode(id, rootGaps);
    return { id, width: s.width, height: s.height, hint: nodes.get(id)!.hint };
  });
  const topScope = layoutScope(topItems, rootGaps, onWarn);

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
