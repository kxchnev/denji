# @kxchnev/denji

Architecture diagrams as text. You declare the boxes and wire them up; **the
connections decide the layout**, and the connectors go around the boxes instead
of through them.

The same package is a library and a command line. The complete grammar lives in
[LANGUAGE.md](./LANGUAGE.md), which `denji spec` prints to stdout — this file
covers the package.

## Install

```bash
npm install @kxchnev/denji
```

Node 18.17 or newer. ESM only: reach for it with `import`, not `require`. Types
ship with the package. Rendering to PNG or JPEG uses `sharp`, which is an
**optional** dependency loaded on demand — SVG needs nothing extra.

## Use it from text

```ts
import { writeFileSync } from "node:fs";
import { parse, toSvg } from "@kxchnev/denji";

const diagram = parse(`architecture
  app gw "API Gateway"
  app api "Orders API" @below(gw)
  database db "Postgres" @below(api)
  gw -> api : http
  api -> db
`);

writeFileSync("diagram.svg", toSvg(diagram));
```

`toSvg` is the whole pipeline in one call. The string it returns is a complete
`<svg>` document with its stylesheet inlined and its ids scoped, so two diagrams
can sit on one page without colliding.

## Use it from code

```ts
import { architecture, toSvg } from "@kxchnev/denji";

const diagram = architecture()
  .app("gw", "API Gateway")
  .app("api", "Orders API")
  .database("db", "Postgres", { hint: { below: "api" } })
  .container("orders", "Orders", { kind: "service", children: ["api", "db"] })
  .connect("gw", "orders", { label: "http" })
  .build();

const svg = toSvg(diagram);
```

Useful when the diagram comes from something you already have — a service
registry, a Terraform state, a dependency graph. `build()` validates: unknown
ids, a node claimed by two containers, a container cycle and an unusable link
all throw rather than drawing something wrong.

## Take the pipeline apart

```ts
import {
  parseArchitecture,
  layoutArchitecture,
  renderArchitecture,
  checkDiagram,
} from "@kxchnev/denji";

const diagram = parseArchitecture(source);
layoutArchitecture(diagram, { gap: 56, onWarn: () => {} });
const svg = renderArchitecture(diagram, { themeMode: "selector" });
```

Split it when you need what is in the middle: the laid-out model carries every
node's rectangle, which is what a viewer hit-tests against.

`layoutArchitecture` takes `gap` (or `gapX` / `gapY`), `padding`, `margin` and
`onWarn` — warnings go to `console.warn` unless you pass a sink, as above.
`renderArchitecture` takes the palette (`theme`, `darkTheme`) and how it should
switch: `themeMode` is `fixed` by default, which bakes one palette in; `auto`
ships both and follows the reader's device; `selector` ships both and follows an
ancestor class, which is what a page with its own theme toggle wants.

Where the document and the caller disagree, the document wins: a `@theme(...)`
in the source pins the palette, and `@spacing` beats the `gap` you passed.

`checkDiagram(source)` answers with `{ diagnostics, failed }` — the same
findings the CLI prints and the editor shows, each with a `code`, a `line` and a
`col`.

## Build your own viewer

Everything an interactive viewer needs on top of a laid-out diagram is exported,
so it does not have to be reinvented: `nodeAt` / `pickAt` / `linkAt` for
hit-testing, `relationFor` for what a drop means, `setNodeRelation` to rewrite
one declaration in place, plus `dropEdgeRect`, `snapToGrid` and
`findDeclaration`. The playground and the VS Code extension are both built on
them.

## Command line

```bash
denji render <input.denji> [-o out.svg|png|jpg] [-t light|dark]
denji watch  <input.denji> [-p 4400] [--no-open]
denji check  <input.denji> [--json] [--strict]
denji icons  [query]
denji spec
```

`render` takes the output format from the `-o` extension. `check` writes its
findings to stderr, or a structure to stdout with `--json`, and reads stdin when
the input is `-`. `icons` searches by slug, title and shorthand. `spec` prints
the grammar.

## Editors

`denji watch` serves a live preview in a browser, which works alongside any
editor. In VS Code there is an extension — preview beside the file, updating as
you type, problems in the Problems panel, and nodes you can drag, which writes
into the source which sibling a node ended up next to.

## Third-party assets

Brand marks come from [Simple Icons](https://simpleicons.org), released under
CC0. The logos remain the trademarks of their respective owners, and bundling
them implies no affiliation or endorsement. See [NOTICE](./NOTICE).

## License

MIT — see [LICENSE](./LICENSE).
