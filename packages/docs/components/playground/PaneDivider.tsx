"use client";

import { useEffect, useRef, useState } from "react";
import { clampRatio } from "@/lib/use-split";
import { cn } from "@/lib/utils";

/** How far one arrow key nudges the divider. */
const STEP = 0.02;

/**
 * The draggable seam between the editor and the preview.
 *
 * Only exists from `md` up — below that the two panes take turns rather than
 * sharing the width, so there is nothing to resize.
 */
export function PaneDivider({
  ratio,
  containerRef,
  onDrag,
  onCommit,
  onReset,
}: {
  /** Share of the split currently taken by the editor, `0..1`. */
  ratio: number;
  /** The element the ratio is measured against — the two panes' flex row. */
  containerRef: React.RefObject<HTMLElement | null>;
  onDrag: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  // Measured once per drag: the row's width cannot change while we are the one
  // changing it, and measuring per frame would force a layout each move.
  const box = useRef<DOMRect | null>(null);

  // The pointer leaves the 1px line the moment the drag starts, so the cursor
  // has to be held from the top — otherwise it turns into a text caret over the
  // editor you are dragging the seam through.
  useEffect(() => {
    if (!dragging) return;
    const { classList } = document.body;
    classList.add("cursor-col-resize", "select-none");
    return () => classList.remove("cursor-col-resize", "select-none");
  }, [dragging]);

  const ratioAt = (clientX: number): number => {
    const r = box.current;
    if (!r || !r.width) return ratio;
    return clampRatio((clientX - r.left) / r.width);
  };

  const end = (clientX: number) => {
    if (!dragging) return;
    setDragging(false);
    onCommit(ratioAt(clientX));
    box.current = null;
  };

  const nudge = (next: number) => onCommit(clampRatio(next));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the editor"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      className={cn(
        // `z-10`: the grab area below overflows the 1px line into both panes, and
        // the preview's own positioned content (the diagram surface) comes later in
        // the DOM — without a layer of its own the seam would only be catchable on
        // the left of the line.
        "group relative z-10 hidden w-px shrink-0 cursor-col-resize bg-border transition-colors md:block",
        "hover:bg-primary/60 focus-visible:bg-primary focus-visible:outline-none",
        dragging && "bg-primary",
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const el = containerRef.current;
        if (!el) return;
        e.preventDefault(); // or the browser starts selecting text in both panes
        box.current = el.getBoundingClientRect();
        setDragging(true);
        // Capture on the divider itself, not on `e.target`: the pointer spends
        // the whole drag over the panes, and their content is replaced from
        // under it as the diagram re-renders.
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        onDrag(ratioAt(e.clientX));
      }}
      onPointerUp={(e) => end(e.clientX)}
      onPointerCancel={(e) => end(e.clientX)}
      onLostPointerCapture={(e) => end(e.clientX)}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") nudge(ratio - STEP);
        else if (e.key === "ArrowRight") nudge(ratio + STEP);
        else if (e.key === "Home") nudge(0);
        else if (e.key === "End") nudge(1);
        else if (e.key === "Enter") onReset();
        else return;
        e.preventDefault();
      }}
    >
      {/* A 1px line is a 1px target. This widens the grab area without moving
          the line — which is what keeps the seam catchable once a pane has been
          squeezed shut. */}
      <span className="absolute inset-y-0 -left-1 -right-1" />
      {/* And a grip in the middle: somewhere you can aim for without aiming at a
          hairline. Its box is transparent and wider than the pill it draws, so the
          catchable area around the middle of the seam is 20px rather than 9. */}
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 flex h-14 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      >
        <span
          className={cn(
            "h-10 w-1.5 rounded-full bg-muted-foreground/40 transition-colors",
            "group-hover:bg-primary group-focus-visible:bg-primary",
            dragging && "bg-primary",
          )}
        />
      </span>
    </div>
  );
}
