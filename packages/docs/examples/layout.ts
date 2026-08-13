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
    id: "scopes",
    title: "every container is its own drawing",
    description:
      "A container is laid out from the connections between its own children, and then placed among its siblings by the connections that cross its border. So a connection between two services' innards is, from the outside, a reason for those services to sit near each other.",
    dsl: `architecture\n  app gw "API Gateway"\n  service orders "Orders" {\n    app oapi "Orders API"\n    database odb "Postgres"\n    oapi -> odb\n  }\n  service pay "Payments" {\n    app papi "Payments API"\n    queue pq "Charges"\n    papi -> pq\n  }\n  queue bus "Event Bus"\n\n  gw -> oapi\n  gw -> papi\n  pq -> bus\n  odb -> bus`,
    api: `architecture()\n  .app("gw", "API Gateway")\n  .app("oapi", "Orders API")\n  .database("odb", "Postgres")\n  .container("orders", "Orders", { kind: "service", children: ["oapi", "odb"] })\n  .app("papi", "Payments API")\n  .queue("pq", "Charges")\n  .container("pay", "Payments", { kind: "service", children: ["papi", "pq"] })\n  .queue("bus", "Event Bus")\n  .connect("oapi", "odb")\n  .connect("papi", "pq")\n  .connect("gw", "oapi")\n  .connect("gw", "papi")\n  .connect("pq", "bus")\n  .connect("odb", "bus")\n  .build();`,
  },
];
