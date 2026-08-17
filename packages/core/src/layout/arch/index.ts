import { NAME } from "../../brand.js";
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
import { autoPlace, type AxisGaps, type LayoutWarning, type Placeable } from "./auto.js";
import { hierarchy, projectEdges } from "./graph.js";
import { derivePorts, type ScopePort } from "./ports.js";
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
   * person watching a build but useless to `denji check`, which needs to collect
   * them. Pass a sink (even an empty one) to take over.
   */
  onWarn?: (warning: LayoutWarning) => void;
}

const warnToConsole = (w: LayoutWarning): void => {
  console.warn(`${NAME}: ${w.message}.`);
};

const DEFAULT_GAP = 40;
const DEFAULT_PADDING = 24;
/** The renderer draws this band; exported so the two cannot drift apart. */
export const DEFAULT_HEADER_H = 28;
const DEFAULT_MARGIN = 24;

/**
 * The height of `n`'s title band. A container with nothing to put there — no
 * label, no mark, no link button — reserves no band at all: an empty strip only
 * reads as a margin nobody asked for, and dropping it is what lets a
 * transparent label-less group wrap siblings without leaving a trace in the
 * geometry. The layout and the renderer both size the band through here, so
 * "no band reserved" and "no band drawn" cannot drift apart.
 */
export const headerBand = (
  n: { label: string; icon?: string; link?: string },
  headerH: number,
): number => (n.label === "" && !n.icon && !n.link ? 0 : headerH);

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

  let sizeMap = new Map<string, Size>();
  let childLocal = new Map<string, Map<string, Local>>();
  let innerOffset = new Map<string, Local>();
  /** Per scope: the corridors it kept clear, in that scope's own coordinates. */
  let scopeLanes = new Map<string, Map<string, Local[]>>();
  /** Per scope: how big its content came out, so a border has a coordinate. */
  let scopeContent = new Map<string, Size>();
  /** Where each scope's own (0, 0) ended up on the drawing. */
  let scopeOrigin = new Map<string, Local>([["", { x: 0, y: 0 }]]);
  /** The doors this pass was told about; empty on the probe. */
  let ports = new Map<string, ScopePort[]>();

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

  /**
   * The middle of `endpoint` in `member`'s own coordinates — a door seen from
   * outside — or `undefined` when the member is the endpoint itself.
   *
   * Everything it reads was filled in on the way up: a container is sized only
   * after its children have been placed inside it.
   */
  const doorOf = (member: string, endpoint: string): Local | undefined => {
    if (member === endpoint) return undefined;
    const down: string[] = [];
    for (let cur = endpoint; cur !== member; ) {
      const p = parentOf.get(cur);
      if (p === undefined) return undefined;
      down.push(cur);
      cur = p;
    }
    let x = 0;
    let y = 0;
    for (let i = down.length - 1, parent = member; i >= 0; i--) {
      const off = innerOffset.get(parent);
      const at = childLocal.get(parent)?.get(down[i]!);
      if (!off || !at) return undefined;
      x += off.x + at.x;
      y += off.y + at.y;
      parent = down[i]!;
    }
    const own = sizeMap.get(endpoint);
    return { x: x + (own?.width ?? 0) / 2, y: y + (own?.height ?? 0) / 2 };
  };

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
      const scope = autoPlace(
        items,
        scopeEdges.get(id) ?? [],
        gaps,
        onWarn,
        "down",
        ports.get(id) ?? [],
        doorOf,
      );
      childLocal.set(id, scope.pos);
      scopeLanes.set(id, scope.lanes);
      contentW = scope.width;
      contentH = scope.height;
    } else {
      childLocal.set(id, new Map());
    }
    scopeContent.set(id, { width: contentW, height: contentH });
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
    const hh = headerBand(n, headerH);
    const height = Math.max(contentH + pad * 2 + hh + bands.top + bands.bottom, own.height ?? 0);
    innerOffset.set(id, { x: pad, y: hh + bands.top + pad });
    const size = { width, height };
    sizeMap.set(id, size);
    return size;
  };

  // Top-down absolute placement. `local` travels alongside: the same position in
  // the scope's own space, which `rect` cannot recover because every scope was
  // packed against its own origin on the way up and then the whole drawing was
  // framed. A drag needs it — it decides which sibling a drop landed next to, and
  // siblings can only be compared in the space they share.
  const place = (id: string, absX: number, absY: number, local: Local): void => {
    const n = nodes.get(id)!;
    const s = sizeMap.get(id)!;
    n.rect = { x: absX, y: absY, width: s.width, height: s.height };
    n.local = local;
    if (n.type === "container") {
      const off = innerOffset.get(id)!;
      const locs = childLocal.get(id)!;
      scopeOrigin.set(id, { x: absX + off.x, y: absY + off.y });
      for (const cid of n.children) {
        const lp = locs.get(cid);
        if (lp) place(cid, absX + off.x + lp.x, absY + off.y + lp.y, { x: lp.x, y: lp.y });
      }
    }
  };

  /**
   * One full pass: size everything bottom-up, place it top-down, frame it.
   *
   * Run twice. The first pass knows nothing about which way anything faces and
   * exists to find that out; the second runs with the doors it found. Everything
   * a pass computes is per-pass state, so the second starts clean rather than
   * reading half of the first one's answers.
   */
  const runPass = (): Local => {
    sizeMap = new Map();
    childLocal = new Map();
    innerOffset = new Map();
    scopeLanes = new Map();
    scopeContent = new Map();
    scopeOrigin = new Map([["", { x: 0, y: 0 }]]);

    const topItems: Placeable[] = topLevel.map((id) => {
      const s = sizeNode(id, rootGaps);
      return { id, width: s.width, height: s.height, hint: nodes.get(id)!.hint };
    });
    const topScope = autoPlace(
      topItems,
      scopeEdges.get("") ?? [],
      rootGaps,
      onWarn,
      "down",
      [],
      doorOf,
    );
    scopeLanes.set("", topScope.lanes);
    scopeContent.set("", { width: topScope.width, height: topScope.height });
    for (const id of topLevel) {
      const p = topScope.pos.get(id)!;
      place(id, p.x, p.y, { x: p.x, y: p.y });
    }
    return normalizeToOrigin(diagram, margin);
  };

  // The probe: the layout as it was before doors existed. Its only job is to say
  // which side of each container its outside partners ended up on — a fact coarse
  // enough to survive every box in the drawing being resized by the second pass,
  // which is why two passes settle it and there is no third.
  let framed = runPass();
  const probeOrigin = scopeOrigin;
  const probeContent = scopeContent;
  ports = derivePorts(
    diagram,
    parentOf,
    {
      rectOf: (id) => nodes.get(id)?.rect,
      originOf: (scope) => probeOrigin.get(scope),
      contentOf: (scope) => probeContent.get(scope),
    },
    rootGaps.x,
  );
  if (ports.size > 0) framed = runPass();
  // From document coordinates to rects: what framing the drawing added. A viewer
  // that pans in document coordinates undoes exactly this, which is what keeps
  // its canvas still while a drag grows the picture.
  diagram.originShift = { x: framed.x, y: framed.y };

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
