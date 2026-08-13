# Changelog

## 1.0.0

First public release.

- Live preview for `.denji` files, beside the editor or in place, following the
  buffer as you type. A document that stops parsing keeps its last drawing on
  screen with the error over it.
- Drag a node and the source gets a relation to the sibling it landed next to —
  one edit, one undo step, and the layout keeps arranging everything else.
  Clicking a node without moving it jumps the cursor to its declaration.
- Pan, zoom around the pointer, fit to view, and an optional dot grid.
- Syntax highlighting generated from the parser's own vocabulary, so it cannot
  drift from the language.
- Errors and layout warnings in the Problems panel as you type, from the same
  check the command line runs. `denji.diagnostics` turns the warnings down.
