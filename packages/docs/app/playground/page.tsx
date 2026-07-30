"use client";

import { useDeferredValue, useState } from "react";
import { Diagram } from "@/components/Diagram";
import { PwrEditor } from "@/components/PwrEditor";
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
  const preview = useDeferredValue(dsl);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Playground</h1>
      <p className="mt-3 text-muted-foreground">
        Edit the DSL on the left and see it render live. Drag to pan, scroll to zoom at the
        cursor, or use the buttons to zoom and re-centre. Download the diagram as SVG, PNG, or
        JPEG from the download button. The editor supports undo (Mod-Z), comment toggling
        (Mod-/), and autocomplete for shapes, directives, and node ids.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button key={p.label} variant="outline" size="sm" onClick={() => setDsl(p.dsl)}>
            {p.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <PwrEditor
          value={dsl}
          onChange={setDsl}
          className="h-[70vh] overflow-hidden rounded-lg border bg-code"
        />
        <div className="h-[70vh] overflow-hidden rounded-lg border bg-card">
          <Diagram dsl={preview} interactive />
        </div>
      </div>
    </div>
  );
}
