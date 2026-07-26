import type { ExampleData } from "./types";

const pair = (op: string, label = "") =>
  `architecture\n  app a "Service A"\n  app b "Service B" @rightOf(a)\n  a ${op} b${label}`;

export const arrows: ExampleData[] = [
  {
    id: "directed",
    title: "Directed",
    description: "`->` draws an arrow from source to target.",
    dsl: pair("->"),
    api: `architecture()\n  .app("a", "Service A")\n  .app("b", "Service B", { hint: { rightOf: "a" } })\n  .connect("a", "b")\n  .build();`,
  },
  {
    id: "reverse",
    title: "Reverse",
    description: "`<-` points the arrow back toward the source.",
    dsl: pair("<-"),
    api: `architecture()\n  .app("a", "Service A")\n  .app("b", "Service B", { hint: { rightOf: "a" } })\n  .connect("a", "b", { dir: "from" })\n  .build();`,
  },
  {
    id: "bidirectional",
    title: "Bidirectional",
    description: "`<->` puts an arrowhead on both ends.",
    dsl: pair("<->"),
    api: `architecture()\n  .app("a", "Service A")\n  .app("b", "Service B", { hint: { rightOf: "a" } })\n  .connect("a", "b", { dir: "both" })\n  .build();`,
  },
  {
    id: "undirected",
    title: "Undirected",
    description: "`--` is a plain association line, no arrowheads.",
    dsl: pair("--"),
    api: `architecture()\n  .app("a", "Service A")\n  .app("b", "Service B", { hint: { rightOf: "a" } })\n  .connect("a", "b", { dir: "none" })\n  .build();`,
  },
  {
    id: "dashed",
    title: "Dashed",
    description: "`-.->` renders a dashed connector.",
    dsl: pair("-.->"),
    api: `architecture()\n  .app("a", "Service A")\n  .app("b", "Service B", { hint: { rightOf: "a" } })\n  .connect("a", "b", { style: "dashed" })\n  .build();`,
  },
  {
    id: "labeled",
    title: "Labeled",
    description: "Add `: label` (or `|label|`) to annotate a connection.",
    dsl: pair("->", " : http"),
    api: `architecture()\n  .app("a", "Service A")\n  .app("b", "Service B", { hint: { rightOf: "a" } })\n  .connect("a", "b", { label: "http" })\n  .build();`,
  },
];
