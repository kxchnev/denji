"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightWhitespace,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { pwrLanguage } from "@/lib/pwr-language";
import { pwrAutocomplete } from "@/lib/pwr-complete";
import { codeEditorTheme } from "@/lib/editor-theme";

const extensions = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  // Spaces and tabs are visible here but not in the read-only viewers: indentation
  // is what nesting in `.pwr` is made of, so it is worth seeing while you type.
  highlightWhitespace(),
  drawSelection(),
  history(),
  bracketMatching(),
  indentOnInput(),
  indentUnit.of("  "),
  // No `lineWrapping` on purpose, unlike the read-only viewers: this editor
  // lives in a pane whose width is dragged around, and reflowing every line on
  // every pixel of that drag is unreadable. The text keeps its own width and
  // `.cm-scroller` scrolls sideways instead.
  keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  pwrLanguage,
  syntaxHighlighting(classHighlighter),
  pwrAutocomplete,
  codeEditorTheme,
];

export function PwrEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Keep the latest callback without tearing the editor down on every render.
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        // `value` is the initial doc only; later changes flow through the effect
        // below, so the editor stays the owner of the cursor and undo history.
        doc: value,
        extensions: [
          ...extensions,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External replacement (the preset buttons). Typing never reaches the dispatch
  // because the parent's state already equals the doc — so the cursor survives.
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      selection: { anchor: 0 },
      scrollIntoView: true,
    });
  }, [value]);

  return <div ref={host} className={className} />;
}
