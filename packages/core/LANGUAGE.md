# The `.pwr` language

Reference for the architecture DSL. This file is the ground truth: the docs site
teaches the same language with pictures, and `packages/core/README.md` covers the
programmatic API, but where they disagree, this wins.

`power check <file>` reports anything this document forbids, plus layout problems
it cannot see. Run it before handing a diagram to anyone.

## What `power check` reports

| Code | Severity | Means |
|---|---|---|
| `parse-error` | error | the document does not parse; nothing renders |
| `build-error` | error | it parses but does not hold together — duplicate id, unknown icon or style, a node in two containers |
| `hint-cycle` | warning | hints point at each other; those nodes fall back to declaration order |
| `loose-node` | warning | a node with no hint that nothing points at, so it is parked to the right of everything |
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

---

## 5. Placement

There are no coordinates. A node is positioned against a **sibling in the same
scope** — hints pointing into another container are ignored.

```
app b "B" @rightOf(a)
app c "C" @below(a) @align(start)
```

- One horizontal relation (`@rightOf` / `@leftOf`) sets X, one vertical
  (`@below` / `@above`) sets Y. Write both and you pin both axes.
- If you write both `@rightOf` and `@leftOf`, **`rightOf` wins**; with both
  `@below` and `@above`, **`below` wins**.
- `@align(start|center|end)` sets the cross axis, and **only applies when just
  one axis is constrained**. Default `center`.
- If the computed slot is taken, the node slides clear: one placed by a
  *horizontal* relation slides **down**, one placed by a *vertical* relation
  slides **right**.

### The rule that matters most

Siblings tied together by hints form one block. **A node with no hint that
nothing points at starts a new block, and blocks are packed left to right** — so
it lands to the right of everything else, not where you expected.

Give every node a hint except the one you want as the origin. `power check`
reports the rest as `loose-node`.

A cycle (`a @rightOf(b)` and `b @rightOf(a)`) does not fail; the nodes fall back
to declaration order and `power check` reports `hint-cycle`.

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

61 marks are bundled, with aliases (`pg`, `postgres` → `postgresql`; `k8s` →
`kubernetes`; `node` → `nodedotjs`; `java`, `jvm` → `openjdk`). An unknown name
fails at parse time with a suggestion.

**`power icons` lists every bundled name and alias — run it instead of
guessing.** They are technology and vendor marks only: there is no generic
device, browser, person or "mobile app" glyph, so leave those without an icon.
An alias resolves to the vendor's own mark, which is not always the glyph you
pictured (`java` → the OpenJDK Duke, `node` → the Node hexagon); check the list
if it matters.

`power icon <slug>` prints a block for any other Simple Icons slug.

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

---

## 9. Where each directive is allowed

| Context | Allowed |
|---|---|
| `architecture` line | `@spacing` `@spacingX` `@spacingY` `@margin` `@theme` |
| shape | `@rightOf` `@leftOf` `@above` `@below` `@gap` `@align` `@style` `@icon` + style properties |
| container | the shape set, plus `@spacing` `@spacingX` `@spacingY` `@padding` |
| connection | `@style` + style properties |

Directive names are case-insensitive: `@rightOf` and `@rightof` are the same.

---

## 10. Rules that are easy to get wrong

1. **ids cannot contain `-`.** Use `order_api`, not `order-api`.
2. **Never name a node after a keyword.** `app`, `database`, `queue`, `rect`,
   `service`, `group`, `architecture` are dispatched on the first word, so
   `rect -> db` is read as a shape declaration and fails.
3. **Directives come before the `:` label** on a connection.
4. **`{` ends the line; `}` sits alone on its own.**
5. **Comments are whole-line only.**
6. **Give every node at least one hint**, except the first. A node without one
   silently lands to the right of everything. Two hints (one per axis) are fine
   and pin both.
7. **Sizes carry no units**, and `fontSize` does not exist.
8. Prefer containers over a long row of top-level nodes — a wide strip is hard to
   read, and `power check` reports it.
