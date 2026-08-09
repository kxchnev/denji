---
name: power-diagrams
description: Write and edit architecture diagrams in the .pwr DSL (power). Use when asked to draw, sketch or update an architecture, system, service or infrastructure diagram, or when editing a .pwr file. Covers the grammar, the check/preview loop, and the layout rules that decide whether a diagram reads well.
---

# Writing `.pwr` diagrams

`power` draws free-form architecture diagrams — shapes, containers and
connections. **Write them with relative hints**: that is the whole point of the
language, and a diagram made of hints keeps arranging itself as it grows.
Exact coordinates exist (`@at`) but they are the escape hatch, and mostly they
arrive in the file because a person dragged something — see below.

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
it writes `@at` into the declarations. So the source may have changed under you
since you last read it: **re-read the file before every edit**, and never keep
editing from a copy you made earlier.

The eight things `check` reports: `parse-error` and `build-error` (errors —
nothing renders, or ids/icons/styles do not hold together), then the layout
warnings `loose-node`, `hint-cycle`, `overlapping-siblings`, `unconnected-node`,
`at-overrides-hint` and `extreme-aspect-ratio`. They are explained in
`power spec`.

**Run `power spec` and read it before writing anything non-trivial** — it prints
the complete grammar. `power icons` lists every bundled icon name; run it rather
than guessing.

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

- **Give every node a placement hint except the first one.** A node with no hint
  that nothing points at starts a new block, and blocks are packed left to right
  — it silently lands to the right of everything. This is the single most common
  mistake. `check` reports it as `loose-node`.
- **Group related nodes into containers.** A long row of top-level nodes becomes
  an unreadable strip; `check` reports `extreme-aspect-ratio`.
- **Prefer `@below` for flow and `@rightOf` for peers.** A request path reads
  top-to-bottom; things at the same level sit side by side.
- **A connection is one curve, and it never routes around anything.** It leaves
  a box perpendicular to a side and enters the other the same way; a third box
  standing between the two **will be crossed**. That is the price of connectors
  that always meet a box square on, so it is on you to leave the room: put the
  pair side by side, or in the same container, rather than wiring across the
  drawing. `check` has no rule for it — you see it in the rendered image.
- **Connect everything you declare.** An unwired node is usually a leftover;
  `check` reports `unconnected-node`.
- **To centre a node under several peers, wrap the peers in a `group` and hint
  against the group.** Hints only resolve against siblings in the same scope, so
  there is no way to say "below both of these" — but a shared event bus under two
  services is exactly what you usually want, and the wrapper is how you get it.
- **Reach for `@icon(...)` when the technology is the point** (`postgres`,
  `kafka`, `k8s`, `redis`); skip it when the role matters more than the vendor.
  Run `power icons` for the list. They are vendor marks only — there is no
  generic device, browser or person glyph, so a "mobile app" box simply goes
  without one.
- If an incoming edge's label collides with a container's frame, push the
  container down with `@gap(n)` on it. `check` has no rule for that; you will
  only see it in the rendered image.

## When the file already has `@at` in it

`@at(x, y)` puts a node's top-left corner at exact coordinates, **in its own
scope** — the parent container's inner area, or the diagram at the top level.
You will meet it because someone dragged a node in the preview or the
playground: the drag writes this directive, snapped to 8.

- **`@at` beats every relation on the same node.** `@rightOf`, `@align` and
  `@gap` written there do nothing at all, and `check` says `at-overrides-hint`.
  So when you are asked to move a pinned node, edit its numbers — adding a hint
  is a no-op that looks like a fix.
- **The first drag pins the whole document.** It has to, or everything else
  would rearrange around the one node being dragged. A file full of `@at` is
  therefore normal and not a mistake; it means the layout is frozen and nothing
  arranges itself any more.
- **Do not add `@at` yourself when a hint would do**, and do not strip the ones
  that are there — they are the person's own placement, and deleting them hands
  the scope back to the hints, which visibly rearranges the picture.
- Other nodes may still point **at** a pinned node and they follow it, so you
  can extend a dragged diagram with ordinary hints against its pinned parts.

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
