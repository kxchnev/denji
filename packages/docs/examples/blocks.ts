import type { ExampleData } from "./types";

export const blocks: ExampleData[] = [
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
