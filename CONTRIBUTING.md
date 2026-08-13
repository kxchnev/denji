# Contributing

The repo is an npm-workspaces monorepo:

| Package | Path | What it is |
|---|---|---|
| `@kxchnev/denji` | `packages/core` | The library and the CLI: parser, layout engine, SVG renderer. |
| `kxchnev.denji` | `packages/vscode` | The VS Code extension: live preview with draggable nodes. |
| — | `packages/docs` | The documentation site (Next.js), with a live playground. |

## The loop

```bash
npm install                # all workspaces
npm run build              # core → packages/core/dist, then the extension bundles
npm test                   # core tests (vitest) + extension tests
npm run typecheck
npm run docs               # docs dev server on :3000, plus a tsc --watch on core
npm run -w packages/docs validate   # render every documented example through the core
npm run vscode             # rebuild the extension on change; F5 launches it
npm run vscode:package     # build a .vsix
```

The docs site and the extension consume the **built** `dist`, so run
`npm run build` after touching the core — with the exception of a running
`npm run docs`, which keeps its own `tsc --watch` and rebuilds the core itself.

## Conventions

- ESM with `NodeNext`. **Local imports inside the core carry the `.js` extension.**
- `strict` plus `noUncheckedIndexedAccess`. The layout is deterministic — keep it so.
- Anything an interactive viewer needs to know about a laid-out diagram —
  hit-testing, what a drop means, the drag snap — lives in
  `packages/core/src/interact.ts`, because there are two viewers. Do not
  re-derive it in a component.
- **Documentation is part of done.** A change to core behaviour needs an example
  in `packages/docs/examples/*.ts` and a green `validate`.

## The grammar lives in more than one place

The parser (`packages/core/src/dsl/arch-parse.ts`) is the source of truth. The
editor tokenizer, the document scan, the autocomplete (all under
`packages/docs/lib/`) and the reference (`packages/core/LANGUAGE.md`) each carry
a copy — change the parser and you must update them in the same commit.

The VS Code highlighter is deliberately **not** another copy:
`packages/vscode/scripts/generate-grammar.ts` builds it from the parser's own
exported vocabulary at build time. Add a shape kind, an operator or a directive
to the core, export it, and the highlighter follows on its own.

## The extension, specifically

It is two bundles plus that generated grammar. `dist/extension.js` runs in the
extension host and does three things: hand the document to the preview, write
drops back into it, and offer the CodeLens. `dist/webview.js` carries the whole
library and does everything else — parse, layout, render, pan, zoom, hit-test,
drag. Rendering lives there because a drag re-lays the document out on every
frame, and an IPC round trip per frame would be felt.

```bash
npm run -w packages/vscode test        # builds, then drives the real bundle in jsdom
npm run -w packages/vscode typecheck
```

Press F5, or run **Run the extension** from the debug panel — it opens a second
window on `packages/vscode/examples/sample.denji`.
