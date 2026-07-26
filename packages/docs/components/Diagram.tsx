"use client";

import { useMemo, useRef, useState } from "react";
import { parseArchitecture, layoutArchitecture, renderArchitecture, DiagramParseError } from "power";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function toSvg(dsl: string): { svg: string; error: null } | { svg: null; error: string } {
  try {
    const diagram = parseArchitecture(dsl);
    layoutArchitecture(diagram);
    return { svg: renderArchitecture(diagram), error: null };
  } catch (e) {
    if (e instanceof DiagramParseError) return { svg: null, error: e.message };
    return { svg: null, error: (e as Error).message };
  }
}

export function Diagram({
  dsl,
  interactive = false,
  className,
}: {
  dsl: string;
  interactive?: boolean;
  className?: string;
}) {
  const { svg, error } = useMemo(() => toSvg(dsl), [dsl]);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  if (error) {
    return (
      <pre className="w-full overflow-auto rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </pre>
    );
  }

  if (!interactive) {
    return (
      <div
        className={cn("flex w-full justify-center [&_svg]:h-auto [&_svg]:max-w-full", className)}
        dangerouslySetInnerHTML={{ __html: svg! }}
      />
    );
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({ ...v, scale: Math.min(4, Math.max(0.2, v.scale * factor)) }));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX - view.x, y: e.clientY - view.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="origin-top-left [&_svg]:max-w-none"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          dangerouslySetInnerHTML={{ __html: svg! }}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="absolute bottom-2 right-2"
        onClick={() => setView({ x: 0, y: 0, scale: 1 })}
      >
        Reset
      </Button>
    </div>
  );
}
