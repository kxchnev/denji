import type { ExampleData } from "./types";

export const layout: ExampleData[] = [
  {
    id: "relative",
    title: "rightOf / below",
    description: "Placement is relative: anchor a node next to or under another.",
    dsl: `architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  app c "C" @below(a)`,
    api: `architecture()\n  .app("a", "A")\n  .app("b", "B", { hint: { rightOf: "a" } })\n  .app("c", "C", { hint: { below: "a" } })\n  .build();`,
  },
  {
    id: "above-left",
    title: "leftOf / above",
    description: "The mirror hints place a node before or over its anchor.",
    dsl: `architecture\n  app a "A"\n  app b "B" @leftOf(a)\n  app c "C" @above(a)`,
    api: `architecture()\n  .app("a", "A")\n  .app("b", "B", { hint: { leftOf: "a" } })\n  .app("c", "C", { hint: { above: "a" } })\n  .build();`,
  },
  {
    id: "align",
    title: "align",
    description: "By default a node centers on its anchor; `@align(start|end)` overrides the cross-axis.",
    dsl: `architecture\n  database wide "Wide Data Store Cluster"\n  app top "start" @below(wide) @align(start)\n  app bottom "end" @below(wide) @align(end)`,
    api: `architecture()\n  .database("wide", "Wide Data Store Cluster")\n  .app("top", "start", { hint: { below: "wide", align: "start" } })\n  .app("bottom", "end", { hint: { below: "wide", align: "end" } })\n  .build();`,
  },
  {
    id: "no-hint",
    title: "no hint",
    description:
      "Nodes tied together by hints form one block. A node nothing anchors to is parked to the right of that block instead of landing on top of it.",
    dsl: `architecture\n  app gw "API Gateway"\n  service orders "Orders" @below(gw) {\n    app oapi "Orders API"\n    database odb "Postgres" @below(oapi)\n  }\n  app loose "No hint"`,
    api: `architecture()\n  .app("gw", "API Gateway")\n  .app("oapi", "Orders API")\n  .database("odb", "Postgres", { hint: { below: "oapi" } })\n  .container("orders", "Orders", { kind: "service", children: ["oapi", "odb"], hint: { below: "gw" } })\n  .app("loose", "No hint")\n  .build();`,
  },
  {
    id: "taken-slot",
    title: "taken slot",
    description:
      "Two nodes asking for the same slot do not stack: the second slides clear along the cross axis of its own relation.",
    dsl: `architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  app c "C" @rightOf(a)`,
    api: `architecture()\n  .app("a", "A")\n  .app("b", "B", { hint: { rightOf: "a" } })\n  .app("c", "C", { hint: { rightOf: "a" } })\n  .build();`,
  },
];
