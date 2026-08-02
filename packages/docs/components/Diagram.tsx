"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  parseArchitecture,
  layoutArchitecture,
  renderArchitecture,
  resolveTheme,
  DiagramParseError,
  type ThemeName,
} from "power";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiagramGrid } from "@/components/DiagramGrid";
import { DownloadButton } from "@/components/DownloadButton";
import { cn } from "@/lib/utils";

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
}

function render(dsl: string): Rendered {
  try {
    const diagram = parseArchitecture(dsl);
    layoutArchitecture(diagram);
    // On screen the diagram follows the site, whose no-flash script has already
    // folded the device preference into the `.dark` class on <html>. Matching on
    // that class means the header toggle moves the diagrams too — through CSS,
    // with no React state and no re-render. Downloads bake one palette instead.
    const svg = renderArchitecture(diagram, { themeMode: "selector" });
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
    };
  } catch (e) {
    const error = e instanceof DiagramParseError ? e.message : (e as Error).message;
    return { svg: null, error, width: 0, height: 0, dsl };
  }
}

export function Diagram({
  dsl,
  interactive = false,
  grid = true,
  controls = true,
  name,
  className,
}: {
  dsl: string;
  /** Enable pan and zoom. Off by default so doc pages keep scrolling normally. */
  interactive?: boolean;
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
  const current = useMemo(() => render(dsl), [dsl]);
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
  // Once the view has been moved by hand, stop auto-fitting it out from under the user.
  const touched = useRef(false);

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
    setView({ scale, x: (cw - width * scale) / 2, y: (ch - height * scale) / 2 });
    setFitted(true);
  }, [width, height]);

  useIsomorphicLayoutEffect(() => {
    if (!interactive) return;
    const el = surface.current;
    if (!el) return;
    if (!touched.current) fit();
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit();
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

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); // otherwise the browser starts selecting text and SVG
    touched.current = true;
    drag.current = { x: e.clientX - view.x, y: e.clientY - view.y };
    // Capture on the surface, not on e.target: the SVG subtree is replaced
    // wholesale whenever the DSL changes, which would drop the capture mid-drag.
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: e.clientX - d.x, y: e.clientY - d.y }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  // Nothing has ever parsed, so there is no diagram to fall back to.
  if (!svg) {
    return (
      <pre className="w-full overflow-auto rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </pre>
    );
  }

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
        className="relative h-full w-full cursor-grab select-none touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <div
          className={
            fitted
              ? "origin-top-left [&_svg]:max-w-none"
              : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [&_svg]:max-w-none"
          }
          style={
            fitted
              ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }
              : undefined
          }
          dangerouslySetInnerHTML={{ __html: svg! }}
        />
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
            openTo="up"
          />
        </div>
      )}
    </div>
  );
}
