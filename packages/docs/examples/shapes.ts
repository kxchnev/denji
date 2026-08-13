import type { ExampleData } from "./types";

/**
 * What you declare: the four shapes, then the two containers that hold them.
 * One page, because "a box" and "a box that holds boxes" are the same question
 * for anyone writing their first diagram.
 */
export const shapes: ExampleData[] = [
  {
    id: "app",
    title: "App",
    description: "A rounded rectangle — the default building block for a service or component.",
    dsl: `architecture\n  app api "API Service"`,
    api: `architecture()\n  .app("api", "API Service")\n  .build();`,
  },
  {
    id: "database",
    title: "Database",
    description: "A vertical cylinder for a data store.",
    dsl: `architecture\n  database db "PostgreSQL"`,
    api: `architecture()\n  .database("db", "PostgreSQL")\n  .build();`,
  },
  {
    id: "queue",
    title: "Queue",
    description: "A horizontal cylinder for a message queue or stream.",
    dsl: `architecture\n  queue bus "Message Queue"`,
    api: `architecture()\n  .queue("bus", "Message Queue")\n  .build();`,
  },
  {
    id: "rect",
    title: "Rect",
    description: "A plain rectangle for anything that isn't a specific kind.",
    dsl: `architecture\n  rect box "External System"`,
    api: `architecture()\n  .rect("box", "External System")\n  .build();`,
  },

  {
    id: "service",
    title: "Service",
    description: "A `service` block groups shapes under an accented header.",
    dsl: `architecture\n  service orders "Orders" {\n    app api "API"\n    database db "Postgres" @below(api)\n    api -> db\n  }`,
    api: `architecture()\n  .app("api", "API")\n  .database("db", "Postgres", { hint: { below: "api" } })\n  .container("orders", "Orders", { kind: "service", children: ["api", "db"] })\n  .connect("api", "db")\n  .build();`,
  },
  {
    id: "group",
    title: "Group",
    description: "A `group` block is a plain labelled frame.",
    dsl: `architecture\n  group edge "Edge" {\n    app cdn "CDN"\n    app waf "WAF" @rightOf(cdn)\n  }`,
    api: `architecture()\n  .app("cdn", "CDN")\n  .app("waf", "WAF", { hint: { rightOf: "cdn" } })\n  .container("edge", "Edge", { kind: "group", children: ["cdn", "waf"] })\n  .build();`,
  },
  {
    id: "group-text",
    title: "Text in a group",
    description:
      "A `text` line writes a free note in one of the group's corners — `@corner` picks which, `topLeft` by default. Repeat it to stack lines in one corner. Each band is reserved, so a note never lands on the children.",
    dsl: `architecture\n  group edge "Edge" {\n    text "only in prod"\n    text "terraform-managed"\n    text "owner: platform" @corner(bottomRight)\n    app cdn "CDN"\n    app waf "WAF" @rightOf(cdn)\n  }`,
    api: `architecture()\n  .app("cdn", "CDN")\n  .app("waf", "WAF", { hint: { rightOf: "cdn" } })\n  .container("edge", "Edge", {\n    kind: "group",\n    children: ["cdn", "waf"],\n    texts: [\n      { text: "only in prod" },\n      { text: "terraform-managed" },\n      { text: "owner: platform", corner: "bottomRight" },\n    ],\n  })\n  .build();`,
  },
  {
    id: "invisible",
    title: "Invisible wrapper",
    description:
      "A container with an empty label and no icon or link has nothing to put in a title band, so it reserves none. Add a transparent frame and zero padding and the wrapper vanishes entirely — it groups its children for the layout, and gives hints something to anchor to, without leaving a trace in the picture.",
    dsl: `architecture\n  group pair "" @fill(transparent) @stroke(transparent) @padding(0) {\n    service orders "Orders" {\n      app oapi "API"\n    }\n    service pay "Payments" @leftOf(orders) {\n      app papi "API"\n    }\n  }\n  app worker "Payouts" @below(pair)\n  oapi -> worker\n  papi -> worker`,
    api: `architecture()\n  .app("oapi", "API")\n  .container("orders", "Orders", { kind: "service", children: ["oapi"] })\n  .app("papi", "API")\n  .container("pay", "Payments", { kind: "service", children: ["papi"], hint: { leftOf: "orders" } })\n  .container("pair", "", {\n    kind: "group",\n    children: ["orders", "pay"],\n    styleProps: { fill: "transparent", stroke: "transparent" },\n    padding: 0,\n  })\n  .app("worker", "Payouts", { hint: { below: "pair" } })\n  .connect("oapi", "worker")\n  .connect("papi", "worker")\n  .build();`,
  },
  {
    id: "nested",
    title: "Nested",
    description: "Containers nest freely — a group holding a service holding shapes.",
    dsl: `architecture\n  group prod "Production" {\n    service orders "Orders" {\n      app api "API"\n      database db "Postgres" @below(api)\n    }\n  }`,
    api: `architecture()\n  .app("api", "API")\n  .database("db", "Postgres", { hint: { below: "api" } })\n  .container("orders", "Orders", { kind: "service", children: ["api", "db"] })\n  .container("prod", "Production", { kind: "group", children: ["orders"] })\n  .build();`,
  },
  {
    id: "connections",
    title: "Connections across blocks",
    description: "Connect shapes across services; blocks auto-size around them.",
    dsl: `architecture\n  service orders "Orders" {\n    app oapi "Orders API"\n    database odb "Postgres" @below(oapi)\n    oapi -> odb\n  }\n  service pay "Payments" @rightOf(orders) {\n    app papi "Payments API"\n    database pdb "Postgres" @below(papi)\n    papi -> pdb\n  }\n  oapi -> papi`,
    api: `architecture()\n  .app("oapi", "Orders API")\n  .database("odb", "Postgres", { hint: { below: "oapi" } })\n  .container("orders", "Orders", { kind: "service", children: ["oapi", "odb"] })\n  .app("papi", "Payments API")\n  .database("pdb", "Postgres", { hint: { below: "papi" } })\n  .container("pay", "Payments", { kind: "service", children: ["papi", "pdb"], hint: { rightOf: "orders" } })\n  .connect("oapi", "odb")\n  .connect("papi", "pdb")\n  .connect("oapi", "papi")\n  .build();`,
  },
];
