# power (monorepo)

Free-form architecture diagrams (not C4) with controllable, **relative** layout —
a mermaid alternative where you actually decide where things go. Shapes
(app / database / queue / rect), nestable container blocks (service / group),
and connections. Authored via a `.pwr` DSL or a programmatic builder; rendered to
SVG.

## Packages

| Package | Path | What |
|---|---|---|
| `power` | [`packages/core`](./packages/core) | The library + CLI: model, relative layout engine, SVG renderer, DSL parser. |
| `docs` | [`packages/docs`](./packages/docs) | Next.js + shadcn documentation site with a live playground. |
| `power-vscode` | [`packages/vscode`](./packages/vscode) | VS Code extension: live `.pwr` preview, with draggable nodes. |

npm workspaces tie them together (both depend on `power`).

## Getting started

```bash
npm install            # install all workspaces
npm run build          # build the core library, then the extension bundles
npm test               # run core and extension tests
npm run docs           # run the docs site dev server (http://localhost:3000)
```

Other useful scripts:

```bash
npm run typecheck              # typecheck the core and the extension
npm run docs:build             # static-export the docs site (packages/docs/out)
npm run -w docs validate       # render every documented example through the core
npm run vscode                 # rebuild the extension on change; F5 launches it
npm run vscode:package         # build a .vsix
```

## Quick taste (DSL)

```
architecture
  service orders "Orders" {
    app api "API"
    database db "Postgres" @below(api)
    api -> db
  }
```

## Working on a diagram

```bash
power check diagram.pwr    # syntax errors and layout problems, --json for tools
power watch diagram.pwr    # live preview that re-renders as the file is edited
power spec                 # print the language reference
```

`watch` plus an editor is the portable way to draw: keep the preview open on one
side and the file on the other. In VS Code, install
[the extension](./packages/vscode) instead — the preview lives in a tab next to
the file, follows the unsaved buffer, and lets you drag a node into place —
which writes down which sibling it belongs next to, and leaves the layout to it.

## Reference

- [`packages/core/LANGUAGE.md`](./packages/core/LANGUAGE.md) — the complete `.pwr`
  grammar. The authoritative one; start here.
- [`packages/core/README.md`](./packages/core/README.md) — the programmatic API
  (Russian).
- [`packages/vscode/README.md`](./packages/vscode/README.md) — the editor
  extension: what it does, and how to work on it.
- [`AGENTS.md`](./AGENTS.md) — for coding agents, both for authoring diagrams and
  for working on the library.
- The docs site, for live interactive examples.

## License

MIT
