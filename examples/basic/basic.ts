import { writeFileSync } from "node:fs";
import { architecture, toSvg } from "../../src/index.js";

// Free-form architecture: two services (each wrapping an app + a store), an
// API gateway, and a shared event bus. Placement is relative-only.
const diagram = architecture()
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
  .build();

writeFileSync(new URL("./basic.svg", import.meta.url), toSvg(diagram));
console.log("wrote examples/basic/basic.svg");
