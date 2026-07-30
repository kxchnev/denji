"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { pwrLanguage } from "@/lib/pwr-language";
import { tsLanguage } from "@/lib/ts-language";
import { codeEditorTheme } from "@/lib/editor-theme";
import type { CodeLang } from "@/lib/code-lang";

/**
 * Read-only CodeMirror instance for the static DSL/API examples — same
 * tokenizer, theme and gutter as the playground editor, just non-editable.
 * `code`/`lang` are fixed for the lifetime of one example, so the editor is
 * built once and never needs a controlled-value sync like PwrEditor's.
 */
export function CodeViewer({ code, lang, className }: { code: string; lang: CodeLang; className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          EditorView.lineWrapping,
          lang === "ts" ? tsLanguage : pwrLanguage,
          syntaxHighlighting(classHighlighter),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          codeEditorTheme,
        ],
      }),
    });
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className={className} />;
}
