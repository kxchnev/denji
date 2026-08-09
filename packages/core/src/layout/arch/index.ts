import type { ArchDiagram, ContainerText, Corner, Shape, StyleProps } from "../../model/arch.js";
import { resolveStyle } from "../../model/style.js";
import type { Size } from "../../model/geometry.js";
import { ceilToGrid } from "./grid.js";
import {
  chooseShapeWidths,
  ICON_GAP,
  ICON_SIZE,
  measureLabelWidth,
  measureNoteStack,
  measureShape,
  noteLines,
  NOTE_GAP,
  NOTE_INSET,
  NOTE_LINE_H,
} from "./measure.js";
import { layoutScope, type AxisGaps, type LayoutWarning, type Placeable } from "./scope.js";
import { hierarchy, projectEdges } from "./graph.js";
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
 * Lay out an architecture diagram. Each scope is arranged from its own share of
 * the connections, narrowed by whatever hints the author wrote; containers are
 * sized bottom-up to wrap their children, then positioned in their parent scope.
 * Mutates and returns the diagram.
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

  const { parentOf, ancestorsOf, topLevel } = hierarchy(diagram);
  // Each scope is arranged from the connections it can see: a connection between
  // two containers' innards is, from the outside, a reason for those containers
  // to sit near each other.
  const scopeEdges = projectEdges(diagram, parentOf);

  const sizeMap = new Map<string, Size>();
  const childLocal = new Map<string, Map<string, Local>>();
  const innerOffset = new Map<string, Local>();
  /** Per scope: what normalizing it subtracted, i.e. the space `@at` speaks in. */
  const scopeOffset = new Map<string, Local>();
  /** Per scope: the corridors it kept clear, in that scope's own coordinates. */
  const scopeLanes = new Map<string, Map<string, Local[]>>();

  // Bottom-up sizing: a container's size depends on its laid-out children.
  // `inherited` flows down the container tree so a diagram-level spacing reaches
  // every scope, and a container's own spacing governs its whole subtree.
  const styleOf = (id: string): StyleProps => {
    const n = nodes.get(id)!;
    return resolveStyle(diagram.styles, n.kind, n.styleRefs, n.styleProps);
  };

  // One width for every leaf, decided before anything is sized. It depends only
  // on labels, kinds and marks — never on geometry — which is why a flat pass
  // can settle it up front and the bottom-up recursion below just reads it.
  const shapeWidths = chooseShapeWidths(
    diagram.nodes.filter((n): n is Shape => n.type === "shape"),
    (s) => resolveStyle(diagram.styles, s.kind, s.styleRefs, s.styleProps),
  );

  const sizeNode = (id: string, inherited: AxisGaps): Size => {
    const n = nodes.get(id)!;
    if (n.type === "shape") {
      const s = measureShape(n, styleOf(id), shapeWidths);
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
      const scope = layoutScope(items, scopeEdges.get(id) ?? [], gaps, onWarn);
      childLocal.set(id, scope.pos);
      scopeOffset.set(id, scope.offset);
      if (scope.lanes) scopeLanes.set(id, scope.lanes);
      contentW = scope.width;
      contentH = scope.height;
    } else {
      childLocal.set(id, new Map());
      scopeOffset.set(id, { x: 0, y: 0 });
    }
    const iconW = n.icon ? ICON_SIZE + ICON_GAP : 0;
    const labelW = measureLabelWidth(n.label) + iconW + 24;
    // Corner texts get bands of their own so they never land on the children:
    // the top one pushes the content down, the bottom one grows the box.
    const bands = noteBands(n.texts);
    // A container hugs its content, so an explicit size can only be a floor —
    // honouring it exactly would crop the children it is meant to hold.
    const own = styleOf(id);
    // Only the width needs the grid. Its measured inputs — a title, a corner text —
    // come from glyph advances and are fractional, and a box wider than its content
    // already leaves the slack on the right whenever a long title decides the width.
    // The height has no fractional input to round: the header, the padding and the
    // note bands are whole numbers and `contentH` is on the grid already, so ceiling
    // it would only shove the rounding into the bottom padding and stop padding
    // meaning padding. The author's own number passes through untouched either way.
    const width = Math.max(
      ceilToGrid(Math.max(contentW + pad * 2, labelW, bands.width)),
      own.width ?? 0,
    );
    const height = Math.max(contentH + pad * 2 + headerH + bands.top + bands.bottom, own.height ?? 0);
    innerOffset.set(id, { x: pad, y: headerH + bands.top + pad });
    const size = { width, height };
    sizeMap.set(id, size);
    return size;
  };

  const topItems: Placeable[] = topLevel.map((id) => {
    const s = sizeNode(id, rootGaps);
    return { id, width: s.width, height: s.height, hint: nodes.get(id)!.hint };
  });
  const topScope = layoutScope(topItems, scopeEdges.get("") ?? [], rootGaps, onWarn);
  if (topScope.lanes) scopeLanes.set("", topScope.lanes);

  /** Where each scope's own (0, 0) ended up on the drawing. */
  const scopeOrigin = new Map<string, Local>([["", { x: 0, y: 0 }]]);

  // Top-down absolute placement. `local` travels alongside: it is the same
  // position expressed in the scope's own space, which `rect` cannot recover
  // because every scope was normalized to its own origin on the way up.
  const place = (id: string, absX: number, absY: number, local: Local): void => {
    const n = nodes.get(id)!;
    const s = sizeMap.get(id)!;
    n.rect = { x: absX, y: absY, width: s.width, height: s.height };
    n.local = local;
    if (n.type === "container") {
      const off = innerOffset.get(id)!;
      const locs = childLocal.get(id)!;
      const scope = scopeOffset.get(id)!;
      scopeOrigin.set(id, { x: absX + off.x, y: absY + off.y });
      for (const cid of n.children) {
        const lp = locs.get(cid);
        if (lp) {
          place(cid, absX + off.x + lp.x, absY + off.y + lp.y, {
            x: lp.x + scope.x,
            y: lp.y + scope.y,
          });
        }
      }
    }
  };
  for (const id of topLevel) {
    const p = topScope.pos.get(id)!;
    place(id, p.x, p.y, { x: p.x + topScope.offset.x, y: p.y + topScope.offset.y });
  }

  const framed = normalizeToOrigin(diagram, margin);
  // From document coordinates to rects: what the top scope subtracted on the way up,
  // then what framing the drawing added. A viewer that pans in document coordinates
  // undoes exactly this.
  diagram.originShift = {
    x: framed.x - topScope.offset.x,
    y: framed.y - topScope.offset.y,
  };

  // Hand the router the corridors, one per connection, in the drawing's own
  // coordinates. Connections that collapsed into a single edge of some scope
  // share a corridor, which is exactly the bundle the router will spread into a
  // bus; the deepest scope to reserve one wins, because it knows the most about
  // the space the connection actually has to cross.
  const lanes = new Map<number, Local[]>();
  for (const [scope, byEdge] of scopeLanes) {
    const origin = scopeOrigin.get(scope);
    if (!origin) continue;
    for (const e of scopeEdges.get(scope) ?? []) {
      const pts = byEdge.get(e.key);
      if (!pts || pts.length === 0) continue;
      const abs = pts.map((p) => ({ x: p.x + origin.x + framed.x, y: p.y + origin.y + framed.y }));
      for (const i of e.indices) lanes.set(i, abs);
    }
  }

  routeConnections(diagram, { ancestorsOf, lanes });
  return diagram;
}

/**
 * The space a container's corner texts claim: a band per occupied edge, as tall
 * as the longer of the two stacks that share it, and a width floor wide enough
 * for the widest band. A left and a right stack share one band, so their widths
 * add up.
 */
function noteBands(texts: ContainerText[] | undefined): {
  top: number;
  bottom: number;
  width: number;
} {
  if (!texts || texts.length === 0) return { top: 0, bottom: 0, width: 0 };
  const stack = (corner: Corner): readonly ContainerText[] => noteLines(texts, corner);
  const band = (
    left: readonly ContainerText[],
    right: readonly ContainerText[],
  ): { height: number; width: number } => {
    const lw = measureNoteStack(left);
    const rw = measureNoteStack(right);
    return {
      height: Math.max(left.length, right.length) * NOTE_LINE_H,
      width: lw + rw + (lw > 0 && rw > 0 ? NOTE_GAP : 0),
    };
  };
  const top = band(stack("topLeft"), stack("topRight"));
  const bottom = band(stack("bottomLeft"), stack("bottomRight"));
  return {
    top: top.height,
    bottom: bottom.height,
    width: Math.max(top.width, bottom.width) + NOTE_INSET * 2,
  };
}

/** Moves every rect into the box the renderer will draw, and reports by how much. */
function normalizeToOrigin(diagram: ArchDiagram, margin: number): Local {
  let minX = Infinity;
  let minY = Infinity;
  for (const n of diagram.nodes) {
    if (!n.rect) continue;
    minX = Math.min(minX, n.rect.x);
    minY = Math.min(minY, n.rect.y);
  }
  if (!isFinite(minX)) return { x: 0, y: 0 };
  // Only pull the drawing back when it starts before the origin. A relative scope
  // already begins at 0, so this is the same margin it always was; a scope placed by
  // coordinates keeps whatever space its own numbers asked for, instead of sliding
  // the whole picture every time the leftmost node moves.
  const dx = margin - Math.min(0, minX);
  const dy = margin - Math.min(0, minY);
  for (const n of diagram.nodes) {
    if (!n.rect) continue;
    n.rect.x += dx;
    n.rect.y += dy;
  }
  return { x: dx, y: dy };
}
