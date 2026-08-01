import type { ExampleData } from "./types";

export const styling: ExampleData[] = [
  {
    id: "theme",
    title: "@theme",
    description:
      "By default a diagram carries both palettes and follows the page — use the toggle in the header and every diagram here moves with it. `@theme(light|dark)` pins one instead, like the dark diagram below. Downloads always bake whichever palette you are looking at, so an exported file never changes on someone else's machine.",
    dsl: `architecture @theme(dark)\n  app gw "Gateway"\n  database db "Postgres" @below(gw)\n  gw -> db : sql`,
    api: `architecture()\n  .theme("dark")\n  .app("gw", "Gateway")\n  .database("db", "Postgres", { hint: { below: "gw" } })\n  .connect("gw", "db", { label: "sql" })\n  .build();`,
  },
  {
    id: "selector",
    title: "Styling a kind",
    description:
      "A `style` block named after a kind — `app`, `database`, `queue`, `rect`, `service`, `group` or `edge` — restyles every element of that kind. No element has to opt in.",
    dsl: `architecture\n  style database {\n    fill: #ecfeff\n    stroke: #0891b2\n    text: #164e63\n  }\n  app api "API"\n  database one "Orders" @below(api)\n  database two "Billing" @rightOf(one)`,
    api: `architecture()\n  .defineStyle("database", { fill: "#ecfeff", stroke: "#0891b2", text: "#164e63" })\n  .app("api", "API")\n  .database("one", "Orders", { hint: { below: "api" } })\n  .database("two", "Billing", { hint: { rightOf: "one" } })\n  .build();`,
  },
  {
    id: "named",
    title: "Reusable styles",
    description:
      "Declare a style once, attach it with `@style(name)` as many times as you like. Several styles stack: when two set the same property, the one declared later wins — the same rule CSS classes follow.",
    dsl: `architecture\n  style hot {\n    fill: #fef2f2\n    stroke: #ef4444\n    text: #991b1b\n  }\n  app gw "Gateway" @style(hot)\n  app worker "Worker" @rightOf(gw)\n  database db "Hot store" @below(gw) @style(hot)`,
    api: `architecture()\n  .defineStyle("hot", { fill: "#fef2f2", stroke: "#ef4444", text: "#991b1b" })\n  .app("gw", "Gateway", { styleRefs: ["hot"] })\n  .app("worker", "Worker", { hint: { rightOf: "gw" } })\n  .database("db", "Hot store", { hint: { below: "gw" }, styleRefs: ["hot"] })\n  .build();`,
  },
  {
    id: "inline",
    title: "Inline properties",
    description:
      "Any property can be written straight on an element as `@name(value)`, and it beats every named style. Spell it `@stroke-width` or `@strokeWidth` — they are the same property.",
    dsl: `architecture\n  style plain {\n    fill: #f8fafc\n    text: #0f172a\n  }\n  app a "Default" @style(plain)\n  app b "Overridden" @rightOf(a) @style(plain) @fill(#ede9fe) @stroke-width(3)`,
    api: `architecture()\n  .defineStyle("plain", { fill: "#f8fafc", text: "#0f172a" })\n  .app("a", "Default", { styleRefs: ["plain"] })\n  .app("b", "Overridden", {\n    hint: { rightOf: "a" },\n    styleRefs: ["plain"],\n    styleProps: { fill: "#ede9fe", strokeWidth: 3 },\n  })\n  .build();`,
  },
  {
    id: "container",
    title: "Containers",
    description:
      "A `service` draws a title band, so it takes `header-fill` and `header-text` on top of the usual body properties. A `group` takes `dash` for its border.",
    dsl: `architecture\n  service svc "Payments" @headerFill(#0f766e) @headerText(#ecfeff) @stroke(#0f766e) {\n    app api "API"\n  }\n  group box "Legacy" @rightOf(svc) @dash(2 3) @stroke(#a855f7) {\n    rect mono "Monolith"\n  }`,
    api: `architecture()\n  .app("api", "API")\n  .container("svc", "Payments", {\n    kind: "service",\n    children: ["api"],\n    styleProps: { headerFill: "#0f766e", headerText: "#ecfeff", stroke: "#0f766e" },\n  })\n  .rect("mono", "Monolith")\n  .container("box", "Legacy", {\n    kind: "group",\n    children: ["mono"],\n    hint: { rightOf: "svc" },\n    styleProps: { dash: "2 3", stroke: "#a855f7" },\n  })\n  .build();`,
  },
  {
    id: "edges",
    title: "Connections",
    description:
      "Connections use the `edge` slot. Directives go *before* the `:` — a label runs to the end of the line. `fill` paints the label chip, and the arrowhead follows the stroke.",
    dsl: `architecture\n  style critical {\n    stroke: #dc2626\n    stroke-width: 2.5\n  }\n  app a "Client"\n  app b "Server" @rightOf(a) @gap(120)\n  app c "Cache" @below(b)\n  a -> b @style(critical) : login\n  b -> c @stroke(#0891b2) @dash(3 3)`,
    api: `architecture()\n  .defineStyle("critical", { stroke: "#dc2626", strokeWidth: 2.5 })\n  .app("a", "Client")\n  .app("b", "Server", { hint: { rightOf: "a", gap: 120 } })\n  .app("c", "Cache", { hint: { below: "b" } })\n  .connect("a", "b", { label: "login", styleRefs: ["critical"] })\n  .connect("b", "c", { styleProps: { stroke: "#0891b2", dash: "3 3" } })\n  .build();`,
  },
  {
    id: "size",
    title: "Size",
    description:
      "`width` and `height` are style properties like any other, so one selector resizes every element of a kind. On a shape the size is exact; on a container it is a floor — it still grows to hold its children.",
    dsl: `architecture\n  style app {\n    width: 150\n    height: 64\n  }\n  app a "Every app"\n  app b "the same" @rightOf(a)\n  database c "Untouched" @below(a)\n  rect d "One-off" @rightOf(c) @width(200) @height(40)`,
    api: `architecture()\n  .defineStyle("app", { width: 150, height: 64 })\n  .app("a", "Every app")\n  .app("b", "the same", { hint: { rightOf: "a" } })\n  .database("c", "Untouched", { hint: { below: "a" } })\n  .rect("d", "One-off", {\n    hint: { rightOf: "c" },\n    styleProps: { width: 200, height: 40 },\n  })\n  .build();`,
  },
  {
    id: "cascade",
    title: "The cascade",
    description:
      "Four layers, each beating the one before it: the theme, then a kind selector, then named styles, then inline properties. Every box below adds one more layer.",
    dsl: `architecture\n  style app {\n    fill: #e0f2fe\n    text: #075985\n  }\n  style loud {\n    fill: #fef9c3\n    stroke: #ca8a04\n    text: #713f12\n  }\n  rect theme "theme only"\n  app kind "kind selector" @rightOf(theme)\n  app named "named style" @rightOf(kind) @style(loud)\n  app inline "inline" @rightOf(named) @style(loud) @fill(#fce7f3) @text(#9d174d)`,
    api: `architecture()\n  .defineStyle("app", { fill: "#e0f2fe", text: "#075985" })\n  .defineStyle("loud", { fill: "#fef9c3", stroke: "#ca8a04", text: "#713f12" })\n  .rect("theme", "theme only")\n  .app("kind", "kind selector", { hint: { rightOf: "theme" } })\n  .app("named", "named style", { hint: { rightOf: "kind" }, styleRefs: ["loud"] })\n  .app("inline", "inline", {\n    hint: { rightOf: "named" },\n    styleRefs: ["loud"],\n    styleProps: { fill: "#fce7f3", text: "#9d174d" },\n  })\n  .build();`,
  },
];
