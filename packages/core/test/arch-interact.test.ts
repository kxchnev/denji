import { describe, expect, it } from "vitest";
import { parseArchitecture as parse } from "../src/dsl/arch-parse.js";
import { findDeclaration, findHeaderLine } from "../src/dsl/arch-edit.js";
import { DEFAULT_HEADER_H, layoutArchitecture } from "../src/layout/arch/index.js";
import {
  DROP_EDGE,
  dropEdgeRect,
  isBoxed,
  linkAt,
  linkBadgeRect,
  nodeAt,
  nodeDepths,
  pickAt,
  relationFor,
  snapToGrid,
} from "../src/interact.js";
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

describe("relationFor", () => {
  const at = (d: ReturnType<typeof laid>, id: string, dx: number, dy: number) => {
    const l = byId(d, id).local!;
    return { x: l.x + dx, y: l.y + dy };
  };

  it("says which sibling a drop landed next to, and on which side", () => {
    const d = laid('architecture\n  app a "A"\n  app b "B"\n  app c "C"\n  a -> b\n  b -> c\n');
    // Dropped square on top of where `a` sits, a little to its right.
    const onA = at(d, "a", byId(d, "a").rect!.width + 40, 0);
    expect(relationFor(d, "c", onA)).toEqual({ id: "c", anchor: "a", side: "rightOf" });
  });

  it("reads a drop below a box as below it, not beside it", () => {
    const d = laid('architecture\n  app a "A"\n  app b "B"\n  a -> b\n');
    const underA = at(d, "a", 0, byId(d, "a").rect!.height + 60);
    expect(relationFor(d, "b", underA)).toMatchObject({ anchor: "a", side: "below" });
  });

  it("picks the sibling the drop is actually nearest to", () => {
    const d = laid('architecture\n  app a "A"\n  app b "B"\n  app c "C"\n  a -> b\n  b -> c\n');
    // Just under `b`, which sits between the other two: `b` is what it landed by.
    const underB = at(d, "b", 0, byId(d, "b").rect!.height + 20);
    expect(relationFor(d, "c", underB)).toMatchObject({ anchor: "b", side: "below" });
  });

  it("only offers siblings — a drop never anchors across a container border", () => {
    const d = laid(
      'architecture\n  service s "S" {\n    app a "A"\n    app b "B"\n    a -> b\n  }\n  app out "Out"\n  a -> out\n',
    );
    const rel = relationFor(d, "b", at(d, "b", 200, 0));
    expect(rel?.anchor).toBe("a");
  });

  it("says nothing when the node already claims exactly that", () => {
    const d = laid('architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  a -> b\n');
    const beside = at(d, "a", byId(d, "a").rect!.width + 40, 0);
    expect(relationFor(d, "b", beside)).toBeNull();
  });

  it("says nothing when there is no sibling to speak of", () => {
    const d = laid('architecture\n  app only "Only"\n');
    expect(relationFor(d, "only", { x: 0, y: 0 })).toBeNull();
  });
});

describe("dropEdgeRect", () => {
  const anchor = { x: 100, y: 200, width: 80, height: 40 };

  it("puts the bar in the gap on the side the relation names", () => {
    const { thickness, gap } = DROP_EDGE;
    expect(dropEdgeRect(anchor, "rightOf")).toEqual({
      x: anchor.x + anchor.width + gap,
      y: anchor.y,
      width: thickness,
      height: anchor.height,
    });
    expect(dropEdgeRect(anchor, "leftOf").x + thickness + gap).toBe(anchor.x);
    expect(dropEdgeRect(anchor, "below").y).toBe(anchor.y + anchor.height + gap);
    expect(dropEdgeRect(anchor, "above").y + thickness + gap).toBe(anchor.y);
  });

  it("spans exactly the edge it sits beside", () => {
    for (const side of ["rightOf", "leftOf"] as const) {
      const r = dropEdgeRect(anchor, side);
      expect(r.y).toBe(anchor.y);
      expect(r.height).toBe(anchor.height);
    }
    for (const side of ["below", "above"] as const) {
      const r = dropEdgeRect(anchor, side);
      expect(r.x).toBe(anchor.x);
      expect(r.width).toBe(anchor.width);
    }
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

describe("findDeclaration", () => {
  /** The text the returned span actually covers — the whole point of the columns. */
  const span = (src: string, id: string): string | null => {
    const d = findDeclaration(src, id);
    return d && d.text.slice(d.col - 1, d.endCol - 1);
  };

  it("finds the line a node is declared on, 1-based", () => {
    const src = 'architecture\n  app a "A"\n  service s "S" {\n    app b "B"\n  }\n';
    expect(findDeclaration(src, "a")?.line).toBe(2);
    expect(findDeclaration(src, "s")?.line).toBe(3);
    expect(findDeclaration(src, "b")?.line).toBe(4);
    expect(findDeclaration(src, "nope")).toBeNull();
  });

  it("spans the id itself, not the keyword before it", () => {
    const src = 'architecture\n  app a "A"\n  service s "S" {\n    app longer "L"\n  }\n';
    expect(span(src, "a")).toBe("a");
    expect(span(src, "longer")).toBe("longer");
    // Four spaces of indent, then "app ".
    expect(findDeclaration(src, "longer")?.col).toBe(9);
  });

  it("hands back the whole line, for a caret to sit under", () => {
    const src = 'architecture\n  app a "A" @icon(redis)\n';
    expect(findDeclaration(src, "a")?.text).toBe('  app a "A" @icon(redis)');
  });

  it("returns the last of several — for a duplicate id that is the offending one", () => {
    expect(findDeclaration('architecture\n  app a "A"\n  app a "again"\n', "a")?.line).toBe(3);
  });

  it("is not fooled by a connection or a comment naming the id", () => {
    const src = 'architecture\n  app a "A"\n  app b "B"\n  # app b again\n  a -> b\n';
    expect(findDeclaration(src, "b")?.line).toBe(3);
  });

  it("does not match an id that merely starts another one", () => {
    const src = 'architecture\n  app apiGateway "G"\n  app api "A" @rightOf(apiGateway)\n';
    expect(findDeclaration(src, "api")?.line).toBe(3);
    expect(findDeclaration(src, "apiGateway")?.line).toBe(2);
  });
});

describe("findHeaderLine", () => {
  it("finds the architecture line and spans the keyword", () => {
    const src = '# a note\n\narchitecture @spacing(40)\n  app a "A"\n';
    const h = findHeaderLine(src)!;
    expect(h.line).toBe(3);
    expect(h.text.slice(h.col - 1, h.endCol - 1)).toBe("architecture");
  });

  it("has nothing to point at in a document without one", () => {
    expect(findHeaderLine('app a "A"\n')).toBeNull();
  });
});

describe("link buttons", () => {
  /** The middle of a node's link button, which is what a pointer aims at. */
  const badge = (d: ArchDiagram, id: string) => {
    const r = linkBadgeRect(byId(d, id));
    if (!r) throw new Error(`no link button on ${id}`);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: r };
  };

  it("has no box without a link", () => {
    const d = laid('architecture\n  app a "A"\n');
    expect(linkBadgeRect(byId(d, "a"))).toBeNull();
    expect(linkAt(d, centre(d, "a"))).toBeNull();
  });

  it("sits inside the silhouette, not the bounding box, for every shape kind", () => {
    const d = laid(
      "architecture\n" +
        '  app a "A" @link(https://x.com/a)\n' +
        '  database b "B" @below(a) @link(https://x.com/b)\n' +
        '  queue c "C" @below(b) @link(https://x.com/c)\n' +
        '  rect e "E" @below(c) @link(https://x.com/e)\n',
    );
    for (const id of ["a", "b", "c", "e"]) {
      const r = byId(d, id).rect!;
      const box = linkBadgeRect(byId(d, id))!;
      expect(box.x).toBeGreaterThanOrEqual(r.x);
      expect(box.y).toBeGreaterThanOrEqual(r.y);
      expect(box.x + box.width).toBeLessThanOrEqual(r.x + r.width);
      expect(box.y + box.height).toBeLessThanOrEqual(r.y + r.height);
    }
    // A database's lid and a queue's right cap are ellipses, so the corner of
    // the box is off the drawn shape — these two are inset past it.
    expect(linkBadgeRect(byId(d, "b"))!.y - byId(d, "b").rect!.y).toBeGreaterThan(
      linkBadgeRect(byId(d, "a"))!.y - byId(d, "a").rect!.y,
    );
    const cRect = byId(d, "c").rect!;
    const cBadge = linkBadgeRect(byId(d, "c"))!;
    const aRect = byId(d, "a").rect!;
    const aBadge = linkBadgeRect(byId(d, "a"))!;
    expect(cRect.x + cRect.width - (cBadge.x + cBadge.width)).toBeGreaterThan(
      aRect.x + aRect.width - (aBadge.x + aBadge.width),
    );
  });

  it("hangs a container's button in the title band, clear of its corner texts", () => {
    const d = laid(
      'architecture\n  group g "G" @link(https://x.com/g) {\n    text "note" @corner(topRight)\n    app a "A"\n  }\n',
    );
    const r = byId(d, "g").rect!;
    const box = linkBadgeRect(byId(d, "g"))!;
    // Corner texts start at the bottom of the header band; the button ends above it.
    expect(box.y + box.height).toBeLessThanOrEqual(r.y + DEFAULT_HEADER_H);
  });

  it("hits inside and misses one pixel out", () => {
    const d = laid('architecture\n  app a "A" @link(https://x.com/a)\n');
    const b = badge(d, "a");
    expect(linkAt(d, { x: b.x, y: b.y })?.url).toBe("https://x.com/a");
    expect(linkAt(d, { x: b.rect.x - 1, y: b.y })).toBeNull();
    expect(linkAt(d, { x: b.rect.x + b.rect.width + 1, y: b.y })).toBeNull();
    expect(linkAt(d, { x: b.x, y: b.rect.y - 1 })).toBeNull();
    expect(linkAt(d, { x: b.x, y: b.rect.y + b.rect.height + 1 })).toBeNull();
  });

  it("beats the node under it, which is the whole reason pickAt exists", () => {
    const d = laid(
      'architecture\n  service s "S" @link(https://x.com/s) {\n    app a "A"\n  }\n',
    );
    const b = badge(d, "s");
    // The button sits in the title band — the only part of a container you can
    // grab — so without a fixed order this press would start a drag instead.
    expect(nodeAt(d, { x: b.x, y: b.y })?.id).toBe("s");
    const picked = pickAt(d, { x: b.x, y: b.y });
    expect(picked?.kind).toBe("link");
    expect(picked?.kind === "link" && picked.hit.node.id).toBe("s");
    // A step to the left of it is the band again, and drags as it always did.
    const beside = pickAt(d, { x: b.rect.x - 8, y: b.y });
    expect(beside?.kind).toBe("node");
  });

  it("gives a child's button to the child, not to the container behind it", () => {
    const d = laid(
      'architecture\n  service s "S" @link(https://x.com/s) {\n    app a "A" @link(https://x.com/a)\n  }\n',
    );
    const b = badge(d, "a");
    expect(linkAt(d, { x: b.x, y: b.y })?.node.id).toBe("a");
  });

  it("has nothing to say about a diagram that was never laid out", () => {
    expect(linkAt(null, { x: 0, y: 0 })).toBeNull();
    expect(pickAt(null, { x: 0, y: 0 })).toBeNull();
    expect(linkBadgeRect(parse('architecture\napp a "A" @link(https://x.com)').nodes[0]!)).toBeNull();
  });
});
