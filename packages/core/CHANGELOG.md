# Changelog

## 1.0.0

First public release.

- The `.denji` language: shapes, containers and connections, with the layout
  derived from the connections rather than written down. Hints (`@rightOf`,
  `@below`) constrain that arrangement; there are no coordinates in the language.
- `denji` on the command line: `render` (SVG, PNG, JPEG), `watch` (a live
  browser preview), `check` (errors and layout warnings, `--json` for tools),
  `icons` (search the bundled marks) and `spec` (print the grammar).
- A programmatic API: `architecture()` to build a diagram in code, or
  `parseArchitecture` / `layoutArchitecture` / `renderArchitecture` to take the
  pipeline apart, plus `checkDiagram` for the same diagnostics the CLI prints.
- Every Simple Icons brand mark bundled, addressable by name from a diagram.
- `sharp` is optional: it is loaded only when you ask for PNG or JPEG.
