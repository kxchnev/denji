"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArchDiagram, ThemeName } from "@kxchnev/denji";
import {
  downloadDiagram,
  downloadSource,
  type ExportFormat,
} from "@/lib/export-diagram";
import { cn } from "@/lib/utils";

/**
 * Three formats, one line each — the same three the editor's preview offers.
 *
 * There used to be `PNG 2×` and `PNG 5×` here, which asked the reader a question
 * they have no way to answer ("how many pixels do you need?") and made the menu
 * disagree with the extension's. A raster is written at twice the diagram's units
 * everywhere now, which is the size that stays sharp on a retina screen and in a
 * slide.
 */
const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "svg", label: "SVG" },
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
];

export function DownloadButton({
  exportDiagram,
  name = "diagram",
  source,
  openTo = "down",
  className,
}: {
  /**
   * The laid-out diagram and the palette to bake in. Called at click time so the
   * file matches what is on screen — including the theme the reader has switched
   * to since the page loaded.
   */
  exportDiagram: () => { diagram: ArchDiagram; theme: ThemeName };
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
              key={f.value}
              className="whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                setOpen(false);
                const { diagram, theme } = exportDiagram();
                void downloadDiagram(diagram, f.value, { name, theme });
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
