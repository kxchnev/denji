"use client";

import { useCallback, useDeferredValue, useRef, useState } from "react";
import { setNodeRelation, type Relation } from "power";
import { CopyButton } from "@/components/CopyButton";
import { Diagram } from "@/components/Diagram";
import { PwrEditor } from "@/components/PwrEditor";
import { DiagramList } from "@/components/playground/DiagramList";
import { PaneDivider } from "@/components/playground/PaneDivider";
import { PlaygroundToolbar, type Pane } from "@/components/playground/PlaygroundToolbar";
import { TemplatePicker } from "@/components/playground/TemplatePicker";
import { usePlayground } from "@/lib/use-playground";
import { useSplit } from "@/lib/use-split";
import { cn, slugify } from "@/lib/utils";

export default function Playground() {
  const {
    diagrams,
    trash,
    session,
    setDsl,
    setName,
    applyTemplate,
    select,
    create,
    destroy,
    undelete,
    destroyForever,
    copy,
  } = usePlayground();
  const [listOpen, setListOpen] = useState(false);
  // Only meaningful below `md`, where the two panes take turns. It starts on the
  // preview because that is where the template picker lives — otherwise a new
  // diagram would open on an empty editor with no way to reach the templates.
  const [pane, setPane] = useState<Pane>("preview");
  // How the two panes divide the width from `md` up. Remembered across sessions.
  const { ratio, drag, commit, reset } = useSplit();
  const split = useRef<HTMLDivElement>(null);
  // Keep typing responsive: the preview lags a frame behind rather than blocking
  // keystrokes on a parse/layout/render pass.
  const preview = useDeferredValue(session?.dsl ?? "");

  // Dropping a node writes where it belongs into the document — the diagram has
  // no state of its own, so the source is the only place placement can live. One
  // write per drag, which is one undo step in the editor.
  const moveNodes = useCallback(
    (moves: ReadonlyArray<Relation>) => {
      setDsl((dsl) => {
        let out = dsl;
        for (const m of moves) out = setNodeRelation(out, m.id, m.side, m.anchor) ?? out;
        return out;
      });
    },
    [setDsl],
  );

  // `session` is null for exactly one commit — the prerendered markup and the
  // hydration pass, both of which happen before storage may be read.
  if (!session) return null;

  const closeList = () => setListOpen(false);
  const list = (
    <DiagramList
      items={diagrams}
      trash={trash}
      activeId={session.id}
      onSelect={(id) => {
        select(id);
        closeList();
      }}
      onNew={() => {
        create();
        closeList();
      }}
      onDelete={destroy}
      onRestore={undelete}
      onDeleteForever={destroyForever}
      onDuplicate={copy}
    />
  );

  return (
    <>
      <PlaygroundToolbar
        name={session.name}
        onNameChange={setName}
        onToggleList={() => setListOpen((v) => !v)}
        pane={pane}
        onPaneChange={setPane}
      />

      {/* `min-h-0` all the way down, or the editor — which is `height: 100%` —
          pushes this row past the bottom of the viewport instead of scrolling
          inside it. */}
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r md:flex">{list}</aside>

        {/* Below `md` the list is a drawer over the editor. */}
        {listOpen && (
          <>
            <button
              type="button"
              aria-label="Close diagram list"
              className="absolute inset-0 z-20 bg-black/40 md:hidden"
              onClick={closeList}
            />
            <aside className="absolute inset-y-0 left-0 z-30 flex w-64 border-r shadow-lg md:hidden">
              {list}
            </aside>
          </>
        )}

        {/* Both panes stay mounted at every width: unmounting the editor would
            destroy the CodeMirror view along with its undo history.

            The `key` matters as much. CodeMirror's history lives in the editor
            state and survives a whole-document replace, so without a remount one
            undo after switching diagrams would paste the previous document's text
            into this one — and autosave would store it. Diagram has the same
            problem with its pan/zoom, which would carry over from the diagram you
            just left. Keying on the id resets both on a switch and on nothing
            else; typing never remounts. */}
        {/* The panes get a flex row of their own so the divider's ratio is a
            share of the two of them rather than of the whole window, sidebar
            included. `min-w-0` on both: their automatic minimum size would
            otherwise be their content's, and a wide diagram would squeeze the
            editor down to nothing. */}
        <div
          ref={split}
          className="flex min-h-0 min-w-0 flex-1"
          style={{ "--split-code": `${ratio * 100}%` } as React.CSSProperties}
        >
          <div
            className={cn(
              "group relative min-h-0 min-w-0 shrink-0 grow-0 basis-full overflow-hidden bg-code",
              // Below `md` the visible pane takes the full width; from `md` up
              // the divider decides. Going through a custom property is what
              // lets one media query hand the width back to the breakpoint.
              "md:block md:basis-[var(--split-code)]",
              pane === "code" ? "block" : "hidden",
            )}
          >
            <PwrEditor
              key={`editor-${session.id}`}
              value={session.dsl}
              onChange={setDsl}
              className="h-full overflow-hidden"
            />
            <CopyButton code={session.dsl} />
          </div>

          <PaneDivider
            ratio={ratio}
            containerRef={split}
            onDrag={drag}
            onCommit={commit}
            onReset={reset}
          />

          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-hidden bg-card md:block",
              pane === "preview" ? "block" : "hidden",
            )}
          >
            {/* Both branches read the deferred value, so the pane never shows a
                half-applied state: an empty document and the picker that replaces
                it always change over together. */}
            {preview.trim() === "" ? (
              <TemplatePicker
                onPick={(label, dsl) => {
                  applyTemplate(label, dsl);
                  setPane("code"); // hand a mobile reader straight to the editor
                }}
              />
            ) : (
              <Diagram
                key={`preview-${session.id}`}
                dsl={preview}
                name={slugify(session.name) || "diagram"}
                interactive
                onMoveNodes={moveNodes}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
