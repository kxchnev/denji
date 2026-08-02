---
name: power-diagrams
description: Write and edit architecture diagrams in the .pwr DSL (power). Use when asked to draw, sketch or update an architecture, system, service or infrastructure diagram, or when editing a .pwr file. Covers the grammar, the check/preview loop, and the layout rules that decide whether a diagram reads well.
---

# Writing `.pwr` diagrams

`power` draws free-form architecture diagrams — shapes, containers and
connections, placed **only** by relative hints. No coordinates.

## The loop

1. Write or edit the `.pwr` file.
2. `power check <file>` — syntax errors *and* layout problems. Fix everything it
   lists. `--json` for structured output, `--strict` to fail on warnings too.
3. **`power render <file> -o /tmp/preview.png` and look at the image.** Do this;
   do not skip it. `check` can only judge the things it has a rule for — it says
   nothing about a label colliding with a container frame, an arrow taking an
   ugly detour, or a layout that is merely confusing. Reading the picture is the
   only way to catch those, and you can read pictures.
4. Only then hand it over, and suggest they keep `power watch <file>` open: it
   re-renders on every save, so they can watch your edits land and tell you what
   to change without a round trip.

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
- **`text` lives inside a `group` only** and its string must be quoted. Repeat
  it to stack lines in one corner — there is no `\n`. It reserves a band, so it
  grows the group rather than overlapping the children: a long note makes a wide
  box, a tall stack a tall one.

## When you are asked to change an existing diagram

Read the file first. Keep the ids stable — the person is looking at the picture
and refers to boxes by their labels, and stable ids keep the diff small and the
layout from jumping around.
