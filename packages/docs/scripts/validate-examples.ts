// Renders every documented example through the core so a broken DSL fails CI
// (and the docs) without needing a browser. Run: `npm run -w docs validate`.
import { parseArchitecture, layoutArchitecture, renderArchitecture, checkDiagram } from "@kxchnev/denji";
import { allExamples } from "../examples/index.js";

let failed = 0;
for (const ex of allExamples) {
  try {
    const d = parseArchitecture(ex.dsl);
    layoutArchitecture(d);
    // The site renders in `selector`, downloads bake one palette. Both paths,
    // and both palettes, have to survive every example.
    for (const opts of [
      { themeMode: "selector" as const },
      { theme: "light" as const },
      { theme: "dark" as const },
    ]) {
      const svg = renderArchitecture(d, opts);
      if (!svg.includes("<svg")) throw new Error("no svg produced");
      // A var() without a literal fallback renders as nothing wherever custom
      // properties are unsupported — librsvg in the CLI, for one.
      const bare = svg.match(/var\(--[a-z0-9-]+\)/g);
      if (bare) throw new Error(`var() without a fallback: ${bare.join(", ")}`);
    }
    // Siblings drawn on top of each other are a layout bug, not a feature. The
    // check lives in the core so `denji check` and the docs judge it the same
    // way. Only this one code is fatal here: the others are authoring advice,
    // and the examples are deliberately minimal — most have a single unconnected
    // node, which is exactly what a one-shape example is.
    const overlaps = checkDiagram(ex.dsl).diagnostics.filter(
      (diag) => diag.code === "overlapping-siblings",
    );
    if (overlaps.length > 0) {
      throw new Error(`overlapping siblings: ${overlaps.map((o) => o.message).join(", ")}`);
    }
  } catch (e) {
    failed++;
    console.error(`✗ ${ex.id}: ${(e as Error).message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${allExamples.length} examples failed`);
  process.exit(1);
}
console.log(`✓ all ${allExamples.length} examples render`);
