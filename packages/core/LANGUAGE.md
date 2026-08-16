# The `.denji` language

Reference for the architecture DSL. This file is the ground truth: the docs site
teaches the same language with pictures, and `packages/core/README.md` covers the
programmatic API, but where they disagree, this wins.

`denji check <file>` reports anything this document forbids, plus layout problems
it cannot see. Run it before handing a diagram to anyone.

## What `denji check` reports

| Code | Severity | Means |
|---|---|---|
| `parse-error` | error | the document does not parse; nothing renders |
| `build-error` | error | it parses but does not hold together — duplicate id, unknown icon or style, a node in two containers |
| `hint-cycle` | warning | hints contradict each other; the relations that close the cycle are dropped |
| `unconnected-node` | warning | a shape with no connections, in a diagram that otherwise has them |
| `overlapping-siblings` | warning | two siblings drawn on top of each other |
| `extreme-aspect-ratio` | warning | the drawing is a strip more than 4:1 — usually a missing container |

`--json` prints `{ file, errors, warnings, diagnostics }`, where each diagnostic
is `{ severity, code, message, line, col, srcLine?, nodes? }` and `line` is null
for findings about the whole document. `--strict` makes warnings fail too.

---

## 1. File shape

```
architecture
  app gw "API Gateway"
  database db "Postgres" @below(gw)
  gw -> db : sql
```

- The parser is **line-oriented**. Each line is trimmed before it is read, so
  **indentation is decoration** — nesting comes only from `{` … `}`.
- Blank lines are skipped.
- **Comments own the whole line** and start with `#` or `%%`. There is no
  trailing comment: `app a "X" # note` is a syntax error.
- The `architecture` line carries diagram-wide settings. Idiomatically it is
  line 1; write it there.

---

## 2. Shapes

```
app|database|queue|rect  <id>  ["<label>"]  <directives…>
```

| Kind | Drawn as |
|---|---|
| `app` | rounded rectangle |
| `database` | vertical cylinder |
| `queue` | horizontal cylinder |
| `rect` | plain rectangle |

- **`id` matches `[A-Za-z0-9_]+`** — letters, digits and underscore. **No
  hyphens, no dots.**
- `label` is optional and double-quoted; it may not contain `"`. Omit it and the
  label becomes the id. Write `""` for an icon with no text.

### How big a shape comes out

**Every shape in a diagram is the same size.** A box is not sized to its own
label — that is what made a picture ragged, one width per name. Instead the
diagram picks one width and every shape takes it.

- A label breaks at a **space** or a **hyphen**. `data-mesh-auth-server` becomes
  `data-mesh-` / `auth-server`; brackets stay whole, so `cdp (SQL Server)`
  becomes `cdp` / `(SQL Server)`.
- A word too long for the line is **broken with a hyphen** rather than allowed to
  widen every box in the document. One `SparkApplicationController` should not
  cost the whole picture.
- One line and two lines give a box of **exactly the same size**, so a row of
  boxes is a row.
- A **database is a barrel**: narrower than the rest, and taller than it is wide.
  Its height comes from its width, never from the text inside it — sizing it to
  two lines is what made it a pancake.
- A **queue is that barrel lying down**: derived from it, but plainly wider than
  it is tall, because a pipe has to look like one.
- On a **database** an `@icon` sits **above** the label rather than before it: a
  barrel is narrow and tall, so vertical room is what it has to spare. On a
  queue the mark stays where every other mark is, to the left of the text.
- An **icon with an empty label** stays a compact square. It is a mark, not a box.

`@width` and `@height` override all of it — on one shape, or on every shape of a
kind through a `style` block (§7). A shape sized by hand neither takes the shared
width nor helps decide it.

---

## 3. Containers

```
service|group  <id>  ["<label>"]  <directives…>  {
  …
}
```

- `service` draws an accented title band; `group` is a plain dashed frame.
- **The `{` must be the last character on the line**, and the closing `}` must be
  alone on its own line. There is no single-line form.
- Nesting is unlimited. A container hugs its content: `width`/`height` on it act
  only as a floor.
- Connections may be written inside a container body, but they are always global.
- A container with an **empty label** and no `@icon` or `@link` has nothing to
  put in a title band, so it reserves none. Combined with a transparent frame
  and zero padding that is the **invisible wrapper** — it groups its children
  for the layout (and gives hints something to anchor to) without leaving any
  trace in the picture:

  ```
  group pair "" @fill(transparent) @stroke(transparent) @padding(0) {
    service orders "Orders" { … }
    service pay "Payments" { … }
  }
  app worker "Payouts" @below(pair)
  ```

### Free text in a group

```
group <id> ["<label>"] {
  text "<some text>" [@corner(topLeft|topRight|bottomLeft|bottomRight)]
  …
}
```

- One line of text pinned to a corner of the group's inner area. `@corner`
  defaults to `topLeft`; the spellings `topLeft`, `top-left` and `topleft` are
  the same corner.
- It **reserves a band** — under the title for a top corner, along the bottom
  edge for a bottom one — so it never lands on the children, and it widens the
  group if it is longer than the content.
- Repeat `text` to stack several lines in one corner. They read downwards in the
  order written; the band grows a line at a time, and a bottom stack stays flush
  with the bottom edge. There is no `\n` — one `text` is one line.
- A text has no id and takes part in no connection.
- `group` only: a `service` spends its whole text palette on the title band.

---

## 4. Connections

```
<fromId> <op> <toId> [directives…] [: label]
```

| Operator | Arrows | Line |
|---|---|---|
| `->` | at the target | solid |
| `<-` | at the source | solid |
| `<->` | both ends | solid |
| `--` | none | solid |
| `-.->` | at the target | dashed |
| `-.-` | none | dashed |

- **Directives go before the `:`** — the label runs from the first `:` to the end
  of the line. `a -> b @style(hot) : login` is right; `a -> b : login @style(hot)`
  makes the label `login @style(hot)`.
- There is **no `|label|` form.**
- Endpoints may be shapes or containers.

### How a connector is drawn

A connection leaves one box and enters the other perpendicular to a side, near
the middle of it; several connections on one side fan out, and a side with no
room left hands the overflow to a side that also points at the other box — where
it docks in the middle again, not off in the corner nearest whatever it is
pointing at.

It **finds its own way round the boxes**: a box sitting between two connected
ones is walked around rather than crossed, and a connection that skips a layer
gets a corridor kept clear for it through the ones it crosses. Where several
connections travel together they are spread across a bundle at a fixed pitch
instead of landing on top of each other. You do not have to leave room for any
of this.

The path is drawn with square turns, rounded. Every bend on every connector gets
**the same radius** — an even rounding is what makes a turn read as a curve, and
a radius that fits in one place but not the next reads as a sloppy drawing, so
the radius is the widest one that fits everywhere. Where a route has to step
sideways by less than that, the step is drawn as one smooth transition rather
than as two corners too tight to round.

---

## 5. Placement

**You do not place anything. The connections do.**

The layout reads each scope's own graph and draws it in layers along the flow:
what feeds something comes before it, what it feeds comes after, and the order
within a layer is chosen to keep the connectors from crossing. Nodes that mostly
talk to each other are drawn together and placed as a group. A connection that
skips a layer gets a corridor reserved through it, so no connector ever runs
across a box it has nothing to do with.

```
architecture
  app web "Web"
  app api "API"
  database db "Postgres"

  web -> api
  api -> db
```

That is a complete diagram. There is nothing to add about where the boxes go.

### Hints are constraints, not coordinates

Where the graph leaves a choice, say what you want and the layout obeys it:

```
app b "B" @rightOf(a)
app c "C" @below(a)
```

- `@rightOf` / `@leftOf` mean **the same layer, in that order**.
- `@below` / `@above` mean **a later / earlier layer**.
- Which is which follows the direction the drawing runs, so the words always
  mean what they say on the page.
- If you write both `@rightOf` and `@leftOf`, **`rightOf` wins**; with both
  `@below` and `@above`, **`below` wins**.
- Contradicting yourself (`a @rightOf(b)` and `b @rightOf(a)`) does not fail: the
  relations that close the cycle are dropped and `denji check` reports
  `hint-cycle`.

A node with no hints is not a problem and never was one to report — it is the
ordinary case.

**There is no way to write a coordinate**, and no escape hatch that takes one.
A position is only true of the diagram you had when you measured it: add a node,
rename one, and the arithmetic that fitted is a hole. Everything you can say
about placement is a constraint the engine has to satisfy, which stays true as
the picture grows. If a drawing comes out wrong, the fix is a hint, a container,
or a connection that was never drawn — not a number.

### Dragging

Dragging a shape or a container (by its title band) says **where it belongs**,
not where the pointer stopped: on release the node gets a relation to the sibling
it was dropped next to — `@rightOf(that_one)` and friends — and the layout keeps
arranging everything, including it.

The drawing holds still while you drag; only the node in hand moves, and the
sibling it would attach to is outlined before you let go. It is the same source
either way; there is no hidden layout state.

---

## 6. Spacing

| Directive | `architecture` | container | shape | Meaning |
|---|---|---|---|---|
| `@spacing(n)` | ✅ | ✅ | — | gap between siblings, both axes |
| `@spacingX(n)` | ✅ | ✅ | — | horizontal only |
| `@spacingY(n)` | ✅ | ✅ | — | vertical only |
| `@padding(n)` | — | ✅ | — | border to content |
| `@margin(n)` | ✅ | — | — | whitespace around the whole drawing |
| `@gap(n)` | — | ✅ | ✅ | this node's distance to **its own anchor** |

A container's spacing governs its whole subtree until another container
overrides it. Defaults: gap 40, padding 24, margin 24.

---

## 7. Styling

Four layers, later wins per property:

1. the theme (`light` / `dark`)
2. a `style` block named after a kind — a selector over every element of it
3. named styles, in the order they are referenced on the element
4. properties written inline on the element

```
style database { fill: #ecfeff; stroke: #0891b2 }
style hot {
  fill: #fef2f2
  stroke: #ef4444
}
architecture
  database db "Postgres" @style(hot) @stroke-width(3)
```

- `style` and `icon` blocks are **top-level only**. Either open with `{` at the
  end of the line and close with `}` on its own, or write the whole thing on one
  line. Properties are `name: value`, separated by newlines or `;`.
- A block whose name is a slot (`app`, `database`, `queue`, `rect`, `service`,
  `group`, `edge`) is a selector; any other name is a reusable style attached
  with `@style(name)`. `@style` may be repeated.
- Forward references are fine — styles resolve after the whole file is read.

### Properties

| Property | Aliases | Value | Applies to |
|---|---|---|---|
| `fill` | | colour | all |
| `stroke` | | colour | all |
| `strokeWidth` | `stroke-width` | number ≥ 0 | all |
| `text` | | colour | all but `service` |
| `width` | | number ≥ 0 | all but `edge` |
| `height` | | number ≥ 0 | all but `edge` |
| `radius` | | number ≥ 0 | `app`, `rect`, `service`, `group` |
| `dash` | | numbers, e.g. `6 4` | all |
| `opacity` | | 0…1 | all |
| `fontWeight` | `font-weight` | `normal`, `bold`, `100`…`900` | all but `service` |
| `iconColor` | `icon-color` | colour | all but `edge` |
| `headerFill` | `header-fill` | colour | `service` only |
| `headerText` | `header-text` | colour | `service` only |

- Colours: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, a bare CSS colour name, or
  `rgb()` / `rgba()` / `hsl()` / `hsla()`.
- Sizes are **unitless** — `2`, never `2px`.
- **There is no `fontSize`**: text is always 14px, because layout measures labels
  before styles are resolved.
- Any property above can also be written inline as a directive: `@fill(#eee)`.
  Note `_` is not allowed in a directive name, so use `@stroke-width(2)` or
  `@strokeWidth(2)`.

### Themes

`@theme(light|dark)` on the `architecture` line pins the palette. Without it the
diagram carries both and follows the page or the device.

---

## 8. Icons

`@icon(name)` on a shape or container, before the label. Icons change the width
of a box, never its height.

```
architecture
  app api "Orders API" @icon(dotnet)
  database db "Postgres" @below(api) @icon(postgres)
```

**The whole of [Simple Icons](https://simpleicons.org) is bundled** — every mark
in the set, by its slug, with no declaration needed. Shorthands work too: `pg`
and `postgres` → `postgresql`, `k8s` → `kubernetes`, `java` → `openjdk`, and an
Apache project answers to its short name (`spark`, `flink`, `cassandra`). An
unknown name fails at parse time with a suggestion.

**`denji icons <text>` searches by slug, title or shorthand — run it instead of
guessing.** Bare `denji icons` says how many there are and which release they
came from.

These are technology and vendor marks only: there is no generic device, browser,
person or "mobile app" glyph, so leave those without an icon. **AWS, Azure,
Amazon and Oracle are not there either** — those companies asked Simple Icons to
drop them, so no slug can bring them back. Google Cloud is there. And an alias
resolves to the vendor's own mark, which is not always the glyph you pictured
(`java` → the OpenJDK Duke, `node` → the Node hexagon).

Your own mark:

```
icon acme {
  path: M12 2 L22 20 L2 20 Z
  color: #ff6600
}
```

`path` is required and may contain only SVG path commands and numbers. Optional:
`color`, `dark-color`, `view-box` (four numbers), `title`. Declaring a block with
a bundled name replaces that mark.

This is now for the marks Simple Icons does not carry — AWS, Azure, a company's
own logo — and nothing else. If `denji icons` finds it, do not paste it.

---

## 9. Links

`@link(url)` on a shape or a container draws a small button in its top-right
corner. Pressing it opens the URL — a new tab on the docs site, your browser
from the VS Code preview. The button is an **overlay**: it never changes a box's
size or where it sits, so adding one to a finished diagram moves nothing.

```
architecture
  app api "Orders API" @link(https://example.com/runbook)
  service pay "Payments" @below(api) @link(https://example.com/payments) {
    database db "Ledger" @link(mailto:data@example.com)
  }
```

- Only `http`, `https` and `mailto` are accepted. Anything else — `javascript:`,
  `data:`, a relative path like `./doc.md` — is a parse error, so a diagram can
  never carry an executable URL to whoever opens it.
- The URL is **not quoted** and runs to the closing `)`, so it may not contain
  one: percent-encode a `)` as `%29`. A `#fragment` is fine, because a comment
  has to own its whole line.
- A connection cannot carry a link — its label runs from the first `:` to the
  end of the line, and a URL has a `:` in it.
- Because the button overlays the box, a long label passes underneath it. That
  is the trade for a diagram whose layout does not shift when a link is added.

## 10. Where each directive is allowed

| Context | Allowed |
|---|---|
| `architecture` line | `@spacing` `@spacingX` `@spacingY` `@margin` `@theme` |
| shape | `@rightOf` `@leftOf` `@above` `@below` `@gap` `@style` `@icon` `@link` + style properties |
| container | the shape set, plus `@spacing` `@spacingX` `@spacingY` `@padding` |
| connection | `@style` + style properties |
| `text` line | `@corner` |

Directive names are case-insensitive: `@rightOf` and `@rightof` are the same.

---

## 11. Rules that are easy to get wrong

1. **ids cannot contain `-`.** Use `order_api`, not `order-api`.
2. **Never name a node after a keyword.** `app`, `database`, `queue`, `rect`,
   `service`, `group`, `text`, `architecture` are dispatched on the first word,
   so `rect -> db` is read as a shape declaration and fails.
3. **Directives come before the `:` label** on a connection.
4. **`{` ends the line; `}` sits alone on its own.**
5. **Comments are whole-line only.**
6. **Write hints only where you actually care.** The connections decide the
   arrangement; a hint is you overruling that for one pair, and every one you add
   is a constraint someone has to keep true as the diagram grows.
7. **Sizes carry no units**, and `fontSize` does not exist.
8. **Long names get hyphenated.** Every shape shares one width, and past a
   ceiling a word too long for it is broken with a hyphen rather than allowed to
   widen every box in the picture.
9. **A `@link` URL is unquoted and ends at `)`** — percent-encode one as `%29` —
   and only `http`, `https` and `mailto` are accepted.
10. **Draw the connections.** They are not decoration on top of a layout — they
    *are* the layout. A diagram whose boxes are wired up needs nothing else said
    about where anything goes.
11. Prefer containers over a long row of top-level nodes — a wide strip is hard to
    read, and `denji check` reports it.
