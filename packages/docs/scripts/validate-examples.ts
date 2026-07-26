// Renders every documented example through the core so a broken DSL fails CI
// (and the docs) without needing a browser. Run: `npm run -w docs validate`.
import { parseArchitecture, layoutArchitecture, renderArchitecture } from "power";
import { allExamples } from "../examples/index.js";

let failed = 0;
for (const ex of allExamples) {
  try {
    const d = parseArchitecture(ex.dsl);
    layoutArchitecture(d);
    const svg = renderArchitecture(d);
    if (!svg.includes("<svg")) throw new Error("no svg produced");
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
