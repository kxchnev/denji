import { EditorView } from "@codemirror/view";

/**
 * Shared chrome for every CodeMirror instance on the site — the editable
 * playground and the read-only example viewers alike. Token colours come from
 * globals.css via `syntaxHighlighting(classHighlighter)`; every value here is
 * a CSS variable, so the editor follows the site's `.dark` class with no JS.
 * Height is deliberately not part of this theme — the two consumers disagree
 * (`editorFillHeight` / `editorAutoHeight` below), so each picks its own.
 */
export const codeEditorTheme = EditorView.theme({
  "&": {
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
    // (No `overscroll-behavior` here: most read-only examples fit under their
    // height cap, leaving this scroller a scroll container with no scroll room,
    // and `contain` on a scroll container that cannot scroll still cuts the
    // scroll chain in Chromium — the page would stop wheel-scrolling whenever
    // the pointer is over a short example.)
    backgroundColor: "hsl(var(--code-bg))",
    // Handle only, no track. Whenever the system shows classic scrollbars — a
    // mouse plugged in, or "Show scroll bars: always" — the default track paints
    // a grey band along the edge of the code, which reads as chrome rather than
    // as part of the editor. The standard properties are deliberate: styling
    // `::-webkit-scrollbar` instead would opt every reader out of the overlay
    // scrollbars they get today and reserve the band permanently.
    scrollbarWidth: "thin",
    scrollbarColor: "hsl(var(--foreground) / 0.25) transparent",
  },
  ".cm-content": { padding: "0.75rem 0", caretColor: "hsl(var(--code-fg))" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--code-fg))" },
  // The long selector is what beats the base theme's `&.cm-focused` rule.
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "hsl(var(--foreground) / 0.16)" },
  ".cm-gutters": {
    // Opaque, not transparent: the gutter is sticky, so with wrapping off the
    // code scrolls underneath it and would show through the line numbers.
    backgroundColor: "hsl(var(--code-bg))",
    borderRight: "none",
    color: "hsl(var(--muted-foreground))",
  },
  // The gap that keeps code scrolled underneath from touching the digits. It sits
  // on the number itself rather than on `.cm-gutters`, so the active line's tint
  // covers it and the highlight runs into the code without a pale seam.
  ".cm-lineNumbers .cm-gutterElement": { paddingRight: "0.5rem" },
  ".cm-activeLine": { backgroundColor: "hsl(var(--foreground) / 0.06)" },
  // The same tint as the line itself, so the highlight reads as one band across
  // the gutter and the code rather than as two separate stripes.
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--foreground) / 0.06)",
    color: "hsl(var(--code-fg))",
  },
  // Whitespace marks (playground only — the read-only viewers leave the extension
  // out). Faint on purpose: `.denji` labels are prose, so a dot between every word
  // has to stay quieter than the words.
  // The dot is a background gradient with a hard-coded grey in CodeMirror's base
  // theme, not a coloured glyph, so it is the gradient that has to be redrawn to
  // quieten it. `--foreground` at a low alpha rather than `--muted-foreground`,
  // which is itself light in the dark theme and would make the dots louder there
  // than in the light one. The tab arrow is a baked-in image, so it is just faded.
  ".cm-highlightSpace": {
    backgroundImage:
      "radial-gradient(circle at 50% 55%, hsl(var(--foreground) / 0.15) 14%, transparent 5%)",
  },
  ".cm-highlightTab": { opacity: "0.2" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "hsl(var(--foreground) / 0.12)",
    outline: "1px solid hsl(var(--border))",
  },
  ".cm-nonmatchingBracket": { color: "hsl(var(--tok-invalid))" },
});

/** The examples' height cap — `editorAutoHeight` stops growing here, and
 *  CodeBlock's SSR min-height floor is clamped to the same value. */
export const CODE_MAX_HEIGHT = "24rem";

// Height policy lives with each consumer, not in the shared theme: the
// playground fills its pane, the examples hug their content.

/** Playground: fill the pane. The `min-h-0` chain in app/playground/page.tsx
 *  ends at this rule. */
export const editorFillHeight = EditorView.theme({
  "&": { height: "100%" },
});

/** Read-only examples: grow with the document, scroll inside past the cap.
 *  The documented CodeMirror pattern (codemirror.net/examples/styling/) —
 *  `max-height` on the editor plus `overflow: auto` on the scroller. The base
 *  theme leaves the editor at auto height and the scroller is a shrinkable
 *  flex item, so these two rules are the whole story. */
export const editorAutoHeight = EditorView.theme({
  "&": { maxHeight: CODE_MAX_HEIGHT },
  ".cm-scroller": { overflow: "auto" },
});
