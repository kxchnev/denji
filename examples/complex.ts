import { writeFileSync } from "node:fs";
import { flowchart, toSvg } from "../src/index.js";

// Exercises the layered engine: branch + merge + back-edge cycle, plus two
// layout hints (rightOf keeps the error path on the right; sameRank aligns
// Metrics with Save).
const chart = flowchart("TB")
  .node("Start", "Start", { shape: "stadium" })
  .node("Fetch", "Fetch data")
  .node("Valid", "Valid?", { shape: "diamond" })
  .node("Transform", "Transform")
  .node("LogErr", "Log error", { hint: { rightOf: "Transform" } })
  .node("Save", "Save", { shape: "round" })
  .node("Metrics", "Emit metrics", { hint: { sameRank: "Save" } })
  .node("Retry", "Retry?", { shape: "diamond" })
  .node("Done", "Done", { shape: "stadium" })
  .edge("Start", "Fetch")
  .edge("Fetch", "Valid")
  .edge("Valid", "Transform", { label: "yes" })
  .edge("Valid", "LogErr", { label: "no", style: "dashed" })
  .edge("Transform", "Save")
  .edge("LogErr", "Save")
  .edge("Save", "Metrics")
  .edge("Save", "Retry")
  .edge("Retry", "Fetch", { label: "retry", style: "dashed" })
  .edge("Retry", "Done", { label: "ok" })
  .build();

writeFileSync(new URL("./complex.svg", import.meta.url), toSvg(chart));
console.log("wrote examples/complex.svg");
