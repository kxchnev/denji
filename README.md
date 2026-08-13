# Denji

Architecture diagrams as text, laid out by their own connections. You declare
the boxes and wire them up; the engine decides where everything goes and routes
the connectors **around** the boxes rather than through them.

```
architecture
  app gw "API Gateway"

  service orders "Orders" @below(gw) {
    app api "Orders API"
    database db "Postgres" @below(api)
  }

  queue bus "Event Bus" @below(orders)

  gw -> orders : http
  orders -> bus
```

Nothing in that says where a box goes. `@below` is a constraint on the
arrangement, not a coordinate — there are no coordinates in the language, which
is what keeps a diagram from rotting the moment you add a service.

## Install

```bash
npm install @kxchnev/denji     # library + the `denji` command
```

Or drive it from an editor: the
[VS Code extension](https://marketplace.visualstudio.com/items?itemName=kxchnev.denji)
gives you a live preview beside the file, with nodes you can drag.

```bash
denji render diagram.denji -o diagram.svg   # SVG, PNG or JPEG
denji watch  diagram.denji                  # live preview in a browser
denji check  diagram.denji                  # errors and layout problems
denji icons  postgres                       # find a brand mark
denji spec                                  # print the language reference
```

## What it gives you

- **Shapes** — app, database, queue, rect — and nestable **containers**
  (service, group) that size themselves around whatever they hold.
- **Layout from the graph.** Nodes are ranked by what feeds what, ordered to
  keep the connectors from crossing, and placed exactly rather than shoved apart.
- **Connectors that go around.** A connection crossing a layer gets a corridor
  reserved through it; where several travel together they spread into a bundle.
- **Every Simple Icons brand mark bundled** — write `@icon(postgresql)` and it
  is there, in the brand's own colour, with no network call.
- **Themes and styling** — a light and a dark palette, per-kind selectors, named
  styles and inline properties, in a cascade you can predict.

## Documentation

- [LANGUAGE.md](./packages/core/LANGUAGE.md) — the complete grammar, and the
  authoritative one. `denji spec` prints it, which is the fastest way to hand it
  to a model.
- [packages/core/README.md](./packages/core/README.md) — the library API.
- [packages/vscode/README.md](./packages/vscode/README.md) — the editor extension.
- [AGENTS.md](./AGENTS.md) — for coding agents, both for drawing diagrams and for
  working on the library.
- The docs site carries the same material with live, editable examples.

## Repository

| Package | Path | What |
|---|---|---|
| `@kxchnev/denji` | [`packages/core`](./packages/core) | The library and CLI: parser, layout engine, SVG renderer. |
| `kxchnev.denji` | [`packages/vscode`](./packages/vscode) | The VS Code extension. |
| — | [`packages/docs`](./packages/docs) | The documentation site, with a live playground. |

Building it, running the tests and how the pieces fit together:
[CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE). Brand marks come from
[Simple Icons](https://simpleicons.org) under CC0; the logos remain trademarks
of their owners ([NOTICE](./NOTICE)).
