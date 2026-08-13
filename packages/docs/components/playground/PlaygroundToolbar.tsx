"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, PanelLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Pane = "code" | "preview";

/**
 * A borderless title that grows a border on hover and focus. Deliberately not a
 * vendored shadcn Input — the wanted affordance is "this heading happens to be
 * editable", which that component's chrome works against.
 */
function NameInput({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);

  // Follow the session when it switches diagrams, but never yank the text out
  // from under someone who is mid-rename.
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value); // empty is not a name — put the old one back
  };

  return (
    <input
      value={draft}
      aria-label="Diagram name"
      maxLength={80}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        editing.current = true;
      }}
      onBlur={() => {
        editing.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          editing.current = false;
          e.currentTarget.blur();
        }
      }}
      className="min-w-0 max-w-56 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none transition-colors hover:border-input focus:border-input focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

export function PlaygroundToolbar({
  name,
  onNameChange,
  onToggleList,
  pane,
  onPaneChange,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onToggleList: () => void;
  pane: Pane;
  onPaneChange: (pane: Pane) => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 md:hidden"
        aria-label="Toggle diagram list"
        onClick={onToggleList}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>
      <Link href="/" className="px-2 font-semibold" title="Back to the docs">
        <span className="hidden sm:inline">Documentation</span>
        <ChevronLeft className="h-4 w-4 sm:hidden" />
      </Link>
      <span className="mx-1 h-5 w-px shrink-0 bg-border" />
      <NameInput value={name} onCommit={onNameChange} />
      <div className="ml-auto flex items-center gap-1">
        {/* Below `md` the two panes share the screen one at a time. Both stay
            mounted — see the page — so switching never costs the editor its
            content or its undo history. */}
        <div className="flex rounded-md border p-0.5 md:hidden">
          {(["code", "preview"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPaneChange(p)}
              className={cn(
                "rounded px-2 py-1 text-xs capitalize transition-colors",
                pane === p
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
