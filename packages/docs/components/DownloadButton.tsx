"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_SCALE,
  downloadDiagram,
  downloadSource,
  type ExportFormat,
} from "@/lib/export-diagram";
import { cn } from "@/lib/utils";

/** `scale` is only meaningful for the raster formats; SVG ignores it. */
const FORMATS: { value: ExportFormat; label: string; scale?: number; hint?: string }[] = [
  { value: "svg", label: "SVG" },
  { value: "png", label: "PNG", scale: DEFAULT_SCALE, hint: `${DEFAULT_SCALE}×` },
  { value: "png", label: "PNG", scale: 5, hint: "5×" },
  { value: "jpeg", label: "JPEG", scale: DEFAULT_SCALE, hint: `${DEFAULT_SCALE}×` },
  { value: "jpeg", label: "JPEG", scale: 5, hint: "5×" },
];

export function DownloadButton({
  exportSvg,
  width,
  height,
  name = "diagram",
  source,
  openTo = "down",
  className,
}: {
  /**
   * Renders the diagram with one palette baked in, plus the opaque backdrop
   * JPEG needs. Called at click time so the file matches what is on screen.
   */
  exportSvg: () => { svg: string; matte: string };
  width: number;
  height: number;
  name?: string;
  /** The diagram's `.denji` source. Given one, the menu can also save the code. */
  source?: string;
  /**
   * Which way the menu opens. Use `"up"` when the button sits at the bottom of
   * its container: opening downwards there puts the menu past the edge, where
   * `overflow-hidden` — or the viewport — swallows it and no click can land.
   */
  openTo?: "up" | "down";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        aria-label="Download diagram"
        onClick={() => setOpen((v) => !v)}
      >
        <Download className="h-4 w-4" />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute right-0 z-10 flex flex-col overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-md",
            openTo === "up" ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {source !== undefined && (
            <>
              <button
                className="whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setOpen(false);
                  downloadSource(source, name);
                }}
              >
                Code (.denji)
              </button>
              <div className="my-1 h-px bg-border" />
            </>
          )}
          {FORMATS.map((f) => (
            <button
              key={`${f.value}-${f.scale ?? 0}`}
              className="flex items-center justify-between gap-4 whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                setOpen(false);
                const { svg, matte } = exportSvg();
                void downloadDiagram(svg, width, height, f.value, name, matte, f.scale);
              }}
            >
              {f.label}
              {f.hint && <span className="text-xs text-muted-foreground">{f.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
