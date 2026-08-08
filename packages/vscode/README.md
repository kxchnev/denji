# power for VS Code

Live preview for `.pwr` architecture diagrams, the way the Markdown preview
works — and draggable: move a node in the picture and the coordinates land in
your file.

## Using it

Open a `.pwr` file and click **Open preview to the side** above the first line —
or hit `Cmd/Ctrl+K V`, or use the preview button in the editor title bar. The
preview follows the buffer as you type, saved or not. While the document is
momentarily broken the last drawing that parsed stays on screen with the error
reported over it.

The file itself is syntax-highlighted: keywords, ids, labels, connection
operators and `@directives`, with a directive the language does not know painted
as an error rather than as a directive.

What `power check` reports shows up in the Problems panel as you type: parse and
build errors, plus the layout warnings — a node nothing points at, a shape
nobody connects to, a relation that `@at` has made dead, a diagram that has
become a strip. Each one squiggles the id it is about, and a warning naming two
nodes lets you jump to either.

- **Pan** — drag the canvas. **Zoom** — wheel, or the buttons in the corner.
  **Fit** — the ⤢ button.
- **Move a node** — drag it. A shape is grabbable anywhere, a container by its
  title band. On drop the coordinates are written into the source as `@at(x, y)`,
  in one undo step. `Escape` mid-drag calls the whole thing off.
- **Find a node in the text** — click it without moving it; the cursor jumps to
  its declaration.

A drag also writes an `@at` onto every other node that did not have one. That is
deliberate, and it is the only way the diagram can hold still: take one node out
of a relative scope and everything left in it re-arranges.

### Settings

| Setting | Default | |
|---|---|---|
| `power.diagnostics` | `all` | What lands in the Problems panel: `all`, `errors`, or `off`. The layout warnings are heuristics — turn them down rather than argue with them. |
| `power.preview.codeLens` | `true` | Offer "Open preview to the side" above the first line, until a preview is open. |
| `power.preview.grid` | `true` | Draw the dot grid behind the diagram. |
| `power.preview.theme` | `auto` | `auto` follows the editor's colour theme. A document with `@theme(...)` overrides it either way. |

## Working on it

```
npm install          # from the repo root
npm run build        # core, then the extension's two bundles
npm run vscode       # rebuild both on change
```

Then press F5, or run **Run the extension** from the debug panel — it opens a
second window on `examples/sample.pwr`.

```
npm run -w power-vscode test        # builds, then drives the real bundle
npm run -w power-vscode typecheck
npm run vscode:package              # power-vscode.vsix
```

The extension is two bundles plus a generated grammar. `dist/extension.js` runs
in the extension host and does three things: hand the document to the preview,
write drops back into it, and offer the CodeLens. `dist/webview.js` carries the
whole of `power` and does everything else — parse, layout, render, pan, zoom,
hit-test, drag. Rendering lives there because a drag re-lays the document out on
every frame, and an IPC round-trip per frame would be felt.

`syntaxes/pwr.tmLanguage.json` is **generated**, not written:
`scripts/generate-grammar.ts` takes the words from the core's exported
vocabulary and supplies only the line shapes itself. The grammar already exists
in five places in this repo; a hand-written sixth would be the one that drifts
without anyone noticing. Add a kind or a directive to the core, export it, and
the highlighter picks it up on the next build. `test/grammar.test.ts` runs real
`.pwr` text through the real TextMate engine and asserts on scopes — checking
that the JSON merely contains the right words would have passed happily while
nothing was coloured at all.

See `CLAUDE.md` in the repo root for the rest.
