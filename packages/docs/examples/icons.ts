import type { ExampleData } from "./types";

export const icons: ExampleData[] = [
  {
    id: "icon",
    title: "@icon",
    description:
      "`@icon(name)` draws a brand mark before the label, in that brand's own colour. Shorthands work too — `pg` is `postgresql`, `k8s` is `kubernetes`.",
    dsl: `architecture\n  app api "Orders API" @icon(dotnet)\n  database db "Postgres" @below(api) @icon(pg)\n  queue bus "Events" @below(db) @icon(kafka)\n  api -> db : sql`,
    api: `architecture()\n  .app("api", "Orders API", { icon: "dotnet" })\n  .database("db", "Postgres", { hint: { below: "api" }, icon: "pg" })\n  .queue("bus", "Events", { hint: { below: "db" }, icon: "kafka" })\n  .connect("api", "db", { label: "sql" })\n  .build();`,
  },
  {
    id: "icon-only",
    title: "Just the mark",
    description:
      "Give a shape an empty label and the icon stands alone, in a box sized for it rather than for absent text.",
    dsl: `architecture\n  app a "" @icon(react)\n  database b "" @rightOf(a) @icon(redis)\n  queue c "" @rightOf(b) @icon(rabbitmq)\n  rect d "" @rightOf(c) @icon(terraform)`,
    api: `architecture()\n  .app("a", "", { icon: "react" })\n  .database("b", "", { hint: { rightOf: "a" }, icon: "redis" })\n  .queue("c", "", { hint: { rightOf: "b" }, icon: "rabbitmq" })\n  .rect("d", "", { hint: { rightOf: "c" }, icon: "terraform" })\n  .build();`,
  },
  {
    id: "icon-container",
    title: "On a container",
    description: "Containers take a mark too — it sits in the title band, before the name.",
    dsl: `architecture\n  service svc "Payments" @icon(openjdk) {\n    app api "API"\n    database db "Ledger" @below(api) @icon(pg)\n  }\n  group legacy "Legacy" @rightOf(svc) @icon(php) {\n    rect mono "Monolith"\n  }`,
    api: `architecture()\n  .app("api", "API")\n  .database("db", "Ledger", { hint: { below: "api" }, icon: "pg" })\n  .container("svc", "Payments", {\n    kind: "service",\n    children: ["api", "db"],\n    icon: "openjdk",\n  })\n  .rect("mono", "Monolith")\n  .container("legacy", "Legacy", {\n    kind: "group",\n    children: ["mono"],\n    hint: { rightOf: "svc" },\n    icon: "php",\n  })\n  .build();`,
  },
  {
    id: "icon-color",
    title: "@iconColor",
    description:
      "Brand colours are loud when every box has one. `@iconColor` flattens a mark to a single colour, and like any style property it can live in a `style` block and be reused.",
    dsl: `architecture\n  style muted {\n    icon-color: #94a3b8\n  }\n  app a "Brand colour" @icon(python)\n  app b "Muted" @rightOf(a) @icon(python) @style(muted)`,
    api: `architecture()\n  .defineStyle("muted", { iconColor: "#94a3b8" })\n  .app("a", "Brand colour", { icon: "python" })\n  .app("b", "Muted", { hint: { rightOf: "a" }, icon: "python", styleRefs: ["muted"] })\n  .build();`,
  },
  {
    id: "icon-custom",
    title: "Your own mark",
    description:
      "An `icon` block declares a mark from SVG path data. Any of the ~3400 Simple Icons works this way — `power icon <slug>` prints the block for you. A block that reuses a bundled name replaces it.",
    dsl: `architecture\n  icon acme {\n    path: M12 2 L22 20 L2 20 Z\n    color: #ff6600\n  }\n  app a "Acme" @icon(acme)\n  app b "Acme too" @rightOf(a) @icon(acme)`,
    api: `import { fromSimpleIcon } from "power";\nimport { siVercel } from "simple-icons";\n\narchitecture()\n  .defineIcon("acme", { path: "M12 2 L22 20 L2 20 Z", color: "#ff6600" })\n  .defineIcon("vercel", fromSimpleIcon(siVercel))\n  .app("a", "Acme", { icon: "acme" })\n  .app("b", "Acme too", { hint: { rightOf: "a" }, icon: "acme" })\n  .build();`,
  },
];
