"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadDiagram, type ExportFormat } from "@/lib/export-diagram";
import { cn } from "@/lib/utils";

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "svg", label: "SVG" },
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
];

export function DownloadButton({
  exportSvg,
  width,
  height,
  name = "diagram",
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
          {FORMATS.map((f) => (
            <button
              key={f.value}
              className="px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                setOpen(false);
                const { svg, matte } = exportSvg();
                void downloadDiagram(svg, width, height, f.value, name, matte);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
