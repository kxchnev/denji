// Renders every documented example through the core so a broken DSL fails CI
// (and the docs) without needing a browser. Run: `npm run -w docs validate`.
import { parseArchitecture, layoutArchitecture, renderArchitecture } from "power";
import type { ArchDiagram, Rect } from "power";
import { allExamples } from "../examples/index.js";

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Siblings must never be drawn on top of each other — a documented example
 *  showing an overlap is a layout bug, not a feature. */
function overlappingSiblings(d: ArchDiagram): string[] {
  const parent = new Map<string, string>();
  for (const n of d.nodes) {
    if (n.type === "container") for (const c of n.children) parent.set(c, n.id);
  }
  const scopes = new Map<string, typeof d.nodes>();
  for (const n of d.nodes) {
    const key = parent.get(n.id) ?? "<top>";
    const list = scopes.get(key) ?? [];
    list.push(n);
    scopes.set(key, list);
  }
  const bad: string[] = [];
  for (const list of scopes.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.rect && b.rect && overlaps(a.rect, b.rect)) bad.push(`${a.id}×${b.id}`);
      }
    }
  }
  return bad;
}

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
    const bad = overlappingSiblings(d);
    if (bad.length > 0) throw new Error(`overlapping siblings: ${bad.join(", ")}`);
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
