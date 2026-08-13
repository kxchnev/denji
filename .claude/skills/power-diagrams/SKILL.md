---
name: power-diagrams
description: Write and edit architecture diagrams in the .pwr DSL (power). Use when asked to draw, sketch or update an architecture, system, service or infrastructure diagram, or when editing a .pwr file. Covers the grammar, the check/preview loop, and the layout rules that decide whether a diagram reads well.
---

# Writing `.pwr` diagrams

`power` draws free-form architecture diagrams — shapes, containers and
connections. **Declare the boxes, wire them up, and stop.** The layout is
computed from the connections, so a diagram that is wired up is finished, and
hints exist to overrule it for one pair. **There is no way to write a
coordinate** — no escape hatch, by design: a position is only true of the diagram
you measured it on.

## The loop

1. Write or edit the `.pwr` file.
2. `power check <file>` — syntax errors *and* layout problems. Fix everything it
   lists. Every finding points at a line and column (`file:12:3  warning  …`
   plus the source line and a caret), so go straight there. `--json` for
   structured output, `--strict` to fail on warnings too.
3. **`power render <file> -o /tmp/preview.png` and look at the image.** Do this;
   do not skip it. `check` can only judge the things it has a rule for — it says
   nothing about a label colliding with a container frame, a connector cutting
   across a third box, or a layout that is merely confusing. Reading the picture
   is the only way to catch those, and you can read pictures.
4. Only then hand it over. They are most likely watching in the VS Code preview
   (it opens beside any `.pwr` file and re-renders as you type), so your edits
   land in front of them and they can tell you what to change without a round
   trip. `power watch <file>` is the same thing in a browser, for someone not in
   VS Code.

⚠️ **In that preview they can drag a node, and the drag rewrites their file** —
it writes a relation like `@rightOf(other)` into the declaration. So the source
may have changed under you since you last read it: **re-read the file before
every edit**, and never keep editing from a copy you made earlier.

The six things `check` reports: `parse-error` and `build-error` (errors —
nothing renders, or ids/icons/styles do not hold together), then the layout
warnings `hint-cycle`, `overlapping-siblings`, `unconnected-node` and
`extreme-aspect-ratio`. Each one, with what to do about it, is on the docs
site under Diagnostics; `power spec` prints the grammar.

**Run `power spec` and read it before writing anything non-trivial** — it prints
the complete grammar. `power icons <text>` searches the bundled marks; run it
rather than guessing at a slug.

If `power` is not on the PATH, the CLI is `node <repo>/packages/core/dist/cli.js`
after `npm run build`. Resolve it to an absolute path once and reuse it — the
working directory does not persist between commands.

## Shape of a diagram

```
architecture
  app gw "API Gateway"

  service orders "Orders" @below(gw) {
    app api "Orders API"
    database db "Postgres" @below(api)
    api -> db
  }

  queue bus "Event Bus" @below(orders)

  gw -> orders : http
  orders -> bus
```

Shapes: `app` (rounded box), `database` (cylinder), `queue` (horizontal
cylinder), `rect` (plain box). Containers: `service` (accented title band),
`group` (dashed frame). Arrows: `->`, `<-`, `<->`, `--`, `-.->`, `-.-`, with an
optional `: label`. Inside a `group`, `text "…" @corner(topLeft|topRight|
bottomLeft|bottomRight)` writes a free line in that corner.

## Rules that decide whether it reads well

- **Draw the connections and write no hints at all.** The layout is computed
  from the graph: what feeds something comes before it, and nodes that mostly
  talk to each other are drawn together. A diagram whose boxes are wired up is
  finished. Reaching for hints first is the single most common mistake — every
  one you add is a constraint that has to stay true as the diagram grows.
- **Add a hint only to overrule the layout for one pair**, e.g. `@rightOf(peer)`
  to fix the order of two things on one row. `@below` / `@above` move a node to a
  later / earlier layer; `@rightOf` / `@leftOf` order it within its own.
- **Group related nodes into containers.** A long row of top-level nodes becomes
  an unreadable strip; `check` reports `extreme-aspect-ratio`. Containers also
  scope the layout: each one is drawn from its own connections.
- **Connectors route around the boxes on their own.** They leave and enter
  perpendicular to a side, walk around anything in the way, and where several run
  together they are spread into a bundle. You do not have to leave room for them.
- **Connect everything you declare.** An unwired node is usually a leftover;
  `check` reports `unconnected-node`.
- **To centre a node under several peers, wrap the peers in a `group` and hint
  against the group.** Hints only resolve against siblings in the same scope, so
  there is no way to say "below both of these" — but a shared event bus under two
  services is exactly what you usually want, and the wrapper is how you get it.
- **Reach for `@icon(...)` when the technology is the point** (`postgres`,
  `kafka`, `k8s`, `redis`); skip it when the role matters more than the vendor.
  **The whole of Simple Icons is bundled**, so nearly any product you can name is
  there under its slug — `power icons <text>` searches by slug, title or
  shorthand, and it is the fastest way to confirm one. Do not paste path data
  into a diagram for a mark that is already in the set.
  Two things are still missing and no slug will find them: **AWS, Azure, Amazon
  and Oracle**, which asked to be removed, and generic glyphs — there is no
  device, browser or person mark, so a "mobile app" box goes without one. For a
  logo the set does not carry, declare it once at the top of the file:
  `icon acme { path: … }`.
- If an incoming edge's label collides with a container's frame, push the
  container down with `@gap(n)` on it. `check` has no rule for that; you will
  only see it in the rendered image.

## A file with `@at` in it

`@at(x, y)` used to pin a node's corner to exact coordinates. It is gone from the
language, along with `@align`, so a file carrying either no longer parses —
`power check` reports `unknown directive @at` on the line. Delete the directive
and let the connections place the node; if the picture then comes out wrong, the
fix is a hint, a container, or a connection nobody drew, never a number.

## Syntax traps

These are the ones that actually bite. All verified against the parser.

- **ids are `[A-Za-z0-9_]+`** — `order_api`, never `order-api`.
- **Never use a keyword as an id.** `app`, `database`, `queue`, `rect`,
  `service`, `group`, `text`, `architecture` are dispatched on the first word,
  so `rect -> db` is read as a shape declaration and fails.
- **Directives go before the `:` label**: `a -> b @style(hot) : login`.
- **`{` must end the line; `}` sits alone on its own line.**
- **Comments are whole-line only** (`#` or `%%`). No trailing comments.
- **Sizes are unitless** — `@width(150)`, not `150px`. There is no `fontSize`.
- `@theme` and `@margin` only on the `architecture` line; `@padding` only on a
  container; `@corner` only on a `text`.
- **Keep labels short — they wrap, and a very long word gets hyphenated.** Every
  shape in a diagram shares one width; labels break at spaces and hyphens, and a
  word too long for the line is cut with a hyphen (`SparkAppli-` / `cation`).
  A database is a narrow tall barrel and a queue is a wide low pipe, so both
  hold less text per line than a box does — keep their names to a word.
- **`@link(url)` is unquoted and ends at the first `)`** — percent-encode one
  as `%29` — and takes only `http`, `https` and `mailto`. It draws a button in
  the element's top-right corner, over the box: nothing about the layout moves,
  but a long label passes underneath it. Connections cannot carry one.
- **`text` lives inside a `group` only** and its string must be quoted. Repeat
  it to stack lines in one corner — there is no `\n`. It reserves a band, so it
  grows the group rather than overlapping the children: a long note makes a wide
  box, a tall stack a tall one.

## When you are asked to change an existing diagram

Read the file from disk first — every time, not once per conversation. A drag in
the preview rewrites it between your turns.

Keep the ids stable — the person is looking at the picture and refers to boxes
by their labels, and stable ids keep the diff small and the layout from jumping
around. Keep their formatting and comments too: edit the lines you need and
leave the rest alone, rather than rewriting the file in your own house style.
