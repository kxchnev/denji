"use client";

import { Plus } from "lucide-react";
import { Diagram } from "@/components/Diagram";
import { templates } from "@/lib/playground-templates";

/**
 * Shown in the preview pane while the document is still empty. Each card renders
 * its template for real, so the choice is made by looking rather than by reading
 * — the same handful of parse/layout/render passes any reference page does.
 */
export function TemplatePicker({ onPick }: { onPick: (label: string, dsl: string) => void }) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-sm font-semibold tracking-tight">Start from a template</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Or just start typing in the editor — this picker disappears as soon as the document
        has anything in it.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.label, t.dsl)}
            className="flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-foreground/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* The preview is decoration — the card itself is the button, so the
                diagram must not bring its own download control along, nor a link
                button's anchor: a <button> or an <a> inside a <button> is invalid
                markup and breaks hydration. `controls={false}` turns off both. */}
            <div className="pointer-events-none grid h-32 place-items-center overflow-hidden border-b">
              {t.id === "empty" ? (
                <Plus className="h-6 w-6 text-muted-foreground" />
              ) : (
                // Stretch the render to the full card and hand the SVG a definite
                // box: with a viewBox and the default `xMidYMid meet`, it then
                // scales itself down to fit instead of overflowing the thumbnail.
                <Diagram
                  dsl={t.dsl}
                  grid={false}
                  controls={false}
                  className="h-32 w-full items-stretch p-3 [&_svg]:!h-full [&_svg]:!w-full"
                />
              )}
            </div>
            <div className="p-3">
              <div className="text-sm font-medium">{t.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
