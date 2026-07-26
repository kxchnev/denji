import { writeFileSync } from "node:fs";
import { flowchart, toSvg } from "../src/index.js";

// Auto-flow with a couple of pinned nodes to demonstrate layout control.
const chart = flowchart("TB")
  .node("A", "Start", { shape: "stadium" })
  .node("B", "Is it ready?", { shape: "diamond" })
  .node("C", "Ship it", { shape: "round" })
  .node("D", "Fix it", { shape: "round", hint: { pin: { x: 320, y: 240 } } })
  .edge("A", "B")
  .edge("B", "C", { label: "yes" })
  .edge("B", "D", { label: "no", style: "dashed" })
  .edge("D", "B", { style: "dashed" })
  .build();

const svg = toSvg(chart);
writeFileSync(new URL("./basic.svg", import.meta.url), svg);
console.log("wrote examples/basic.svg");
