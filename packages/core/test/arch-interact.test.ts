import { describe, expect, it } from "vitest";
import { parseArchitecture as parse } from "../src/dsl/arch-parse.js";
import { findDeclarationLine } from "../src/dsl/arch-edit.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { isBoxed, nodeAt, nodeDepths, pinsFor, snapToGrid } from "../src/interact.js";
import type { ArchDiagram, ArchNode } from "../src/model/arch.js";

/** Parse and lay out, which is the only state these functions are defined on. */
const laid = (src: string): ArchDiagram => {
  const d = parse(src);
  layoutArchitecture(d, { onWarn: () => {} });
  return d;
};

const byId = (d: ArchDiagram, id: string): ArchNode => {
  const n = d.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

/** The middle of a node's box, in the absolute space `nodeAt` takes. */
const centre = (d: ArchDiagram, id: string) => {
  const r = byId(d, id).rect!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

describe("snapToGrid", () => {
  it("rounds to the lattice the layout sizes boxes on", () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(3)).toBe(0);
    expect(snapToGrid(5)).toBe(8);
    expect(snapToGrid(-5)).toBe(-8);
    expect(snapToGrid(16)).toBe(16);
  });
});

describe("pinsFor", () => {
  it("reports every other node at the position it already sits on", () => {
    const d = laid('architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  app c "C" @rightOf(b)\n');
    const pins = pinsFor(d, "b");
    expect(pins.map((p) => p.id).sort()).toEqual(["a", "c"]);
    for (const p of pins) expect(p.at).toEqual(byId(d, p.id).local);
  });

  it("leaves nodes that already have coordinates alone — theirs are in the source", () => {
    const d = laid('architecture\n  app a "A" @at(0, 0)\n  app b "B"\n  app c "C" @rightOf(b)\n');
    expect(pinsFor(d, "b").map((p) => p.id)).toEqual(["c"]);
  });

  it("pins containers and their children alike, since both scopes can reflow", () => {
    const d = laid(
      'architecture\n  service s "S" {\n    app a "A"\n    app b "B" @rightOf(a)\n  }\n  app out "Out" @below(s)\n',
    );
    expect(pinsFor(d, "a").map((p) => p.id).sort()).toEqual(["b", "out", "s"]);
  });
});

describe("nodeDepths", () => {
  it("counts how deep each node sits in the container tree", () => {
    const d = laid(
      'architecture\n  service outer "O" {\n    group inner "I" {\n      app leaf "L"\n    }\n  }\n  app top "T" @below(outer)\n',
    );
    const depths = nodeDepths(d);
    expect(depths.get("outer")).toBe(0);
    expect(depths.get("top")).toBe(0);
    expect(depths.get("inner")).toBe(1);
    expect(depths.get("leaf")).toBe(2);
  });

  it("has nothing to say about a diagram that was never laid out", () => {
    expect(nodeDepths(null).size).toBe(0);
  });
});

describe("nodeAt", () => {
  it("picks up a shape anywhere on it, and nothing on empty canvas", () => {
    const d = laid('architecture\n  app a "A"\n');
    expect(nodeAt(d, centre(d, "a"))?.id).toBe("a");
    const r = byId(d, "a").rect!;
    expect(nodeAt(d, { x: r.x - 10, y: r.y - 10 })).toBeNull();
  });

  it("grabs a container by its title band only, leaving the body to pan", () => {
    const d = laid('architecture\n  service s "S" {\n    app a "A"\n  }\n');
    const r = byId(d, "s").rect!;
    expect(nodeAt(d, { x: r.x + r.width / 2, y: r.y + 4 })?.id).toBe("s");
    // Well below the header, but still inside the box and clear of the child.
    expect(nodeAt(d, { x: r.x + 2, y: r.y + r.height - 2 })).toBeNull();
  });

  it("returns the child, not the container it sits in", () => {
    const d = laid('architecture\n  service s "S" {\n    app a "A"\n  }\n');
    expect(nodeAt(d, centre(d, "a"))?.id).toBe("a");
  });

  it("returns the deepest hit when containers nest", () => {
    const d = laid(
      'architecture\n  service outer "O" {\n    group inner "I" {\n      app leaf "L"\n    }\n  }\n',
    );
    const inner = byId(d, "inner").rect!;
    // Over the inner container's own title band — which is also inside `outer`.
    expect(nodeAt(d, { x: inner.x + inner.width / 2, y: inner.y + 4 })?.id).toBe("inner");
    expect(nodeAt(d, centre(d, "leaf"))?.id).toBe("leaf");
  });
});

describe("isBoxed", () => {
  it("tells a child from a top-level node", () => {
    const d = laid('architecture\n  service s "S" {\n    app a "A"\n  }\n  app free "F" @below(s)\n');
    expect(isBoxed(d, "a")).toBe(true);
    expect(isBoxed(d, "s")).toBe(false);
    expect(isBoxed(d, "free")).toBe(false);
  });
});

describe("findDeclarationLine", () => {
  it("finds the line a node is declared on, 1-based", () => {
    const src = 'architecture\n  app a "A"\n  service s "S" {\n    app b "B"\n  }\n';
    expect(findDeclarationLine(src, "a")).toBe(2);
    expect(findDeclarationLine(src, "s")).toBe(3);
    expect(findDeclarationLine(src, "b")).toBe(4);
    expect(findDeclarationLine(src, "nope")).toBeNull();
  });

  it("returns the last of several — for a duplicate id that is the offending one", () => {
    expect(findDeclarationLine('architecture\n  app a "A"\n  app a "again"\n', "a")).toBe(3);
  });

  it("is not fooled by a connection or a comment naming the id", () => {
    const src = 'architecture\n  app a "A"\n  app b "B"\n  # app b again\n  a -> b\n';
    expect(findDeclarationLine(src, "b")).toBe(3);
  });
});
