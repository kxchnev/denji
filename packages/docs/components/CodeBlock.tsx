import { CodeViewer } from "@/components/CodeViewer";
import { CopyButton } from "@/components/CopyButton";
import type { CodeLang } from "@/lib/code-lang";
import { CODE_MAX_HEIGHT } from "@/lib/editor-theme";

/** The outer Card already frames the example — no border/rounding here, just
 *  the code surface, so the tabs don't read as a frame within a frame. */
export function CodeBlock({ code, lang = "denji" }: { code: string; lang?: CodeLang }) {
  const source = code.trim();
  // CodeMirror mounts client-side into an empty div, so server HTML has no
  // height of its own — without a floor every block renders at 0px and jumps
  // open on hydration. Reserve the editor's exact height up front: a line box
  // is 0.875rem font × 1.625 line-height (codeEditorTheme) = 1.421875rem, plus
  // .cm-content's 0.75rem padding top and bottom, clamped to the same cap the
  // editor grows to (editorAutoHeight). A floor, not a height: a line long
  // enough to wrap renders taller, and min-height lets it.
  const lines = source.split("\n").length;
  return (
    <div className="group relative">
      <CodeViewer
        code={source}
        lang={lang}
        className="bg-code text-sm text-code-foreground"
        style={{ minHeight: `min(calc(${lines} * 1.421875rem + 1.5rem), ${CODE_MAX_HEIGHT})` }}
      />
      <CopyButton code={source} />
    </div>
  );
}
