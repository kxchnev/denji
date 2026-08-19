# Denji for VS Code

Live preview for `.denji` architecture diagrams, the way the Markdown preview
works — and draggable: move a node in the picture and the file learns where it
belongs.

You describe the boxes and wire them up; the connections decide the layout, and
the connectors go around the boxes instead of through them.

## Using it

Open a `.denji` file and click **Open preview to the side** above the first line —
or hit `Cmd/Ctrl+K V`, or use the preview button in the editor title bar. The
preview follows the buffer as you type, saved or not. While the document is
momentarily broken the last drawing that parsed stays on screen with the error
reported over it.

The file itself is syntax-highlighted: keywords, ids, labels, connection
operators and `@directives`, with a directive the language does not know painted
as an error rather than as a directive.

What `denji check` reports shows up in the Problems panel as you type: parse and
build errors, plus the layout warnings — a node nothing points at, a shape
nobody connects to, hints that contradict each other, a diagram that has
become a strip. Each one squiggles the id it is about, and a warning naming two
nodes lets you jump to either.

- **Pan** — drag the canvas. **Zoom** — wheel, or the buttons in the corner.
  **Fit** — the ⤢ button.
- **Move a node** — drag it. A shape is grabbable anywhere, a container by its
  title band. On drop the source gets a relation to the sibling it landed next
  to — `@rightOf(that_one)` and friends — in one undo step, and the layout keeps
  arranging everything. `Escape` mid-drag calls the whole thing off.
- **Find a node in the text** — click it without moving it; the cursor jumps to
  its declaration.

Nothing else in the document is touched: the drop is one relation on one line,
and the drawing holds still until you let go, so you are aiming at a target that
is not running away.

## Saving a picture

The save button in the preview's toolbar offers **SVG**, **PNG** and **JPEG**;
the same three live under **Export diagram** when you right-click a `.denji`
file in the Explorer, right-click in the editor, or open the editor title-bar
menu. The Explorer route needs nothing open — the extension draws the picture
itself instead of asking a preview for one.

What is drawn is the buffer, so an unsaved edit is in the file you save. The
rasterizer and the typeface travel inside the extension, which is what makes an
export here identical, byte for byte, to one written by the `denji` command
line: no system fonts, nothing downloaded, the same picture on every machine.

## Settings

| Setting | Default | |
|---|---|---|
| `denji.diagnostics` | `all` | What lands in the Problems panel: `all`, `errors`, or `off`. The layout warnings are heuristics — turn them down rather than argue with them. |
| `denji.preview.codeLens` | `true` | Offer "Open preview to the side" above the first line, until a preview is open. |
| `denji.preview.grid` | `true` | Draw the dot grid behind the diagram. |
| `denji.preview.theme` | `auto` | `auto` follows the editor's colour theme. A document with `@theme(...)` overrides it either way. |

## The language

The complete grammar is in
[LANGUAGE.md](https://github.com/kxchnev/denji/blob/main/packages/core/LANGUAGE.md),
and the same language has a library and a command line —
[`@kxchnev/denji`](https://www.npmjs.com/package/@kxchnev/denji).

## Contributing

Building the extension, running its tests and how the two bundles fit together:
[CONTRIBUTING.md](https://github.com/kxchnev/denji/blob/main/CONTRIBUTING.md).

## License

MIT. Brand marks come from [Simple Icons](https://simpleicons.org) under CC0;
the logos remain trademarks of their owners.
