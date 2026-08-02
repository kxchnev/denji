"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedDiagram } from "@/lib/playground-store";
import { cn } from "@/lib/utils";

/** How long an armed delete stays armed before disarming itself. */
const CONFIRM_MS = 4000;

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function DiagramList({
  items,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onDuplicate,
  className,
}: {
  items: readonly SavedDiagram[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  className?: string;
}) {
  // There is no Dialog in this project, and `confirm()` silently returns false
  // inside a sandboxed iframe — which is exactly how these docs are meant to be
  // embedded. So deleting arms the row instead, and the row itself confirms.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirmId) return;
    const disarm = () => setConfirmId(null);
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) disarm();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") disarm();
    };
    const t = window.setTimeout(disarm, CONFIRM_MS);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [confirmId]);

  return (
    // `w-full`: the panel is a flex item in its <aside>, so without it the column
    // would shrink to the width of the longest diagram name.
    <div ref={root} className={cn("flex w-full flex-col overflow-hidden bg-background", className)}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b pl-4 pr-2">
        <span className="text-sm font-semibold">Diagrams</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="New diagram"
          onClick={onNew}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No saved diagrams yet. Anything you write here is stored on this device.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto p-2">
          {items.map((d) => {
            const armed = confirmId === d.id;
            return (
              // The actions are siblings of the select button, not children of
              // it: a <button> inside a <button> is invalid markup.
              <li key={d.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(d.id)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 pr-16 text-left transition-colors",
                    d.id === activeId
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60",
                  )}
                >
                  <span className="block truncate text-sm">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">{ago(d.updatedAt)}</span>
                </button>
                <div
                  className={cn(
                    "absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 transition-opacity",
                    armed
                      ? "opacity-100"
                      : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
                  )}
                >
                  {armed ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        aria-label={`Confirm deleting ${d.name}`}
                        onClick={() => {
                          setConfirmId(null);
                          onDelete(d.id);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Cancel"
                        onClick={() => setConfirmId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Duplicate ${d.name}`}
                        onClick={() => onDuplicate(d.id)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Delete ${d.name}`}
                        onClick={() => setConfirmId(d.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
