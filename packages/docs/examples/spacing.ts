import type { ExampleData } from "./types";

export const spacing: ExampleData[] = [
  {
    id: "gap",
    title: "gap",
    description:
      "`@gap(n)` sets the distance from one node to its own anchor, replacing the scope's spacing on that axis.",
    dsl: `architecture\n  app a "A"\n  app b "B" @rightOf(a) @gap(120)\n  app c "C" @below(a)`,
    api: `architecture()\n  .app("a", "A")\n  .app("b", "B", { hint: { rightOf: "a", gap: 120 } })\n  .app("c", "C", { hint: { below: "a" } })\n  .build();`,
  },
  {
    id: "spacing",
    title: "spacing",
    description:
      "`@spacing(n)` on the `architecture` line is the default gap between siblings everywhere — including inside containers.",
    dsl: `architecture @spacing(80)\n  app a "A"\n  app b "B" @rightOf(a)\n  app c "C" @below(a)`,
    api: `architecture()\n  .spacing({ x: 80, y: 80 })\n  .app("a", "A")\n  .app("b", "B", { hint: { rightOf: "a" } })\n  .app("c", "C", { hint: { below: "a" } })\n  .build();`,
  },
  {
    id: "spacing-axes",
    title: "spacingX / spacingY",
    description:
      "Set the axes apart: wide columns, tight rows. Either one refines `@spacing`, whichever is written last.",
    dsl: `architecture @spacingX(120) @spacingY(16)\n  app a "A"\n  app b "B" @rightOf(a)\n  app c "C" @below(a)\n  app d "D" @below(c)`,
    api: `architecture()\n  .spacing({ x: 120, y: 16 })\n  .app("a", "A")\n  .app("b", "B", { hint: { rightOf: "a" } })\n  .app("c", "C", { hint: { below: "a" } })\n  .app("d", "D", { hint: { below: "c" } })\n  .build();`,
  },
  {
    id: "container-spacing",
    title: "spacing on a container",
    description:
      "A container overrides the spacing for its own subtree; everything outside keeps the diagram default.",
    dsl: `architecture @spacing(16)\n  service loose "Roomy" @spacing(64) {\n    app x "X"\n    app y "Y" @below(x)\n  }\n  service tight "Default" @rightOf(loose) {\n    app p "P"\n    app q "Q" @below(p)\n  }`,
    api: `architecture()\n  .spacing({ x: 16, y: 16 })\n  .app("x", "X")\n  .app("y", "Y", { hint: { below: "x" } })\n  .container("loose", "Roomy", { kind: "service", children: ["x", "y"], spacing: { x: 64, y: 64 } })\n  .app("p", "P")\n  .app("q", "Q", { hint: { below: "p" } })\n  .container("tight", "Default", { kind: "service", children: ["p", "q"], hint: { rightOf: "loose" } })\n  .build();`,
  },
  {
    id: "padding",
    title: "padding",
    description:
      "`@padding(n)` is the breathing room between a container's border and its children — independent of the gap between those children.",
    dsl: `architecture\n  service snug "Snug" @padding(8) {\n    app a "A"\n  }\n  service airy "Airy" @rightOf(snug) @padding(48) {\n    app b "B"\n  }`,
    api: `architecture()\n  .app("a", "A")\n  .container("snug", "Snug", { kind: "service", children: ["a"], padding: 8 })\n  .app("b", "B")\n  .container("airy", "Airy", { kind: "service", children: ["b"], hint: { rightOf: "snug" }, padding: 48 })\n  .build();`,
  },
  {
    id: "margin",
    title: "margin",
    description:
      "`@margin(n)` is the whitespace around the whole drawing — the only setting that has no per-container form.",
    dsl: `architecture @margin(56)\n  app a "A"\n  app b "B" @rightOf(a)`,
    api: `architecture()\n  .margin(56)\n  .app("a", "A")\n  .app("b", "B", { hint: { rightOf: "a" } })\n  .build();`,
  },
];
