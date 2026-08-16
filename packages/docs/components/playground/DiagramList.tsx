"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Copy, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRASH_TTL_MS, type SavedDiagram } from "@/lib/playground-store";
import { cn } from "@/lib/utils";

/** How long an armed permanent delete stays armed before disarming itself. */
const CONFIRM_MS = 4000;
const DAY_MS = 24 * 60 * 60 * 1000;

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** How long this diagram has left before it is dropped for good. */
function expiresIn(deletedAt: number): string {
  const left = deletedAt + TRASH_TTL_MS - Date.now();
  if (left <= 0) return "deleting now";
  const days = Math.ceil(left / DAY_MS);
  return days === 1 ? "deletes tomorrow" : `deletes in ${days} days`;
}

export function DiagramList({
  items,
  trash,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRestore,
  onDeleteForever,
  onDuplicate,
  className,
}: {
  items: readonly SavedDiagram[];
  trash: readonly SavedDiagram[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onDuplicate: (id: string) => void;
  className?: string;
}) {
  // Only the permanent delete needs confirming — the ordinary one is reversible
  // for 30 days. There is no Dialog in this project, and `confirm()` silently
  // returns false inside a sandboxed iframe, which is exactly how these docs are
  // meant to be embedded. So the row arms itself and confirms in place.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
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

      <div className="flex-1 overflow-y-auto">
        <ul className="p-2">
          {items.map((d) => (
            // The actions are siblings of the select button, not children of it:
            // a <button> inside a <button> is invalid markup.
            <li key={d.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 pr-16 text-left transition-colors",
                  d.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="block truncate text-sm">{d.name}</span>
                <span className="block text-xs text-muted-foreground">{ago(d.updatedAt)}</span>
              </button>
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Duplicate ${d.name}`}
                  onClick={() => onDuplicate(d.id)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {/* No confirmation: this is recoverable from the trash below. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Delete ${d.name}`}
                  onClick={() => onDelete(d.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {trash.length > 0 && (
          <div className="border-t p-2">
            <button
              type="button"
              onClick={() => setTrashOpen((v) => !v)}
              aria-expanded={trashOpen}
              className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <ChevronRight
                className={cn("h-3 w-3 transition-transform", trashOpen && "rotate-90")}
              />
              Recently deleted ({trash.length})
            </button>
            {trashOpen && (
              <ul className="mt-1">
                {trash.map((d) => {
                  const armed = confirmId === d.id;
                  return (
                    <li key={d.id} className="group relative">
                      <div className="rounded-md px-2 py-1.5 pr-16">
                        <span className="block truncate text-sm text-muted-foreground">
                          {d.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {expiresIn(d.deletedAt!)}
                        </span>
                      </div>
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
                              aria-label={`Permanently delete ${d.name}`}
                              onClick={() => {
                                setConfirmId(null);
                                onDeleteForever(d.id);
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
                              aria-label={`Restore ${d.name}`}
                              onClick={() => onRestore(d.id)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            {/* This one is not recoverable, so it confirms. */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Delete ${d.name} forever`}
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
        )}
      </div>
    </div>
  );
}
