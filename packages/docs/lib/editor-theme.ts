import { EditorView } from "@codemirror/view";

/**
 * Shared chrome for every CodeMirror instance on the site — the editable
 * playground and the read-only example viewers alike. Token colours come from
 * globals.css via `syntaxHighlighting(classHighlighter)`; every value here is
 * a CSS variable, so the editor follows the site's `.dark` class with no JS.
 */
export const codeEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.875rem",
    backgroundColor: "hsl(var(--code-bg))",
    color: "hsl(var(--code-fg))",
  },
  "&.cm-focused": { outline: "1px solid hsl(var(--ring))" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: "1.625",
    // The scroller — not `.cm-editor` — is the actual overflow viewport, so it
    // needs its own explicit background: macOS trackpad rubber-band overscroll
    // paints past the content using this element's own background, and an
    // unset (transparent) one falls through to black instead of the theme.
    // (No `overscroll-behavior` here: in the read-only examples this element
    // has no scroll room of its own — the wrapping div scrolls instead — and
    // `contain` on a non-scrolling element blocks the wheel event from
    // chaining to that wrapper, breaking scroll entirely.)
    backgroundColor: "hsl(var(--code-bg))",
  },
  ".cm-content": { padding: "0.75rem 0", caretColor: "hsl(var(--code-fg))" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--code-fg))" },
  // The long selector is what beats the base theme's `&.cm-focused` rule.
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "hsl(var(--foreground) / 0.16)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "none",
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-activeLine": { backgroundColor: "hsl(var(--foreground) / 0.04)" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "hsl(var(--code-fg))",
  },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "hsl(var(--foreground) / 0.12)",
    outline: "1px solid hsl(var(--border))",
  },
  ".cm-nonmatchingBracket": { color: "hsl(var(--tok-invalid))" },
});
