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
  {
    id: "at",
    title: "@at",
    description:
      "Exact coordinates, when relative placement is not what you want. `@at(x, y)` sets a node's top-left corner in the coordinate space of its own scope — inside a container, relative to that container's inner area, so moving the container carries its children along untouched. A scope that has coordinates in it keeps its origin instead of hugging its content, so moving one node moves nothing else. Drag a node in the playground and this is the directive it writes, snapped to 8px — the first drag also pins the rest of the document where it already is, so that only what you grabbed moves.",
    dsl: `architecture\n  app a "A" @at(0, 0)\n  database b "B" @at(0, 120)\n  service edge "Edge" @at(240, 40) {\n    app cdn "CDN" @at(0, 0)\n    app lb "LB" @at(0, 100)\n  }\n  a -> cdn\n  b -> lb`,
    api: `architecture()\n  .app("a", "A", { hint: { at: { x: 0, y: 0 } } })\n  .database("b", "B", { hint: { at: { x: 0, y: 120 } } })\n  .app("cdn", "CDN", { hint: { at: { x: 0, y: 0 } } })\n  .app("lb", "LB", { hint: { at: { x: 0, y: 100 } } })\n  .container("edge", "Edge", { kind: "service", children: ["cdn", "lb"], hint: { at: { x: 240, y: 40 } } })\n  .connect("a", "cdn")\n  .connect("b", "lb")\n  .build();`,
  },
  {
    id: "at-and-hints",
    title: "@at with hints",
    description:
      "The two mix. Coordinates beat every relation written on the same node, but other nodes may still anchor to it and follow it around — so one part of a diagram can be placed by hand while the rest keeps arranging itself. A pinned node stays an obstacle: relative nodes step around it instead of landing on it.",
    dsl: `architecture\n  app api "API" @at(0, 0)\n  database db "Postgres" @below(api)\n  queue bus "Events" @rightOf(api)\n  api -> db\n  api -> bus`,
    api: `architecture()\n  .app("api", "API", { hint: { at: { x: 0, y: 0 } } })\n  .database("db", "Postgres", { hint: { below: "api" } })\n  .queue("bus", "Events", { hint: { rightOf: "api" } })\n  .connect("api", "db")\n  .connect("api", "bus")\n  .build();`,
  },
];
