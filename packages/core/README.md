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

Node 22 or newer. ESM only: reach for it with `import`, not `require`. Types
ship with the package. Nothing is native and nothing is fetched over the
network: PNG and JPEG go through resvg compiled to WebAssembly, and the brand
marks and the typeface travel inside the package.

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

## Writing a picture

```ts
import { toSvgFile, toPng, toJpeg } from "@kxchnev/denji";
import { loadAll } from "@kxchnev/denji/assets-node";

loadAll(); // the typeface and the rasterizer, from the files this package ships

const svg = toSvgFile(diagram); // its own @font-face, no CSS variables, links as anchors
const png = await toPng(diagram, { scale: 2 });
const jpg = await toJpeg(diagram, { quality: 0.92 }); // flattened onto the theme's surface
```

These are the functions the CLI, the VS Code extension and the playground all
call, so the same diagram gives the same bytes wherever it is exported from — one
rasterizer, one typeface, nothing read from the machine it runs on.

Rasterizing needs two things that cannot be part of a JavaScript import: a font
with real outlines, and resvg as WebAssembly. `loadAll()` hands both over in
Node; in a browser, fetch them from `@kxchnev/denji/assets/` and pass the bytes
to `registerFont` and `registerRasterizer`. Nothing is ever downloaded on your
behalf — the files travel inside the package. SVG needs neither: it embeds the
woff2 subsets if a font is registered, and is a complete file without one.

## About the brand marks

Importing `@kxchnev/denji` registers the bundled marks, so `@icon(postgresql)`
draws without being asked — as it has in every release. Be aware of the size:
that is 4.8 MB of path data in whatever bundles the entry point. The same
artwork also ships as a plain file, `@kxchnev/denji/assets/icons.json`, which is
what the command line reads rather than importing it.

`registerIcons(table)` merges more marks in — your own artwork, or a set you
fetched — and `registeredIcons()` answers with everything registered. A document
can also define its own with an `icon` block, and those win over the bundled
ones. A diagram whose marks are missing draws its labels and keeps their space,
so the picture does not move if they arrive later.

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
them implies no affiliation or endorsement. The typeface is
[Inter](https://rsms.me/inter/) under the SIL Open Font License, and rasters are
drawn by [resvg](https://github.com/linebender/resvg) under the MPL 2.0. See
[NOTICE](./NOTICE).

## License

MIT — see [LICENSE](./LICENSE).
