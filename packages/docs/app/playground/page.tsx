"use client";

import { useState } from "react";
import { Diagram } from "@/components/Diagram";
import { Button } from "@/components/ui/button";
import { intro, blocks, layout } from "@/examples";

const presets = [
  { label: "System", dsl: intro.dsl },
  { label: "Service", dsl: blocks[0]!.dsl },
  { label: "Nested", dsl: blocks[2]!.dsl },
  { label: "Layout", dsl: layout[0]!.dsl },
];

export default function Playground() {
  const [dsl, setDsl] = useState(intro.dsl);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Playground</h1>
      <p className="mt-3 text-muted-foreground">
        Edit the DSL on the left and see it render live. Drag to pan, scroll to zoom.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button key={p.label} variant="outline" size="sm" onClick={() => setDsl(p.dsl)}>
            {p.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <textarea
          value={dsl}
          onChange={(e) => setDsl(e.target.value)}
          spellCheck={false}
          className="h-[70vh] w-full resize-none rounded-lg border bg-zinc-950 p-4 font-mono text-sm text-zinc-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-900"
        />
        <div className="h-[70vh] overflow-hidden rounded-lg border bg-white bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] [background-size:16px_16px]">
          <Diagram dsl={dsl} interactive />
        </div>
      </div>
    </div>
  );
}
