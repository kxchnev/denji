import type { ExampleData } from "./types";

export const layout: ExampleData[] = [
  {
    id: "automatic",
    title: "no placement at all",
    description:
      "The connections are the layout. Each scope is drawn in layers along its own flow — what feeds something comes before it — and the order within a layer is chosen to keep the connectors from crossing. Nothing here says where anything goes.",
    dsl: `architecture\n  app web "Web"\n  app api "API"\n  app auth "Auth"\n  database db "Postgres"\n  queue bus "Events"\n\n  web -> api\n  web -> auth\n  api -> db\n  api -> bus\n  auth -> db`,
    api: `architecture()\n  .app("web", "Web")\n  .app("api", "API")\n  .app("auth", "Auth")\n  .database("db", "Postgres")\n  .queue("bus", "Events")\n  .connect("web", "api")\n  .connect("web", "auth")\n  .connect("api", "db")\n  .connect("api", "bus")\n  .connect("auth", "db")\n  .build();`,
  },
  {
    id: "relative",
    title: "rightOf / below",
    description:
      "Hints are constraints on that arrangement, not coordinates. `@rightOf` means the same layer, in that order; `@below` means a later one. Use them where the graph leaves a choice you care about.",
    dsl: `architecture\n  app gw "Gateway"\n  app b "B"\n  app a "A" @leftOf(b)\n  database db "Store" @below(a)\n  gw -> a\n  gw -> b\n  a -> db\n  b -> db`,
    api: `architecture()\n  .app("gw", "Gateway")\n  .app("b", "B")\n  .app("a", "A", { hint: { leftOf: "b" } })\n  .database("db", "Store", { hint: { below: "a" } })\n  .connect("gw", "a")\n  .connect("gw", "b")\n  .connect("a", "db")\n  .connect("b", "db")\n  .build();`,
  },
  {
    id: "routing",
    title: "connectors find their own way",
    description:
      "A connection that skips a layer gets a corridor reserved through the ones it crosses, so it never runs over a box it has nothing to do with. Where several travel together they are spread into a bundle instead of landing on top of each other.",
    dsl: `architecture\n  app edge "Edge"\n  app one "One"\n  app two "Two"\n  app three "Three"\n  database store "Store"\n\n  edge -> one\n  edge -> two\n  edge -> three\n  one -> store\n  two -> store\n  three -> store\n  edge -> store`,
    api: `architecture()\n  .app("edge", "Edge")\n  .app("one", "One")\n  .app("two", "Two")\n  .app("three", "Three")\n  .database("store", "Store")\n  .connect("edge", "one")\n  .connect("edge", "two")\n  .connect("edge", "three")\n  .connect("one", "store")\n  .connect("two", "store")\n  .connect("three", "store")\n  .connect("edge", "store")\n  .build();`,
  },
  {
    id: "align",
    title: "align",
    description:
      "A node placed against a pinned one centers on it by default; `@align(start|end)` moves it to an edge instead. Only pinned anchors have an edge to align to — everywhere else the layout decides the cross axis from the connections.",
    dsl: `architecture\n  database wide "Wide Data Store Cluster" @at(0, 0)\n  app top "start" @below(wide) @align(start)\n  app bottom "end" @rightOf(wide) @align(end)`,
    api: `architecture()\n  .database("wide", "Wide Data Store Cluster", { hint: { at: { x: 0, y: 0 } } })\n  .app("top", "start", { hint: { below: "wide", align: "start" } })\n  .app("bottom", "end", { hint: { rightOf: "wide", align: "end" } })\n  .build();`,
  },
  {
    id: "nudge",
    title: "@nudge",
    description:
      "The layout still decides where a node goes; `@nudge(dx, dy)` shifts it a little off that spot. A preference, not a promise: sibling order and minimum gaps always win, so a nudge can never make boxes overlap, and unlike `@at` the node stays in the automatic arrangement. Without it the gateway here would sit centered over the pair; the nudge slides it left. `dy` moves a node only within its own layer.",
    dsl: `architecture\n  app gw "Gateway" @nudge(-40, 0)\n  app orders "Orders"\n  app billing "Billing"\n  gw -> orders\n  gw -> billing`,
    api: `architecture()\n  .app("gw", "Gateway", { hint: { nudge: { x: -40, y: 0 } } })\n  .app("orders", "Orders")\n  .app("billing", "Billing")\n  .connect("gw", "orders")\n  .connect("gw", "billing")\n  .build();`,
  },
  {
    id: "scopes",
    title: "every container is its own drawing",
    description:
      "A container is laid out from the connections between its own children, and then placed among its siblings by the connections that cross its border. So a connection between two services' innards is, from the outside, a reason for those services to sit near each other.",
    dsl: `architecture\n  app gw "API Gateway"\n  service orders "Orders" {\n    app oapi "Orders API"\n    database odb "Postgres"\n    oapi -> odb\n  }\n  service pay "Payments" {\n    app papi "Payments API"\n    queue pq "Charges"\n    papi -> pq\n  }\n  queue bus "Event Bus"\n\n  gw -> oapi\n  gw -> papi\n  pq -> bus\n  odb -> bus`,
    api: `architecture()\n  .app("gw", "API Gateway")\n  .app("oapi", "Orders API")\n  .database("odb", "Postgres")\n  .container("orders", "Orders", { kind: "service", children: ["oapi", "odb"] })\n  .app("papi", "Payments API")\n  .queue("pq", "Charges")\n  .container("pay", "Payments", { kind: "service", children: ["papi", "pq"] })\n  .queue("bus", "Event Bus")\n  .connect("oapi", "odb")\n  .connect("papi", "pq")\n  .connect("gw", "oapi")\n  .connect("gw", "papi")\n  .connect("pq", "bus")\n  .connect("odb", "bus")\n  .build();`,
  },
  {
    id: "at",
    title: "@at",
    description:
      "The escape hatch, for a picture whose shape is not in the graph — a rack, a floor plan, a map. `@at(x, y)` sets a node's top-left corner in the coordinate space of its own scope, so moving a container carries its children along untouched, and a scope that has coordinates in it keeps its origin instead of hugging its content. Dragging does not write this: a drop is recorded as a relation, so the node keeps being arranged.",
    dsl: `architecture\n  app a "A" @at(0, 0)\n  database b "B" @at(0, 120)\n  service edge "Edge" @at(240, 40) {\n    app cdn "CDN" @at(0, 0)\n    app lb "LB" @at(0, 100)\n  }\n  a -> cdn\n  b -> lb`,
    api: `architecture()\n  .app("a", "A", { hint: { at: { x: 0, y: 0 } } })\n  .database("b", "B", { hint: { at: { x: 0, y: 120 } } })\n  .app("cdn", "CDN", { hint: { at: { x: 0, y: 0 } } })\n  .app("lb", "LB", { hint: { at: { x: 0, y: 100 } } })\n  .container("edge", "Edge", { kind: "service", children: ["cdn", "lb"], hint: { at: { x: 240, y: 40 } } })\n  .connect("a", "cdn")\n  .connect("b", "lb")\n  .build();`,
  },
  {
    id: "at-and-hints",
    title: "@at with hints",
    description:
      "The two mix. Coordinates beat every relation written on the same node, but other nodes may still anchor to it and are placed against it exactly — so one part of a diagram can be drawn by hand while everything else keeps arranging itself around it, stepping clear rather than landing on it.",
    dsl: `architecture\n  app api "API" @at(0, 0)\n  database db "Postgres" @below(api)\n  queue bus "Events" @rightOf(api)\n  api -> db\n  api -> bus`,
    api: `architecture()\n  .app("api", "API", { hint: { at: { x: 0, y: 0 } } })\n  .database("db", "Postgres", { hint: { below: "api" } })\n  .queue("bus", "Events", { hint: { rightOf: "api" } })\n  .connect("api", "db")\n  .connect("api", "bus")\n  .build();`,
  },
];
