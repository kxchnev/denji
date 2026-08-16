"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { denjiLanguage } from "@/lib/denji-language";
import { tsLanguage } from "@/lib/ts-language";
import { codeEditorTheme, editorAutoHeight } from "@/lib/editor-theme";
import type { CodeLang } from "@/lib/code-lang";

/**
 * Read-only CodeMirror instance for the static DSL/API examples — same
 * tokenizer, theme and gutter as the playground editor, just non-editable.
 * `code`/`lang` are fixed for the lifetime of one example, so the editor is
 * built once and never needs a controlled-value sync like DenjiEditor's.
 */
export function CodeViewer({
  code,
  lang,
  className,
  style,
}: {
  code: string;
  lang: CodeLang;
  className?: string;
  style?: React.CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          EditorView.lineWrapping,
          lang === "ts" ? tsLanguage : denjiLanguage,
          syntaxHighlighting(classHighlighter),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          codeEditorTheme,
          editorAutoHeight,
        ],
      }),
    });
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className={className} style={style} />;
}
