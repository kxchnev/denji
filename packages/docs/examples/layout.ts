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
    id: "gap",
    title: "gap",
    description: "`@gap(n)` adds extra spacing between a node and its anchor.",
    dsl: `architecture\n  app a "A"\n  app b "B" @rightOf(a) @gap(120)`,
    api: `architecture()\n  .app("a", "A")\n  .app("b", "B", { hint: { rightOf: "a", gap: 120 } })\n  .build();`,
  },
  {
    id: "align",
    title: "align",
    description: "By default a node centers on its anchor; `@align(start|end)` overrides the cross-axis.",
    dsl: `architecture\n  database wide "Wide Data Store"\n  app top "start" @below(wide) @align(start)\n  app bottom "end" @below(wide) @align(end)`,
    api: `architecture()\n  .database("wide", "Wide Data Store")\n  .app("top", "start", { hint: { below: "wide", align: "start" } })\n  .app("bottom", "end", { hint: { below: "wide", align: "end" } })\n  .build();`,
  },
];
