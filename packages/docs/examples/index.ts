import type { ExampleData } from "./types";
import { elements } from "./elements";
import { arrows } from "./arrows";
import { blocks } from "./blocks";
import { layout } from "./layout";
import { spacing } from "./spacing";
import { styling } from "./styling";
import { icons } from "./icons";
import { links } from "./links";

export type { ExampleData };
export { elements, arrows, blocks, layout, spacing, styling, icons, links };

/** The headline example shown on the introduction page. */
export const intro: ExampleData = {
  id: "intro",
  title: "A small system",
  description: "Two services, an API gateway, and a shared event bus — placed with relative hints.",
  dsl: `architecture
  app gw "API Gateway"

  service orders "Orders" @below(gw) {
    app oapi "Orders API"
    database odb "Postgres" @below(oapi)
  }

  service pay "Payments" @rightOf(orders) {
    app papi "Payments API"
    queue pq "Charges" @below(papi)
  }

  queue bus "Event Bus" @below(orders)

  gw -> orders : http
  gw -> pay : http
  orders -> bus
  pay -> bus
  orders -- pay`,
  api: `architecture()
  .app("gw", "API Gateway")
  .app("oapi", "Orders API")
  .database("odb", "Postgres", { hint: { below: "oapi" } })
  .container("orders", "Orders", { kind: "service", children: ["oapi", "odb"], hint: { below: "gw" } })
  .app("papi", "Payments API")
  .queue("pq", "Charges", { hint: { below: "papi" } })
  .container("pay", "Payments", { kind: "service", children: ["papi", "pq"], hint: { rightOf: "orders" } })
  .queue("bus", "Event Bus", { hint: { below: "orders" } })
  .connect("gw", "orders", { label: "http" })
  .connect("gw", "pay", { label: "http" })
  .connect("orders", "bus")
  .connect("pay", "bus")
  .connect("orders", "pay", { dir: "none" })
  .build();`,
};

/** Flat list for the example validator. */
export const allExamples: ExampleData[] = [
  intro,
  ...elements,
  ...arrows,
  ...blocks,
  ...layout,
  ...spacing,
  ...styling,
  ...icons,
  ...links,
];
