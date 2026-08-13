"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  parseArchitecture,
  layoutArchitecture,
  renderArchitecture,
  resolveTheme,
  linkAt,
  nodeAt,
  nodeDepths,
  relationFor,
  dropEdgeRect,
  snapToGrid,
  DiagramParseError,
  type ArchDiagram,
  type ArchNode,
  type Point,
  type Rect,
  type Relation,
  type ThemeName,
} from "@kxchnev/denji";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiagramGrid } from "@/components/DiagramGrid";
import { DownloadButton } from "@/components/DownloadButton";
import { cn, openLink } from "@/lib/utils";

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
/** Breathing room left around the diagram when fitting it to the viewport. */
const FIT_MARGIN = 16;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The first fit has to land before the browser paints, or the diagram is visible
 * at the origin for a frame and then jumps to the middle. On the server there is
 * nothing to lay out, so fall back to useEffect and skip React's warning.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface Rendered {
  svg: string | null;
  error: string | null;
  width: number;
  height: number;
  /** Set when the document names a theme, which no export may override. */
  pinned?: ThemeName;
  /** The source this render came from — not always the current `dsl`, see below. */
  dsl: string;
  /** The laid-out model behind the SVG, for hit-testing a pointer against nodes. */
  diagram: ArchDiagram | null;
}

/**
 * @param linkAnchors wrap link buttons in real `<a>` elements. Only the
 * read-only render wants them: there is nothing there to intercept a click, and
 * a real anchor is focusable and has a context menu. The interactive one takes
 * the pointer for panning and dragging, so it hit-tests the button itself.
 */
function render(dsl: string, linkAnchors: boolean): Rendered {
  try {
    const diagram = parseArchitecture(dsl);
    layoutArchitecture(diagram);
    // On screen the diagram follows the site, whose no-flash script has already
    // folded the device preference into the `.dark` class on <html>. Matching on
    // that class means the header toggle moves the diagrams too — through CSS,
    // with no React state and no re-render. Downloads bake one palette instead.
    const svg = renderArchitecture(diagram, { themeMode: "selector", linkAnchors });
    // The core always emits `viewBox="0 0 W H"` — steadier than measuring the DOM
    // and it keeps the padding knowledge in one place (the renderer).
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    return {
      svg,
      error: null,
      width: Number(m?.[1] ?? 0),
      height: Number(m?.[2] ?? 0),
      pinned: diagram.theme,
      dsl,
      diagram,
    };
  } catch (e) {
    const error = e instanceof DiagramParseError ? e.message : (e as Error).message;
    return { svg: null, error, width: 0, height: 0, dsl, diagram: null };
  }
}

export function Diagram({
  dsl,
  interactive = false,
  grid = true,
  controls = true,
  name,
  onMoveNodes,
  className,
}: {
  dsl: string;
  /** Enable pan and zoom. Off by default so doc pages keep scrolling normally. */
  interactive?: boolean;
  /**
   * Makes nodes draggable, reporting a drop as the relation it means: the
   * sibling the node was dropped next to, and the side it landed on. Ready to be
   * written into the document as `@rightOf(...)` and friends. Without it the
   * diagram is read-only, which is what every doc page wants.
   */
  onMoveNodes?: (moves: ReadonlyArray<Relation>) => void;
  /** Draw the dot grid behind the diagram. */
  grid?: boolean;
  /**
   * Show the overlay controls — the download button, plus zoom and fit when
   * interactive. Turn off when the diagram sits inside something clickable: the
   * controls are buttons, and a button may not nest inside another one.
   */
  controls?: boolean;
  /** Base filename (without extension) used when downloading this diagram. */
  name?: string;
  className?: string;
}) {
  const source = dsl;
  // Anchors on the read-only render, except where the caller has already said
  // this diagram sits inside something clickable: `controls={false}` is that
  // signal, and an <a> nested in a <button> is invalid markup for exactly the
  // reason a nested <button> is.
  const current = useMemo(
    () => render(source, !interactive && controls),
    [source, interactive, controls],
  );
  // Editing spends most of its keystrokes on a document that is momentarily
  // incomplete. Swapping the whole preview for a red box each time — losing the
  // pan and zoom with it — makes the playground unusable, so the last render that
  // parsed stays on screen and the error is reported over it.
  const lastGood = useRef(current);
  useEffect(() => {
    if (current.svg) lastGood.current = current;
  }, [current]);
  // Updated in an effect rather than during render: a render React discards must
  // not poison the fallback. On an error commit the ref still holds the previous
  // good value, which is exactly what we want to show.
  const shown = current.svg ? current : lastGood.current;
  const { svg, width, height, pinned } = shown;
  const error = current.error;
  const depths = useMemo(() => nodeDepths(shown.diagram), [shown.diagram]);
  /**
   * `view` pans in *document* coordinates, not in the rendered SVG's. The layout
   * shifts every rect to frame the drawing, and that shift changes the moment a
   * drag grows the diagram — panning in rendered coordinates would then slide the
   * whole picture, and the grid with it, instead of moving the node. Undoing the
   * shift right here is what keeps the canvas still.
   */
  const shift = shown.diagram?.originShift ?? { x: 0, y: 0 };

  // An export must not react to anything: it captures the palette the reader is
  // looking at right now and bakes it in, media query and all removed. It follows
  // what is on screen, so it re-parses `shown.dsl` — re-parsing a broken document
  // would only throw.
  const exportSvg = useCallback((): { svg: string; matte: string } => {
    const dark =
      pinned === "dark" ||
      (!pinned && document.documentElement.classList.contains("dark"));
    const theme = dark ? "dark" : "light";
    const diagram = parseArchitecture(shown.dsl);
    layoutArchitecture(diagram);
    return {
      // No `linkAnchors`: a download is a picture. It goes into a slide or a
      // README, where a live `href` is at best inert and at worst a surprise in
      // someone else's document — the button is still drawn, it just does not
      // carry the URL out of here.
      svg: renderArchitecture(diagram, { theme, themeMode: "fixed" }),
      matte: resolveTheme(theme).surface,
    };
  }, [shown.dsl, pinned]);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  // Until the first measurement the diagram is centred in CSS instead of by
  // transform, so the markup that ships from the server is already centred and
  // there is nothing to jump away from.
  const [fitted, setFitted] = useState(false);
  const surface = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  /**
   * A link button held between press and release. Deliberately neither a drag
   * nor a pan: pressing a button starts nothing, so nothing has to be undone if
   * the pointer wanders off before it is let go.
   */
  const linkArm = useRef<{ id: string; url: string } | null>(null);
  // Once the view has been moved by hand, stop auto-fitting it out from under the user.
  const touched = useRef(false);
  /**
   * The node being dragged.
   *
   * The document is not rewritten while the pointer is down. A drop says "this
   * one belongs next to that one", and re-deciding which sibling that is on every
   * frame would re-arrange the whole drawing under the pointer as the answer
   * flipped. So the drag is a ghost over the real render, and the document
   * changes once, on release.
   */
  const nodeDrag = useRef<{
    id: string;
    /** The node's own coordinates at the start, in its scope's space. */
    base: Point;
    /** Where it sits on the drawing, for the ghost to start from. */
    fromRect: Rect;
    /** The grab point and the zoom, in screen terms, so the delta stays honest. */
    fromCursor: Point;
    scale: number;
    at: Point;
    /** The pointer, relative to the surface. */
    cursor: Point;
  } | null>(null);
  /** Where the node in hand is, which sibling a drop would attach it to, and
   *  the bar on that sibling's edge naming the side. */
  const [dragGhost, setDragGhost] = useState<{
    rect: Rect;
    anchor: Rect | null;
    edge: Rect | null;
  } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  // Whether a fit has ever landed, and the size it landed at. Both are refs: the
  // resize handler below reads them without wanting to be rebuilt.
  const everFit = useRef(false);
  const size = useRef<{ w: number; h: number } | null>(null);

  const fit = useCallback(() => {
    const el = surface.current;
    if (!el || !width || !height) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;
    // Never scale a small diagram up — only shrink what does not fit.
    const scale = clamp(
      Math.min((cw - FIT_MARGIN * 2) / width, (ch - FIT_MARGIN * 2) / height),
      MIN_SCALE,
      1,
    );
    // `+ shift * scale`: the view pans in document coordinates, so centring the
    // drawing has to put its framed top-left corner — not the document's origin —
    // in the middle of the viewport.
    setView({
      scale,
      x: (cw - width * scale) / 2 + shift.x * scale,
      y: (ch - height * scale) / 2 + shift.y * scale,
    });
    setFitted(true);
    everFit.current = true;
    size.current = { w: cw, h: ch };
  }, [width, height, shift.x, shift.y]);

  useIsomorphicLayoutEffect(() => {
    if (!interactive) return;
    const el = surface.current;
    if (!el) return;
    if (!touched.current) fit();
    // Resizing the viewport must not rescale the diagram: dragging the
    // playground's divider reveals or hides part of it, it does not zoom it. So
    // the scale is left alone and only the offset moves, by half the change in
    // each axis — whatever was in the middle of the pane stays in the middle.
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      // A pane squeezed shut has nothing to centre on, and recording its zero
      // size would make the next resize jump. Wait for it to come back.
      if (!cw || !ch) return;
      const prev = size.current;
      size.current = { w: cw, h: ch };
      // Nothing to preserve yet — this is the first measurement that has a size
      // to fit into, e.g. the pane the diagram was born in was collapsed.
      if (!everFit.current) {
        fit();
        return;
      }
      if (!prev) return;
      const dx = (cw - prev.w) / 2;
      const dy = (ch - prev.h) / 2;
      if (!dx && !dy) return;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [interactive, fit]);

  // React attaches `wheel` at the root as a passive listener, so calling
  // preventDefault from an onWheel prop is ignored and the page scrolls or zooms
  // along with the diagram. A native non-passive listener is the only fix.
  useEffect(() => {
    if (!interactive) return;
    const el = surface.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touched.current = true;
      // Normalise deltaMode so a line/page-scrolling device does not cross the
      // whole zoom range in one tick.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const factor = Math.exp((-e.deltaY * unit) / 500);
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const k = scale / v.scale;
        // Keep the diagram point under the cursor pinned to the cursor.
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interactive]);

  const zoomBy = (factor: number) => {
    const el = surface.current;
    const cw = el?.clientWidth ?? 0;
    const ch = el?.clientHeight ?? 0;
    touched.current = true;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      // Buttons have no cursor to anchor on, so hold the viewport centre still.
      return { scale, x: cw / 2 - (cw / 2 - v.x) * k, y: ch / 2 - (ch / 2 - v.y) * k };
    });
  };

  /** Where the rendered drawing's own origin sits on screen. */
  const pan = { x: view.x - shift.x * view.scale, y: view.y - shift.y * view.scale };

  /** Pointer position in the rendered drawing's coordinates, i.e. in `rect` terms. */
  const toDiagram = (e: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / view.scale,
      y: (e.clientY - rect.top - pan.y) / view.scale,
    };
  };

  /** The node a pointer at `p` would pick up — nothing at all when read-only. */
  const grabbable = (p: Point): ArchNode | null =>
    onMoveNodes && fitted ? nodeAt(shown.diagram, p, depths) : null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); // otherwise the browser starts selecting text and SVG
    touched.current = true;
    // Capture on the surface, not on e.target: the SVG subtree is replaced
    // wholesale whenever the DSL changes, which would drop the capture mid-drag.
    e.currentTarget.setPointerCapture(e.pointerId);

    const p = toDiagram(e);
    // A button beats the node under it: a container's hangs in the title band,
    // which is the only part of a container a drag can take hold of.
    // Not gated on `onMoveNodes` the way `grabbable` is: opening a link needs no
    // callback from the owner, only the transform that maps the pointer.
    const link = fitted ? linkAt(shown.diagram, p, depths) : null;
    if (link) {
      linkArm.current = { id: link.node.id, url: link.url };
      return; // this pointer opens a link: not a drag, not a pan
    }

    const hit = grabbable(p);
    if (hit?.local && hit.rect && shown.diagram) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      nodeDrag.current = {
        id: hit.id,
        base: hit.local,
        fromRect: hit.rect,
        fromCursor: cursor,
        scale: view.scale,
        at: hit.local,
        cursor,
      };
      setDragGhost({ rect: hit.rect, anchor: null, edge: null });
      return; // this pointer moves a node, not the viewport
    }
    drag.current = { x: e.clientX - view.x, y: e.clientY - view.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const nd = nodeDrag.current;
    if (nd) {
      const rect = e.currentTarget.getBoundingClientRect();
      nd.cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const at = {
        x: snapToGrid(nd.base.x + (nd.cursor.x - nd.fromCursor.x) / nd.scale),
        y: snapToGrid(nd.base.y + (nd.cursor.y - nd.fromCursor.y) / nd.scale),
      };
      if (at.x === nd.at.x && at.y === nd.at.y) return;
      nd.at = at;
      const rel = shown.diagram ? relationFor(shown.diagram, nd.id, at) : null;
      const anchor = rel
        ? (shown.diagram?.nodes.find((n) => n.id === rel.anchor)?.rect ?? null)
        : null;
      setDragGhost({
        rect: {
          x: nd.fromRect.x + (at.x - nd.base.x),
          y: nd.fromRect.y + (at.y - nd.base.y),
          width: nd.fromRect.width,
          height: nd.fromRect.height,
        },
        anchor,
        edge: rel && anchor ? dropEdgeRect(anchor, rel.side) : null,
      });
      return;
    }
    const d = drag.current;
    if (d) {
      setView((v) => ({ ...v, x: e.clientX - d.x, y: e.clientY - d.y }));
      return;
    }
    const p = toDiagram(e);
    const overLink = fitted ? linkAt(shown.diagram, p, depths) : null;
    // Over a button say only "this opens": the dashed "this moves" outline of
    // the node underneath is a mixed message about what the press will do.
    setHoverLink(overLink?.url ?? null);
    setHoverId(overLink ? null : (grabbable(p)?.id ?? null));
  };

  const endDrag = (e?: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    const armed = linkArm.current;
    linkArm.current = null;
    if (armed) {
      // Only a release still over the button that was pressed counts, exactly
      // as a real button behaves: press, wander off, release — nothing happens.
      // Only a real release: a cancel or a lost capture arrives here too.
      const still =
        e?.type === "pointerup" && shown.diagram ? linkAt(shown.diagram, toDiagram(e), depths) : null;
      if (still && still.node.id === armed.id && still.url === armed.url) openLink(still.url);
      return;
    }
    const nd = nodeDrag.current;
    if (!nd) return;
    nodeDrag.current = null;
    setDragGhost(null);
    // A press that moved nothing is not an edit, and neither is a drop that would
    // say what the node already says. Committing here rather than on every frame
    // is what keeps a whole drag to one undo step.
    const rel = shown.diagram ? relationFor(shown.diagram, nd.id, nd.at) : null;
    if (!rel) return;
    onMoveNodes?.([rel]);
  };

  // Nothing compensates the viewport during a drag, and nothing has to: the
  // document is untouched until the drop, so the drawing behind the ghost cannot
  // move at all.

  // Bailing out mid-drag has to leave the document alone, ghost and all.
  useEffect(() => {
    if (!onMoveNodes) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !nodeDrag.current) return;
      nodeDrag.current = null;
      setDragGhost(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMoveNodes]);

  // Nothing has ever parsed, so there is no diagram to fall back to.
  if (!svg) {
    return (
      <pre className="w-full overflow-auto rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </pre>
    );
  }

  // Outlining the node under the pointer is the only hint that dragging is a thing
  // one can do here. A container is outlined whole, even though only its title band
  // is the handle — what moves is the container, children and all.
  const hoverRect = hoverId
    ? (shown.diagram?.nodes.find((n) => n.id === hoverId)?.rect ?? null)
    : null;

  const errorOverlay = error && (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-10 overflow-hidden rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive backdrop-blur">
      {error}
    </div>
  );

  if (!interactive) {
    return (
      <div
        className={cn("group relative flex w-full items-center justify-center", className)}
      >
        {errorOverlay}
        {grid && <DiagramGrid x={0} y={0} scale={1} />}
        <div
          className="relative [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg! }}
        />
        {controls && (
          <DownloadButton
            exportSvg={exportSvg}
            width={width}
            height={height}
            name={name}
            source={shown.dsl}
            className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {errorOverlay}
      {grid && (
        <DiagramGrid
          x={fitted ? view.x : 0}
          y={fitted ? view.y : 0}
          scale={fitted ? view.scale : 1}
        />
      )}
      <div
        ref={surface}
        className={cn(
          "relative h-full w-full select-none touch-none",
          // Over a draggable node the cursor says "this moves"; everywhere else the
          // canvas still says "this pans".
          hoverLink
            ? "cursor-pointer"
            : hoverId
              ? "cursor-move"
              : "cursor-grab active:cursor-grabbing",
        )}
        title={hoverLink ?? undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => {
          setHoverId(null);
          setHoverLink(null);
        }}
      >
        <div
          className={
            fitted
              ? "origin-top-left [&_svg]:max-w-none"
              : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [&_svg]:max-w-none"
          }
          style={
            fitted
              ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(${view.scale})` }
              : undefined
          }
          dangerouslySetInnerHTML={{ __html: svg! }}
        />
        {(hoverRect || dragGhost) && (
          // A second layer under the same transform, because the SVG one is written
          // with innerHTML and cannot take React children.
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${view.scale})` }}
          >
            {hoverRect && !dragGhost && (
              <div
                className="absolute rounded-sm outline-dashed outline-primary/70"
                style={{
                  left: hoverRect.x,
                  top: hoverRect.y,
                  width: hoverRect.width,
                  height: hoverRect.height,
                  // Undo the layer's scale, so the hint is a hairline at every zoom.
                  outlineWidth: 1 / view.scale,
                }}
              />
            )}
            {/* The sibling a drop would attach to, named before the release commits it. */}
            {dragGhost?.anchor && (
              <div
                className="absolute rounded-md outline outline-primary"
                style={{
                  left: dragGhost.anchor.x,
                  top: dragGhost.anchor.y,
                  width: dragGhost.anchor.width,
                  height: dragGhost.anchor.height,
                  outlineWidth: 2 / view.scale,
                }}
              />
            )}
            {/* The bar in the slot the node is about to take — the outline above
                says who it attaches to, this says on which side. */}
            {dragGhost?.edge && (
              <div
                className="absolute rounded-full bg-primary"
                style={{
                  left: dragGhost.edge.x,
                  top: dragGhost.edge.y,
                  width: dragGhost.edge.width,
                  height: dragGhost.edge.height,
                }}
              />
            )}
            {/* The node in hand — the only thing that moves while the pointer is
                down, so there is something steady to aim at. */}
            {dragGhost && (
              <div
                className="absolute rounded-md border border-primary bg-primary/25"
                style={{
                  left: dragGhost.rect.x,
                  top: dragGhost.rect.y,
                  width: dragGhost.rect.width,
                  height: dragGhost.rect.height,
                  borderWidth: 2 / view.scale,
                }}
              />
            )}
          </div>
        )}
      </div>
      {controls && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <span className="mr-1 rounded bg-background/80 px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {Math.round(view.scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.2)}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.2)}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Fit to view"
            onClick={() => {
              touched.current = false; // let resizes re-centre again
              fit();
            }}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          {/* This control cluster is pinned to the bottom edge, so the menu has
              to open upwards to stay on screen. */}
          <DownloadButton
            exportSvg={exportSvg}
            width={width}
            height={height}
            name={name}
            source={shown.dsl}
            openTo="up"
          />
        </div>
      )}
    </div>
  );
}
