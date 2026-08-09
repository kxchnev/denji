import type { ExampleData } from "./types";

export const links: ExampleData[] = [
  {
    id: "link",
    title: "@link",
    description:
      "`@link(url)` puts a button in an element's top-right corner. Press it and the URL opens in a new tab — from the VS Code preview, in your browser. The button is drawn over the box, so adding one moves nothing.",
    dsl: `architecture\n  app api "Orders API" @link(https://example.com/orders)\n  database db "Postgres" @below(api) @link(https://example.com/db)\n  api -> db : sql`,
    api: `architecture()\n  .app("api", "Orders API", { link: "https://example.com/orders" })\n  .database("db", "Postgres", { hint: { below: "api" }, link: "https://example.com/db" })\n  .connect("api", "db", { label: "sql" })\n  .build();`,
  },
  {
    id: "link-container",
    title: "On a container",
    description:
      "A container takes one too, at the right end of its title band. That band is also the only part of a container you can drag, and the button wins there — pressing it opens the link instead of picking the container up.",
    dsl: `architecture\n  app gw "Gateway" @link(https://example.com/gateway)\n  service pay "Payments" @below(gw) @link(https://example.com/runbook) {\n    app api "API"\n    database db "Ledger" @below(api)\n  }\n  gw -> pay : http`,
    api: `architecture()\n  .app("gw", "Gateway", { link: "https://example.com/gateway" })\n  .app("api", "API")\n  .database("db", "Ledger", { hint: { below: "api" } })\n  .container("pay", "Payments", {\n    kind: "service",\n    children: ["api", "db"],\n    hint: { below: "gw" },\n    link: "https://example.com/runbook",\n  })\n  .connect("gw", "pay", { label: "http" })\n  .build();`,
  },
  {
    id: "link-mailto",
    title: "Who owns this",
    description:
      "`mailto:` is allowed as well, which turns the button into the owner of a box. Only `http`, `https` and `mailto` are — anything else is a parse error, so a diagram can never carry an executable URL. A mark and a link do not collide: one sits before the label, the other above it.",
    dsl: `architecture\n  app api "Orders API" @icon(dotnet) @link(mailto:orders@example.com)\n  app web "Storefront" @rightOf(api) @icon(react) @link(https://example.com/storefront)`,
    api: `architecture()\n  .app("api", "Orders API", { icon: "dotnet", link: "mailto:orders@example.com" })\n  .app("web", "Storefront", {\n    hint: { rightOf: "api" },\n    icon: "react",\n    link: "https://example.com/storefront",\n  })\n  .build();`,
  },
];
